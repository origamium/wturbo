/**
 * @fileoverview `wtb ls` コマンド実装
 * Gitのworktree一覧をls風に表示する
 */

import * as path from "node:path"
import { Command } from "commander"
import { EXIT_CODES } from "../../constants/index.js"
import { enrichWorktree } from "../../core/git/commit-info.js"
import { getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { listWorktrees } from "../../core/git/worktree.js"
import type { LsCommandOptions } from "../../types/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import {
  renderDefault,
  renderJson,
  renderLong,
  renderPaths,
} from "../utils/worktree-render.js"

/**
 * lsコマンドを作成
 */
export function lsCommand(): Command {
  return new Command("ls")
    .alias("list")
    .description("List git worktrees (ls-like, scriptable)")
    .option("-l, --long", "Show commit hash, age, dirty state, and subject")
    .option("--json", "Output machine-readable JSON")
    .option("-p, --paths", "Output paths only (one per line)")
    .action(async (options: LsCommandOptions) => {
      try {
        await executeLsCommand(options)
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
 * lsコマンドのメイン実行ロジック
 * 優先順位: --paths > --json (+ -l) > plain (+ -l)
 */
async function executeLsCommand(options: LsCommandOptions): Promise<void> {
  if (!isGitRepository()) {
    throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const worktrees = listWorktrees()
  const gitRoot = getGitRoot()
  const currentPath = path.resolve(process.cwd())

  if (options.paths) {
    process.stdout.write(renderPaths(worktrees))
    return
  }

  if (options.long) {
    const enriched = await Promise.all(worktrees.map(enrichWorktree))
    if (options.json) {
      process.stdout.write(`${renderJson(enriched, currentPath, gitRoot)}\n`)
      return
    }
    process.stdout.write(renderLong(enriched, currentPath, gitRoot))
    return
  }

  if (options.json) {
    process.stdout.write(`${renderJson(worktrees, currentPath, gitRoot)}\n`)
    return
  }

  process.stdout.write(renderDefault(worktrees, currentPath, gitRoot))
}
