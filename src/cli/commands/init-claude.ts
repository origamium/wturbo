/**
 * @fileoverview `wtb init-claude` コマンド実装
 * Claude Code Skill テンプレートを .claude/skills/wtb/ に展開する
 */

import { Command } from "commander"
import { EXIT_CODES } from "../../constants/index.js"
import type { InitClaudeOptions } from "../../types/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import { installClaudeSkill } from "../utils/claude-skill-install.js"

/**
 * init-claudeコマンドを作成
 */
export function initClaudeCommand(): Command {
  return new Command("init-claude")
    .description(
      "Install the wtb Claude Code skill into this repo (.claude/skills/wtb/)"
    )
    .option("-f, --force", "Overwrite existing SKILL.md")
    .option("--user", "Install globally at ~/.claude/skills/wtb/ instead of per-repo")
    .option("--dry-run", "Print the target path without writing")
    .action(async (options: InitClaudeOptions) => {
      try {
        await executeInitClaudeCommand(options)
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

async function executeInitClaudeCommand(options: InitClaudeOptions): Promise<void> {
  try {
    const result = await installClaudeSkill({
      force: options.force,
      user: options.user,
      dryRun: options.dryRun,
    })

    if (options.dryRun) {
      console.log("🔍 Dry run — no files written")
      console.log(`  target dir:  ${result.targetDir}`)
      console.log(`  SKILL.md:    ${result.skillPath}`)
      console.log(`  existed:     ${result.existed}`)
      return
    }

    if (!result.wrote) {
      console.log(`ℹ️  Skipped: ${result.skillPath}`)
      if (result.skippedReason) {
        console.log(`   reason: ${result.skippedReason}`)
      }
      return
    }

    console.log("✅ Installed wtb Claude Code skill")
    console.log(`   ${result.skillPath}`)
    console.log("")
    if (options.user) {
      console.log(
        "This skill now applies to every Claude Code session on this machine."
      )
    } else {
      console.log("Next step:")
      console.log("  git add .claude/skills/wtb")
      console.log("  git commit -m \"chore: install wtb Claude Code skill\"")
      console.log("")
      console.log(
        "Committing ensures every worktree you create picks up the skill automatically."
      )
    }
  } catch (error) {
    if (error instanceof CLIError) throw error
    const message = getErrorMessage(error)
    if (message.includes("Not in a git repository")) {
      throw new CLIError(message, EXIT_CODES.NOT_GIT_REPOSITORY)
    }
    throw new CLIError(message, EXIT_CODES.GENERAL_ERROR)
  }
}
