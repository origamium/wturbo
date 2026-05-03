# wtb CLI Architecture

## 📁 ディレクトリ構造

リファクタリング後のディレクトリ構造は以下の通りです：

```
src/
├── cli/                     # CLI関連モジュール
│   ├── commands/           # コマンド実装
│   │   └── status.ts      # ステータス表示コマンド
│   └── index.ts           # CLIエントリーポイント
├── core/                   # コア機能モジュール
│   ├── config/            # 設定管理
│   │   ├── loader.ts      # 設定ファイル読み込み
│   │   └── validator.ts   # 設定検証
│   ├── git/               # Git操作
│   │   ├── repository.ts  # リポジトリ基本操作
│   │   └── worktree.ts    # Worktree操作
│   ├── docker/            # Docker操作
│   │   ├── client.ts      # Docker API クライアント
│   │   └── compose.ts     # Docker Compose操作
│   ├── environment/       # 環境変数処理
│   │   └── processor.ts   # .env ファイル処理
│   └── index.ts          # コアモジュール統合エクスポート
├── utils/                  # 汎用ユーティリティ
│   ├── system.ts          # システム操作
│   ├── file.ts            # ファイル操作
│   └── index.ts          # ユーティリティ統合エクスポート
├── types/                  # 型定義
│   └── index.ts          # 全型定義統合
├── constants/              # 定数定義
│   └── index.ts          # 全定数統合
├── test/                  # テストヘルパー
│   └── helpers/
│       └── git-test-helper.ts
└── index.ts              # アプリケーションエントリーポイント
```

## 🏗️ アーキテクチャ原則

### 1. 責任の分離 (Separation of Concerns)

各モジュールは明確な責任を持ちます：

- **CLI**: ユーザーインターフェースとコマンド解析
- **Core**: ビジネスロジックとドメイン操作
- **Utils**: 汎用的なヘルパー機能
- **Types**: 型安全性の確保
- **Constants**: 設定値の集中管理

### 2. 依存関係の方向

```
CLI → Core → Utils
  ↓     ↓      ↓
Types ← ← ← ← ←
Constants ← ← ←
```

- 上位層は下位層に依存可能
- 下位層は上位層に依存しない
- すべての層が Types と Constants を参照可能

### 3. モジュール境界

- **明確なインターフェース**: 各モジュールは明確に定義されたAPIを提供
- **疎結合**: モジュール間の依存関係を最小限に
- **高凝集**: 関連する機能は同じモジュールに配置

## 📋 各モジュールの詳細

### CLI モジュール (`src/cli/`)

**責任**: ユーザーインターフェースとコマンド解析

```typescript
// エントリーポイント
export { main, createMainProgram } from './cli/index.js'

// コマンド定義
export function statusCommand(): Command
```

**特徴**:
- Commander.js を使用したCLI設計
- エラーハンドリングとプロセス終了管理
- ヘルプとバージョン情報の提供

### Core モジュール (`src/core/`)

**責任**: ビジネスロジックとドメイン固有の操作

#### Config (`src/core/config/`)
```typescript
// 設定ファイル管理
export function loadConfig(configDir?: string): WtbConfig
export function validateConfig(config: WtbConfig, configFile: string): void
export function createDefaultConfig(configPath?: string): WtbConfig
```

#### Git (`src/core/git/`)
```typescript
// リポジトリ操作
export function isGitRepository(cwd?: string): boolean
export function getGitRoot(cwd?: string): string
export function getCurrentBranch(cwd?: string): string

// Worktree操作
export function listWorktrees(cwd?: string): WorktreeInfo[]
export function createWorktree(branchName: string, worktreePath: string, cwd?: string): void
export function removeWorktree(worktreePath: string, cwd?: string): void
```

#### Docker (`src/core/docker/`)
```typescript
// Docker クライアント
export function getRunningContainers(options?: ExecOptions): ContainerInfo[]
export function getDockerVolumes(options?: ExecOptions): VolumeInfo[]
export function getDockerInfo(options?: ExecOptions): DockerInfo

// Docker Compose
export function readComposeFile(filePath: string, options?: FileOperationOptions): ComposeConfig
export function writeComposeFile(filePath: string, config: ComposeConfig, options?: FileOperationOptions): void
export function adjustPortsInCompose(config: ComposeConfig, usedPorts: number[]): ComposeConfig
```

