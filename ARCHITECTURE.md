# wtb Architecture

`wtb` は **Git worktree ごとに Docker Compose 環境を分離する CLI** です。
1 リポジトリ内の複数ブランチをポート競合なしに同時に立ち上げ、`.env` の値を worktree ごとに自動調整し、Claude Code から worktree 固有のポートを発見可能にします。

対象バージョン: **1.0.1** (`@schemelisp/wtb`)

---

## ディレクトリ構造

```
src/
├── index.ts                         # エクスポート集約（cli/index から再エクスポート）
├── cli/
│   ├── index.ts                     # Commander プログラム生成・エラーハンドリング・main()
│   ├── commands/                    # サブコマンド実装（1 ファイル = 1 コマンド）
│   │   ├── create.ts                # wtb create — 7 フェーズの worktree 構築パイプライン
│   │   ├── remove.ts                # wtb remove — Docker teardown / end_command / worktree 削除
│   │   ├── ls.ts                    # wtb ls   — worktree 一覧（-l で並列 enrichment）
│   │   ├── ports.ts                 # wtb ports — 調整後ポート/エンドポイント表示
│   │   ├── status.ts                # wtb status — worktree + Docker 状態
│   │   ├── init-claude.ts           # wtb init-claude — Claude Skill 配置
│   │   ├── ls.test.ts
│   │   └── status.test.ts
│   └── utils/                       # CLI 出力レンダリング & インストーラ
│       ├── worktree-render.ts       # ls 用 pure renderer (default/-l/--json/-p)
│       ├── ports-render.ts          # ports 用 pure renderer (JSON / pretty)
│       ├── claude-skill-install.ts  # SKILL.md テンプレートのコピー処理
│       ├── progress.ts              # 進捗表示 (creates 用)
│       └── *.test.ts
├── core/                            # ドメインロジック（CLI 非依存）
│   ├── index.ts
│   ├── config/
│   │   ├── loader.ts                # findConfigFile / loadConfig / mergeWithDefaults
│   │   └── validator.ts             # validateConfig (errors throw, warnings → stderr)
│   ├── git/
│   │   ├── repository.ts            # isGitRepository / getGitRoot / getCurrentBranch / branchExists
│   │   ├── worktree.ts              # listWorktrees / createWorktree / removeWorktree (porcelain parser)
│   │   └── commit-info.ts           # enrichWorktree (ls -l 用: shortHash/age/dirty)
│   ├── docker/
│   │   ├── client.ts                # getRunningContainers / getDockerVolumes / getUsedPorts / isWtbContainer
│   │   ├── compose.ts               # readComposeFile / writeComposeFile / parsePortMapping / adjustPortsInCompose
│   │   └── volume.ts                # ボリュームユーティリティ
│   └── environment/
│       └── processor.ts             # parseEnvFile / copyAndAdjustEnvFile (順序保存・null 削除)
├── utils/
│   ├── exec.ts                      # execSafeSync / execGitSafe / execDockerSafe / executeLifecycleCommand
│   └── error.ts                     # getErrorMessage / CLIError
├── constants/
│   └── index.ts                     # APP_NAME, CONFIG_FILE_NAMES, WTB_PREFIX, PORT_RANGE …
├── types/
│   └── index.ts                     # 全 interface 定義
└── test/
    ├── setup.ts                     # vitest セットアップ
    ├── helpers/
    │   ├── git-test-helper.ts       # createWtbConfig など
    │   └── docker-test-helper.ts
    └── fixtures/
        └── docker-project/          # docker-compose + init-db フィクスチャ

e2e/
├── cli.test.ts                      # CLI を子プロセスで起動するシナリオテスト (101 件)
├── helpers.ts                       # createTestRepo / runCLI / cleanup
└── projects/                        # フィクスチャプロジェクト（basic, edge-cases, env-adjust,
                                     # full-featured, link-files, missing-files, no-docker）

templates/
└── claude/skills/wtb/SKILL.md       # init-claude が配布する Skill 定義

sample/
├── docker-compose.yml               # PostgreSQL + Next.js + Debian の見本
├── wtb.yaml                         # ポート調整・env.adjust 例
├── start-dev.sh / stop-dev.sh
├── next-app/                        # Next.js アプリ
└── README.md
```

