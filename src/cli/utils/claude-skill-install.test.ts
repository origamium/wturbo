import { execSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { installClaudeSkill, resolveTargetDir } from "./claude-skill-install.js"

function mkTempRepo(): string {
  // macOS returns /private/var/... via git rev-parse --show-toplevel, resolve upfront
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "wtb-skill-test-")))
  execSync("git init -q", { cwd: dir })
  execSync('git config user.email "t@t.t"', { cwd: dir })
  execSync('git config user.name "t"', { cwd: dir })
  // 初期コミットを作って gitRoot を安定させる
  writeFileSync(path.join(dir, "README.md"), "x", "utf-8")
  execSync("git add README.md && git commit -q -m init", { cwd: dir })
  return dir
}

describe("resolveTargetDir", () => {
  it("returns ~/.claude/skills/wtb when --user", () => {
    const target = resolveTargetDir({ user: true })
    expect(target).toBe(path.join(os.homedir(), ".claude", "skills", "wtb"))
  })

  it("returns <gitRoot>/.claude/skills/wtb when repo", () => {
    const repo = mkTempRepo()
    try {
      const target = resolveTargetDir({}, repo)
      expect(target).toBe(path.join(repo, ".claude", "skills", "wtb"))
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it("throws when not a git repo and --user is not set", () => {
    const nonRepo = mkdtempSync(path.join(os.tmpdir(), "wtb-not-repo-"))
    try {
      expect(() => resolveTargetDir({}, nonRepo)).toThrow(/Not in a git repository/)
    } finally {
      rmSync(nonRepo, { recursive: true, force: true })
    }
  })
})

describe("installClaudeSkill", () => {
  let repo: string
  const origCwd = process.cwd()

  beforeEach(() => {
    repo = mkTempRepo()
    process.chdir(repo)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(repo, { recursive: true, force: true })
  })

  it("writes SKILL.md to the repo .claude/skills/wtb/", async () => {
    const result = await installClaudeSkill({})
    expect(result.wrote).toBe(true)
    expect(result.existed).toBe(false)
    expect(existsSync(result.skillPath)).toBe(true)
    const content = readFileSync(result.skillPath, "utf-8")
    expect(content).toMatch(/^---\nname: wtb\b/m)
  })

  it("skips when SKILL.md exists and --force is not set", async () => {
    await installClaudeSkill({})
    const second = await installClaudeSkill({})
    expect(second.wrote).toBe(false)
    expect(second.existed).toBe(true)
    expect(second.skippedReason).toMatch(/already exists/)
  })

  it("overwrites with --force", async () => {
    const first = await installClaudeSkill({})
    writeFileSync(first.skillPath, "stale content", "utf-8")
    const second = await installClaudeSkill({ force: true })
    expect(second.wrote).toBe(true)
    const content = readFileSync(second.skillPath, "utf-8")
    expect(content).not.toBe("stale content")
    expect(content).toMatch(/name: wtb/)
  })

  it("does not write when --dry-run", async () => {
    const result = await installClaudeSkill({ dryRun: true })
    expect(result.wrote).toBe(false)
    expect(existsSync(result.skillPath)).toBe(false)
  })

  it("refuses to overwrite a symlink at the target", async () => {
    const targetDir = path.join(repo, ".claude", "skills", "wtb")
    execSync(`mkdir -p ${targetDir}`)
    const symlinkTarget = path.join(repo, "external-target.md")
    writeFileSync(symlinkTarget, "evil", "utf-8")
    symlinkSync(symlinkTarget, path.join(targetDir, "SKILL.md"))
    await expect(installClaudeSkill({ force: true })).rejects.toThrow(/symlink/)
  })
})
