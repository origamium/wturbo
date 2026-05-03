---
name: wtb
description: Use this skill when working in a repository that contains a wtb.yaml or .wtb.yaml config. wtb is a CLI that manages multiple git worktrees with per-worktree environment and port isolation. Activate this skill when the user asks about - this worktree's local ports, endpoints, or URLs; which worktrees exist or which is main/current; creating, removing, or listing worktrees for a branch; why a dev server or Docker Compose service is reachable on a non-default port; setting up a new feature branch environment. The skill explains how to invoke the wtb CLI via Bash and how to interpret its JSON output.
---

# wtb skill

wtb gives every git branch its own isolated working directory with remapped ports and copied `.env` files. Each worktree's concrete port numbers are only discoverable at runtime — that is what this skill is for.

## When to use

Activate this skill when the user says or implies any of:

- "What port is this worktree on?" / "What URL do I hit for the API?" / "What's the DB port here?"
- "List / show the worktrees." / "What worktrees do we have?" / "Which branch is main?"
- "Make a worktree for feature/X" / "Spin up a branch environment for bugfix/Y."
- "Tear down / remove / clean up the worktree for feature/X."
- "Why is the service on port 3002 not 3000?" — wtb auto-bumps ports to avoid collisions.
- Any time the user wants to hit a local URL and you do not already know the port.

Also activate when `wtb.yaml`, `.wtb.yaml`, `.wtb.yml`, or `.wtb/config.yaml` exists at the repo root, even without an explicit trigger — that config is the sign wtb is in use.

## Which command to run

| User intent | Command | Why |
|---|---|---|
| "What port is X on?" | `wtb ports` | JSON by default, includes endpoints |
| "What worktrees exist?" | `wtb ls --json` | Fastest structured listing (1 git call) |
| "Show me everything (incl. Docker state)" | `wtb status -a` | Human-readable, includes containers/volumes |
| "Make a worktree" | `wtb create <branch>` | Always preview with `--dry-run` first if config is unfamiliar |
| "Remove a worktree" | `wtb remove <branch>` | **Destructive** — confirm with the user first |

Read-only commands (`ls`, `ports`, `status`) are safe to run autonomously. Mutating commands (`create`, `remove`) require explicit user intent.

## Discovering the current worktree's endpoints

Run `wtb ports` from anywhere inside the worktree and parse the JSON. **Do this before hitting any local service when the port is not obvious.** JSON is the default output — there is no `--json` flag.

```bash
wtb ports                # current worktree, JSON object
wtb ports --all          # every worktree, JSON array
wtb ports --pretty       # human-readable table (use only when displaying to user)
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

Reading the output:

- `env` only contains keys the user listed under `env.adjust` in `wtb.yaml` — it will not leak arbitrary `.env` secrets.
- `compose.services.<service>.host_ports[]` is the authoritative list of host-bound ports (already adjusted for the current worktree).
- `endpoints` is a pre-rendered list of `http://localhost:<host_port>` entries. Use these first; reach for `env.*_PORT` only if no compose file is present.
- If Docker is missing or the Compose file is absent, `compose.services` is `{}` — that is not an error. Use `env` values instead.
- Warnings (e.g. `📋 Loading configuration from: wtb.yaml`) go to stderr; stdout stays valid JSON. Pipe to `jq` safely.

When the user asks an open question like "check the health endpoint," pick the first `http://localhost:<port>` from `endpoints` (or reason from service names like `web` / `api` when multiple exist).

## Listing worktrees

```bash
wtb ls              # compact, marker for current worktree
wtb ls -l           # enriched: short hash, age, dirty flag, subject (parallel git calls)
wtb ls --json       # machine-readable; combines with -l for enrichment fields
wtb ls -p           # absolute paths only, one per line — pipe-friendly
```

JSON fields (always): `path, branch, head, isMain, isCurrent, locked, prunable, bare, detached`.
With `-l` adds: `shortHash, subject, ageRelative, ageTimestamp, dirty` (and `enrichmentError` if a worktree was unreadable).

Common idioms:

```bash
wtb ls --json | jq '.[] | select(.isCurrent == true)'        # current worktree
wtb ls -l --json | jq '.[] | select(.dirty == true) | .path' # dirty worktrees only
cd "$(wtb ls -p | fzf)"                                        # fuzzy-jump
```

## Creating a worktree