---

## レイヤと依存関係

```
              cli/commands ──┐
                             ├──► core/* ──► utils/*
              cli/utils    ──┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
              types/index                              constants/index
```

- **CLI 層** (`src/cli/`) は Commander で引数解析し、core を呼び出して結果をレンダリングする。プロセス終了コードと標準出力管理を担う。
- **Core 層** (`src/core/`) は CLI に非依存のドメインロジック。Git / Docker / 設定 / 環境変数処理。
- **Utils 層** (`src/utils/`) は外部コマンド実行とエラー整形のみ。
- **Types** と **Constants** はすべての層から参照可能。逆方向の依存は禁止。

---

## 公開 API（モジュール別）

すべて ES Module。import パスはビルド後の `.js` 拡張子で記述（例: `from "../core/git/repository.js"`）。

### `src/constants/index.ts`

| 名前 | 値 / 意味 |
| --- | --- |
| `APP_NAME` | `"wtb"` |
| `APP_VERSION` | `package.json` から動的取得（現状 `"1.0.1"`） |
| `APP_DESCRIPTION` | CLI 説明文 |
| `CONFIG_FILE_NAMES` | `["wtb.yaml", "wtb.yml", ".wtb.yaml", ".wtb.yml", ".wtb/config.yaml", ".wtb/config.yml"]` |
| `DEFAULT_CONFIG` | 設定のデフォルト値（`base_branch: "main"`, `env.file: ["./.env"]` …） |
| `COMPOSE_FILE_NAMES` | `["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]` |
| `ENV_FILE_NAMES` | `[".env", ".env.local", ".env.development", ".env.production"]` |
| `DOCKER_COMMANDS` | `docker ps` / `docker inspect` / `docker volume ls` / `docker --version` 等のコマンド文字列 |
| `PORT_RANGE` | `{ MIN: 3000, MAX: 9999, SEARCH_LIMIT: 100 }` |
| `EXIT_CODES` | `SUCCESS=0` / `GENERAL_ERROR=1` / `INVALID_USAGE=2` / `NOT_GIT_REPOSITORY=3` / `CONFIG_ERROR=4` / `DOCKER_ERROR=5` |
| `LOG_LEVELS` | `error / warn / info / debug` |
| `ENV_VAR_PATTERNS` | 環境変数名のバリデーション用正規表現一式 |
| `WTB_PREFIX` | `"WTB_"` — wtb 由来コンテナ識別用 env プレフィックス |
| `FILE_ENCODING` | `"utf-8"` |
| `TEMP_DIR_PREFIX` | `"wtb-"` |
| `BACKUP_EXTENSION` | `".backup"` |

### `src/types/index.ts` — 主要な型

```typescript
interface WtbConfig {
  base_branch: string
  docker_compose_file: string
  copy_files: string[]
  link_files: string[]                       // copy_files より優先
  start_command?: string
  end_command?: string                       // セット時は Docker teardown を肩代わり
  env: { file: string[]; adjust: Record<string, string | number | null> }
}

interface WorktreeInfo { path; branch; head; locked?; prunable?; bare?; detached? }
interface EnrichedWorktreeInfo extends WorktreeInfo {
  shortHash; subject; ageRelative; ageTimestamp; dirty; enrichmentError?
}

interface WorktreePorts {
  path: string
  branch: string
  env: Record<string, string>                // env.adjust に列挙された key の現値
  compose: { file: string | null; services: Record<string, ComposeServicePorts> }
  endpoints: string[]                        // http://localhost:<host_port>
}

interface ContainerInfo { id; name; image; status; ports; volumes; networks }
interface ComposeConfig { version?; services: Record<string, ComposeService>; volumes?; networks? }
```

その他: `LsCommandOptions`, `PortsCommandOptions`, `InitClaudeOptions`, `ComposeService`, `VolumeInfo`, `EnvConfig`, `FileOperationOptions`, `ExecOptions`, `CommandOptions`, `CommandContext`。

