# wtb

**複数ブランチの開発環境を一瞬で切り替える**

Git worktreeを使って、ブランチごとに独立した作業ディレクトリを作成・管理するCLIツールです。環境変数ファイルの自動調整、Docker Composeポートの衝突回避、重いディレクトリのsymlink対応を備えています。

[English](README.md)

## こんな時に便利

- メインブランチで作業中に、緊急のバグ修正が入った
- 複数の機能ブランチを並行して開発したい
- PRレビュー用に別ブランチをすぐに確認したい
- `.env`などgitignoreされたファイルも新しい作業環境にコピーしたい
- ブランチごとにDocker Composeサービスを異なるポートで動かしたい

## 仕組み

```
project/                        ← メインworktree（元のリポジトリ）
├── wtb.yaml
├── .env
├── docker-compose.yml
├── node_modules/
└── src/

worktree-feature-auth/          ← wtbが作成
├── .env                        ← コピー＆ポート調整済み
├── docker-compose.yml          ← コピー＆ポート調整済み
├── node_modules -> ../project/node_modules  ← symlink
└── src/                        ← git worktree（.git共有）
```

`wtb create` を実行すると:
1. Git worktreeを作成（同じ`.git`を共有する別の作業ディレクトリ）
2. 指定したgitignoreファイルをコピー（`.env`、設定、秘密鍵など）
3. 重いディレクトリのsymlinkを作成（`node_modules`、`.cache`）
4. `.env`ファイルのポート番号を自動調整して衝突を回避
5. Docker Composeファイルをポート自動リマップしてコピー
6. セットアップスクリプトを実行（設定時のみ）

## クイックスタート

### 1. インストール

```bash
npm install -g wtb
```

インストールせずに使う場合:

```bash
npx wtb create feature/awesome-feature
```

### 2. 設定ファイルを作成

プロジェクトのルートに `wtb.yaml` を作成:

```yaml
base_branch: main

# gitignoreされているファイルを新しいworktreeにコピー
copy_files:
  - .env
  - .env.local

# 大きなディレクトリはコピーせずsymlinkを張る
link_files:
  - node_modules
```

### 3. 使う

```bash
# 新しいブランチ用のworktreeを作成
wtb create feature/awesome-feature

# 作業ディレクトリに移動
cd ../worktree-feature-awesome-feature

# 作業完了後、worktreeを削除
wtb remove feature/awesome-feature
```

## コマンド

### `wtb create <branch>`

新しいworktreeを作成します。

```bash
wtb create feature/new-feature
wtb create bugfix/urgent-fix
```

**処理内容:**
1. `git worktree add` でブランチ用の作業ディレクトリを作成（`base_branch` からブランチを作成）
2. `copy_files` で指定したファイルをコピー
3. `link_files` で指定したファイル/ディレクトリにsymlinkを作成（`copy_files` より優先）
4. `env.file` で指定した環境変数ファイルをコピー（`env.adjust` が設定されている場合はポート等を調整してコピー）
5. `docker_compose_file` が設定・存在する場合は worktree にコピーしてポート衝突を自動調整
6. `start_command` を実行（設定時のみ）

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-p, --path <path>` | worktreeの作成場所を指定（デフォルト: 親ディレクトリに `worktree-<branch名>` で作成） |
| `--no-create-branch` | 既存のブランチを使用（新規作成しない） |
| `--no-docker` | Docker Composeのセットアップをスキップ |
| `--no-env` | 環境変数ファイルの処理をスキップ（`.env`のコピー/調整） |
| `--no-copy` | ファイルコピーをスキップ（`copy_files`） |
| `--no-link` | symlink作成をスキップ（`link_files`） |
| `--no-start` | `start_command` の実行をスキップ |
| `--dry-run` | 実際の変更を行わず、実行内容をプレビュー |

**使用例:**

```bash
# Docker操作なしでworktreeを作成（高速、Docker不要）
wtb create feature/quick-fix --no-docker

# スタートスクリプトを実行せずにworktreeを作成
wtb create feature/wip --no-start

# 最小限のworktreeを作成（git worktreeのみ、ファイル操作なし）
wtb create feature/minimal --no-docker --no-env --no-copy --no-link --no-start

# 実行内容をプレビュー
wtb create feature/test --dry-run

# パスを指定して作成
wtb create feature/auth -p /tmp/auth-worktree

