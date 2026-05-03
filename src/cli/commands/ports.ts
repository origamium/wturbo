/**
 * @fileoverview `wtb ports` コマンド実装
 * 各worktreeの adjusted 済ポート値・compose サービスポート・推定エンドポイントを出力する
 */

import { accessSync, constants as fsConstants } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
import {
  findComposeFile,
  parsePortMapping,
  readComposeFile,
} from "../../core/docker/compose.js"
import { parseEnvFile } from "../../core/environment/processor.js"
import { getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { listWorktrees } from "../../core/git/worktree.js"
import type {
  ComposeServicePorts,
  PortsCommandOptions,
  WtbConfig,
  WorktreeInfo,
  WorktreePorts,
} from "../../types/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import { renderPortsJson, renderPortsPretty } from "../utils/ports-render.js"

/**
 * portsコマンドを作成
 */
export function portsCommand(): Command {
  return new Command("ports")
    .description(
      "Print the adjusted ports and endpoints for this (or all) worktree(s)"
    )
    .option("--all", "Output an array of all worktrees (default: current worktree only)")
    .option("--pretty", "Human-readable table instead of JSON")
    .action(async (options: PortsCommandOptions) => {
      try {
        await executePortsCommand(options)
      } catch (error) {
        if (error instanceof CLIError) {
          console.error(`Error: ${error.message}`)
          process.exit(error.exitCode)
        }
        console.error(`Error: ${getErrorMessage(error)}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })
}

async function executePortsCommand(options: PortsCommandOptions): Promise<void> {
  if (!isGitRepository()) {
    throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const gitRoot = getGitRoot()
  const config = loadConfig(gitRoot)
  const worktrees = listWorktrees()
  const currentPath = path.resolve(process.cwd())

  if (options.all) {
    const rows = worktrees.map((wt) => gatherPortsForWorktree(wt, gitRoot, config))
    if (options.pretty) {
      process.stdout.write(renderPortsPretty(rows))
    } else {
      process.stdout.write(`${renderPortsJson(rows)}\n`)
    }
    return
  }

  const target = pickCurrentWorktree(worktrees, currentPath, gitRoot)
  if (!target) {
    throw new CLIError(
      "Could not determine current worktree (no matching path in `git worktree list`)",
      EXIT_CODES.GENERAL_ERROR
    )
  }
  const row = gatherPortsForWorktree(target, gitRoot, config)
  if (options.pretty) {
    process.stdout.write(renderPortsPretty([row]))
  } else {
    process.stdout.write(`${renderPortsJson(row)}\n`)
  }
}

/**
 * cwd を含む worktree を選ぶ。該当なしなら main(gitRoot と同じ path)へフォールバック。
 */
function pickCurrentWorktree(
  worktrees: WorktreeInfo[],
  currentPath: string,
  gitRoot: string
): WorktreeInfo | null {
  const resolvedCwd = path.resolve(currentPath)
  const byCwd = worktrees.find((wt) => {
    const resolved = path.resolve(wt.path)
    return resolvedCwd === resolved || resolvedCwd.startsWith(`${resolved}${path.sep}`)
  })
  if (byCwd) return byCwd
  return worktrees.find((wt) => path.resolve(wt.path) === path.resolve(gitRoot)) ?? null
}

/**
 * 1 worktree 分の ports 情報を収集する。
 * - env: config.env.adjust の key のみ、対応 worktree の env ファイルから値を引く
 * - compose: config.docker_compose_file または findComposeFile で見つけた compose から抽出
 * - endpoints: compose の host_ports を http://localhost:<port> に単純展開
 */
export function gatherPortsForWorktree(
  wt: WorktreeInfo,
  gitRoot: string,
  config: WtbConfig
): WorktreePorts {
  const worktreePath = path.resolve(wt.path)

  const env = collectEnvValues(worktreePath, config)
  const compose = collectComposeServices(worktreePath, gitRoot, config)
  const endpoints = buildEndpoints(compose.services)

  return {
    path: worktreePath,
    branch: wt.branch,
    env,
    compose,
    endpoints,
  }
}

function collectEnvValues(
  worktreePath: string,
  config: WtbConfig
): Record<string, string> {
  const adjustKeys = new Set(Object.keys(config.env.adjust ?? {}))
  const out: Record<string, string> = {}
  if (adjustKeys.size === 0) return out

  for (const relPath of config.env.file) {
    const envPath = path.resolve(worktreePath, relPath)
    try {
      const parsed = parseEnvFile(envPath)
      for (const entry of parsed.entries) {
        if (adjustKeys.has(entry.key)) {
          out[entry.key] = entry.value
        }
      }
    } catch {
      // env ファイル未存在などは無視（別 worktree に存在するケース含む）
    }
  }
  return out
}

function collectComposeServices(
  worktreePath: string,
  gitRoot: string,
  config: WtbConfig
): WorktreePorts["compose"] {
  const composePath = resolveComposePath(worktreePath, gitRoot, config)
  if (!composePath) {
    return { file: null, services: {} }
  }

  try {
    const parsed = readComposeFile(composePath)
    const services: Record<string, ComposeServicePorts> = {}
    for (const [name, svc] of Object.entries(parsed.services ?? {})) {
      const hostPorts: number[] = []
      const containerPorts: number[] = []
      if (svc.ports && Array.isArray(svc.ports)) {
        for (const entry of svc.ports) {
          const mapping =
            typeof entry === "string" ? parsePortMapping(entry) : null
          if (mapping) {
            hostPorts.push(mapping.hostPort)
            containerPorts.push(mapping.containerPort)
          }
        }
      }
      services[name] = { host_ports: hostPorts, container_ports: containerPorts }
    }
    return {
      file: path.relative(worktreePath, composePath) || path.basename(composePath),
      services,
    }
  } catch (error) {
    process.stderr.write(
      `⚠️  Failed to read compose file at ${composePath}: ${getErrorMessage(error)}\n`
    )
    return { file: null, services: {} }
  }
}

function resolveComposePath(
  worktreePath: string,
  gitRoot: string,
  config: WtbConfig
): string | null {
  if (config.docker_compose_file) {
    // docker_compose_file は config(=gitRoot)基準の相対パス。
    // worktree 内の同じ相対位置を優先、無ければ gitRoot 側を試す。
    const inWorktree = path.resolve(worktreePath, config.docker_compose_file)
    if (fileIsReadable(inWorktree)) return inWorktree
    const inRoot = path.resolve(gitRoot, config.docker_compose_file)
    if (fileIsReadable(inRoot)) return inRoot
    return null
  }
  // docker_compose_file 未設定でも worktree に compose がある場合は拾う
  return findComposeFile(worktreePath)
}

function fileIsReadable(p: string): boolean {
  try {
    accessSync(p, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

function buildEndpoints(
  services: Record<string, ComposeServicePorts>
): string[] {
  const seen = new Set<number>()
  const out: string[] = []
  for (const svc of Object.values(services)) {
    for (const p of svc.host_ports) {
      if (!seen.has(p)) {
        seen.add(p)
        out.push(`http://localhost:${p}`)
      }
    }
  }
  return out
}
