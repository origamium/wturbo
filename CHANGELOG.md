# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **Dead code**: deleted `src/cli/utils/progress.ts` (Spinner, MultiVolumeProgressTracker)
  and `src/core/docker/volume.ts` (volume copy machinery). Neither was reachable from
  any CLI command. Net reduction ~630 LoC.

### Changed
- Centralized command error handling via new `withErrorHandling` wrapper
  (`src/cli/utils/command-helpers.ts`); all six commands now share the same
  CLIError-aware exit path.
- Added `getGitRootOrThrow()` guard in `src/core/git/repository.ts` to replace
  the duplicated `isGitRepository()` + `getGitRoot()` boilerplate across commands.
- `wtb status` now throws `CLIError` instead of calling `console.error` /
  `process.exit` directly, matching the other commands.
- `package.json#prepublishOnly` now runs the test suite in addition to clean+build,
  preventing publishes with a red test status.

## [1.0.1] – 2026-05-03

### Changed
- Rename: package `@schemelisp/wturbo` → `@schemelisp/wtb`,
  CLI binary `wturbo` → `wtb`, config files `wturbo.yaml` → `wtb.yaml`,
  env-var prefix `WTURBO_` → `WTB_`, and all internal identifiers
  (`WtbConfig`, `isWtbContainer`, …). No backwards-compat fallbacks.
- Repository URLs in `package.json` updated to `github.com/origamium/wtb`.
- Claude Code skill template moved to `templates/claude/skills/wtb/`.

## [1.0.0]

### Added
- `wtb create <branch>` — create git worktree with file copy/link, env adjustment,
  Docker Compose port collision avoidance, and lifecycle scripts.
- `wtb remove <branch>` — teardown including optional `end_command` and
  `docker compose down`.
- `wtb ls` — list worktrees with default/long/JSON/paths output modes.
- `wtb ports` — print adjusted ports and endpoints, JSON by default.
- `wtb status` — show worktree and Docker container/volume state.
- `wtb init-claude` — install Claude Code skill template (`.claude/skills/wtb/`).
- 7-phase create pipeline with `--no-docker`, `--no-env`, `--no-copy`, `--no-link`,
  `--no-start`, and `--dry-run` flags.

[Unreleased]: https://github.com/origamium/wtb/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/origamium/wtb/releases/tag/v1.0.1
[1.0.0]: https://github.com/origamium/wtb/releases/tag/v1.0.0
