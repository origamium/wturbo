/**
 * @fileoverview Create コマンド実装
 * Git worktreeの作成を担当
 */

import { existsSync, lstatSync, readlinkSync, statSync, symlinkSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import fs from "fs-extra"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
import { getUsedPorts } from "../../core/docker/client.js"
import {
  adjustPortsInCompose,
  readComposeFile,
  resolveComposeProjectName,
  writeComposeFile,
} from "../../core/docker/compose.js"
import {
  copyVolume,
  discoverCloneableVolumes,
  getContainersUsingVolume,
  getVolumeSize,
  resolveVolumeName,
  volumeExists,
} from "../../core/docker/volume.js"
import { copyAndAdjustEnvFile, parseEnvFile } from "../../core/environment/processor.js"
import { branchExists, getGitRootOrThrow } from "../../core/git/repository.js"
import { createWorktree, getWorktreePath, listWorktrees } from "../../core/git/worktree.js"
import type { WtbConfig } from "../../types/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import { executeLifecycleCommand } from "../../utils/exec.js"
import { withErrorHandling } from "../utils/command-helpers.js"
import { createVolumeCopyProgressHandler } from "../utils/progress.js"

interface CreateOptions {
  path?: string
  createBranch?: boolean
  docker?: boolean
  env?: boolean
  copy?: boolean
  link?: boolean
  start?: boolean
  volumeCopy?: boolean
  forceVolumeCopy?: boolean
  dryRun?: boolean
}

/**
 * createコマンドを作成
 */
export function createCommand(): Command {
  return new Command("create")
    .description("Create a new git worktree for the specified branch")
    .argument("<branch>", "Branch name to create worktree for")
    .option("-p, --path <path>", "Custom path for the worktree")
    .option("--no-create-branch", "Use existing branch instead of creating new one")
    .option("--no-docker", "Skip Docker Compose setup")
    .option("--no-env", "Skip environment file processing")
    .option("--no-copy", "Skip file copying")
    .option("--no-link", "Skip symlink creation")
    .option("--no-start", "Skip start_command execution")
    .option("--no-volume-copy", "Skip cloning Docker volumes from the source project")
    .option(
      "--force-volume-copy",
      "Clone volumes even when the source container is running or the target volume already has data",
    )
    .option("--dry-run", "Show what would be done without making changes")
    .action(withErrorHandling(executeCreateCommand))
}

/**
 * createコマンドのメイン実行ロジック
 */
async function executeCreateCommand(
  branch: string,
  options: CreateOptions
): Promise<void> {
  const gitRoot = getGitRootOrThrow()

  // 既存のworktreeチェック
  const existingPath = getWorktreePath(branch)
  if (existingPath) {
    throw new CLIError(
      `Worktree for branch '${branch}' already exists at: ${existingPath}`,
      EXIT_CODES.GENERAL_ERROR
    )
  }

  // ブランチ名のサニタイズ（パス用）
  const sanitizedBranch = branch.replace(/\//g, "-")

  // worktreeパスの決定
  const worktreePath = options.path
    ? path.resolve(options.path)
    : path.join(path.dirname(gitRoot), `worktree-${sanitizedBranch}`)

  const skipDocker = options.docker === false
  const skipEnv = options.env === false
  const skipCopy = options.copy === false
  const skipLink = options.link === false
  const skipStart = options.start === false
  const skipVolumeCopy = options.volumeCopy === false
  const forceVolumeCopy = options.forceVolumeCopy === true
  const dryRun = options.dryRun === true

  if (dryRun) {
    console.log("🔍 Dry run mode — no changes will be made")
    console.log("")
  }

  console.log(`🌿 Creating worktree for branch: ${branch}`)
  console.log(`📂 Worktree path: ${worktreePath}`)

  // ブランチが既に存在するかチェック
  const branchAlreadyExists = branchExists(branch)

  // --no-create-branch が指定されたのに対象ブランチが存在しない場合はエラー
  if (options.createBranch === false && !branchAlreadyExists) {
    throw new CLIError(
      `Branch '${branch}' does not exist. Remove --no-create-branch to create it.`,
      EXIT_CODES.GENERAL_ERROR
    )
  }

  const useExistingBranch = branchAlreadyExists || options.createBranch === false
  if (useExistingBranch) {
    console.log(`ℹ️  Branch '${branch}' already exists, using existing branch`)
  } else {
    console.log(`✨ Creating new branch: ${branch}`)
  }

  // 設定ファイルを先に読み込み（base_branch を worktree 作成前に取得するため）
  const config = loadConfig(gitRoot)

  // worktreeを作成（新規ブランチの場合は base_branch を使用）
  if (dryRun) {
    console.log(`  [dry-run] Would create worktree at ${worktreePath}`)
  } else {
    createWorktree(branch, worktreePath, {
      useExistingBranch,
      baseBranch: useExistingBranch ? undefined : config.base_branch,
    })
  }

  // link_files に含まれるパスはコピーをスキップしてシンボリックリンクを優先する
  const linkFileSet = new Set(config.link_files ?? [])
  const filesToCopy = (config.copy_files ?? []).filter((p) => !linkFileSet.has(p))

  // File copying phase
  if (filesToCopy.length > 0) {
    console.log("")
    if (skipCopy) {
      console.log("⏭️  Skipping file copy (--no-copy)")
    } else if (dryRun) {
      console.log(`📋 Would copy files: ${filesToCopy.join(", ")}`)
    } else {
      console.log("📋 Copying files/directories...")
      await copyConfiguredFiles(gitRoot, worktreePath, filesToCopy)
    }
  }

  // Symlink phase
  const linkFiles = config.link_files ?? []
  if (linkFiles.length > 0) {
    console.log("")
    if (skipLink) {
      console.log("⏭️  Skipping symlink creation (--no-link)")
    } else if (dryRun) {
      console.log(`🔗 Would create symlinks: ${linkFiles.join(", ")}`)
    } else {
      console.log("🔗 Creating symlinks...")
      await linkConfiguredFiles(gitRoot, worktreePath, linkFiles)
    }
  }

  // Environment file phase
  if (config.env.file.length > 0) {
    console.log("")
    if (skipEnv) {
      console.log("⏭️  Skipping environment file processing (--no-env)")
    } else if (dryRun) {
      const mode = Object.keys(config.env.adjust).length > 0 ? "adjust" : "copy"
      console.log(`🔧 Would process environment files (${mode}): ${config.env.file.join(", ")}`)
    } else if (Object.keys(config.env.adjust).length > 0) {
      console.log("🔧 Adjusting environment files...")
      await applyEnvAdjustments(gitRoot, worktreePath, config)
    } else {
      console.log("📋 Copying environment files...")
      await copyConfiguredFiles(gitRoot, worktreePath, config.env.file)
    }
  }

  // Docker Compose phase
  if (config.docker_compose_file) {
    console.log("")
    if (skipDocker) {
      console.log("⏭️  Skipping Docker Compose setup (--no-docker)")
    } else if (dryRun) {
      const sourceComposePath = path.resolve(gitRoot, config.docker_compose_file)
      if (existsSync(sourceComposePath)) {
        console.log(`🐳 Would configure Docker Compose: ${config.docker_compose_file}`)
      } else {
        console.log(
          `⚠️  Docker Compose source not found: ${config.docker_compose_file} (would skip)`
        )
      }
    } else {
      await setupDockerCompose(gitRoot, worktreePath, config)
    }
  }

  // Volume clone phase (named volumes from compose are auto-cloned to the new
  // worktree's project so e.g. PostgreSQL data carries over).
  if (config.docker_compose_file && !skipDocker) {
    console.log("")
    if (skipVolumeCopy) {
      console.log("⏭️  Skipping volume clone (--no-volume-copy)")
    } else if (dryRun) {
      previewVolumeCopy(gitRoot, config)
    } else {
      await setupVolumeCopy(gitRoot, worktreePath, config, { force: forceVolumeCopy })
    }
  }

  // start_command phase
  if (config.start_command) {
    console.log("")
    if (skipStart) {
      console.log("⏭️  Skipping start command (--no-start)")
    } else if (dryRun) {
      console.log(`🚀 Would run start command: ${config.start_command}`)
    } else {
      console.log(`🚀 Running start command: ${config.start_command}`)
      await executeStartCommand(config.start_command, worktreePath)
    }
  }

  // 成功メッセージ
  console.log("")
  if (dryRun) {
    console.log("🔍 Dry run complete — no changes were made")
  } else {
    console.log("🎉 Worktree created successfully!")
    console.log("")
    console.log("Next steps:")
    console.log(`  cd ${worktreePath}`)
    console.log("  # Start working on your branch")

    console.log("")
    console.log("📋 Current worktrees:")
    const worktrees = listWorktrees()
    for (const wt of worktrees) {
      const isNew = wt.branch === branch
      console.log(`  ${isNew ? "→" : " "} ${wt.branch}: ${wt.path}`)
    }

    // Claude Code skill 未導入なら案内を 1 行だけ出す
    if (!existsSync(path.join(gitRoot, ".claude", "skills", "wtb"))) {
      console.log("")
      console.log(
        '💡 Tip: Run "wtb init-claude" to let Claude Code auto-detect this worktree\'s ports.'
      )
    }
  }
}

/**
 * 設定ファイルで指定されたファイル/ディレクトリをworktreeにコピー
 */
async function copyConfiguredFiles(
  sourceRoot: string,
  targetRoot: string,
  copyFiles: string[]
): Promise<void> {
  for (const relativePath of copyFiles) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      const stat = statSync(sourcePath)

      if (stat.isDirectory()) {
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        console.log(`  ✅ Copied directory: ${relativePath}`)
      } else {
        await fs.ensureDir(path.dirname(targetPath))
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        console.log(`  ✅ Copied file: ${relativePath}`)
      }
    } catch (error) {
      console.log(`  ❌ Failed to copy ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}

/**
 * 設定ファイルで指定されたファイル/ディレクトリをworktreeにシンボリックリンクで張る
 */
async function linkConfiguredFiles(
  sourceRoot: string,
  targetRoot: string,
  linkFiles: string[]
): Promise<void> {
  for (const relativePath of linkFiles) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      await fs.ensureDir(path.dirname(targetPath))

      let targetExists = false
      try {
        lstatSync(targetPath)
        targetExists = true
      } catch {
        targetExists = false
      }

      if (targetExists) {
        let targetStat: ReturnType<typeof lstatSync>
        try {
          targetStat = lstatSync(targetPath)
        } catch {
          console.log(`  ❌ Failed to stat target ${relativePath}: cannot read target`)
          continue
        }

        if (targetStat.isSymbolicLink()) {
          const currentLink = readlinkSync(targetPath)
          if (currentLink === sourcePath) {
            console.log(`  ✅ Symlink already correct: ${relativePath}`)
            continue
          }
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing symlink (was → ${currentLink}): ${relativePath}`)
        } else if (targetStat.isDirectory()) {
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing existing directory with symlink: ${relativePath}`)
        } else {
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing existing file with symlink: ${relativePath}`)
        }
      }

      symlinkSync(sourcePath, targetPath)
      console.log(`  ✅ Symlinked: ${relativePath} → ${sourcePath}`)
    } catch (error) {
      console.log(`  ❌ Failed to symlink ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}

/**
 * start_commandを実行
 */
async function executeStartCommand(command: string, worktreePath: string): Promise<void> {
  try {
    const commandPath = path.resolve(worktreePath, command)
    const actualCommand = existsSync(commandPath) ? commandPath : command

    executeLifecycleCommand(actualCommand, worktreePath)
    console.log("  ✅ Start command completed successfully")
  } catch (error) {
    console.log(`  ⚠️  Start command failed: ${getErrorMessage(error)}`)
    console.log("  (Worktree was created, but start command had issues)")
  }
}

/**
 * Docker Compose ファイルをworktreeにコピーし、ポートを調整する
 * Docker が利用できない場合は無調整でコピーする
 */
async function setupDockerCompose(
  gitRoot: string,
  worktreePath: string,
  config: WtbConfig
): Promise<void> {
  if (!config.docker_compose_file) return

  const sourceComposePath = path.resolve(gitRoot, config.docker_compose_file)
  if (!existsSync(sourceComposePath)) {
    console.log(`⚠️  Docker Compose source not found: ${config.docker_compose_file} (skipped)`)
    return
  }

  const targetComposePath = path.resolve(worktreePath, config.docker_compose_file)

  // ターゲットに既にファイルが存在する場合はスキップ（start_command 等でコピー済みの場合）
  if (existsSync(targetComposePath)) return

  try {
    console.log("🐳 Configuring Docker Compose...")

    const composeConfig = readComposeFile(sourceComposePath)

    // 実行中のコンテナのポートを取得してポート衝突を避ける
    // Docker が利用できない場合は空配列になる（エラーは無視）
    let usedPorts: number[] = []
    try {
      usedPorts = getUsedPorts()
    } catch {
      // Docker が利用できない場合はポート調整なし
    }

    const adjustedConfig = adjustPortsInCompose(composeConfig, usedPorts)
    await fs.ensureDir(path.dirname(targetComposePath))
    writeComposeFile(targetComposePath, adjustedConfig)
    console.log(`  ✅ Docker Compose file configured: ${config.docker_compose_file}`)

    // start_command がない場合は使い方を提案
    if (!config.start_command) {
      console.log("  ℹ️  Tip: Run 'docker compose up -d' in the worktree to start services")
    }
  } catch (error) {
    console.log(`  ⚠️  Docker Compose setup skipped: ${getErrorMessage(error)}`)
  }
}

/**
 * dry-run 時の volume clone プレビュー。実 Docker は触らない。
 */
function previewVolumeCopy(gitRoot: string, config: WtbConfig): void {
  if (!config.docker_compose_file) return
  const sourceComposePath = path.resolve(gitRoot, config.docker_compose_file)
  if (!existsSync(sourceComposePath)) {
    console.log("📦 Would clone Docker volumes — but compose file not found, skipping")
    return
  }
  let composeConfig: ReturnType<typeof readComposeFile>
  try {
    composeConfig = readComposeFile(sourceComposePath)
  } catch {
    console.log("📦 Would clone Docker volumes — but compose file unreadable, skipping")
    return
  }
  const exclude = config.volumes?.exclude ?? []
  const cloneable = discoverCloneableVolumes(composeConfig, exclude)
  if (cloneable.length === 0) {
    console.log("📦 No volumes to clone (none defined in compose, all external, or all excluded)")
    return
  }
  console.log(`📦 Would clone ${cloneable.length} volume(s):`)
  for (const key of cloneable) {
    console.log(`    - ${key}`)
  }
}

/**
 * Compose の volumes セクションに定義された named volume を、source project から
 * target project (新 worktree) へ自動コピーする。
 *
 * - external な volume はスキップ (共有意図)
 * - config.volumes.exclude に含まれる key はスキップ
 * - source volume が存在しない、稼働中コンテナが使用中、target が既にデータ保持中
 *   の場合は警告してスキップ (force=true で強行可能。target 側はクリア後コピー)
 *
 * @internal exported for unit testing
 */
export async function setupVolumeCopy(
  gitRoot: string,
  worktreePath: string,
  config: WtbConfig,
  options: { force?: boolean }
): Promise<void> {
  if (!config.docker_compose_file) return

  const sourceComposePath = path.resolve(gitRoot, config.docker_compose_file)
  if (!existsSync(sourceComposePath)) return

  let composeConfig: ReturnType<typeof readComposeFile>
  try {
    composeConfig = readComposeFile(sourceComposePath)
  } catch (error) {
    console.log(`📦 Volume clone skipped: cannot read compose file (${getErrorMessage(error)})`)
    return
  }

  const exclude = config.volumes?.exclude ?? []
  const cloneable = discoverCloneableVolumes(composeConfig, exclude)
  if (cloneable.length === 0) {
    return // nothing to copy — silent
  }

  // Compose の実際のプロジェクト名 (compose-spec 準拠) を解決する。
  // `name:` が compose.yml に書かれていればそれを採用、なければディレクトリ名を
  // Compose の正規化規則で整形する。`generateProjectName` は仕様より厳しい
  // (underscore や dot をダッシュに置換) ため、ここでは使えない。
  const sourceProject = resolveComposeProjectName(composeConfig, gitRoot)
  const targetProject = resolveComposeProjectName(composeConfig, worktreePath)
  console.log("📦 Cloning Docker volumes...")

  let copiedCount = 0
  let skippedCount = 0

  for (const key of cloneable) {
    const source = resolveVolumeName(composeConfig, key, sourceProject)
    const target = resolveVolumeName(composeConfig, key, targetProject)
    if (!source || !target) {
      // discoverCloneableVolumes が external を弾いているのでここには来ない想定
      continue
    }
    if (source.external) {
      // 念のためのガード
      continue
    }

    // source 存在チェック
    if (!volumeExists(source.name)) {
      console.log(`  ℹ️  ${key}: source volume '${source.name}' does not exist yet — skipping`)
      skippedCount++
      continue
    }

    // 稼働中コンテナチェック (Postgres などのライブコピーは破損リスク)
    const usingContainers = getContainersUsingVolume(source.name)
    if (usingContainers.length > 0 && !options.force) {
      console.log(
        `  ⚠️  ${key}: source volume '${source.name}' is in use by ${usingContainers.join(", ")}`
      )
      console.log(
        `      → skipping (run 'docker compose down' on the source side, or pass --force-volume-copy to clone live with data-corruption risk)`
      )
      skippedCount++
      continue
    }

    // target に既にデータが入っているかチェック (空の volume ならコピーで上書き OK)
    let targetHadData = false
    if (volumeExists(target.name)) {
      const targetSize = getVolumeSize(target.name)
      if (targetSize > 0) {
        if (!options.force) {
          console.log(
            `  ⚠️  ${key}: target volume '${target.name}' already has data — skipping (use --force-volume-copy to overwrite)`
          )
          skippedCount++
          continue
        }
        // force=true: target に古いファイルが残ったままにならないよう、コピー前に
        // target を消去する (rsync は --delete、cp は find -delete でこの semantics
        // を実現)。これがないと cp フォールバック時に "上書き" の約束が破れる。
        targetHadData = true
      }
    }

    try {
      await copyVolume(source.name, target.name, {
        onProgress: createVolumeCopyProgressHandler(`  📦 ${key}`),
        clearTarget: targetHadData,
      })
      console.log(`  ✅ Cloned ${source.name} → ${target.name}`)
      copiedCount++
    } catch (error) {
      console.log(`  ❌ Failed to clone ${key}: ${getErrorMessage(error)}`)
      skippedCount++
    }
  }

  console.log(
    `  → ${copiedCount} volume(s) cloned, ${skippedCount} skipped`
  )
}

/**
 * 他のworktreeの環境変数ファイルから既に使われているポート番号を収集する
 * （数値調整キーに対応するポートのみ収集）
 */
function collectWorktreeEnvPorts(
  sourceRoot: string,
  targetRoot: string,
  config: WtbConfig
): number[] {
  const adjustedKeys = new Set(
    Object.entries(config.env.adjust)
      .filter(([, v]) => typeof v === "number")
      .map(([k]) => k)
  )

  if (adjustedKeys.size === 0) return []

  const usedPorts: number[] = []
  const resolvedTarget = path.resolve(targetRoot)
  const resolvedSource = path.resolve(sourceRoot)

  try {
    const worktrees = listWorktrees()
    for (const worktree of worktrees) {
      const resolvedPath = path.resolve(worktree.path)
      if (resolvedPath === resolvedTarget || resolvedPath === resolvedSource) continue

      for (const relativePath of config.env.file) {
        const envPath = path.resolve(worktree.path, relativePath)

        try {
          const parsed = parseEnvFile(envPath)
          for (const entry of parsed.entries) {
            if (adjustedKeys.has(entry.key)) {
              const port = parseInt(entry.value, 10)
              if (!Number.isNaN(port)) {
                usedPorts.push(port)
              }
            }
          }
        } catch {
          // ignore errors reading individual worktree env files
        }
      }
    }
  } catch {
    // ignore worktree listing errors (e.g. not in git repo)
  }

  return usedPorts
}

/**
 * env.fileに記載された環境変数ファイルをworktreeにコピーしenv.adjustを適用
 */
async function applyEnvAdjustments(
  sourceRoot: string,
  targetRoot: string,
  config: WtbConfig
): Promise<void> {
  // 他のworktreeで使用中のポートを収集（衝突防止）
  const usedPorts = collectWorktreeEnvPorts(sourceRoot, targetRoot, config)

  for (const relativePath of config.env.file) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      await fs.ensureDir(path.dirname(targetPath))
      const adjustedCount = copyAndAdjustEnvFile(
        sourcePath,
        targetPath,
        config.env.adjust,
        undefined,
        usedPorts
      )
      console.log(`  ✅ Applied ${adjustedCount} adjustment(s): ${relativePath}`)
    } catch (error) {
      console.log(`  ❌ Failed to adjust ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}
