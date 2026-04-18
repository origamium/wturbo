/**
 * @fileoverview 共通型定義
 * WTurbo CLI で使用されるすべての型定義を統合管理
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * 環境変数設定
 */
export interface EnvConfig {
  /** 環境変数ファイルのパス一覧 */
  file: string[]
  /** 環境変数の調整設定 */
  adjust: Record<string, string | number | null>
}

/**
 * WTurbo設定ファイルの型定義
 */
export interface WTurboConfig {
  /** ベースブランチ名 */
  base_branch: string
  /** Docker Composeファイルのパス */
  docker_compose_file: string
  /** worktree作成時にコピーするファイル・ディレクトリ（gitignoreされているものも含む） */
  copy_files: string[]
  /** worktree作成時にシンボリックリンクを張るファイル・ディレクトリ（copy_filesより優先） */
  link_files: string[]
  /** worktree作成後に実行するコマンド（スクリプトパス） */
  start_command?: string
  /** worktree削除時に実行するコマンド（スクリプトパス） */
  end_command?: string
  /** 環境変数設定 */
  env: EnvConfig
}

// =============================================================================
// Git Types
// =============================================================================

/**
 * Git worktree情報
 */
export interface WorktreeInfo {
  /** worktreeのパス */
  path: string
  /** ブランチ名 */
  branch: string
  /** HEADのコミットハッシュ */
  head: string
  /** ロック中かどうか（git worktree lock） */
  locked?: boolean
  /** prunable状態かどうか（参照先ディレクトリが消えている等） */
  prunable?: boolean
  /** ベアリポジトリかどうか */
  bare?: boolean
  /** detached HEAD状態かどうか */
  detached?: boolean
}

/**
 * 追加情報で拡張されたworktree情報（`wturbo ls -l` 用）
 */
export interface EnrichedWorktreeInfo extends WorktreeInfo {
  /** 短縮コミットハッシュ（7文字） */
  shortHash: string
  /** 最新コミットのサブジェクト */
  subject: string
  /** 相対日時（例: "2h ago"） */
  ageRelative: string
  /** コミット時刻（ISO 8601） */
  ageTimestamp: string
  /** 未コミット変更があるかどうか */
  dirty: boolean
  /** 拡張情報取得に失敗した場合のエラーメッセージ */
  enrichmentError?: string
}

/**
 * `ls` コマンドのオプション
 */
export interface LsCommandOptions {
  /** 長形式で表示（コミット情報・dirty状態） */
  long?: boolean
  /** JSON出力 */
  json?: boolean
  /** パスのみを出力 */
  paths?: boolean
}

// =============================================================================
// Docker Types
// =============================================================================

/**
 * Dockerコンテナ情報
 */
export interface ContainerInfo {
  /** コンテナID */
  id: string
  /** コンテナ名 */
  name: string
  /** イメージ名 */
  image: string
  /** ステータス */
  status: string
  /** ポートマッピング */
  ports: string[]
  /** ボリュームマウント */
  volumes: string[]
  /** ネットワーク */
  networks: string[]
}

/**
 * Dockerボリューム情報
 */
export interface VolumeInfo {
  /** ボリューム名 */
  name: string
  /** ドライバー */
  driver: string
  /** マウントポイント */
  mountpoint: string
}

/**
 * Docker Composeサービス定義
 */
export interface ComposeService {
  /** イメージ名 */
  image?: string
  /** ビルド設定 */
  build?: string | object
  /** ポートマッピング */
  ports?: string[]
  /** ボリュームマウント */
  volumes?: string[]
  /** 環境変数 */
  environment?: Record<string, string> | string[]
  /** ネットワーク */
  networks?: string[]
  /** 依存関係 */
  depends_on?: string[]
  /** その他の設定（Docker Composeは任意のキーを許容） */
  // biome-ignore lint/suspicious/noExplicitAny: Docker Compose allows arbitrary keys
  [key: string]: any
}

/**
 * Docker Compose設定
 */
export interface ComposeConfig {
  /** Composeファイルのバージョン（Docker Compose v2 では省略可） */
  version?: string
  /** サービス定義 */
  services: Record<string, ComposeService>
  /** ボリューム定義（Docker Composeは任意の構造を許容） */
  // biome-ignore lint/suspicious/noExplicitAny: Docker Compose volumes have flexible structure
  volumes?: Record<string, any>
  /** ネットワーク定義（Docker Composeは任意の構造を許容） */
  // biome-ignore lint/suspicious/noExplicitAny: Docker Compose networks have flexible structure
  networks?: Record<string, any>
  /** その他の設定（Docker Composeは任意のキーを許容） */
  // biome-ignore lint/suspicious/noExplicitAny: Docker Compose allows arbitrary keys
  [key: string]: any
}

// =============================================================================
// CLI Types
// =============================================================================

/**
 * status コマンドのオプション
 */
export interface CommandOptions {
  /** 全worktreeを表示するフラグ */
  all?: boolean
  /** Docker情報のみ表示するフラグ */
  dockerOnly?: boolean
}

/**
 * コマンド実行コンテキスト
 */
export interface CommandContext {
  /** 現在の作業ディレクトリ */
  cwd: string
  /** 設定オブジェクト */
  config: WTurboConfig
  /** コマンドオプション */
  options: CommandOptions
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * ファイル操作のオプション
 */
export interface FileOperationOptions {
  /** 作業ディレクトリ */
  cwd?: string
  /** エンコーディング */
  encoding?: BufferEncoding
  /** バックアップ作成フラグ */
  createBackup?: boolean
}

/**
 * 実行コマンドのオプション
 */
export interface ExecOptions {
  /** 作業ディレクトリ */
  cwd?: string
  /** 環境変数 */
  env?: Record<string, string>
  /** タイムアウト（ミリ秒） */
  timeout?: number
}
