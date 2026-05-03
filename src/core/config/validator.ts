/**
 * @fileoverview 設定バリデーター
 * wtb設定ファイルの検証と環境変数名の正規化を担当
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import { ENV_VAR_PATTERNS } from "../../constants/index.js"
import type { WtbConfig } from "../../types/index.js"

/**
 * バリデーションエラー情報
 */
interface ValidationError {
  message: string
  field: string
  severity: "error" | "warning"
}

/**
 * wtb設定ファイルをバリデートする
 * 警告は stderr に出力し、エラーは例外をスロー
 *
 * @param config - 検証する設定オブジェクト
 * @param configFile - 設定ファイルのパス（相対パス解決用）
 * @throws {Error} バリデーションエラーが発生した場合
 */
export function validateConfig(config: WtbConfig, configFile: string): void {
  const errors: ValidationError[] = []
  const configDir = path.dirname(configFile)

  // base_branchの検証
  if (!config.base_branch || typeof config.base_branch !== "string") {
    errors.push({
      message: "base_branch must be a non-empty string",
      field: "base_branch",
      severity: "error",
    })
  }

  // docker_compose_fileの検証
  // 空文字列・未設定の場合はDocker未使用と見なしてスキップ（エラーなし・警告なし）
  // 非空文字列が設定されている場合のみ存在チェック（warning）
  if (config.docker_compose_file) {
    if (typeof config.docker_compose_file !== "string") {
      errors.push({
        message: "docker_compose_file must be a string",
        field: "docker_compose_file",
        severity: "error",
      })
    } else {
      const composePath = path.resolve(configDir, config.docker_compose_file)
      if (!existsSync(composePath)) {
        errors.push({
          message: `docker_compose_file not found: ${config.docker_compose_file}`,
          field: "docker_compose_file",
          severity: "warning",
        })
      }
    }
  }

  // copy_filesの検証
  if (config.copy_files !== undefined) {
    if (!Array.isArray(config.copy_files)) {
      errors.push({
        message: "copy_files must be an array",
        field: "copy_files",
        severity: "error",
      })
    } else {
      config.copy_files.forEach((copyFile, index) => {
        if (typeof copyFile !== "string") {
          errors.push({
            message: `copy_files[${index}] must be a string`,
            field: `copy_files[${index}]`,
            severity: "error",
          })
        }
      })
    }
  }

  // link_filesの検証
  if (config.link_files !== undefined) {
    if (!Array.isArray(config.link_files)) {
      errors.push({
        message: "link_files must be an array",
        field: "link_files",
        severity: "error",
      })
    } else {
      config.link_files.forEach((linkFile, index) => {
        if (typeof linkFile !== "string") {
          errors.push({
            message: `link_files[${index}] must be a string`,
            field: `link_files[${index}]`,
            severity: "error",
          })
        }
      })
    }
  }

  // start_commandの検証
  if (config.start_command !== undefined && typeof config.start_command !== "string") {
    errors.push({
      message: "start_command must be a string",
      field: "start_command",
      severity: "error",
    })
  }

  // end_commandの検証
  if (config.end_command !== undefined && typeof config.end_command !== "string") {
    errors.push({
      message: "end_command must be a string",
      field: "end_command",
      severity: "error",
    })
  }

  // env設定の検証
  if (!config.env || typeof config.env !== "object") {
    errors.push({
      message: "env section must be an object",
      field: "env",
      severity: "error",
    })
  } else {
    // env.fileの検証
    if (!Array.isArray(config.env.file)) {
      errors.push({
        message: "env.file must be an array",
        field: "env.file",
        severity: "error",
      })
    } else {
      config.env.file.forEach((envFile, index) => {
        if (typeof envFile !== "string") {
          errors.push({
            message: `env.file[${index}] must be a string`,
            field: `env.file[${index}]`,
            severity: "error",
          })
        } else {
          const envPath = path.resolve(configDir, envFile)
          if (!existsSync(envPath)) {
            errors.push({
              message: `env.file not found: ${envFile}`,
              field: `env.file[${index}]`,
              severity: "warning",
            })
          }
        }
      })
    }

    // env.adjustの検証
    if (config.env.adjust && typeof config.env.adjust !== "object") {
      errors.push({
        message: "env.adjust must be an object",
        field: "env.adjust",
        severity: "error",
      })
    } else if (config.env.adjust) {
      Object.entries(config.env.adjust).forEach(([key, value]) => {
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          errors.push({
            message: `env.adjust.${key} must be null, string, or number`,
            field: `env.adjust.${key}`,
            severity: "error",
          })
        }
      })
    }
  }

  // 警告を stderr に出力
  const warnings = errors.filter((e) => e.severity === "warning")
  for (const w of warnings) {
    process.stderr.write(`⚠️  Config warning [${w.field}]: ${w.message}\n`)
  }

  // エラーがあれば例外をスロー
  const hardErrors = errors.filter((e) => e.severity === "error")
  if (hardErrors.length > 0) {
    const errorMessages = hardErrors.map((e) => `  - ${e.message}`).join("\n")
    throw new Error(`Configuration validation failed:\n${errorMessages}`)
  }
}

/**
 * 環境変数名が有効かチェック（POSIX準拠）
 * 環境変数名は英字またはアンダースコアで始まり、英数字とアンダースコアのみ使用可
 */
export function validateEnvVarName(name: string): boolean {
  return ENV_VAR_PATTERNS.VALID_NAME.test(name)
}

/**
 * 無効な環境変数名を有効な形式に修正する
 */
export function suggestEnvVarName(name: string): string {
  const result = name
    .toUpperCase()
    .replace(ENV_VAR_PATTERNS.INVALID_CHARS, "_")
    .replace(ENV_VAR_PATTERNS.STARTS_WITH_NUMBER, "_$1")
    .replace(ENV_VAR_PATTERNS.MULTIPLE_UNDERSCORES, "_")
    .replace(/_{0,1}$/, "")

  if (result.startsWith("_") && !/^_[0-9]/.test(result)) {
    return result.replace(/^_+/, "")
  }

  return result
}

/**
 * 設定オブジェクト内の環境変数名をすべて検証し、問題があれば修正案を提示
 */
export function validateConfigEnvVars(config: WtbConfig): Record<string, string> {
  const suggestions: Record<string, string> = {}

  if (config.env?.adjust) {
    Object.keys(config.env.adjust).forEach((key) => {
      if (!validateEnvVarName(key)) {
        const suggestion = suggestEnvVarName(key)
        if (suggestion !== key) {
          suggestions[key] = suggestion
        }
      }
    })
  }

  return suggestions
}
