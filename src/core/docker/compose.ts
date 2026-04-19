/**
 * @fileoverview Docker Compose ファイル操作
 * Docker Composeファイルの読み込み、書き込み、ポート調整を担当
 */

import { existsSync } from "node:fs"
import fs from "fs-extra"
import { parse, stringify } from "yaml"
import { COMPOSE_FILE_NAMES, FILE_ENCODING, PORT_RANGE } from "../../constants/index.js"
import type { ComposeConfig, FileOperationOptions } from "../../types/index.js"

/**
 * Docker Composeファイルを読み込んでパース
 *
 * @param filePath - Composeファイルのパス
 * @param options - ファイル操作オプション
 * @returns パースされた設定オブジェクト
 * @throws {Error} ファイルの読み込みまたはパースに失敗した場合
 *
 * @example
 * ```typescript
 * try {
 *   const config = readComposeFile('./docker-compose.yml')
 *   console.log(`Services: ${Object.keys(config.services).length}`)
 * } catch (error) {
 *   console.error('Failed to read compose file:', error.message)
 * }
 * ```
 */
export function readComposeFile(filePath: string, options?: FileOperationOptions): ComposeConfig {
  try {
    if (!existsSync(filePath)) {
      throw new Error(`Docker Compose file not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, {
      encoding: options?.encoding || FILE_ENCODING,
    })

    const parsed = parse(content) as ComposeConfig

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid Docker Compose file format")
    }

    if (!parsed.services || typeof parsed.services !== "object") {
      throw new Error("Docker Compose file must contain a services section")
    }

    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("not found")) {
      throw error
    }
    throw new Error(`Failed to parse Docker Compose file: ${message}`)
  }
}

/**
 * Docker Compose設定をファイルに書き込み
 *
 * @param filePath - 出力先ファイルパス
 * @param config - 書き込む設定オブジェクト
 * @param options - ファイル操作オプション
 * @throws {Error} ファイルの書き込みに失敗した場合
 *
 * @example
 * ```typescript
 * const config = {
 *   version: '3.8',
 *   services: {
 *     web: { image: 'nginx', ports: ['8080:80'] }
 *   }
 * }
 * writeComposeFile('./docker-compose.new.yml', config)
 * ```
 */
export function writeComposeFile(
  filePath: string,
  config: ComposeConfig,
  options?: FileOperationOptions
): void {
  try {
    // バックアップ作成（オプション）
    if (options?.createBackup && existsSync(filePath)) {
      const backupPath = `${filePath}.backup`
      fs.copyFileSync(filePath, backupPath)
      console.log(`📋 Created backup: ${backupPath}`)
    }

    const yamlContent = stringify(config, {
      indent: 2,
      lineWidth: 120,
      minContentWidth: 80,
    })

    fs.writeFileSync(filePath, yamlContent, {
      encoding: options?.encoding || FILE_ENCODING,
    })

    console.log(`📄 Wrote Docker Compose file: ${filePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write Docker Compose file: ${message}`)
  }
}

/**
 * Docker Compose設定内で使用中のポートを避けて新しいポートに調整
 *
 * @param config - 調整する設定オブジェクト
 * @param usedPorts - 使用中のポート番号配列
 * @returns 調整された設定オブジェクト（元のオブジェクトは変更されない）
 *
 * @example
 * ```typescript
 * const config = {
 *   version: '3.8',
 *   services: {
 *     web: { image: 'nginx', ports: ['3000:80'] }
 *   }
 * }
 * const usedPorts = [3000, 3001]
 * const adjusted = adjustPortsInCompose(config, usedPorts)
 * // web.portsは['3002:80']に調整される
 * ```
 */
/**
 * Docker Compose のポートマッピング文字列を解析
 * 対応形式: "3000:80", "0.0.0.0:3000:80", "3000:80/tcp"
 *
 * @returns { hostPort, containerPort } または null (解析不能)
 */
export function parsePortMapping(
  portMapping: string
): { hostPort: number; containerPort: number } | null {
  if (typeof portMapping !== "string") return null
  const match = portMapping.match(/^(?:[\d.]+:)?(\d+):(\d+)(?:\/\w+)?$/)
  if (!match) return null
  const hostPort = parseInt(match[1], 10)
  const containerPort = parseInt(match[2], 10)
  if (Number.isNaN(hostPort) || Number.isNaN(containerPort)) return null
  return { hostPort, containerPort }
}

export function adjustPortsInCompose(config: ComposeConfig, usedPorts: number[]): ComposeConfig {
  // 深いコピーを作成して元のオブジェクトを変更しない
  const newConfig = structuredClone(config) as ComposeConfig
  const currentlyUsed = [...usedPorts]

  Object.entries(newConfig.services).forEach(([, service]) => {
    if (service.ports && Array.isArray(service.ports)) {
      service.ports = service.ports.map((portMapping: string) => {
        if (typeof portMapping !== "string") {
          return portMapping
        }

        const parsed = parsePortMapping(portMapping)
        if (!parsed) {
          return portMapping // 解析できない形式はそのまま
        }

        const newHostPort = findAvailablePort(parsed.hostPort, currentlyUsed)

        // 新しいポートを使用中リストに追加
        currentlyUsed.push(newHostPort)

        // 元の形式を保持して新しいポートに置換
        return portMapping.replace(parsed.hostPort.toString(), newHostPort.toString())
      })
    }
  })

  return newConfig
}

/**
 * 使用可能なポート番号を検索
 *
 * @param basePort - 希望するベースポート番号
 * @param usedPorts - 使用中のポート番号配列
 * @returns 使用可能なポート番号
 *
 * @example
 * ```typescript
 * const usedPorts = [3000, 3001, 3002]
 * const availablePort = findAvailablePort(3000, usedPorts)
 * console.log(availablePort) // 3003
 * ```
 */
export function findAvailablePort(basePort: number, usedPorts: number[]): number {
  let candidatePort = basePort
  let attempts = 0
  const maxAttempts = PORT_RANGE.SEARCH_LIMIT

  while (attempts < maxAttempts) {
    if (
      !usedPorts.includes(candidatePort) &&
      candidatePort >= PORT_RANGE.MIN &&
      candidatePort <= PORT_RANGE.MAX
    ) {
      return candidatePort
    }
    candidatePort++
    attempts++
  }

  // 上限に達した場合は警告を出して元のポートを返す
  console.warn(
    `⚠️  Could not find available port after ${maxAttempts} attempts, using original port ${basePort}`
  )
  return basePort
}

/**
 * プロジェクトディレクトリからDocker Composeファイルを自動検出
 *
 * @param projectDir - プロジェクトディレクトリパス
 * @returns 見つかったComposeファイルのパス（見つからない場合はnull）
 *
 * @example
 * ```typescript
 * const composePath = findComposeFile('/path/to/project')
 * if (composePath) {
 *   console.log(`Found compose file: ${composePath}`)
 * } else {
 *   console.log('No compose file found')
 * }
 * ```
 */
export function findComposeFile(projectDir: string): string | null {
  for (const fileName of COMPOSE_FILE_NAMES) {
    const filePath = `${projectDir}/${fileName}`
    if (existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

/**
 * Docker Composeプロジェクト名を生成
 * 通常はディレクトリ名にworktreeの識別子を追加
 *
 * @param projectDir - プロジェクトディレクトリパス
 * @param branchName - ブランチ名（オプション）
 * @returns プロジェクト名
 *
 * @example
 * ```typescript
 * const projectName = generateProjectName('/path/to/my-app', 'feature-branch')
 * console.log(projectName) // "my-app-feature-branch"
 * ```
 */
export function generateProjectName(projectDir: string, branchName?: string): string {
  const baseName = projectDir.split("/").pop() || "wturbo-project"
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()

  if (branchName) {
    const cleanBranchName = branchName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
    return `${cleanBaseName}-${cleanBranchName}`
  }

  return cleanBaseName
}

/**
 * Docker Compose設定の妥当性をチェック
 *
 * @param config - チェックする設定オブジェクト
 * @returns 妥当性チェック結果
 *
 * @example
 * ```typescript
 * const result = validateComposeConfig(config)
 * if (result.isValid) {
 *   console.log('Configuration is valid')
 * } else {
 *   console.error('Validation errors:', result.errors)
 * }
 * ```
 */
export function validateComposeConfig(config: ComposeConfig): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // バージョンチェック（Docker Compose v2 では version フィールドは任意）
  if (!config.version) {
    warnings.push("Missing version field (optional in Docker Compose v2)")
  }

  // サービスチェック
  if (!config.services || Object.keys(config.services).length === 0) {
    errors.push("No services defined")
  } else {
    Object.entries(config.services).forEach(([serviceName, service]) => {
      if (!service.image && !service.build) {
        errors.push(`Service '${serviceName}' must have either 'image' or 'build' specified`)
      }

      if (service.ports && Array.isArray(service.ports)) {
        service.ports.forEach((port, index: number) => {
          if (typeof port !== "string" && typeof port !== "number") {
            warnings.push(`Service '${serviceName}' port[${index}] should be a string or number`)
          }
        })
      }
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
