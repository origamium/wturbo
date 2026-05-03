/**
 * @fileoverview 環境変数ファイル処理
 * .envファイルの読み込み、書き込み、値の調整を担当
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"
import { BACKUP_EXTENSION, FILE_ENCODING, PORT_RANGE } from "../../constants/index.js"
import type { FileOperationOptions } from "../../types/index.js"

// =============================================================================
// 統合行型（順序保持のため）
// =============================================================================

/**
 * .env ファイルの1行を表す型
 * type === 'entry' は KEY=VALUE 行、type === 'other' はコメント・空行
 */
type EnvLine =
  | { type: "entry"; key: string; value: string; comment?: string }
  | { type: "other"; content: string }

/**
 * 環境変数エントリ（後方互換性のため維持）
 */
interface EnvEntry {
  key: string
  value: string
  comment?: string
}

/**
 * 環境変数ファイルの解析結果
 * lines で元のファイルの行順序を保持
 */
interface ParsedEnvFile {
  /** 行の配列（順序保持） */
  lines: EnvLine[]
  /** エントリ一覧（便利アクセス用） */
  entries: EnvEntry[]
  /** 元のファイル内容（バックアップ用） */
  originalContent: string
}

// =============================================================================
// ポート解決ユーティリティ
// =============================================================================

/**
 * 使用中ポートと衝突しない最小のポートを返す
 * originalPort + 1 から順に空きを探す
 */
function findNextFreePort(originalPort: number, usedPorts: Set<number>): number {
  let candidate = originalPort + 1
  let attempts = 0
  while (attempts < PORT_RANGE.SEARCH_LIMIT) {
    if (!usedPorts.has(candidate)) {
      return candidate
    }
    candidate++
    attempts++
  }
  console.warn(
    `⚠️  Could not find available port after ${PORT_RANGE.SEARCH_LIMIT} attempts, using ${originalPort + 1}`
  )
  return originalPort + 1
}

// =============================================================================
// パース
// =============================================================================

/**
 * 環境変数ファイルを読み込んで解析
 */
export function parseEnvFile(filePath: string, options?: FileOperationOptions): ParsedEnvFile {
  try {
    if (!existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, {
      encoding: options?.encoding || FILE_ENCODING,
    })

    return parseEnvContent(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("not found")) {
      throw error
    }
    throw new Error(`Failed to read environment file: ${message}`)
  }
}

/**
 * 環境変数ファイルの内容を解析（行順序を保持）
 */