### `src/core/git/`

```typescript
// repository.ts
isGitRepository(cwd?): boolean
getGitRoot(cwd?): string
getCurrentBranch(cwd?): string
branchExists(name, cwd?): boolean

// worktree.ts
listWorktrees(cwd?): WorktreeInfo[]                       // git worktree list --porcelain をパース
createWorktree(branch, path, opts?): void
removeWorktree(path, opts?): void
getWorktreePath(branch, cwd?): string | null

// commit-info.ts
enrichWorktree(wt: WorktreeInfo): Promise<EnrichedWorktreeInfo>   // ls -l 用
```

### `src/core/docker/`

```typescript
// client.ts
getRunningContainers(opts?): ContainerInfo[]              // docker ps をパース
getDockerVolumes(opts?): VolumeInfo[]
getUsedPorts(opts?): number[]                             // 稼働中コンテナの host port 一覧
isWtbContainer(c: ContainerInfo): boolean                 // 名前に "wtb" を含む or WTB_* env と一致

// compose.ts
readComposeFile(path, opts?): ComposeConfig
writeComposeFile(path, config, opts?): void
parsePortMapping(s): { hostPort; containerPort } | null   // "0.0.0.0:3000:80/tcp" などを解釈
adjustPortsInCompose(config, usedPorts): ComposeConfig    // 衝突しないよう host port を昇順割当
findComposeFile(dir): string | null
generateProjectName(dir, branch?): string
```

### `src/core/environment/processor.ts`

```typescript
parseEnvFile(path, opts?): ParsedEnvFile                  // {lines: EnvLine[], entries: EnvEntry[]}
copyAndAdjustEnvFile(src, dst, adjust, opts?, usedPorts?): number   // 戻り値 = 調整した件数
backupEnvFile / restoreEnvFile                            // .backup 拡張子で保存・復元
```

`ParsedEnvFile.lines` は `{ type: "entry"; key; value; comment? } | { type: "other"; content }` のユニオン。**並び順とコメント・空行が完全に保存**される。

### `src/core/config/`

```typescript
loadConfig(dir?): WtbConfig                               // 検索 → YAML パース → defaults とマージ → validate
findConfigFile(dir?): { path; exists }
mergeWithDefaults(partial): WtbConfig                     // ?? 演算子で falsy-safe マージ
validateConfig(config, configFile): void                  // warning は stderr、error は throw
createDefaultConfig(path?): WtbConfig
```

### `src/cli/utils/claude-skill-install.ts`

```typescript
resolveTemplateRoot(): string                             // src/ と dist/ どちらからでも templates/ を解決
resolveTargetDir(opts, cwd?): string                      // --user → ~/.claude/skills/wtb / 既定 → <gitRoot>/.claude/skills/wtb
installClaudeSkill(opts, cwd?): Promise<InstallResult>
```

### `src/utils/exec.ts`

```typescript
execSafeSync(file, args[], opts?): string                 // execFileSync ラッパー（shell 経由なし）
execGitSafe(args[], opts?): string                        // execSafeSync("git", args)
execDockerSafe(args[], opts?): string
executeLifecycleCommand(command, cwd): void               // start_command / end_command 用は /bin/sh 経由
```

---

## コマンドのライフサイクル

### `wtb create <branch>` — 7 フェーズ

| Phase | 処理 | スキップ条件 |
| --- | --- | --- |
| 1. 検証 | `isGitRepository`, 既存 worktree チェック, パス決定, ブランチ存在確認 | — |
| 2. worktree 生成 | `git worktree add` (新規ブランチなら `-b <branch> <base_branch>`) | — |
| 3. copy_files | 各エントリを worktree にコピー（link_files に重複するものは除外） | `--no-copy` |
| 4. link_files | 既存実体を置換しつつシンボリックリンク作成 | `--no-link` |
| 5. env 処理 | `env.adjust` が空ならコピーのみ。あれば `copyAndAdjustEnvFile` で他 worktree のポートをスキャンしつつ調整 | `--no-env` |
| 6. compose 調整 | `readComposeFile` → `getUsedPorts` → `adjustPortsInCompose` → `writeComposeFile` | `--no-docker` または `docker_compose_file` 未設定 |
| 7. start_command | `/bin/sh` 経由で起動スクリプト実行（失敗しても worktree は残す） | `--no-start` または `start_command` 未設定 |

