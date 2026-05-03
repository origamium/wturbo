# wtb

**Switch between multiple branch environments in an instant.**

A CLI tool built on Git worktrees that gives every branch its own isolated working directory — with automatic `.env` copying, port remapping, Docker Compose isolation, and symlinks for heavy directories like `node_modules`.

[![npm version](https://img.shields.io/npm/v/@schemelisp/wtb.svg)](https://www.npmjs.com/package/@schemelisp/wtb)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

[日本語 / Japanese README](README_ja.md)

---

## Table of contents

- [Why wtb?](#why-wtb)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Commands](#commands)
  - [`create`](#wtb-create-branch)
  - [`remove`](#wtb-remove-branch)
  - [`ls` / `list`](#wtb-ls-alias-list)
  - [`ports`](#wtb-ports)
  - [`status`](#wtb-status)
  - [`init-claude`](#wtb-init-claude)
- [Configuration](#configuration)
- [Environment variable adjustment](#environment-variable-adjustment)
- [Docker Compose integration](#docker-compose-integration)
- [Lifecycle scripts](#lifecycle-scripts)
- [Architecture](#architecture)
- [Development](#development)
- [Design notes](#design-notes)
- [Requirements](#requirements)
- [Claude Code integration](#claude-code-integration)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Changelog](#changelog)
- [License](#license)

## Why wtb?

Git worktrees are powerful but awkward on their own: every new working directory needs its gitignored files copied, dependencies installed, ports remapped, and long-lived services restarted. wtb automates that glue so each branch feels like a self-contained mini-environment.

Typical use cases:

- You're in the middle of a feature branch and an urgent hotfix lands — spin up a second working directory in seconds.
- You want several feature branches building, testing, or serving in parallel without port collisions.
- You need a clean checkout to review a PR without stashing, resetting, or killing your running dev server.
- You'd like `.env`, local configs, or credentials automatically copied (and adjusted) to each new worktree.
- You run Docker Compose and need each branch's services on their own ports.

## How it works

```
project/                        ← main worktree (your original repo)
├── wtb.yaml
├── .env                        APP_PORT=3000
├── docker-compose.yml          3000:80
├── node_modules/
└── src/

worktree-feature-auth/          ← created by `wtb create feature/auth`
├── .env                        APP_PORT=3001   (auto-bumped, collision-free)
├── docker-compose.yml          3001:80         (auto-bumped)
├── node_modules -> ../project/node_modules     (symlinked, not copied)
└── src/                        (git worktree — shares the same .git)
```

When you run `wtb create <branch>`, the tool walks these phases in order:

1. **Worktree** — `git worktree add` at `../worktree-<sanitized-branch>/` (or a custom `-p <path>`), branching from `base_branch` unless the branch already exists.
2. **Copy files** — `copy_files` (gitignored configs, secrets, etc.) are copied over. Paths also listed in `link_files` are skipped here.
3. **Symlink** — `link_files` entries are symlinked back to the source (existing files/dirs/symlinks are replaced safely).
4. **Environment files** — `env.file` entries are copied; if `env.adjust` is non-empty, port-style values are bumped to the next free port that doesn't collide with other worktrees' `.env` files.
5. **Docker Compose** — if `docker_compose_file` is configured, wtb reads it, remaps host ports around running containers, and writes the adjusted copy into the worktree.
6. **Start command** — `start_command`, if configured, runs inside the new worktree with `/bin/sh`.

`wtb remove <branch>` runs in reverse: `docker compose down` (unless `end_command` is set), then `end_command`, then `git worktree remove`.

## Quick start

### 1. Install

```bash
npm install -g @schemelisp/wtb
# or one-shot
npx @schemelisp/wtb create feature/awesome
```

### 2. Drop a config in your repo root

```yaml
# wtb.yaml
base_branch: main

copy_files:
  - .env
  - .env.local

link_files:
  - node_modules

env:
  file:
    - .env
  adjust:
    APP_PORT: 1       # auto-bump to the next free port
    DB_PORT: 1
```

### 3. Use it

```bash
wtb create feature/awesome
cd ../worktree-feature-awesome
# ...hack...
wtb remove feature/awesome
```

Preview without touching anything:

```bash
wtb create feature/awesome --dry-run
```

## Commands

### `wtb create <branch>`

Creates a new worktree for `<branch>`, branching from `base_branch` unless the branch already exists.

**Pipeline (short version):** worktree → copy → symlink → env → compose → start.

**Default path:** `../worktree-<branch-with-"/"-replaced-by-"-">`. Use `-p` to override.

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Custom worktree location |
| `--no-create-branch` | Use an existing branch (fails if it doesn't exist) |
| `--no-docker` | Skip Docker Compose copy/port-remap |
| `--no-env` | Skip `env.file` copy + `env.adjust` |
| `--no-copy` | Skip `copy_files` |
| `--no-link` | Skip `link_files` symlinks |
| `--no-start` | Skip `start_command` |
| `--dry-run` | Print the plan, make no changes |

Examples:

```bash
wtb create feature/quick-fix --no-docker        # skip Docker even if configured
wtb create feature/wip --no-start               # skip install/setup
wtb create release/v2 --no-create-branch        # attach to an existing branch
wtb create feature/minimal \
  --no-docker --no-env --no-copy --no-link --no-start  # bare git worktree only
wtb create feature/test --dry-run               # preview
wtb create feature/auth -p /tmp/auth-wt         # custom path
```

### `wtb remove <branch>`

Removes the worktree that owns `<branch>`. Guards against removing the main repository.

| Option | Description |
|--------|-------------|
| `-f, --force` | Pass `--force` to `git worktree remove` (uncommitted changes) |
| `--no-docker` | Skip `docker compose down` in the worktree |
| `--no-end` | Skip `end_command` |

Ordering: Docker teardown → `end_command` → `git worktree remove`. If `end_command` is set, wtb assumes you own teardown and skips the automatic `docker compose down`.

```bash
wtb remove feature/old --no-docker          # Docker daemon already stopped
wtb remove feature/abandoned -f --no-end    # force-remove, skip cleanup
```

### `wtb ls` (alias: `list`)

Lightweight, scriptable listing of worktrees — like Unix `ls`. Use this instead of `status` when you just want to see what worktrees exist, without the Docker noise.

| Option | Description |
|--------|-------------|
| `-l, --long` | Long format: short hash, relative age, dirty flag, subject |
| `--json` | Machine-readable JSON (combines with `-l` for enriched fields) |
| `-p, --paths` | Absolute paths only, one per line — pipe-friendly |

**Default (compact, 1 git call):**

```
→ main            /Users/me/proj                          [main]
  feature/api     /Users/me/proj-worktrees/feature-api
  feature/ui      /Users/me/proj-worktrees/feature-ui     [locked]
  hotfix/crash    /Users/me/proj-worktrees/hotfix-crash   [prunable]
  (detached)      /Users/me/proj-worktrees/detached-xyz
```

**Long (`-l`, extra `git log`/`git status` per worktree in parallel):**

```
  BRANCH          COMMIT   AGE        D  PATH                                   TAGS / SUBJECT
→ main            a1b2c3d  2h ago     *  /Users/me/proj                         [main] Add foo
  feature/api     9f8e7d6  3d ago        /Users/me/proj-worktrees/feature-api   WIP refactor
```

Legend:

- `→` in column 0 marks the worktree that contains your current working directory (works even in detached HEAD).
- Tags: `[main]` (main repository worktree), `[locked]` (`git worktree lock`), `[prunable]` (worktree directory gone), `[bare]` (bare repository).
- `D` column: `*` means the worktree has uncommitted changes.

**Paths-only for shell pipelines:**

```bash
cd "$(wtb ls -p | fzf)"                       # fuzzy-jump between worktrees
wtb ls -p | xargs -I{} du -sh {}              # disk usage per worktree
```

**JSON:**

```bash
wtb ls --json | jq '.[] | select(.isMain == false) | .path'
wtb ls -l --json | jq '.[] | select(.dirty == true)'
```

JSON fields (always): `path, branch, head, isMain, isCurrent, locked, prunable, bare, detached`.
With `-l`: adds `shortHash, subject, ageRelative, ageTimestamp, dirty` — plus `enrichmentError` if per-worktree enrichment failed (e.g., prunable).

### `wtb ports`

Prints the adjusted `env.adjust` values, Docker Compose host/container ports, and a pre-rendered `http://localhost:<port>` endpoint list for the current worktree (or all worktrees).

| Option | Description |
|--------|-------------|
| `--all` | Output an array of every worktree's ports (default: current worktree as an object) |
| `--pretty` | Human-readable table instead of JSON |

Designed to be called from Claude Code (via the [shipped skill](#claude-code-integration)) or from shell scripts. See [Claude Code integration](#claude-code-integration) for the full output schema.

### `wtb status`

Richer inspection: worktrees + Docker Compose services + running containers + volumes. Slower than `ls` because it shells out to Docker.

| Option | Description |
|--------|-------------|
| `-a, --all` | Show all worktrees (default: current branch only) |
| `--docker-only` | Suppress worktree section, show only Docker info |

```
📁 Git Worktrees Status

→ main (main)
   📂 /Users/me/project
   🐳 Docker: docker-compose.yml
   📦 Services: 3
   🔧 Environment: .env, .env.local
```

### `wtb init-claude`

Installs the bundled Claude Code skill into this repo (or globally). See [Claude Code integration](#claude-code-integration) for what the skill does.

| Option | Description |
|--------|-------------|
| `-f, --force` | Overwrite an existing `SKILL.md` |
| `--user` | Install at `~/.claude/skills/wtb/` instead of the repo |
| `--dry-run` | Print the target path; don't write |

## Configuration

wtb searches for a config file in this order and stops at the first match:

1. `wtb.yaml`
2. `wtb.yml`
3. `.wtb.yaml`
4. `.wtb.yml`
5. `.wtb/config.yaml`
6. `.wtb/config.yml`

If nothing is found, wtb still runs with defaults (prints a warning to stderr). The config is **merged with defaults** — any field you omit gets the default.

### Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base_branch` | string | `"main"` | Base branch used when creating a brand-new branch |
| `docker_compose_file` | string | `""` | Path (relative to config) to the Compose file. Empty/omitted → Docker skipped entirely |
| `copy_files` | string[] | `[]` | Files/dirs to copy to new worktrees (even if gitignored). Directories are copied recursively |
| `link_files` | string[] | `[]` | Files/dirs to symlink into the new worktree. Takes **priority** over `copy_files` on duplicates |
| `start_command` | string | — | Runs in the new worktree via `/bin/sh` after creation. Relative scripts are resolved against the worktree root |
| `end_command` | string | — | Runs in the worktree before removal. Setting this **suppresses** the automatic `docker compose down` |
| `env.file` | string[] | `["./.env"]` | Env files to copy into the worktree |
| `env.adjust` | map | `{}` | Per-key adjustment (see [Environment variable adjustment](#environment-variable-adjustment)) |

### Validation

On load, wtb validates the config:

- **Errors** (fail with exit code `4`): wrong types, missing/invalid `base_branch`, non-array `copy_files`/`link_files`, invalid `env.adjust` value type.
- **Warnings** (stderr, keep running): referenced `docker_compose_file` / `env.file` not found on disk.

### Annotated example

```yaml
# wtb.yaml — full example
base_branch: main
docker_compose_file: ./docker-compose.yml

# Copied into each new worktree even when gitignored
copy_files:
  - .env
  - .env.local
  - .secrets
  - config/

# Symlinked back to the source repo — avoid copying giant dirs
link_files:
  - node_modules
  - .cache
  - .next/cache

# Lifecycle scripts — run inside the worktree via /bin/sh
start_command: npm install && npm run db:migrate
end_command:   docker compose down -v

env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1          # any number → "auto-bump to the next free port"
    DB_PORT: 1
    API_KEY: "dev-key"   # string → literal replacement
    DEBUG_PORT: null     # null → remove the variable entirely
```

## Environment variable adjustment

`env.adjust` lets you rewrite values in every env file as it is copied. Three value types are supported:

| Value type | Behavior on existing key | Behavior when key is absent |
|------------|--------------------------|-----------------------------|
| **number** | Scans other worktrees + this file for the same key's port, then picks the first free port starting at `original + 1`. The number literal itself is used as a type marker — any positive integer works. | Key is appended with the number literal as its value, annotated `# Added by wtb`. |
| **string** | Value is replaced verbatim. | Key is appended with the string value. |
| **null**   | Key is removed from the output. | No-op. |

Port collision sources considered:

1. Other worktrees' `.env` files (only for keys listed as numbers in `env.adjust`).
2. Other numeric entries in the current adjustment pass (so a single file doesn't collide with itself).

Key naming: only POSIX-compliant names are valid (`^[A-Za-z_][A-Za-z0-9_]*$`). Invalid names are reported with a suggested sanitized form.

## Docker Compose integration

When `docker_compose_file` is set and the file exists:

1. wtb reads it from the source repo.
2. Calls `docker ps` to collect ports already claimed by running containers.
3. For every `services.*.ports` mapping, the host port is rewritten to the first free port at/above the original, honoring the running-container set plus any ports already remapped in this pass.
4. Writes the adjusted Compose file into the worktree at the same relative path.

Notes:

- Port format recognized: `HOST:CONTAINER`, `0.0.0.0:HOST:CONTAINER`, optional `/tcp`/`/udp`.
- The **original** host port is tried first — if the base port is free, it's kept. (Env-file adjustment is stricter and always starts at `original + 1`.)
- If Docker isn't installed or the daemon isn't running, wtb copies the Compose file without remapping and prints a warning — your worktree still works, you just own port collisions.
- `wtb remove` calls `docker compose down` in the worktree before removing it, unless `end_command` is set (then you own teardown) or `--no-docker` is passed.
- Disable Compose integration entirely by omitting the field or setting it to `""`.

## Lifecycle scripts

`start_command` and `end_command` run inside the worktree with `cwd` set to the worktree root and a `/bin/sh` shell. For `start_command`, wtb first tries resolving the string as a path relative to the worktree (so `./scripts/setup.sh` works); if the file doesn't exist it's passed to the shell as-is (so `npm install && npm run dev` also works).

Script failures are **non-fatal** — wtb prints a warning and the worktree is left in place so you can finish the setup manually.

## Architecture

```
src/
├── cli/
│   ├── commands/      create, remove, ls, ports, status, init-claude
│   ├── utils/         worktree/ports renderers, command error wrapper, claude skill installer
│   └── index.ts       commander wiring + global error handlers
├── core/
│   ├── config/        YAML loader + validator + defaults merge
│   ├── git/           repository / worktree / commit-info helpers
│   ├── docker/        `docker ps`, compose parse/write, port adjust
│   └── environment/   .env parser (order-preserving) + adjust + serialize
├── utils/             safe exec helpers (execFileSync wrappers), errors
├── types/             all public types (WtbConfig, WorktreeInfo, …)
├── constants/         defaults, command templates, regex, exit codes
└── index.ts           library entry point
```

For full module-by-module API surface and design rationale, see [ARCHITECTURE.md](ARCHITECTURE.md).

Key design choices:

- **`execFileSync` everywhere for git/docker.** Arguments are passed as arrays, never interpolated into strings — no shell injection surface on branch names or paths. The one exception is user-supplied lifecycle scripts, which intentionally run via `/bin/sh`.
- **Defaults-merge with `??`.** Missing fields fall back to defaults, but empty arrays/strings you explicitly set are preserved.
- **Order-preserving `.env` parsing.** Comments, blank lines, and inline `# comments` survive the copy + adjust round-trip.
- **Pure renderers for `ls`.** `renderDefault`/`renderLong`/`renderPaths`/`renderJson` are unit-tested in isolation; the command module just wires them up.
- **Enrichment is best-effort.** `ls -l` falls back gracefully on prunable/broken worktrees and still prints the rest — the failure is surfaced in JSON as `enrichmentError`.

Exit codes (`src/constants/index.ts`):

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid CLI usage |
| `3` | Not in a git repository |
| `4` | Configuration error |
| `5` | Docker error |

## Development

```bash
git clone https://github.com/origamium/wtb.git
cd wtb
npm install

npm run dev                    # run the CLI from source (tsx)
npm run build                  # tsc → dist/
npm start                      # run the built CLI

npm run test                   # vitest watch
npm run test:run               # vitest once
npm run test:unit              # unit tests (src/)
npm run test:e2e               # e2e (creates real git repos under test-repos/)
npm run test:ui                # vitest UI

npm run typecheck              # tsc --noEmit
npm run lint                   # biome lint
npm run format                 # biome format --write
npm run check                  # biome check --write (lint + format)
```

E2E tests (`e2e/`) create temporary git repos and exercise the compiled CLI end-to-end. See `sample/` for a runnable playground — a tiny Next.js + Postgres stack with a real `wtb.yaml`, `.env`, and `docker-compose.yml`.

## Design notes

- **Symlinks beat copies for large trees.** `node_modules`, `.cache`, `.next/cache` should almost always go in `link_files`. One source of truth, zero disk duplication, instant worktree creation. The tradeoff: native modules rebuilt for a different platform in one worktree affect all of them — use `copy_files` for those.
- **Branch name sanitization.** `/` in branch names becomes `-` in the default path: `feature/auth` → `worktree-feature-auth`. Use `-p <path>` if you need full control.
- **Docker is optional at every step.** Omit `docker_compose_file`, or install without Docker, or pass `--no-docker` — wtb degrades gracefully and only produces Docker-related output when Docker is reachable.
- **`wtb ls` vs `wtb status`.** `ls` is for fast, scriptable enumeration (1 git call in the default form). `status` is for human inspection with Docker context. Use `ls -l --json` in scripts.
- **Dry-run is honest.** `--dry-run` walks every phase and prints what it *would* do, including which files are missing and would be skipped.

## Requirements

- Node.js **≥ 18**
- Git (any modern version with `worktree` support)
- Docker + Docker Compose (optional — only if `docker_compose_file` is configured)

## Claude Code integration

wtb ships a [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills) that teaches the agent how to inspect this repo's worktrees and call the CLI itself. Once installed, Claude can answer *"what port is this worktree on?"* or *"spin up a worktree for feature/auth"* without any hand-holding.

### Install once per repo

```bash
wtb init-claude                          # writes .claude/skills/wtb/SKILL.md
git add .claude/skills/wtb
git commit -m "chore: install wtb Claude Code skill"
```

Because `.claude/skills/` is a regular tracked directory, every worktree you create with `git worktree add` / `wtb create` automatically inherits the skill — there is nothing to sync per-worktree.

Prefer a global install?

```bash
wtb init-claude --user                   # writes ~/.claude/skills/wtb/SKILL.md
```

Flags: `-f, --force` (overwrite existing), `--user` (global), `--dry-run` (preview target path only).

### `wtb ports` — the data source

The skill tells Claude to call `wtb ports --json`. The command is useful on its own too:

```bash
wtb ports                                # current worktree as a JSON object
wtb ports --all                          # every worktree as a JSON array
wtb ports --pretty                       # human-readable
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

Notes:

- `env` only contains keys listed under `env.adjust` in `wtb.yaml` — other `.env` entries (secrets, API keys) are **not leaked**.
- `compose.services` is populated from the worktree's copy of the Compose file, so it reflects the *already-adjusted* ports.
- `endpoints` is a convenience list of `http://localhost:<port>` entries built from compose host ports.
- stdout stays valid JSON even if Docker isn't installed (`compose.services` becomes `{}`). Warnings go to stderr.

### What Claude sees

With the skill installed, typical prompts just work:

| You say | Claude does |
|---------|-------------|
| "What port is the API on here?" | `wtb ports --json` → picks the right host port |
| "List the worktrees." | `wtb ls -l` |
| "Make a worktree for feature/login." | `wtb create feature/login` (prompts you first if destructive) |
| "Clean up feature/old." | `wtb ls -l` to show the target → confirms → `wtb remove feature/old` |

The skill's `description` triggers automatically when `wtb.yaml` is in the repo, so you usually don't need to invoke it by hand.

## Troubleshooting

### "Not in a git repository" (exit 3)
Run wtb from anywhere inside your repo. It discovers the git root via `git rev-parse --show-toplevel`.

### Ports still collide
wtb adjusts against *known* sources:

- For `.env` files: other worktrees' `.env` files containing the same key.
- For Docker Compose: currently running containers and the ports it remapped earlier in the same pass.

It does **not** probe arbitrary OS-level listening sockets. If something outside Docker is holding a port (a native dev server you started by hand, another project on the same machine, etc.), you'll need to stop it or edit `env.adjust` manually. Check `wtb status -a` to see what wtb thinks is going on.

### "Worktree for branch 'X' already exists"
The branch already has a worktree. `wtb ls` shows where it is. `wtb remove X` cleans it up first.

### `git worktree add` fails with "invalid reference"
The branch doesn't exist and you passed `--no-create-branch`. Drop that flag to create it, or check your branch name.

### Config validation failed (exit 4)
The config is structurally invalid — the error lists each bad field. Warnings about missing `docker_compose_file` / `env.file` paths are non-fatal and go to stderr.

### `start_command` failed
wtb leaves the worktree in place and prints a warning. Finish setup manually in the worktree, then proceed.

### Docker daemon stopped mid-session
`docker compose down` on `remove` fails silently with a warning; the worktree still gets removed. On `create`, wtb skips port adjustment (Compose file is copied verbatim).

## FAQ

**Is this different from `git worktree add`?**
wtb *uses* `git worktree add` under the hood, then layers on the environment-sync logic that git itself doesn't handle: gitignored config files, symlinks, env-var remapping, Compose port adjustment, and lifecycle scripts.

**Do I have to use Docker?**
No. Leave `docker_compose_file` empty (or omit it) and the Docker phases are skipped entirely. Everything else — copy, symlink, env adjust, lifecycle scripts — still works.

**What happens to my `.git` directory?**
Untouched. Every worktree shares the same `.git` via Git's native worktree mechanism; disk usage stays flat.

**Can I use this in CI?**
Yes — but lifecycle scripts, Docker integration, and port remapping are mostly useful on a dev box. In CI, `wtb create <branch> --no-docker --no-start --no-link` gives you a clean isolated checkout fast.

**Why the "wtb" name?**
Short for "worktree turbo" — git worktrees, but with the environment-wrangling turbocharged.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

[MIT](LICENSE) © ONOUE Origami
