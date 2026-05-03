# wtb

**複数ブランチの開発環境を一瞬で切り替える**

Git worktree をベースにした CLI ツールで、ブランチごとに独立した作業ディレクトリを提供します。`.env` の自動コピー、ポート再マッピング、Docker Compose 環境の分離、**Docker volume の自動クローン (DB の中身を引き継いでブランチ環境を立ち上げ)**、`node_modules` のような重いディレクトリの symlink 化までを一括で面倒見ます。

[![npm version](https://img.shields.io/npm/v/@schemelisp/wtb.svg)](https://www.npmjs.com/package/@schemelisp/wtb)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

[English README](README.md)

---

## 目次

- [なぜ wtb？](#なぜ-wtb)
- [仕組み](#仕組み)
- [クイックスタート](#クイックスタート)
- [コマンド](#コマンド)
  - [`create`](#wtb-create-branch)
  - [`remove`](#wtb-remove-branch)
  - [`ls` / `list`](#wtb-ls-alias-list)
  - [`ports`](#wtb-ports)
  - [`status`](#wtb-status)
  - [`init-claude`](#wtb-init-claude)
- [設定ファイル](#設定ファイル)
- [環境変数の自動調整](#環境変数の自動調整)
- [Docker Compose 連携](#docker-compose-連携)
- [Volume の自動クローン](#volume-の自動クローン)
- [ライフサイクルスクリプト](#ライフサイクルスクリプト)
- [アーキテクチャ](#アーキテクチャ)
- [開発](#開発)
- [設計メモ](#設計メモ)
- [必要環境](#必要環境)
- [Claude Code 連携](#claude-code-連携)
- [トラブルシューティング](#トラブルシューティング)
- [FAQ](#faq)
- [Changelog](#changelog)
- [License](#license)

## なぜ wtb？

Git worktree は強力ですが、単独で使うには手間がかかります。新しい作業ディレクトリを作るたびに、gitignore されたファイルのコピー、依存関係の再インストール、ポート再割り当て、長く動いているサービスの再起動などが必要になります。wtb はこの「のり付け」処理を自動化し、それぞれのブランチがミニ環境のように振る舞えるようにします。

典型的なユースケース:

- 機能ブランチで作業中に緊急修正が降ってきた — 数秒で 2 つ目の作業ディレクトリを立ち上げる
- 複数の機能ブランチを並行してビルド/テスト/サーブし、ポート衝突を避けたい
- スタッシュ・リセット・dev サーバーの停止をせずに、PR レビュー用のクリーンなチェックアウトが欲しい
- `.env` やローカル設定、認証情報を新しい worktree に自動コピー(または値を調整)したい
- Docker Compose を使っていて、ブランチごとに別ポートでサービスを動かしたい

## 仕組み

```
project/                        ← メイン worktree（元のリポジトリ）
├── wtb.yaml
├── .env                        APP_PORT=3000
├── docker-compose.yml          3000:80
├── node_modules/
└── src/

worktree-feature-auth/          ← `wtb create feature/auth` で作成
├── .env                        APP_PORT=3001   (自動でずらされ衝突なし)
├── docker-compose.yml          3001:80         (自動でずらされる)
├── node_modules -> ../project/node_modules     (symlink、コピーではない)
└── src/                        (git worktree — 同じ .git を共有)
```

`wtb create <branch>` は以下のフェーズを順に実行します:

1. **Worktree** — `git worktree add` で `../worktree-<sanitized-branch>/`(または `-p <path>`)に作成。新規ブランチは `base_branch` を起点に切り出し。
2. **ファイルコピー** — `copy_files`(gitignore された設定や秘密鍵など)をコピー。`link_files` にも含まれるパスはここでスキップ。
3. **シンボリックリンク** — `link_files` のエントリをソースリポジトリへ symlink(既存のファイル/ディレクトリ/symlink は安全に置き換え)。
4. **環境変数ファイル** — `env.file` をコピーし、`env.adjust` が空でなければポート風の値を他 worktree とぶつからない次の空きポートまでずらす。
5. **Docker Compose** — `docker_compose_file` 設定があれば、稼働中コンテナを避けつつ host ポートを再マッピングして worktree に書き出し。
6. **Volume クローン** — Compose の `volumes:` セクションに定義された non-`external` な named volume を、新 worktree の project に自動コピー。これで例えば PostgreSQL の中身がそのまま新 worktree でも使える。**稼働中ソースコンテナがある volume は破損リスク回避のため skip + 警告**(まずメイン側を `docker compose down` してから、または `--force-volume-copy` で強制)。詳細は [Volume の自動クローン](#volume-の自動クローン)。
7. **Start command** — `start_command` 設定があれば、新しい worktree 内で `/bin/sh` 経由で実行。

`wtb remove <branch>` は逆順で動作: `docker compose down`(`--remove-volumes` で `down -v`、`end_command` 未設定時) → `end_command` → `git worktree remove`。

## クイックスタート

### 1. インストール

```bash
npm install -g @schemelisp/wtb
# または単発実行
npx @schemelisp/wtb create feature/awesome
```

### 2. リポジトリのルートに設定を置く

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
    APP_PORT: 1       # 次の空きポートに自動増加
    DB_PORT: 1
```

### 3. 使う

```bash
wtb create feature/awesome
cd ../worktree-feature-awesome
# ...作業...
wtb remove feature/awesome
```

何もせずプレビューだけ:

```bash
wtb create feature/awesome --dry-run
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
| `--no-volume-copy` | Docker volume の自動クローンをスキップ |
| `--force-volume-copy` | 稼働中コンテナや既存 target volume があってもクローンを試行（dev のみ・データ破損リスクあり） |
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
| `--remove-volumes` | この worktree の Docker volume も削除 (`docker compose down -v`) |

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

### ライフサイクルスクリプト

worktree 作成時・削除時にスクリプトを実行:

```yaml
# 作成後に実行（依存関係のインストールなど）
start_command: ./scripts/setup.sh

# 削除前に実行（クリーンアップなど）
end_command: ./scripts/cleanup.sh
```

`start_command` と `end_command` は worktree のルートを `cwd` として `/bin/sh` 経由で実行されます。`start_command` は最初に worktree からの相対パスとして解決を試み(`./scripts/setup.sh` のような形)、ファイルが無ければシェルに文字列として渡されます(`npm install && npm run dev` も動く)。

スクリプトの失敗は **致命的ではありません** — wtb は警告を出して worktree をそのまま残すので、手で続きを完了できます。

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

### Docker Compose 連携

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
| `volumes.exclude` | string[] | `[]` | 自動クローンから**除外**する compose volume key 一覧。デフォルトでは Compose の named non-`external` volume をすべて自動クローンする |

### バリデーション

設定読み込み時に wtb は以下を検証します:

- **エラー** (exit code `4` で失敗): 型違反、`base_branch` 欠落/不正、`copy_files`/`link_files` が配列でない、`env.adjust` の値型違反 など。
- **警告** (stderr に出力、処理は続行): `docker_compose_file` / `env.file` で参照したパスがディスク上に存在しない場合。

## Volume の自動クローン

Compose ファイルが remap された後、wtb は **Compose の `volumes:` セクションに定義された全ての named Docker volume をソースから新 worktree の project に自動コピー** します。これでメインで動かしていた DB / cache の中身がそのまま新 worktree でも使えて、`pg_dump | pg_restore` や seed スクリプトの再実行は不要になります。

動作:

1. wtb は Compose の `volumes:` キーを列挙します。
2. `external: true` のものは **対象外** (共有意図のため)。
3. ソース volume 名は `<source_project>_<key>` (もしくは `volumes.<key>.name` で明示されていればそれ)、ターゲットも同様に新 worktree の project name を使って解決。
4. 各 volume について:
   - **稼働中コンテナがソース volume を使用中** なら skip + 警告 (Postgres/MySQL/Redis などはライブコピーで破損する可能性があるため)。メイン側で `docker compose down` してから再実行するか、`--force-volume-copy` で強制実行可能。
   - **ターゲット volume が既に中身を持っていれば** skip (二度走らせて上書きしないため)。`--force-volume-copy` で上書きできます。
   - それ以外は `instrumentisto/rsync-ssh` の使い捨てサイドカーコンテナで再帰コピー (rsync が無ければ Alpine の `cp -a` にフォールバック)。

特定の volume を除外したい (例: 再生成可能なキャッシュ):

```yaml
# wtb.yaml
volumes:
  exclude:
    - cache_data
    - tmp_data
```

その実行回だけスキップしたいときは `wtb create <branch> --no-volume-copy`、稼働中ソースを強制コピーしたい (dev のみ・データ破損リスクあり) ときは `--force-volume-copy`。

`wtb remove <branch>` はデフォルトでは clone した volume を削除しません(`docker compose down` のデフォルト挙動と整合)。`wtb remove <branch> --remove-volumes` で `docker compose down -v` 相当に切り替わり volume も削除されます。

## アーキテクチャ

```
src/
├── cli/
│   ├── commands/      create, remove, ls, ports, status, init-claude
│   ├── utils/         worktree/ports レンダラ、共通エラーラッパー、Claude Skill インストーラ
│   └── index.ts       commander の組み立て + グローバルエラーハンドラ
├── core/
│   ├── config/        YAML ローダ + バリデータ + デフォルトマージ
│   ├── git/           repository / worktree / commit-info ヘルパー
│   ├── docker/        `docker ps`、compose のパース・書き出し、ポート調整
│   └── environment/   .env パーサ(順序保存) + adjust + シリアライズ
├── utils/             安全な exec ヘルパ(execFileSync ラッパー)、エラー型
├── types/             公開型定義(WtbConfig, WorktreeInfo, …)
├── constants/         デフォルト値、コマンドテンプレート、正規表現、終了コード
└── index.ts           ライブラリエントリポイント
```

モジュール毎の API と設計の根拠は [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

主要な設計判断:

- **git/docker は全て `execFileSync` 経由。** 引数は配列で渡され、文字列に展開されないため、ブランチ名やパスが含むメタ文字でシェル注入されない。例外はユーザ提供の `start_command` / `end_command` のみで、これは意図的に `/bin/sh` 経由で実行する。
- **`??` でデフォルトマージ。** 未定義フィールドはデフォルトに、明示的な空配列・空文字列は保存される。
- **順序保存 `.env` パーサ。** コメント、空行、行末コメントもラウンドトリップで保たれる。
- **`ls` は pure renderer。** `renderDefault`/`renderLong`/`renderPaths`/`renderJson` は単独でユニットテスト可能、コマンドモジュールはそれらを繋ぐだけ。
- **enrichment はベストエフォート。** `ls -l` は壊れた worktree でも他の行は出力する。失敗は JSON で `enrichmentError` として表面化。

終了コード(`src/constants/index.ts`):

| コード | 意味 |
|------|---------|
| `0` | 成功 |
| `1` | 一般エラー |
| `2` | CLI 引数エラー |
| `3` | git リポジトリ外 |
| `4` | 設定エラー |
| `5` | Docker エラー |

## 開発

```bash
git clone https://github.com/origamium/wtb.git
cd wtb
npm install

npm run dev                    # tsx でソースから直接実行
npm run build                  # tsc → dist/
npm start                      # ビルド済み CLI を実行

npm run test                   # vitest watch
npm run test:run               # vitest 1 回
npm run test:unit              # ユニットテスト(src/)
npm run test:e2e               # E2E(test-repos/ 配下に実 git repo を作る)
npm run test:ui                # vitest UI

npm run typecheck              # tsc --noEmit
npm run lint                   # biome lint
npm run format                 # biome format --write
npm run check                  # biome check --write (lint + format)
```

E2E テスト(`e2e/`)は一時 git リポジトリを作ってビルド済み CLI を実行します。`sample/` には Next.js + Postgres ベースの動作するプレイグラウンドがあり、実際の `wtb.yaml` / `.env` / `docker-compose.yml` が同梱されています。

## 設計メモ

- **大きなツリーは copy より symlink。** `node_modules`、`.cache`、`.next/cache` は基本的に `link_files` 行き。1 つのソース、ディスク重複ゼロ、即座の worktree 作成。トレードオフ: ある worktree でネイティブモジュールを別プラットフォーム向けに再ビルドすると他にも波及する — そういうものは `copy_files` で。
- **ブランチ名のサニタイズ。** `/` はデフォルトパスでは `-` に置換: `feature/auth` → `worktree-feature-auth`。完全制御したいときは `-p <path>`。
- **Docker は全フェーズでオプション。** `docker_compose_file` を省略、Docker 未インストール、`--no-docker` のいずれでも wtb は優雅に degrade し、Docker 関連の出力は Docker が到達可能なときだけ出る。
- **`wtb ls` vs `wtb status`。** `ls` は高速・スクリプト用途(デフォルト形式は git 呼び出し 1 回)。`status` は人間向けで Docker コンテキスト含む。スクリプトでは `ls -l --json` を推奨。
- **dry-run は嘘をつかない。** `--dry-run` は全フェーズを歩いて *実行されたら何が起こるか* を表示する。スキップ対象の不在ファイルも報告する。

## 必要環境

- Node.js 18+
- Git
- Docker（オプション — `docker_compose_file` を設定した場合のみ必要）

## Claude Code 連携

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

## FAQ

**`git worktree add` と何が違いますか？**
wtb は内部で `git worktree add` を使い、その上に git 単体ではカバーできない処理を載せています: gitignore された設定ファイルのコピー、symlink、env-var の再マッピング、Compose ポート調整、ライフサイクルスクリプト。

**Docker は必須ですか？**
いいえ。`docker_compose_file` を空にする(または省略する)と Docker フェーズは丸ごとスキップされます。コピー・symlink・env 調整・ライフサイクルスクリプトはそれぞれ独立して動きます。

**`.git` ディレクトリはどうなりますか？**
触りません。Git 標準の worktree 機能で同じ `.git` を共有するため、ディスク使用量はほぼ平坦です。

**CI で使えますか？**
使えます — ただしライフサイクルスクリプト・Docker 連携・ポート再マッピングは主に開発機向けの便利機能です。CI では `wtb create <branch> --no-docker --no-start --no-link` でクリーンな分離チェックアウトが高速に得られます。

**「wtb」の由来は？**
"worktree turbo" の略 — git worktree に環境管理のターボを付けた、という意味です。

## Changelog

リリースノートは [CHANGELOG.md](CHANGELOG.md) を参照。

## License

[MIT](LICENSE) © ONOUE Origami
