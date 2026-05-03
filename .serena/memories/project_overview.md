# wtb Project Overview

## Project Purpose
wtb (旧称: WTCompose) は、Git worktreeとDocker Compose環境を統合管理するTypeScript CLIツールです。

### 主な機能
- **worktree作成** - ブランチごとに独立した開発環境を作成
- **ファイルコピー** - gitignoreされたファイル（.env、設定ファイル等）を自動コピー
- **コマンド実行** - worktree作成後/削除前にスクリプトを自動実行
- **環境変数調整** - ポート番号等の自動調整（予定）
- **Docker連携** - コンテナ/ボリュームの状態表示

## Tech Stack
- **Language**: TypeScript (ES2022, ESNext modules)
- **CLI Framework**: Commander.js v14.0.1
- **Build Tool**: TypeScript compiler (tsc)
- **Development**: tsx for development server
- **Testing**: Vitest v3.2.4
- **Linting/Formatting**: Biome v2.2.4
- **Runtime**: Node.js
- **Dependencies**: fs-extra, yaml, simple-git

## Project Structure
```
wtcompose/
├── src/
│   ├── index.ts              # メインエントリーポイント
│   ├── types/                # 型定義
│   │   └── index.ts          # WtbConfig, ContainerInfo等
│   ├── constants/            # 定数定義
│   │   └── index.ts          # DEFAULT_CONFIG, EXIT_CODES等
│   ├── core/                 # コアビジネスロジック
│   │   ├── config/           # 設定ファイル管理
│   │   │   ├── loader.ts     # 設定読み込み・マージ
│   │   │   └── validator.ts  # 設定検証
│   │   ├── git/              # Git操作
│   │   │   ├── repository.ts # リポジトリ操作
│   │   │   └── worktree.ts   # worktree操作
│   │   ├── docker/           # Docker操作
│   │   │   ├── client.ts     # コンテナ操作
│   │   │   ├── compose.ts    # Compose操作
│   │   │   └── volume.ts     # ボリューム操作
│   │   └── environment/      # 環境変数処理
│   │       └── processor.ts
│   ├── cli/                  # CLIインターフェース
│   │   ├── index.ts          # CLIエントリーポイント
│   │   ├── commands/         # コマンド実装
│   │   │   ├── create.ts     # worktree作成
│   │   │   ├── remove.ts     # worktree削除
│   │   │   └── status.ts     # ステータス表示
│   │   └── utils/
│   │       └── progress.ts
│   └── test/                 # テスト関連
│       ├── setup.ts
│       ├── helpers/
│       └── fixtures/
├── sample/                   # サンプルプロジェクト
│   ├── docker-compose.yml    # PostgreSQL + Next.js + Debian
│   ├── wtb.yaml           # 設定例
│   ├── start-dev.sh          # 起動スクリプト
│   ├── stop-dev.sh           # 停止スクリプト
│   └── next-app/             # Next.jsアプリ
├── dist/                     # ビルド出力
├── package.json
├── tsconfig.json
└── biome.json

```

## Configuration (wtb.yaml)
```yaml
base_branch: main
docker_compose_file: ./docker-compose.yml
copy_files:
  - .env
  - .claude
  - .serena
start_command: ./start-dev.sh   # worktree作成後に実行
end_command: ./stop-dev.sh      # worktree削除時に実行
env:
  file:
    - ./.env
  adjust:
    APP_PORT: 1000
    DB_PORT: 1000
```

## CLI Commands
- `wtb create <branch>` - worktree作成
- `wtb remove <branch>` - worktree削除
- `wtb status` - ステータス表示
