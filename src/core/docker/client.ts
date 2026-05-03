/**
 * @fileoverview Docker クライアント操作
 * Dockerコンテナとボリュームの情報取得を担当
 */

import { execSync } from "node:child_process"
import { DOCKER_COMMANDS, FILE_ENCODING, WTB_PREFIX } from "../../constants/index.js"
import type { ContainerInfo, ExecOptions, VolumeInfo } from "../../types/index.js"

/**
 * Dockerコマンドを実行するための基本ヘルパー
 *
 * @param command - 実行するDockerコマンド
 * @param options - 実行オプション
 * @returns コマンドの出力結果
 * @throws {Error} コマンドの実行に失敗した場合
 */
function execDockerCommand(command: string, options?: ExecOptions): string {
  try {
    const execOptions = {
      encoding: FILE_ENCODING,
      stdio: "pipe" as const,
      ...(options?.cwd && { cwd: options.cwd }),
      ...(options?.env && { env: { ...process.env, ...options.env } }),
    }
    return execSync(command, execOptions).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Docker command failed: ${command}\n${message}`)
  }
}

/**
 * 実行中のDockerコンテナ一覧を取得
 *
 * @param options - 実行オプション
 * @returns コンテナ情報の配列
 *
 * @example
 * ```typescript
 * const containers = getRunningContainers()
 * containers.forEach(container => {
 *   console.log(`${container.name}: ${container.status}`)
 * })
 * ```
 */
export function getRunningContainers(options?: ExecOptions): ContainerInfo[] {
  try {
    const output = execDockerCommand(DOCKER_COMMANDS.CONTAINERS, options)
    return parseContainerList(output)
  } catch (error) {
    console.warn(
      "Failed to get running containers:",
      error instanceof Error ? error.message : String(error)
    )
    return []
  }
}

/**
 * docker psの出力をパースしてコンテナ情報配列に変換
 *
 * @param output - docker psの出力
 * @returns パースされたコンテナ情報配列
 *
 * @example
 * ```typescript
 * const output = "abc123\tmy-app\tnginx:latest\tUp 5 minutes\t0.0.0.0:3000->80/tcp"
 * const containers = parseContainerList(output)
 * ```
 */
function parseContainerList(output: string): ContainerInfo[] {
  if (!output.trim()) {
    return []
  }

  const containers: ContainerInfo[] = []
  for (const line of output.split("\n")) {
    const parts = line.split("\t")
    if (parts.length < 4) {
      continue
    }

    const [id, name, image, status, ports = ""] = parts

    containers.push({
      id: id.trim(),
      name: name.trim(),
      image: image.trim(),
      status: status.trim(),
      ports: ports
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      volumes: [] as string[], // 後で個別に取得
      networks: [] as string[], // 後で個別に取得
    })
  }
  return containers
}

/**
 * 指定されたコンテナのボリュームマウント情報を取得
 *
 * @param containerId - コンテナID
 * @param options - 実行オプション
 * @returns ボリュームマウント情報の配列
 *
 * @example
 * ```typescript
 * const volumes = getContainerVolumes('abc123')
 * volumes.forEach(volume => {
 *   console.log(`Volume: ${volume}`)
 * })
 * ```
 */
export function getContainerVolumes(containerId: string, options?: ExecOptions): string[] {
  try {
    const command = DOCKER_COMMANDS.CONTAINER_VOLUMES.replace("{containerId}", containerId)
    const output = execDockerCommand(command, options)
    return output
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v !== "<no value>")
  } catch (error) {
    console.warn(
      `Failed to get volumes for container ${containerId}:`,
      error instanceof Error ? error.message : String(error)
    )
    return []
  }
}

/**
 * 指定されたコンテナのネットワーク情報を取得
 *
 * @param containerId - コンテナID
 * @param options - 実行オプション
 * @returns ネットワーク名の配列
 *
 * @example
 * ```typescript
 * const networks = getContainerNetworks('abc123')
 * networks.forEach(network => {
 *   console.log(`Network: ${network}`)
 * })
 * ```
 */
export function getContainerNetworks(containerId: string, options?: ExecOptions): string[] {
  try {
    const command = DOCKER_COMMANDS.CONTAINER_NETWORKS.replace("{containerId}", containerId)
    const output = execDockerCommand(command, options)
    return output
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  } catch (error) {
    console.warn(
      `Failed to get networks for container ${containerId}:`,
      error instanceof Error ? error.message : String(error)
    )
    return []
  }
}

/**
 * Dockerボリューム一覧を取得
 *
 * @param options - 実行オプション
 * @returns ボリューム情報の配列
 *
 * @example
 * ```typescript
 * const volumes = getDockerVolumes()
 * volumes.forEach(volume => {
 *   console.log(`${volume.name}: ${volume.driver}`)
 * })
 * ```
 */
export function getDockerVolumes(options?: ExecOptions): VolumeInfo[] {
  try {
    const output = execDockerCommand(DOCKER_COMMANDS.VOLUMES, options)
    return parseVolumeList(output)
  } catch (error) {
    console.warn(
      "Failed to get Docker volumes:",
      error instanceof Error ? error.message : String(error)
    )
    return []
  }
}

/**
 * docker volume lsの出力をパースしてボリューム情報配列に変換
 *
 * @param output - docker volume lsの出力
 * @returns パースされたボリューム情報配列
 */
function parseVolumeList(output: string): VolumeInfo[] {
  if (!output.trim()) {
    return []
  }

  return output
    .split("\n")
    .map((line) => {
      const parts = line.split("\t")
      if (parts.length < 2) {
        return null
      }

      const [name, driver, mountpoint = ""] = parts

      return {
        name: name.trim(),
        driver: driver.trim(),
        mountpoint: mountpoint.trim(),
      }
    })
    .filter((volume): volume is VolumeInfo => volume !== null)
}

/**
 * 実行中のコンテナから使用されているポート番号を抽出
 *
 * @param options - 実行オプション
 * @returns 使用中のポート番号配列
 *
 * @example
 * ```typescript
 * const usedPorts = getUsedPorts()
 * console.log(`Used ports: ${usedPorts.join(', ')}`)
 * ```
 */
export function getUsedPorts(options?: ExecOptions): number[] {
  const containers = getRunningContainers(options)
  const ports: number[] = []

  containers.forEach((container) => {
    container.ports.forEach((portMapping) => {
      // ポートマッピングの形式: "0.0.0.0:3000->80/tcp" または "3000:80"
      const match = portMapping.match(/(?:[\d.]+:)?(\d+)(?:->\d+(?:\/\w+)?)?/)
      if (match) {
        const port = parseInt(match[1], 10)
        if (!Number.isNaN(port) && !ports.includes(port)) {
          ports.push(port)
        }
      }
    })
  })

  return ports.sort((a, b) => a - b)
}

/**
 * wtbプロジェクトのコンテナかどうかを判定
 *
 * @param container - 判定するコンテナ情報
 * @returns wtbプロジェクトのコンテナの場合true
 *
 * @example
 * ```typescript
 * const containers = getRunningContainers()
 * const wtbContainers = containers.filter(isWtbContainer)
 * console.log(`wtb containers: ${wtbContainers.length}`)
 * ```
 */
export function isWtbContainer(container: ContainerInfo): boolean {
  // コンテナ名にwtbが含まれている
  if (container.name.includes("wtb")) {
    return true
  }

  // 環境変数でwtbプロジェクトのコンテナか判定
  const wtbEnvVars = Object.keys(process.env).filter((key) => key.startsWith(WTB_PREFIX))

  return wtbEnvVars.some((envVar) => {
    const value = process.env[envVar]
    return value && container.name.includes(value)
  })
}

/**
 * Dockerの動作確認とバージョン情報を取得
 *
 * @param options - 実行オプション
 * @returns Docker情報オブジェクト
 *
 * @example
 * ```typescript
 * try {
 *   const info = getDockerInfo()
 *   console.log(`Docker: ${info.dockerVersion}`)
 *   console.log(`Compose: ${info.composeVersion}`)
 * } catch (error) {
 *   console.error('Docker is not available')
 * }
 * ```
 */
export function getDockerInfo(options?: ExecOptions) {
  try {
    const dockerVersion = execDockerCommand(DOCKER_COMMANDS.VERSION, options)

    let composeVersion = "unknown"
    try {
      const composeOutput = execDockerCommand(DOCKER_COMMANDS.COMPOSE_VERSION, options)
      const versionMatch = composeOutput.match(/version (\S+)/)
      if (versionMatch) {
        composeVersion = versionMatch[1]
      }
    } catch {
      // Docker Composeが利用できない場合は無視
    }

    return {
      dockerVersion,
      composeVersion,
      isAvailable: true,
    }
  } catch {
    throw new Error("Docker is not available or not running")
  }
}
