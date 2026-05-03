/**
 * @fileoverview E2E Test Helpers
 * Utilities for setting up and tearing down test environments
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"

// Paths
export const E2E_DIR = path.dirname(new URL(import.meta.url).pathname)
export const PROJECT_ROOT = path.dirname(E2E_DIR)
export const CLI_PATH = path.join(PROJECT_ROOT, "dist/cli/index.js")
export const PROJECTS_DIR = path.join(E2E_DIR, "projects")
export const TEST_WORKSPACE_DIR = path.join(E2E_DIR, ".test-workspace")

/**
 * Test project configuration
 */
export interface TestProject {
  name: string
  path: string
  description: string
}

/**
 * CLI execution result
 */
export interface CLIResult {
  stdout: string
  stderr: string
  exitCode: number
  combined: string
}

/**
 * Get all available test projects
 */
export function getTestProjects(): TestProject[] {
  const projects: TestProject[] = []

  if (!existsSync(PROJECTS_DIR)) {
    return projects
  }

  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const projectPath = path.join(PROJECTS_DIR, entry.name)
      const descPath = path.join(projectPath, "DESCRIPTION.txt")
      const description = existsSync(descPath)
        ? fs.readFileSync(descPath, "utf-8").trim()
        : entry.name

      projects.push({
        name: entry.name,
        path: projectPath,
        description,
      })
    }
  }

  return projects
}

/**
 * Create an isolated git repository for e2e testing based on a project template
 */
export function createTestRepo(projectName: string, testName: string): TestRepo {
  const templatePath = path.join(PROJECTS_DIR, projectName)
  const repoPath = path.join(TEST_WORKSPACE_DIR, `${projectName}-${testName}-${Date.now()}`)

  // Clean up if exists
  if (existsSync(repoPath)) {
    fs.removeSync(repoPath)
  }

  // Create workspace directory
  fs.ensureDirSync(TEST_WORKSPACE_DIR)

  // Copy project template
  fs.copySync(templatePath, repoPath)

  // Initialize git repository with 'main' as the default branch
  execSync("git init -b main", { cwd: repoPath, stdio: "pipe" })
  execSync('git config user.name "E2E Test"', { cwd: repoPath, stdio: "pipe" })
  execSync('git config user.email "e2e@test.local"', { cwd: repoPath, stdio: "pipe" })

  // Add and commit all files
  execSync("git add -A", { cwd: repoPath, stdio: "pipe" })
  execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: "pipe" })

  return new TestRepo(repoPath, projectName)
}

/**
 * Test repository wrapper with helper methods
 */
export class TestRepo {
  constructor(
    public readonly path: string,
    public readonly projectName: string
  ) {}

  /**
   * Run CLI command in this repository
   */
  runCLI(args: string): CLIResult {
    try {
      const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
        cwd: this.path,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
      return { stdout, stderr: "", exitCode: 0, combined: stdout }
    } catch (error: any) {
      const stdout = error.stdout?.toString() || ""
      const stderr = error.stderr?.toString() || ""
      return {
        stdout,
        stderr,
        exitCode: error.status || 1,
        combined: stdout + stderr,
      }
    }
  }

  /**
   * Get the path where a worktree would be created
   */
  getWorktreePath(branch: string): string {
    const sanitized = branch.replace(/\//g, "-")
    return path.join(path.dirname(this.path), `worktree-${sanitized}`)
  }

  /**
   * Check if a file exists in the repository
   */
  fileExists(relativePath: string): boolean {
    return existsSync(path.join(this.path, relativePath))
  }

  /**
   * Check if a file exists in a worktree
   */
  worktreeFileExists(branch: string, relativePath: string): boolean {
    return existsSync(path.join(this.getWorktreePath(branch), relativePath))
  }

  /**
   * Read a file from the repository
   */
  readFile(relativePath: string): string {
    return fs.readFileSync(path.join(this.path, relativePath), "utf-8")
  }

  /**
   * Read a file from a worktree
   */
  readWorktreeFile(branch: string, relativePath: string): string {
    return fs.readFileSync(path.join(this.getWorktreePath(branch), relativePath), "utf-8")
  }

  /**
   * Write a file to the repository
   */
  writeFile(relativePath: string, content: string): void {
    const filePath = path.join(this.path, relativePath)
    fs.ensureDirSync(path.dirname(filePath))
    fs.writeFileSync(filePath, content)
  }

  /**
   * List worktrees
   */
  listWorktrees(): string[] {
    try {
      const output = execSync("git worktree list --porcelain", {
        cwd: this.path,
        encoding: "utf-8",
      })
      return output
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
        .map((line) => line.substring(9))
    } catch {
      return []
    }
  }

  /**
   * Get current branch
   */
  getCurrentBranch(): string {
    return execSync("git branch --show-current", {
      cwd: this.path,
      encoding: "utf-8",
    }).trim()
  }

  /**
   * Check if branch exists
   */
  branchExists(branchName: string): boolean {
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: this.path,
        stdio: "pipe",
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Clean up the test repository and its worktrees
   */
  cleanup(): void {
    // Clean up worktrees first
    try {
      const worktrees = this.listWorktrees().filter((p) => p !== this.path)
      for (const wt of worktrees) {
        try {
          execSync(`git worktree remove --force "${wt}"`, {
            cwd: this.path,
            stdio: "pipe",
          })
        } catch {
          if (existsSync(wt)) {
            fs.removeSync(wt)
          }
        }
      }
      execSync("git worktree prune", { cwd: this.path, stdio: "pipe" })
    } catch {
      // Ignore errors
    }

    // Remove the repository
    if (existsSync(this.path)) {
      fs.removeSync(this.path)
    }
  }
}

/**
 * Clean up all test workspaces
 */
export function cleanupAllTestWorkspaces(): void {
  if (existsSync(TEST_WORKSPACE_DIR)) {
    // First, try to remove any worktrees
    const entries = fs.readdirSync(TEST_WORKSPACE_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repoPath = path.join(TEST_WORKSPACE_DIR, entry.name)
        try {
          // Prune worktrees
          execSync("git worktree prune", { cwd: repoPath, stdio: "pipe" })
        } catch {
          // Not a git repo or error, ignore
        }
      }
    }

    // Then remove the entire workspace
    fs.removeSync(TEST_WORKSPACE_DIR)
  }
}

/**
 * Create a non-git directory for testing error cases
 */
export function createNonGitDir(name: string): { path: string; cleanup: () => void } {
  const dirPath = path.join("/tmp", `wtb-e2e-nongit-${name}-${Date.now()}`)
  fs.ensureDirSync(dirPath)

  return {
    path: dirPath,
    cleanup: () => {
      if (existsSync(dirPath)) {
        fs.removeSync(dirPath)
      }
    },
  }
}

/**
 * Run CLI without a specific working directory (uses current)
 */
export function runCLI(args: string, cwd: string): CLIResult {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { stdout, stderr: "", exitCode: 0, combined: stdout }
  } catch (error: any) {
    const stdout = error.stdout?.toString() || ""
    const stderr = error.stderr?.toString() || ""
    return {
      stdout,
      stderr,
      exitCode: error.status || 1,
      combined: stdout + stderr,
    }
  }
}
