---
name: wtb
description: Use this skill when working in a repository that contains a wtb.yaml or .wtb.yaml config. wtb is a CLI that manages multiple git worktrees with per-worktree environment and port isolation. Activate this skill when the user asks about - this worktree's local ports, endpoints, or URLs; which worktrees exist or which is main/current; creating, removing, or listing worktrees for a branch; why a dev server or Docker Compose service is reachable on a non-default port; setting up a new feature branch environment. The skill explains how to invoke the wtb CLI via Bash and how to interpret its JSON output.
---

# wtb skill

wtb gives every git branch its own isolated working directory with remapped ports and copied `.env` files. Each worktree's concrete port numbers are only discoverable at runtime — that's what this skill is for.

## When to use

Activate this skill when the user says or implies any of:

- "What port is this worktree on?" / "What URL do I hit for the API?" / "What's the DB port here?"
- "List / show the worktrees." / "What worktrees do we have?" / "Which branch is main?"
- "Make a worktree for feature/X" / "Spin up a branch environment for bugfix/Y."
- "Tear down / remove / clean up the worktree for feature/X."
- "Why is the service on port 3002 not 3000?" — wtb auto-bumps ports to avoid collisions.
- Any time the user wants to hit a local URL and you don't already know the port.

Also activate when `wtb.yaml`, `.wtb.yaml`, `.wtb.yml`, or `.wtb/config.yaml` exists at the repo root, even without an explicit trigger — that config is the sign wtb is in use.

## Discovering the current worktree's endpoints

Run `wtb ports --json` from the worktree and parse the JSON. **Do this before hitting any local service when the port is not obvious.**

```bash
wtb ports --json
```

Output shape:

```json
{
  "path": "/Users/me/worktree-feature-auth",
  "branch": "feature/auth",
  "env": { "APP_PORT": "3001", "DB_PORT": "5433" },
  "compose": {
    "file": "docker-compose.yml",
    "services": {
      "web": { "host_ports": [3001], "container_ports": [80] },
      "db":  { "host_ports": [5433], "container_ports": [5432] }
    }
  },
  "endpoints": ["http://localhost:3001", "http://localhost:5433"]
}
```

- `env` only contains keys the user listed under `env.adjust` in `wtb.yaml` — it will not leak arbitrary secrets.
- `compose.services.*.host_ports` is the authoritative list of ports bound on the host machine.
- `endpoints` is a pre-rendered list of `http://localhost:<host_port>` entries. Use these first; only reach for `env.*_PORT` if no compose file is present.
- If Docker isn't installed or the Compose file is missing, `compose.services` is `{}` — that's fine, it's not an error.

When the user asks an open question like "check the health endpoint," pick the first `http://localhost:<port>` from `endpoints` (or reason from service names like `web` / `api` when multiple exist).

Use `wtb ports --all` to see every worktree's endpoints at once (returns an array). Use `wtb ports --pretty` for a human-readable summary.

## Listing worktrees

```bash
wtb ls              # compact, 1 git call
wtb ls -l           # enriched: short hash, age, dirty flag, subject
wtb ls --json       # machine-readable (combines with -l)
wtb ls -p           # absolute paths only, one per line
```

Key fields in JSON output: `path`, `branch`, `isMain`, `isCurrent`, `locked`, `prunable`, `bare`, `detached`, plus (with `-l`) `shortHash`, `subject`, `ageRelative`, `dirty`.

Use `wtb ls --json | jq '.[] | select(.isCurrent == true)'` to find the current worktree in scripts.

## Creating a worktree

```bash
wtb create feature/my-new-feature
```

Phases (in order): `git worktree add` → copy gitignored files → create symlinks → copy-and-adjust `.env` → rewrite Compose ports → run `start_command`.

Useful flags:

- `--dry-run` — preview without touching anything. **Recommend this to the user before the real run** if the config is unfamiliar or changes recently.
- `-p <path>` — custom worktree location (default: `../worktree-<branch-with-slashes-as-dashes>`).
- `--no-create-branch` — attach to an existing branch instead of creating a new one.
- `--no-docker` / `--no-env` / `--no-copy` / `--no-link` / `--no-start` — skip individual phases.

After creation, `cd` into the new worktree path (printed at the end of `wtb create`), then `wtb ports` again to see the *new* worktree's ports.

## Removing a worktree (destructive — confirm first)

```bash
wtb remove feature/old-branch
```

**This is destructive.** Always:

1. Run `wtb ls -l` first to show the user what will be removed (path, dirty status, age).
2. Ask the user to confirm before executing `wtb remove`.
3. Only use `-f` / `--force` when the user explicitly acknowledges the uncommitted-change risk.

Flags:

- `-f, --force` — allow removal with uncommitted changes.
- `--no-docker` — skip `docker compose down` (useful when the Docker daemon is already stopped).
- `--no-end` — skip `end_command`.

Ordering is: Docker teardown → `end_command` → `git worktree remove`. Setting `end_command` in `wtb.yaml` suppresses the automatic Docker teardown (the user owns shutdown).

## Config quick reference

`wtb.yaml` (or `.wtb.yaml` / `.wtb/config.yaml`) at the repo root. Read it when the user asks "what does wtb do on create?" or when their request hinges on what's configured.

| Field | Purpose |
|-------|---------|
| `base_branch` | Branch new worktrees fork from (default `main`). |
| `docker_compose_file` | Compose file to copy + port-remap. Empty/omitted = Docker skipped. |
| `copy_files` | Files/dirs copied into each worktree (e.g. `.env`). |
| `link_files` | Files/dirs symlinked (e.g. `node_modules`) — priority over `copy_files`. |
| `start_command` / `end_command` | Lifecycle scripts run via `/bin/sh` in the worktree. |
| `env.file` | Env files processed per worktree. |
| `env.adjust` | Per-key transform: `number` = auto-bump to next free port, `string` = literal replace, `null` = remove. |

## Troubleshooting hints

- "Port still collides" → wtb only scans other worktrees' `.env` files and running Docker containers. Anything else listening on the port is invisible to it. Check with `lsof -i :<port>` and stop the offender.
- "Not in a git repository" (exit 3) → run from inside the repo.
- "Worktree for branch 'X' already exists" → `wtb ls` shows where; `wtb remove X` to clear.
- Docker daemon down → `wtb ports` still works, `compose.services` will be `{}`. `wtb remove` skips teardown gracefully.

## Output conventions

- All read-only commands (`ls`, `ports`, `status`) support `--json` for scripting. Prefer JSON + `jq` over scraping human output.
- `wtb ports` prints valid JSON on stdout even when Docker is unavailable; warnings go to stderr.
- Exit codes: `0` success, `1` general error, `2` usage, `3` not-a-git-repo, `4` config error, `5` Docker error.