# 既存のブランチを使用
wtb create release/v2.0 --no-create-branch
```

### `wtb remove <branch>`

worktreeを削除します。

```bash
wtb remove feature/new-feature
```

**処理内容:**
1. `docker_compose_file` が worktree に存在する場合は `docker compose down` を実行（`end_command` が未設定の場合）
2. `end_command` を実行（設定時のみ）
3. `git worktree remove` でworktreeを削除

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-f, --force` | 未コミットの変更があっても強制削除 |
| `--no-docker` | Docker Composeの停止をスキップ（`docker compose down`） |
| `--no-end` | `end_command` の実行をスキップ |

**使用例:**

```bash
# Dockerサービスを停止せずに削除（Docker未起動時に便利）
wtb remove feature/old-branch --no-docker

# 強制削除、クリーンアップもスキップ
wtb remove feature/abandoned -f --no-end
```

### `wtb ls` (alias: `list`)

軽量でスクリプト向けのworktree一覧表示。Unixの`ls`に近い使い勝手です。Docker情報が不要で、worktreeだけを素早く確認したい場合に使います。

```bash
wtb ls
wtb list      # 同じ
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-l, --long` | 長形式（短縮コミットハッシュ、経過時間、dirty状態、サブジェクト） |
| `--json` | 機械可読JSON出力（`-l` と組み合わせると拡張フィールドも追加） |
| `-p, --paths` | 絶対パスのみを1行ずつ出力（`$(wtb ls -p \| fzf)` 等の用途に便利） |

**出力例:**

デフォルト（compact、gitコール1回）:
```
→ main            /Users/me/proj                          [main]
  feature/api     /Users/me/proj-worktrees/feature-api
  feature/ui      /Users/me/proj-worktrees/feature-ui     [locked]
  hotfix/crash    /Users/me/proj-worktrees/hotfix-crash   [prunable]
  (detached)      /Users/me/proj-worktrees/detached-xyz
```

長形式（`-l`、worktree毎に `git log`/`git status` を並列実行）:
```
  BRANCH          COMMIT   AGE        D  PATH                                   TAGS / SUBJECT
→ main            a1b2c3d  2h ago     *  /Users/me/proj                         [main] Add foo
  feature/api     9f8e7d6  3d ago        /Users/me/proj-worktrees/feature-api   WIP refactor
```
タグ: `[main]` メインリポジトリ、`[locked]` `git worktree lock` 済み、`[prunable]` ディレクトリ消失、`[bare]` ベアリポジトリ。先頭の `→` は現在の作業ディレクトリを含むworktreeを示します（detached HEADでも正しく判定）。

パスのみ（`-p`、シェル連携用）:
```bash
# 別worktreeにfzfで移動:
cd "$(wtb ls -p | fzf)"
```

JSON（`--json`）:
```bash
wtb ls --json | jq '.[] | select(.isMain == false) | .path'
```

### `wtb ports`

