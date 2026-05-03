/**
 * @fileoverview `wtb ls` コマンド実装
 * Gitのworktree一覧をls風に表示する
 */

import * as path from "node:path"
import { Command } from "commander"
import { enrichWorktree } from "../../core/git/commit-info.js"
import { getGitRootOrThrow } from "../../core/git/repository.js"
import { listWorktrees } from "../../core/git/worktree.js"
import type { LsCommandOptions } from "../../types/index.js"
import { withErrorHandling } from "../utils/command-helpers.js"
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
    .action(withErrorHandling(executeLsCommand))
}

/**
 * lsコマンドのメイン実行ロジック
 * 優先順位: --paths > --json (+ -l) > plain (+ -l)
 */
async function executeLsCommand(options: LsCommandOptions): Promise<void> {
  const gitRoot = getGitRootOrThrow()
  const worktrees = listWorktrees()
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