完了時、`.claude/skills/wtb/` が無ければ `wtb init-claude` を促す Tip を表示。

### `wtb remove <branch>`

- `end_command` がセットされていれば **Docker teardown はスキップ**（ユーザの責務）。なければ `docker compose down` を worktree 内で実行。
- `end_command` を `/bin/sh` 経由で実行（失敗しても続行）。
- `git worktree remove [--force] <path>`。

### `wtb ls`

- `listWorktrees()` 取得後、`--long` 時のみ `Promise.all(worktrees.map(enrichWorktree))` で並列に commit info を取得。
- 出力切替: 既定 / `-l` / `--json` / `-p` (paths only)。レンダリングは `cli/utils/worktree-render.ts` の pure 関数で完結。

### `wtb ports`

- 既定はカレント worktree のみ。`--all` で全 worktree。
- 各 worktree について `gatherPortsForWorktree()`:
  1. `config.env.file` 内の `config.env.adjust` キーの現値を抽出
  2. compose ファイルを `readComposeFile` → 各サービスの `ports` を `parsePortMapping` で分解
  3. host_ports から `http://localhost:<port>` を生成
- 既定は JSON 出力（Claude Code から機械パース用）。`--pretty` でテーブル。

### `wtb init-claude`

- テンプレート探索: `import.meta.url` から `../../../templates/claude/skills/wtb/SKILL.md` を解決（src/ と dist/ どちらからでも同じ相対深度）。
- 配置先: `--user` で `~/.claude/skills/wtb/`、既定で `<gitRoot>/.claude/skills/wtb/`。
- 既存ファイルがある場合: `--force` 無しならスキップ。`--dry-run` は対象パスのみ出力。

### `wtb status`

- worktree 一覧（既定はカレントのみ、`-a` で全件）と各 worktree の compose / env ファイル検出。
- Docker 状態は `isWtbContainer()` フィルタを通したコンテナと、`name` に `wtb` または `worktree` を含むボリューム。`docker_compose_file` が未設定なら省略。

---

## 横断的な設計判断

### ポート衝突回避

3 段階で重複を防ぐ:

1. **稼働中コンテナ**: `getUsedPorts()` が `docker ps` の host port を全列挙。
2. **他 worktree**: `create` は他 worktree の env ファイルを走査し、`env.adjust` キーの現値を `usedPorts` に合流させる（cross-worktree scan）。
3. **同ファイル内**: `copyAndAdjustEnvFile` は `assignedPorts: Set<number>` を持ち、同じ .env 内で同じ番号が二度割り当たらないようにする。

`findAvailablePort(base, used[])` は `base+1` から `PORT_RANGE.SEARCH_LIMIT (=100)` まで線形探索し、`PORT_RANGE.MIN/MAX (=3000/9999)` の枠内で最初の空きを返す。

### `.env` 順序保存と削除

- `parseEnvFile` は 1 行ずつ `EnvLine` ユニオン（`entry` または `other`）にパースする。コメントと空行は `other` として原文保持。
- 削除指示（`adjust: { KEY: null }`）は **`Set<string>` に集めてから一括フィルタ**。`__DELETE__` のようなセンチネル値を使わないため、ユーザの env 値が文字列リテラル `__DELETE__` でも安全。
- 数値の調整は `findNextFreePort` を経由してポートを自動採番。文字列はそのまま置換、関数なら値変換。

### シェルインジェクション防止

- Git / Docker 呼び出しはすべて `execFileSync(cmd, args[], …)` 経由（`execGitSafe` / `execDockerSafe`）。引数配列なのでメタ文字解釈なし。
- 例外は `executeLifecycleCommand` のみで、ユーザ提供の `start_command` / `end_command` を `/bin/sh` 経由で実行（パイプ・シェバン等のサポートが必要なため）。エスケープはユーザ責務。