export function parseEnvContent(content: string): ParsedEnvFile {
  const lines = content.split("\n")
  const parsedLines: EnvLine[] = []
  const entries: EnvEntry[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // 空行またはコメント行
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      parsedLines.push({ type: "other", content: line })
      continue
    }

    // KEY=VALUE形式の解析
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) {
      const [, key, rawValue] = match

      let value = rawValue
      // 値の前後の引用符を除去
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      // インラインコメントをチェック
      let comment: string | undefined
      const commentMatch = rawValue.match(/^[^#]*#\s*(.+)$/)
      if (commentMatch) {
        comment = commentMatch[1].trim()
        value = rawValue.replace(/#.*$/, "").trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
      }

      const entry: EnvEntry = { key, value, comment }
      parsedLines.push({ type: "entry", key, value, comment })
      entries.push(entry)
    } else {
      // 解析できない行はそのまま保持
      parsedLines.push({ type: "other", content: line })
    }
  }

  return {
    lines: parsedLines,
    entries,
    originalContent: content,
  }
}

// =============================================================================
// シリアライズ（行順序を保持）
// =============================================================================

/**
 * 環境変数エントリを.env形式の文字列に変換
 * 元のファイルの行順序（コメント・空行含む）を保持する
 */
export function serializeEnvFile(parsed: ParsedEnvFile): string {
  const outputLines: string[] = []

  for (const line of parsed.lines) {
    if (line.type === "other") {
      outputLines.push(line.content)
    } else {
      // type === 'entry'
      let serialized = `${line.key}=${line.value}`
      if (line.comment) {
        serialized += ` # ${line.comment}`
      }
      outputLines.push(serialized)
    }
  }

  return outputLines.join("\n")
}

// =============================================================================
// 書き込み
// =============================================================================

/**
 * 環境変数ファイルに設定を書き込み
 */
export function writeEnvFile(
  filePath: string,
  parsed: ParsedEnvFile,
  options?: FileOperationOptions
): void {
  try {
    // バックアップ作成（オプション）
    if (options?.createBackup && existsSync(filePath)) {
      const backupPath = `${filePath}${BACKUP_EXTENSION}`
      fs.copyFileSync(filePath, backupPath)
      console.log(`📋 Created backup: ${backupPath}`)
    }

    const content = serializeEnvFile(parsed)

    const dir = path.dirname(filePath)
    if (!existsSync(dir)) {
      fs.mkdirpSync(dir)
    }

    fs.writeFileSync(filePath, content, {
      encoding: options?.encoding || FILE_ENCODING,
    })

    console.log(`🔧 Wrote environment file: ${filePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write environment file: ${message}`)
  }
}

// =============================================================================
// 調整・コピー
// =============================================================================

/**
 * 環境変数ファイルをコピーして値を調整
 * null の削除は Set で管理し、__DELETE__ センチネル値の衝突を防ぐ
 *
 * @returns 調整された環境変数の数
 */
export function copyAndAdjustEnvFile(
  sourcePath: string,
  targetPath: string,
  adjustments: Record<string, string | number | null | ((value: string) => string)>,
  options?: FileOperationOptions,
  usedPorts: number[] = []
): number {
  const parsed = parseEnvFile(sourcePath, options)
  let adjustedCount = 0

  // 削除対象のキーを Set で管理（センチネル値衝突を防ぐ）
  const keysToDelete = new Set<string>()

  // 数値調整で確保済みのポートを追跡（ファイル内衝突防止 + 引数の usedPorts を加算）
  const assignedPorts = new Set<number>(usedPorts)

  // entries への O(1) ルックアップ用 Map（3回の find() を置き換える）
  const entryByKey = new Map(parsed.entries.map((e) => [e.key, e]))

  // 既存の環境変数を調整
  for (const line of parsed.lines) {
    if (line.type !== "entry") continue

    const adjustment = adjustments[line.key]

    if (adjustment === null) {
      keysToDelete.add(line.key)
      adjustedCount++
    } else if (typeof adjustment === "string") {
      line.value = adjustment
      // entries 配列も同期
      const entry = entryByKey.get(line.key)
      if (entry) entry.value = adjustment
      adjustedCount++
    } else if (typeof adjustment === "number") {
      const originalValue = parseInt(line.value, 10)
      if (!Number.isNaN(originalValue)) {
        const newPort = findNextFreePort(originalValue, assignedPorts)
        assignedPorts.add(newPort)
        const newValue = newPort.toString()
        line.value = newValue
        const entry = entryByKey.get(line.key)
        if (entry) entry.value = newValue
        adjustedCount++
      }
    } else if (typeof adjustment === "function") {
      const newValue = adjustment(line.value)
      line.value = newValue
      const entry = entryByKey.get(line.key)
      if (entry) entry.value = newValue
      adjustedCount++
    }
  }

  // 削除マークされた行を除去（lines と entries 両方から）
  parsed.lines = parsed.lines.filter(
    (line) => !(line.type === "entry" && keysToDelete.has(line.key))
  )
  parsed.entries = parsed.entries.filter((entry) => !keysToDelete.has(entry.key))

  // 新しい環境変数を追加（既存にない場合のみ）
  const existingKeys = new Set(parsed.entries.map((e) => e.key))
  for (const [key, value] of Object.entries(adjustments)) {
    if (!existingKeys.has(key) && value !== null && typeof value !== "function") {
      const strValue = typeof value === "number" ? value.toString() : (value as string)
      const newEntry: EnvEntry = { key, value: strValue, comment: "Added by wtb" }
      parsed.entries.push(newEntry)
      parsed.lines.push({ type: "entry", key, value: strValue, comment: "Added by wtb" })
      adjustedCount++
    }
  }

  writeEnvFile(targetPath, parsed, options)
  return adjustedCount
}

// =============================================================================
// バックアップ
// =============================================================================

/**
 * 環境変数ファイルをバックアップ
 */
export function backupEnvFile(filePath: string, backupSuffix?: string): string {
  const suffix = backupSuffix || BACKUP_EXTENSION
  const backupPath = `${filePath}${suffix}`

  if (existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`📋 Created backup: ${backupPath}`)
  }

  return backupPath
}

/**
 * 環境変数ファイルからバックアップを復元
 */
export function restoreEnvFile(filePath: string, backupSuffix?: string): void {
  const suffix = backupSuffix || BACKUP_EXTENSION
  const backupPath = `${filePath}${suffix}`

  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }

  fs.copyFileSync(backupPath, filePath)
  console.log(`📋 Restored from backup: ${backupPath}`)
}
