/**
 * @fileoverview Claude Code Skill テンプレートを展開するヘルパー
 */

import { existsSync, lstatSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "fs-extra"
import { getGitRoot, isGitRepository } from "../../core/git/repository.js"

export interface InstallOptions {
  /** 既存ファイルを上書き */
  force?: boolean
  /** ~/.claude/skills/wtb/ に配置 */
  user?: boolean
  /** 書き込まずに対象パスだけ返す */
  dryRun?: boolean
}

export interface InstallResult {
  /** 展開されたスキルのルートディレクトリ */
  targetDir: string
  /** 書き出した SKILL.md の絶対パス */
  skillPath: string
  /** 既存 SKILL.md があったか */
  existed: boolean
  /** 実際に書き込んだか（dryRun / skip の場合 false） */
  wrote: boolean
  /** スキップ理由（existed && !force）または null */
  skippedReason: string | null
}

/**
 * templates ルート（npm パッケージ同梱）
 * src/cli/utils/claude-skill-install.(ts|js) から見た相対パス
 */
function resolveTemplateRoot(): string {
  const here = fileURLToPath(import.meta.url)
  // dist/cli/utils/claude-skill-install.js から ../../../templates
  // src/cli/utils/claude-skill-install.ts から同様
  return path.resolve(path.dirname(here), "..", "..", "..", "templates")
}

function resolveTemplateSkillFile(): string {
  return path.join(resolveTemplateRoot(), "claude", "skills", "wtb", "SKILL.md")
}

/**
 * インストール先ディレクトリを決定する
 * --user: ~/.claude/skills/wtb
 * default: <gitRoot>/.claude/skills/wtb
 */
export function resolveTargetDir(opts: InstallOptions, cwd?: string): string {
  if (opts.user) {
    return path.join(os.homedir(), ".claude", "skills", "wtb")
  }
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a git repository (use --user to install globally)")
  }
  const root = getGitRoot(cwd)
  return path.join(root, ".claude", "skills", "wtb")
}

/**
 * SKILL.md を target に展開する
 */
export async function installClaudeSkill(
  opts: InstallOptions,
  cwd?: string
): Promise<InstallResult> {
  const targetDir = resolveTargetDir(opts, cwd)
  const skillPath = path.join(targetDir, "SKILL.md")
  const templatePath = resolveTemplateSkillFile()

  if (!existsSync(templatePath)) {
    throw new Error(`Skill template not found at: ${templatePath}`)
  }

  const existed = existsSync(skillPath)

  if (opts.dryRun) {
    return {
      targetDir,
      skillPath,
      existed,
      wrote: false,
      skippedReason: null,
    }
  }

  if (existed && !opts.force) {
    return {
      targetDir,
      skillPath,
      existed: true,
      wrote: false,
      skippedReason: "already exists (use --force to overwrite)",
    }
  }

  // symlink 経由で書き込まれるのを防ぐ
  if (existed) {
    const stat = lstatSync(skillPath)
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to overwrite symlink at ${skillPath}. Remove it manually first.`
      )
    }
  }

  await fs.ensureDir(targetDir)
  await fs.copy(templatePath, skillPath, { overwrite: true })

  return {
    targetDir,
    skillPath,
    existed,
    wrote: true,
    skippedReason: null,
  }
}