### Claude Code Skill の配信

- `templates/claude/skills/wtb/SKILL.md` は `package.json` の `files` に含まれ npm tarball に同梱。
- `resolveTemplateRoot()` は `import.meta.url` から templates ディレクトリを解決する設計で、**src/ と dist/ どちらに居ても同じ相対深度（3 段上）** で解決可能。
- 配置後の `SKILL.md` の YAML frontmatter `name: wtb` が Claude Code 側のスキル識別子として使われる。

---

## テスト戦略

| カテゴリ | 場所 | 件数 (現状) | 主な内容 |
| --- | --- | --- | --- |
| ユニット | `src/**/*.test.ts` | 140 件 / 13 ファイル | 純関数（renderer, parser, validator, port adjustment）と外部 IO のモック |
| E2E | `e2e/cli.test.ts` | 101 件 / 1 ファイル | CLI を子プロセス起動し、temp git repo に対して全コマンドを通す |
| ヘルパ | `src/test/helpers/` | — | `createWtbConfig`, `createTestContainer` など |
| フィクスチャ | `src/test/fixtures/`, `e2e/projects/` | 7 プロジェクト | basic / edge-cases / env-adjust / full-featured / link-files / missing-files / no-docker |

実行: `npm run test:unit` / `npm run test:e2e` / `npm run test:run` (両方)。

ユニットテストは外部依存（`execSync`, `fs`, `yaml`）を `vi.mock` でモック。E2E テストはモックせず実 Git / 実ファイルシステムを使うが、Docker は条件付き（環境に Docker が無くても fall back する）。

---

## 配布

`package.json`:

```json
{
  "name": "@schemelisp/wtb",
  "bin": { "wtb": "dist/cli/index.js" },
  "files": ["dist", "templates", "README.md", "LICENSE"],
  "type": "module",
  "engines": { "node": ">=18" }
}
```

tarball に含まれるのは **`dist/`, `templates/`, `README.md`, `LICENSE`** のみ。`sample/` や `e2e/` は含まれない。

依存:

- ランタイム: `commander` (CLI), `fs-extra` (再帰コピー), `yaml` (parse/stringify)
- 開発: `typescript`, `vitest`, `@biomejs/biome`, `tsx`

---

## 既知の制約

- **ポート探索の上限**: `PORT_RANGE.SEARCH_LIMIT = 100`。ベースポートから 100 連続で空きが見つからない場合は警告と共に元ポートを返す（衝突する可能性あり）。100 ブランチ以上の同時稼働は想定外。
- **`COMPOSE_PROJECT_NAME` の自動設定なし**: `adjustPortsInCompose` はファイル内の `ports` を書き換えるが、コンテナ名やネットワーク名のプレフィックスは触らない。docker-compose.yml 側で `${COMPOSE_PROJECT_NAME:-...}` を使うのが推奨。
- **Windows 未対応**: `execFileSync` でのパス解釈と `/bin/sh` 依存により、現状は macOS / Linux 前提。
- **`end_command` セット時の Docker teardown**: ユーザ側で `docker compose down` を呼ぶ責務がある。設定し忘れるとコンテナが残る。
- **後方互換なし**: v1.0.1 の `wtb` は旧 `wturbo` 名の設定ファイル（`wturbo.yaml`）や env プレフィックス（`WTURBO_*`）を読まない。移行が必要。

---

## 拡張ポイント

- **新コマンド追加**: `src/cli/commands/<name>.ts` に `Command` を返す関数を実装し、`src/cli/index.ts` の `program.addCommand(...)` に登録。
- **新コア機能**: `src/core/<domain>/` 配下に純関数モジュールを作り、CLI から呼ぶ。型は `src/types/index.ts` に集約。
- **新 renderer**: `src/cli/utils/<command>-render.ts` に pure 関数として追加し、テストを `*.test.ts` で同居。

レンダリング・パース・バリデーションを **pure に保つ**（外部 IO を引数として注入する）ことで単体テストを高速かつ deterministic に維持する設計方針。