現 worktree(または全 worktree)の `env.adjust` 調整済み値、Docker Compose の host/container ポート、`http://localhost:<port>` エンドポイント一覧を出力します。Claude Code の [skill](#claude-code連携) から呼び出される想定ですが、シェルスクリプトからも使えます。

| オプション | 説明 |
|-----------|------|
| `--all` | 全 worktree を配列で出力（デフォルトは現在の worktree 1 件をオブジェクトで） |
| `--pretty` | JSON ではなく人間向けテーブル |

出力スキーマと利用例は [Claude Code連携](#claude-code連携) を参照。

### `wtb status`

現在のworktree一覧とDocker環境の状態を表示します。

```bash
wtb status
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-a, --all` | 現在のブランチだけでなく、全てのworktreeを表示 |
| `--docker-only` | Docker関連の情報のみ表示 |

出力例:
```
📁 Git Worktrees Status

→ main (main)
   📂 /Users/me/project
   🐳 Docker: docker-compose.yml
   📦 Services: 3
   🔧 Environment: .env, .env.local

  feature/auth
   📂 /Users/me/worktree-feature-auth
   🐳 Docker: docker-compose.yml
   📦 Services: 3
   🔧 Environment: .env, .env.local
```

### `wtb init-claude`

同梱の Claude Code Skill をこのリポジトリ(またはグローバル)に展開します。詳しくは [Claude Code連携](#claude-code連携) を参照。

| オプション | 説明 |
|-----------|------|
| `-f, --force` | 既存 `SKILL.md` を上書き |
| `--user` | リポジトリではなく `~/.claude/skills/wtb/` にインストール |
| `--dry-run` | 対象パスのみ出力し書き込まない |

## 設定ファイル

以下のいずれかのパスに設定ファイルを配置します（優先順位順）:

- `wtb.yaml`
- `wtb.yml`
- `.wtb.yaml`
- `.wtb.yml`
- `.wtb/config.yaml`
- `.wtb/config.yml`

### 基本設定

```yaml
base_branch: main
```

### ファイルコピー

gitignoreされているファイルや設定ファイルを新しいworktreeにコピー:

```yaml
copy_files:
  - .env
  - .env.local
  - .claude          # ディレクトリも可
  - config/local.json
```

### シンボリックリンク

重いディレクトリ（`node_modules` など）はコピーせず、元リポジトリを参照するsymlinkを作成:

```yaml
link_files:
  - node_modules
  - .cache
```

> 同じパスが `copy_files` と `link_files` の両方にある場合、`link_files` が優先されます。

### スクリプト実行

worktree作成時・削除時にスクリプトを実行:

```yaml
# 作成後に実行（依存関係のインストールなど）
start_command: ./scripts/setup.sh

# 削除前に実行（クリーンアップなど）
end_command: ./scripts/cleanup.sh
```

### 環境変数の自動調整

worktree間のポート衝突を自動的に回避:

```yaml
env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1        # 元の値+1から空きポートを自動検索
    DB_PORT: 1         # 元の値+1から空きポートを自動検索
    API_KEY: "new-key" # 固定文字列で置換
    DEBUG_PORT: null    # 変数を削除
```

`adjust` フィールドは3種類の値に対応:
- **数値** (`1`): 元の値+指定数値から空きポートを検索。他worktreeの`.env`ファイルや実行中コンテナをスキャンして衝突を回避。
- **文字列** (`"new-key"`): 指定した文字列で値を置換。
- **null**: 変数をファイルから削除。

### Docker Compose連携

`docker_compose_file` を設定すると、wtbが自動的に:
- Composeファイルを各worktreeにコピー
- 実行中コンテナとのポート衝突を回避してリマップ
- worktree削除前に `docker compose down` を実行

```yaml
docker_compose_file: ./docker-compose.yml
```

Docker連携を無効にするには空文字を設定するか、フィールドを省略:

```yaml
docker_compose_file: ""   # 明示的に無効化
# またはフィールド自体を省略
```

### フル設定例

```yaml
base_branch: main
docker_compose_file: ./docker-compose.yml

copy_files:
  - .env
  - .env.local
  - .secrets
  - config/

link_files:
  - node_modules
  - .cache

start_command: npm install && npm run db:migrate
end_command: docker compose down

env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1    # 元の値+1から空きポートを自動検索
    DB_PORT: 1
```

## 設定項目一覧

| 項目 | 型 | デフォルト | 説明 |
|------|------|-----------|------|
| `base_branch` | string | `"main"` | 新しいworktreeブランチのベースブランチ名 |
| `docker_compose_file` | string | `""` | Docker Composeファイルのパス（省略または空文字でDockerスキップ） |
| `copy_files` | string[] | `[]` | 新しいworktreeにコピーするファイル/ディレクトリ |
| `link_files` | string[] | `[]` | symlinkを作成するファイル/ディレクトリ（`copy_files` より優先） |
| `start_command` | string | — | worktree作成後に実行するコマンド |
| `end_command` | string | — | worktree削除前に実行するコマンド |
| `env.file` | string[] | `["./.env"]` | 処理する環境変数ファイルのリスト |
| `env.adjust` | object | `{}` | 調整設定（数値: 空きポート検索, 文字列: 置換, null: 削除） |

## CLIオプション一覧

### グローバル動作

すべての `--no-*` フラグはCommander.jsの否定構文です。例えば `--no-docker` は `docker` を `false` に設定します。

### `create` オプション

```
-p, --path <path>     worktreeの場所を指定
--no-create-branch    既存ブランチを使用
--no-docker           Docker Composeのセットアップをスキップ
--no-env              .envファイル処理をスキップ
--no-copy             copy_filesをスキップ
--no-link             link_files（symlink）をスキップ
--no-start            start_commandをスキップ
--dry-run             変更せずにプレビュー
```

### `remove` オプション

```
-f, --force           強制削除
--no-docker           docker compose downをスキップ
--no-end              end_commandをスキップ
```

### `status` オプション

```
-a, --all             全worktreeを表示
--docker-only         Docker情報のみ表示
```

### `ls` オプション

```
-l, --long            長形式（コミットハッシュ、経過時間、dirty、サブジェクト）
--json                JSON出力（-l と併用で拡張フィールド追加）
-p, --paths           絶対パスのみを1行ずつ出力
```

### `ports` オプション

```
--all                 全worktreeを配列で出力
--pretty              人間向けテーブル（デフォルトはJSON）
```

### `init-claude` オプション

```
-f, --force           既存 SKILL.md を上書き
--user                ~/.claude/skills/wtb/ にグローバル展開
--dry-run             対象パスだけ出力
```

## 必要環境

- Node.js 18+
- Git
- Docker（オプション — `docker_compose_file` を設定した場合のみ必要）

## Claude Code連携

wtb には [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills) が同梱されています。skill を入れると Claude Code のエージェントが自動で wtb CLI を呼び出し、「このworktreeのポートは？」「feature/auth のworktree作って」といった依頼に直接応えられるようになります。

### リポジトリに 1 回だけインストール

```bash
wtb init-claude                          # .claude/skills/wtb/SKILL.md を配置
git add .claude/skills/wtb
git commit -m "chore: install wtb Claude Code skill"
```

`.claude/skills/` は通常の git 管理ディレクトリなので、`git worktree add` や `wtb create` で作ったすべての worktree に自動で伝播します。worktree ごとの仕込みは不要です。

グローバル配置を選ぶ場合:

```bash
wtb init-claude --user                   # ~/.claude/skills/wtb/SKILL.md
```

フラグ: `-f, --force`(上書き)、`--user`(グローバル)、`--dry-run`(対象パスのみ確認)。

### データソース: `wtb ports`

Skill は `wtb ports --json` を呼び出して結果を読み取ります。シェルから直接使うこともできます:

```bash
wtb ports                                # 現 worktree を JSON オブジェクトで
wtb ports --all                          # 全 worktree を JSON 配列で
wtb ports --pretty                       # 人間向けテーブル
```

出力スキーマ:

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

ポイント:

- `env` には `env.adjust` に登録した key のみが入る。`.env` 内の他の値(API キー等のシークレット)は**漏れない**。
- `compose.services` は worktree のコピー済み Compose ファイルから読むので、**リマップ後のポート値**が得られる。
- `endpoints` は compose の host ポートから `http://localhost:<port>` を組み立てる簡易一覧。
- Docker 不在でも stdout は有効な JSON(`compose.services` が `{}` になるだけ)。警告は stderr。

### Claude が何をできるようになるか

Skill インストール後は、次のような依頼が自然に通ります:

| 発言 | Claude の挙動 |
|-----|---------------|
| 「ここの API のポート教えて」 | `wtb ports --json` を実行 → 該当ポートを返答 |
| 「worktree 一覧見せて」 | `wtb ls -l` |
| 「feature/login の worktree 作って」 | `wtb create feature/login`(破壊的変更は事前確認) |
| 「feature/old 片付けて」 | `wtb ls -l` で対象表示 → 確認 → `wtb remove feature/old` |

Skill の `description` は `wtb.yaml` を含むリポジトリで自動発火するので、手動で呼び出す必要はほぼありません。

## トラブルシューティング

### "Not in a git repository"

Gitリポジトリ内からwtbを実行してください。ツールはGitルートを自動検出します。

### ポートの衝突

ポート調整が期待通りに動作しない場合、wtbは以下をスキャンしています:
1. 他のworktreeの`.env`ファイルで使用中のポート
2. 実行中のDockerコンテナが占有しているポート

`wtb status -a` で各worktreeに割り当てられているポートを確認できます。

### Dockerが利用できない

Dockerがインストールされていない、またはデーモンが起動していない場合、wtbはDocker操作を優雅にスキップします。`--no-docker` を使うとDocker関連の警告を完全に抑制できます。

### Worktreeが既に存在する

ブランチが既にworktreeとして存在するため `git worktree add` が失敗した場合は、`wtb status` で既存のworktreeを確認し、`wtb remove` で古いものを先に削除してください。

## License

MIT
