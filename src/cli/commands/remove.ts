/**
 * @fileoverview Remove コマンド実装
 * Git worktreeの削除を担当
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
import { getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { getWorktreePath, listWorktrees, removeWorktree } from "../../core/git/worktree.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import { executeLifecycleCommand } from "../../utils/exec.js"

interface RemoveOptions {
  force?: boolean
  docker?: boolean
  end?: boolean
}

/**
 * removeコマンドを作成
 */
export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a git worktree for the specified branch")
    .argument("<branch>", "Branch name of the worktree to remove")
    .option("-f, --force", "Force removal even if worktree has uncommitted changes")
    .option("--no-docker", "Skip Docker Compose teardown")
    .option("--no-end", "Skip end_command execution")
    .action(async (branch: string, options: RemoveOptions) => {
      try {
        await executeRemoveCommand(branch, options)
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

/**
 * removeコマンドのメイン実行ロジック
 */
async function executeRemoveCommand(branch: string, options: RemoveOptions): Promise<void> {
  // Git リポジトリチェック
  if (!isGitRepository()) {
    throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const gitRoot = getGitRoot()

  // worktreeのパスを取得
  const worktreePath = getWorktreePath(branch)
  if (!worktreePath) {
    console.error(`Error: No worktree found for branch '${branch}'`)
    console.log("")
    console.log("Available worktrees:")
    const worktrees = listWorktrees()
    for (const wt of worktrees) {
      console.log(`  ${wt.branch}: ${wt.path}`)
    }
    throw new CLIError(`No worktree found for branch '${branch}'`, EXIT_CODES.GENERAL_ERROR)
  }

  // メインリポジトリの削除を防止
  if (worktreePath === gitRoot) {
    throw new CLIError("Cannot remove the main repository worktree", EXIT_CODES.GENERAL_ERROR)
  }

  console.log(`🗑️  Removing worktree for branch: ${branch}`)
  console.log(`📂 Worktree path: ${worktreePath}`)

  if (options.force) {
    console.log("⚠️  Force removal enabled")
  }

  const config = loadConfig(gitRoot)

  const skipDocker = options.docker === false
  const skipEnd = options.end === false

  // Docker Compose teardown
  // - Only if compose file is actually configured (avoid path.resolve("") → worktree root bug)
  // - Skipped automatically when end_command is set (user owns teardown)
  if (config.docker_compose_file) {
    if (skipDocker) {
      console.log("")
      console.log("⏭️  Skipping Docker Compose teardown (--no-docker)")
    } else if (!config.end_command) {
      const worktreeComposePath = path.resolve(worktreePath, config.docker_compose_file)
      if (existsSync(worktreeComposePath)) {
        console.log("")
        console.log("🐳 Stopping Docker Compose services...")
        await runDockerComposeDown(worktreePath)
      }
    }
  }

  // end_commandの実行（worktree削除前）
  if (config.end_command) {
    if (skipEnd) {
      console.log("")
      console.log("⏭️  Skipping end command (--no-end)")
    } else {
      console.log("")
      console.log(`🛑 Running end command: ${config.end_command}`)
      await executeEndCommand(config.end_command, worktreePath)
    }
  }

  // worktreeを削除
  removeWorktree(worktreePath, { force: options.force })

  // 成功メッセージ
  console.log("")
  console.log("🎉 Worktree removed successfully!")

  // 残りのworktree一覧を表示
  console.log("")
  console.log("📋 Remaining worktrees:")
  const worktrees = listWorktrees()
  if (worktrees.length === 0) {
    console.log("  No worktrees found")
  } else {
    for (const wt of worktrees) {
      const isMain = wt.path === gitRoot
      console.log(`  ${wt.branch}${isMain ? " (main)" : ""}: ${wt.path}`)
    }
  }
}

/**
 * worktreeディレクトリで docker compose down を実行
 * Docker が利用できない場合は警告のみ（削除処理は継続）
 */
async function runDockerComposeDown(worktreePath: string): Promise<void> {
  try {
    execSync("docker compose down", {
      cwd: worktreePath,
      stdio: "inherit",
      shell: "/bin/sh",
    })
    console.log("  ✅ Docker Compose services stopped")
  } catch (error) {
    console.log(`  ⚠️  Docker Compose down skipped: ${getErrorMessage(error)}`)
    console.log("  (Continuing with worktree removal)")
  }
}

/**
 * end_commandを実行
 */
async function executeEndCommand(command: string, worktreePath: string): Promise<void> {
  try {
    const commandPath = path.resolve(worktreePath, command)
    const actualCommand = existsSync(commandPath) ? commandPath : command

    executeLifecycleCommand(actualCommand, worktreePath)
    console.log("  ✅ End command completed successfully")
  } catch (error) {
    console.log(`  ⚠️  End command failed: ${getErrorMessage(error)}`)
    console.log("  (Continuing with worktree removal)")
  }
}