#### Environment (`src/core/environment/`)
```typescript
// 環境変数ファイル処理
export function parseEnvFile(filePath: string, options?: FileOperationOptions): ParsedEnvFile
export function copyAndAdjustEnvFile(sourcePath: string, targetPath: string, adjustments: Record<string, any>, options?: FileOperationOptions): number
```

### Utils モジュール (`src/utils/`)

**責任**: 汎用的なヘルパー機能

```typescript
// システム操作
export function execCommand(command: string, options?: ExecOptions): string

// ファイル操作
export function fileExists(filePath: string): boolean
export function readFileIfExists(filePath: string, options?: FileOperationOptions): string
export function writeFileEnsureDir(filePath: string, content: string, options?: FileOperationOptions): void
```

### Types モジュール (`src/types/`)

**責任**: 型安全性の確保

```typescript
// 設定関連
export interface WtbConfig
export interface EnvConfig

// Git関連
export interface WorktreeInfo

// Docker関連
export interface ContainerInfo
export interface VolumeInfo
export interface ComposeConfig

// CLI関連
export interface CommandOptions
export interface CommandContext
```

### Constants モジュール (`src/constants/`)

**責任**: 設定値の集中管理

```typescript
// アプリケーション定数
export const APP_NAME = 'wtb'
export const APP_VERSION = '1.0.0'

// 設定ファイル
export const CONFIG_FILE_NAMES = ['wtb.yaml', 'wtb.yml', ...] as const

// Docker設定
export const DOCKER_COMMANDS = { ... } as const
export const PORT_RANGE = { MIN: 3000, MAX: 9999, ... } as const

// Git設定
export const GIT_COMMANDS = { ... } as const
```

## 🔧 JSDoc コメント規約

すべての公開関数には詳細なJSDocコメントを付与：

```typescript
/**
 * 機能の簡潔な説明
 * 
 * @param paramName - パラメータの説明
 * @param options - オプションパラメータの説明
 * @returns 戻り値の説明
 * @throws {Error} エラー条件の説明
 * 
 * @example
 * ```typescript
 * const result = functionName('example', { option: true })
 * console.log(result)
 * ```
 */
```

## 🧪 テスト戦略

### テストファイルの配置
- 各モジュールのテストは同じディレクトリに配置 (`*.test.ts`)
- 統合テストは `src/test/` ディレクトリに配置
- テストヘルパーは `src/test/helpers/` に配置

### モック戦略
- 外部依存関係（execSync, fs, yaml等）は適切にモック
- 新しいインポートパスを使用
- テストの独立性を確保

## 🚀 利点

### 1. 保守性の向上
- **明確な責任分離**: 各ファイルの役割が明確
- **統一されたインポート**: 型定義と定数が統合されている
- **包括的なドキュメント**: JSDocによる詳細な説明

### 2. 開発効率の向上
- **予測可能な構造**: 機能の場所が分かりやすい
- **再利用性**: 汎用的な機能が utils に集約
- **型安全性**: 統合された型定義による開発支援

### 3. テスト可能性
- **独立したモジュール**: 単体テストが容易
- **モック対応**: 外部依存関係の適切な分離
- **テストヘルパー**: Git関連のテスト支援

### 4. 拡張性
- **プラグイン対応**: 新しいコマンドの追加が容易
- **設定拡張**: 新しい設定項目の追加が簡単
- **機能追加**: 新しいコアモジュールの追加が可能

## 📈 今後の拡張計画

1. **新しいコマンド**: `src/cli/commands/` に追加
2. **新しいドメイン**: `src/core/` に新しいモジュール追加
3. **プラグインシステム**: 外部プラグインの読み込み機能
4. **設定スキーマ**: JSON Schema による設定ファイル検証
5. **Docker Swarm対応**: 新しいオーケストレーション機能

この新しいアーキテクチャにより、wtb CLIはより保守しやすく、拡張しやすく、テストしやすいコードベースとなりました。