```bash
wtb create feature/my-new-feature
```

Phases (in order): `git worktree add` → copy gitignored files → create symlinks → copy-and-adjust `.env` → rewrite Compose ports → **clone Docker named volumes** → run `start_command`.

The volume-clone step is automatic when `docker_compose_file` is set: every named (non-`external`) Docker volume is copied from the source project to the new worktree's project, so e.g. PostgreSQL data carries over. **Volumes whose source container is running are skipped with a warning** to avoid corruption. If the user reports an unexpected skip, suggest they `docker compose down` on the source side first, or use `--force-volume-copy` if they accept the data-loss risk.

Useful flags:

- `--dry-run` — preview without touching anything. **Suggest this to the user before the real run** if the config is unfamiliar or recently changed.
- `-p <path>` — custom worktree location (default: `../worktree-<branch-with-slashes-as-dashes>`).
- `--no-create-branch` — attach to an existing branch instead of creating a new one.
- `--no-docker` / `--no-env` / `--no-copy` / `--no-link` / `--no-start` — skip individual phases.
- `--no-volume-copy` — skip the volume-clone phase entirely (start with empty volumes).
- `--force-volume-copy` — clone even when source containers are running or the target already has data (data-loss risk; dev only).

After creation, the new worktree path is printed at the end. `cd` there, then re-run `wtb ports` to see the *new* worktree's adjusted ports.

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
- `--remove-volumes` — also delete the worktree's Docker volumes (`docker compose down -v`). **Destructive for cloned data — confirm with the user.**

Ordering is: Docker teardown → `end_command` → `git worktree remove`. Setting `end_command` in `wtb.yaml` suppresses the automatic Docker teardown (the user owns shutdown). The default leaves volumes intact (consistent with `docker compose down`); use `--remove-volumes` only if the user explicitly wants the data gone.

## Inspecting state

```bash
wtb status              # current branch + Docker state (human-readable)
wtb status -a           # all worktrees
wtb status --docker-only # skip the worktree section
```

Use `wtb status` for diagnosis when ports look wrong or services are missing — it shells out to `docker ps` and `docker volume ls` to show what is actually running. There is no JSON mode; for scripting use `wtb ls --json` and `wtb ports --all`.

## Config quick reference

`wtb.yaml` (or `.wtb.yaml` / `.wtb/config.yaml`) at the repo root. Read it when the user asks "what does wtb do on create?" or when their request hinges on what is configured.

| Field | Purpose |
|-------|---------|
| `base_branch` | Branch new worktrees fork from (default `main`). |
| `docker_compose_file` | Compose file to copy + port-remap. Empty/omitted = Docker skipped. |
| `copy_files` | Files/dirs copied into each worktree (e.g. `.env`). |
| `link_files` | Files/dirs symlinked (e.g. `node_modules`) — priority over `copy_files`. |
| `start_command` / `end_command` | Lifecycle scripts run via `/bin/sh` in the worktree. |
| `env.file` | Env files processed per worktree. |
| `env.adjust` | Per-key transform: `number` = auto-bump to next free port, `string` = literal replace, `null` = remove. |
| `volumes.exclude` | Compose volume keys to exclude from auto-cloning. Default `[]` (clone every named non-`external` volume). |

## Troubleshooting hints

- "Port still collides" → wtb only scans other worktrees' `.env` files and running Docker containers. Anything else listening on the port is invisible to it. Check with `lsof -i :<port>` and stop the offender.
- "Not in a git repository" (exit 3) → run from inside the repo.
- "Worktree for branch 'X' already exists" → `wtb ls` shows where; `wtb remove X` to clear.
- Docker daemon down → `wtb ports` still works, `compose.services` will be `{}`. `wtb remove` skips teardown gracefully.
- Config validation error (exit 4) → fields like `base_branch` missing or wrong type. The error message names the bad field.

## Conventions

- All read-only commands (`ls`, `ports`, `status`) are safe to run without confirmation. `create` and `remove` mutate state — confirm first.
- `wtb ports` and `wtb ls --json` produce **valid JSON on stdout even when Docker is unavailable**. Warnings and progress logs go to stderr, so `2>/dev/null` keeps pipes clean.
- Exit codes: `0` success, `1` general error, `2` usage, `3` not-a-git-repo, `4` config error, `5` Docker error.
- `wtb --help` and `wtb <command> --help` are always available for live reference.
