/**
 * @fileoverview Git Worktree 操作
 * Git worktreeの作成、削除、一覧表示等の操作を担当
 */

import * as path from "node:path"
import type { WorktreeInfo } from "../../types/index.js"
import { execGitSafe } from "../../utils/exec.js"
import { getGitRoot, isGitRepository } from "./repository.js"

/**
 * Git worktreeの一覧を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeの情報配列
 * @throws {Error} Gitリポジトリではない場合
 */
export function listWorktrees(cwd?: string): WorktreeInfo[] {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  try {
    const output = execGitSafe(["worktree", "list", "--porcelain"], { cwd })
    return parseWorktreeList(output)
  } catch {
    return []
  }
}

/**
 * git worktree listの出力をパースしてオブジェクト配列に変換
 *
 * @param output - git worktree list --porcelainの出力
 * @returns パースされたworktree情報配列
 */
export function parseWorktreeList(output: string): WorktreeInfo[] {
  if (!output.trim()) {
    return []
  }

  const worktrees: WorktreeInfo[] = []
  const lines = output.split("\n")
  let currentWorktree: Partial<WorktreeInfo> = {}

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (currentWorktree.path) {
        worktrees.push(currentWorktree as WorktreeInfo)
      }
      currentWorktree = {
        path: line.substring(9).trim(),
        branch: "",
        head: "",
      }
    } else if (line.startsWith("HEAD ")) {
      currentWorktree.head = line.substring(5).trim()
    } else if (line.startsWith("branch ")) {
      const branchRef = line.substring(7).trim()
      currentWorktree.branch = branchRef.replace("refs/heads/", "")
    } else if (line.startsWith("detached")) {
      currentWorktree.branch = "(detached)"
      currentWorktree.detached = true
    } else if (line === "locked" || line.startsWith("locked ")) {
      currentWorktree.locked = true
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      currentWorktree.prunable = true
    } else if (line === "bare") {
      currentWorktree.bare = true
    }
  }

  if (currentWorktree.path) {
    worktrees.push(currentWorktree as WorktreeInfo)
  }

  return worktrees
}

/**
 * 新しいworktreeを作成
 *
 * @param branchName - 作成するブランチ名
 * @param worktreePath - worktreeを作成するパス
 * @param options - オプション
 *   - cwd: 作業ディレクトリ
 *   - useExistingBranch: 既存ブランチを使用（新規作成しない）
 *   - baseBranch: 新規ブランチ作成時のベースブランチ名
 * @throws {Error} 作成に失敗した場合
 */
export function createWorktree(
  branchName: string,
  worktreePath: string,
  options?: { cwd?: string; useExistingBranch?: boolean; baseBranch?: string }
): void {
  const cwd = options?.cwd
  const useExistingBranch = options?.useExistingBranch ?? false
  const baseBranch = options?.baseBranch

  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const args = useExistingBranch
    ? ["worktree", "add", worktreePath, branchName]
    : baseBranch
      ? ["worktree", "add", worktreePath, "-b", branchName, baseBranch]
      : ["worktree", "add", worktreePath, "-b", branchName]

  try {
    execGitSafe(args, { cwd })
    console.log(`✅ Created worktree: ${branchName} at ${worktreePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to create worktree: ${message}`)
  }
}

/**
 * worktreeを削除
 *
 * @param worktreePath - 削除するworktreeのパス
 * @param options - オプション（cwd: 作業ディレクトリ, force: 強制削除）
 * @throws {Error} 削除に失敗した場合
 */
export function removeWorktree(
  worktreePath: string,
  options?: { cwd?: string; force?: boolean }
): void {
  const cwd = options?.cwd
  const force = options?.force ?? false

  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const args = force
    ? ["worktree", "remove", "--force", worktreePath]
    : ["worktree", "remove", worktreePath]

  try {
    execGitSafe(args, { cwd })
    console.log(`✅ Removed worktree at: ${worktreePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to remove worktree: ${message}`)
  }
}

/**
 * 指定されたブランチのworktreeパスを取得
 *
 * @param branchName - 検索するブランチ名
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeのパス（見つからない場合はnull）
 */
export function getWorktreePath(branchName: string, cwd?: string): string | null {
  const worktrees = listWorktrees(cwd)
  const worktree = worktrees.find((wt) => wt.branch === branchName)
  return worktree ? worktree.path : null
}

/**
 * 指定されたディレクトリがworktreeかどうかを判定
 *
 * @param dirPath - チェックするディレクトリパス
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeの場合true
 */
export function isWorktree(dirPath: string, cwd?: string): boolean {
  try {
    const worktrees = listWorktrees(cwd)
    const absolutePath = path.resolve(dirPath)
    return worktrees.some((wt) => path.resolve(wt.path) === absolutePath)
  } catch {
    return false
  }
}

/**
 * メインリポジトリとworktreeの関係情報を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 関係情報オブジェクト
 */
export function getWorktreeRelationship(cwd?: string) {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const root = getGitRoot(cwd)
  const worktrees = listWorktrees(cwd)
  const currentPath = path.resolve(cwd || process.cwd())

  const mainRepo = worktrees.find((wt) => wt.path === root) || worktrees[0]
  const isCurrentWorktree = worktrees.some(
    (wt) => path.resolve(wt.path) === currentPath && wt.path !== root
  )

  return {
    mainPath: mainRepo?.path || root,
    currentPath,
    isCurrentWorktree,
    totalWorktrees: worktrees.length,
    worktrees,
  }
}
