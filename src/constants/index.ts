/**
 * @fileoverview アプリケーション定数
 * wtb CLI で使用される定数値を統合管理
 */

import { createRequire } from "node:module"

const _require = createRequire(import.meta.url)
// biome-ignore lint/suspicious/noExplicitAny: package.json is a plain object
const _pkg = _require("../../package.json") as any

// =============================================================================
// Application Constants
// =============================================================================

/** アプリケーション名 */
export const APP_NAME = "wtb"

/** アプリケーションバージョン（package.json から動的取得） */
export const APP_VERSION: string = _pkg.version ?? "0.0.0"

/** アプリケーション説明 */
export const APP_DESCRIPTION = "Git worktree management with Docker Compose environment isolation"

// =============================================================================
// Configuration Constants
// =============================================================================

/** 設定ファイル名の候補リスト（優先順位順） */
export const CONFIG_FILE_NAMES = [
  "wtb.yaml",
  "wtb.yml",
  ".wtb.yaml",
  ".wtb.yml",
  ".wtb/config.yaml",
  ".wtb/config.yml",
] as const

/** デフォルト設定値 */
export const DEFAULT_CONFIG = {
  base_branch: "main",
  docker_compose_file: "",
  copy_files: [] as string[],
  link_files: [] as string[],
  start_command: undefined as string | undefined,
  end_command: undefined as string | undefined,
  env: {
    file: ["./.env"],
    adjust: {},
  },
} as const

// =============================================================================
// Docker Constants
// =============================================================================

/** Docker Composeファイル名の候補リスト */
export const COMPOSE_FILE_NAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const

/** 環境変数ファイル名の候補リスト */
export const ENV_FILE_NAMES = [".env", ".env.local", ".env.development", ".env.production"] as const

/** Dockerコマンドのフォーマット */
export const DOCKER_COMMANDS = {
  CONTAINERS: 'docker ps --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"',
  CONTAINER_VOLUMES:
    'docker inspect --format="{{range .Mounts}}{{.Source}}:{{.Destination}},{{end}}" {containerId}',
  CONTAINER_NETWORKS:
    'docker inspect --format="{{range $key, $value := .NetworkSettings.Networks}}{{$key}},{{end}}" {containerId}',
  VOLUMES: 'docker volume ls --format "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}"',
  VERSION: "docker --version",
  COMPOSE_VERSION: "docker-compose --version",
} as const

/** ポート範囲設定 */
export const PORT_RANGE = {
  MIN: 3000,
  MAX: 9999,
  SEARCH_LIMIT: 100,
} as const

// =============================================================================
// File System Constants
// =============================================================================

/** ファイルエンコーディング */
export const FILE_ENCODING = "utf-8" as const

/** 一時ディレクトリ名 */
export const TEMP_DIR_PREFIX = "wtb-" as const

/** バックアップファイル拡張子 */
export const BACKUP_EXTENSION = ".backup" as const

// =============================================================================
// CLI Constants
// =============================================================================

/** 終了コード */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  NOT_GIT_REPOSITORY: 3,
  CONFIG_ERROR: 4,
  DOCKER_ERROR: 5,
} as const

/** ログレベル */
export const LOG_LEVELS = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
} as const

// =============================================================================
// Environment Variable Constants
// =============================================================================

/**
 * 環境変数名の正規表現パターン（POSIX準拠）
 * 英字またはアンダースコアで始まり、英数字とアンダースコアのみ使用可
 */
export const ENV_VAR_PATTERNS = {
  VALID_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  INVALID_CHARS: /[^a-zA-Z0-9_]/g,
  STARTS_WITH_NUMBER: /^([0-9])/,
  MULTIPLE_UNDERSCORES: /_+/g,
  LEADING_TRAILING_UNDERSCORES: /^_+|_+$/g,
} as const

/** wtbプロジェクト識別用の環境変数プレフィックス */
export const WTB_PREFIX = "WTB_" as const
