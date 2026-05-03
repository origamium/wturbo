import { execSync } from "node:child_process"
import * as path from "node:path"
import * as fs from "fs-extra"

export interface TestGitRepo {
  path: string
  cleanup: () => void
}

/**
 * Create a temporary git repository for testing
 */
export function createTestGitRepo(name?: string): TestGitRepo {
  const testDir = path.join(process.cwd(), "test-repos")
  const repoName = name || `test-repo-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const repoPath = path.join(testDir, repoName)

  // Ensure test directory exists
  fs.ensureDirSync(testDir)

  // Create repository directory
  fs.ensureDirSync(repoPath)

  try {
    // Initialize git repository
    execSync("git init", { cwd: repoPath, stdio: "pipe" })

    // Configure git for testing
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: "pipe" })
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: "pipe" })

    // Create initial commit
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Test Repository\n")
    execSync("git add README.md", { cwd: repoPath, stdio: "pipe" })
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: "pipe" })

    const cleanup = () => {
      if (fs.existsSync(repoPath)) {
        fs.removeSync(repoPath)
      }
    }

    return {
      path: repoPath,
      cleanup,
    }
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(repoPath)) {
      fs.removeSync(repoPath)
    }
    throw new Error(`Failed to create test git repository: ${error}`)
  }
}

/**
 * Add a file to the test repository and commit it
 */
export function addFileToRepo(
  repoPath: string,
  fileName: string,
  content: string,
  commitMessage?: string
): void {
  const filePath = path.join(repoPath, fileName)
  fs.writeFileSync(filePath, content)

  execSync(`git add ${fileName}`, { cwd: repoPath, stdio: "pipe" })
  const message = commitMessage || `Add ${fileName}`
  execSync(`git commit -m "${message}"`, { cwd: repoPath, stdio: "pipe" })
}

/**
 * Create a new branch in the test repository
 */
export function createBranch(
  repoPath: string,
  branchName: string,
  switchTo: boolean = false
): void {
  const command = switchTo ? `git checkout -b ${branchName}` : `git branch ${branchName}`
  execSync(command, { cwd: repoPath, stdio: "pipe" })
}

/**
 * Switch to a branch in the test repository
 */
export function switchBranch(repoPath: string, branchName: string): void {
  execSync(`git checkout ${branchName}`, { cwd: repoPath, stdio: "pipe" })
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoPath: string): string {
  return execSync("git branch --show-current", { cwd: repoPath, encoding: "utf-8" }).trim()
}

/**
 * Check if branch exists
 */
export function branchExists(repoPath: string, branchName: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      cwd: repoPath,
      stdio: "pipe",
    })
    return true
  } catch {
    return false
  }
}

/**
 * Create a worktree in the test repository
 */
export function createWorktree(repoPath: string, branchName: string, worktreePath: string): void {
  execSync(`git worktree add ${worktreePath} ${branchName}`, { cwd: repoPath, stdio: "pipe" })
}

/**
 * List worktrees in the test repository
 */
export function listWorktrees(
  repoPath: string
): Array<{ path: string; branch: string; head: string }> {
  try {
    const output = execSync("git worktree list --porcelain", { cwd: repoPath, encoding: "utf-8" })
    const worktrees: Array<{ path: string; branch: string; head: string }> = []

    const entries = output.split("\n\n").filter((entry) => entry.trim())

    entries.forEach((entry) => {
      const lines = entry.split("\n")
      const worktree: Partial<{ path: string; branch: string; head: string }> = {}

      lines.forEach((line) => {
        if (line.startsWith("worktree ")) {
          worktree.path = line.substring(9)
        } else if (line.startsWith("branch ")) {
          worktree.branch = line.substring(7)
        } else if (line.startsWith("HEAD ")) {
          worktree.head = line.substring(5)
        }
      })

      if (worktree.path) {
        worktrees.push({
          path: worktree.path,
          branch: worktree.branch || "detached",
          head: worktree.head || "unknown",
        })
      }
    })

    return worktrees
  } catch {
    return []
  }
}

/**
 * Remove a worktree from the test repository
 */
export function removeWorktree(repoPath: string, worktreePath: string): void {
  execSync(`git worktree remove ${worktreePath}`, { cwd: repoPath, stdio: "pipe" })
}

/**
 * Create a docker-compose.yml file in the test repository
 */
export function createDockerComposeFile(repoPath: string, content?: string): void {
  const defaultContent = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "3000:80"
    environment:
      - NODE_ENV=development
  db:
    image: postgres:13
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=testdb
      - POSTGRES_USER=testuser
      - POSTGRES_PASSWORD=testpass
`

  fs.writeFileSync(path.join(repoPath, "docker-compose.yaml"), content || defaultContent)
}

/**
 * Create a .env file in the test repository
 */
export function createEnvFile(repoPath: string, fileName: string = ".env", content?: string): void {
  const defaultContent = `NODE_ENV=development
APP_PORT=3000
DB_PORT=5432
API_URL=http://localhost:8000
`

  fs.writeFileSync(path.join(repoPath, fileName), content || defaultContent)
}

/**
 * Clean up all test repositories
 */
export function cleanup(): void {
  const testDir = path.join(process.cwd(), "test-repos")
  if (fs.existsSync(testDir)) {
    fs.removeSync(testDir)
  }
}

/**
 * Create a wtb.yaml config file in the test repository
 */
type PartialWtbTestConfig = {
  base_branch?: string
  docker_compose_file?: string
  env?: {
    file?: string[]
    adjust?: {
      APP_PORT?: number | null
      DB_PORT?: number | null
      API_URL?: string
    }
  }
}

export function createWtbConfig(repoPath: string, config?: PartialWtbTestConfig): void {
  const defaultConfig = {
    base_branch: "main",
    docker_compose_file: "./docker-compose.yaml",
    env: {
      file: ["./.env"],
      adjust: {
        APP_PORT: null,
        DB_PORT: null,
        API_URL: "http://localhost:8000",
      },
    },
  }

  const configContent = `# wtb Test Configuration
base_branch: ${config?.base_branch || defaultConfig.base_branch}
docker_compose_file: ${config?.docker_compose_file || defaultConfig.docker_compose_file}

env:
  file:
    - ${config?.env?.file?.[0] || defaultConfig.env.file[0]}
  adjust:
    APP_PORT: ${config?.env?.adjust?.APP_PORT !== undefined ? config.env.adjust.APP_PORT : "null"}
    DB_PORT: ${config?.env?.adjust?.DB_PORT !== undefined ? config.env.adjust.DB_PORT : "null"}
    API_URL: "${config?.env?.adjust?.API_URL || defaultConfig.env.adjust.API_URL}"
`

  fs.writeFileSync(path.join(repoPath, "wtb.yaml"), configContent)
}
