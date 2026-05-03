# wtb Architecture

## レイヤー構成

```
┌─────────────────────────────────────────┐
│              CLI Layer                  │
│  src/cli/commands/{create,remove,status}│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│            Core Layer                   │
│  config/ │ git/ │ docker/ │ environment│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Types & Constants               │
│   src/types/  │  src/constants/         │
└─────────────────────────────────────────┘
```

## 主要モジュール

### src/types/index.ts
- `WtbConfig` - 設定ファイルの型
- `EnvConfig` - 環境変数設定の型
- `WorktreeInfo` - worktree情報の型
- `ContainerInfo` - Dockerコンテナ情報の型

### src/constants/index.ts
- `DEFAULT_CONFIG` - デフォルト設定値
- `CONFIG_FILE_NAMES` - 設定ファイル名候補
- `GIT_COMMANDS` - Gitコマンドテンプレート
- `DOCKER_COMMANDS` - Dockerコマンドテンプレート
- `EXIT_CODES` - 終了コード

### src/core/config/
- `loader.ts`
  - `loadConfig()` - 設定ファイル読み込み
  - `mergeWithDefaults()` - デフォルト値とマージ
  - `findConfigFile()` - 設定ファイル検索
- `validator.ts`
  - `validateConfig()` - 設定検証
  - `validateEnvVarName()` - 環境変数名検証

### src/core/git/
- `repository.ts`
  - `isGitRepository()` - Gitリポジトリ判定
  - `getGitRoot()` - ルートパス取得
  - `branchExists()` - ブランチ存在確認
- `worktree.ts`
  - `listWorktrees()` - worktree一覧
  - `createWorktree()` - worktree作成
  - `removeWorktree()` - worktree削除
  - `getWorktreePath()` - worktreeパス取得

### src/cli/commands/
- `create.ts` - worktree作成コマンド
  - ファイルコピー (copy_files)
  - 起動コマンド実行 (start_command)
- `remove.ts` - worktree削除コマンド
  - 終了コマンド実行 (end_command)
- `status.ts` - ステータス表示コマンド

## データフロー

### create コマンド
```
1. isGitRepository() チェック
2. getGitRoot() でルート取得
3. getWorktreePath() で既存チェック
4. createWorktree() でworktree作成
5. loadConfig() で設定読み込み
6. copyConfiguredFiles() でファイルコピー
7. executeStartCommand() で起動スクリプト実行
```

### remove コマンド
```
1. isGitRepository() チェック
2. getGitRoot() でルート取得
3. getWorktreePath() でworktree存在確認
4. loadConfig() で設定読み込み
5. executeEndCommand() で終了スクリプト実行
6. removeWorktree() でworktree削除
```

## 設定ファイル (wtb.yaml) 構造

```yaml
base_branch: string           # ベースブランチ名
docker_compose_file: string   # Docker Composeファイルパス
copy_files: string[]          # コピーするファイル/ディレクトリ
start_command?: string        # 起動時コマンド（オプション）
end_command?: string          # 終了時コマンド（オプション）
env:
  file: string[]              # 環境変数ファイル
  adjust: Record<string, string | number | null>  # 調整設定
```
