/**
 * @fileoverview Git リポジトリ操作
 * Gitリポジトリの基本的な状態確認と情報取得を担当
 */

import { EXIT_CODES } from "../../constants/index.js"
import type { ExecOptions } from "../../types/index.js"
import { CLIError } from "../../utils/error.js"
import { execGitSafe } from "../../utils/exec.js"

/**
 * 現在のディレクトリがGitリポジトリかどうかを判定
 *
 * @param cwd - チェックするディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns Gitリポジトリの場合true
 */
export function isGitRepository(cwd?: string): boolean {
  try {
    execGitSafe(["rev-parse", "--is-inside-work-tree"], { cwd })
    return true
  } catch {
    return false
  }
}

/**
 * Gitリポジトリのルートディレクトリを取得
 *
 * @param cwd - 開始ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns リポジトリのルートディレクトリパス
 * @throws {Error} Gitリポジトリではない場合
 */
export function getGitRoot(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitSafe(["rev-parse", "--show-toplevel"], { cwd })
}

/**
 * Git リポジトリ内であることを保証してルートを返す（CLI コマンド向けガード）
 *
 * リポジトリでない場合は CLIError(NOT_GIT_REPOSITORY) を throw するので、
 * 呼び出し側は withErrorHandling 経由で適切な exit code に変換される。
 */
export function getGitRootOrThrow(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
  }
  return getGitRoot(cwd)
}

/**
 * 現在のブランチ名を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 現在のブランチ名
 * @throws {Error} Gitリポジトリではない場合
 */
export function getCurrentBranch(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitSafe(["branch", "--show-current"], { cwd })
}

/**
 * 指定したブランチが存在するかチェック
 *
 * @param branchName - チェックするブランチ名
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns ブランチが存在する場合true
 */
export function branchExists(branchName: string, cwd?: string): boolean {
  if (!isGitRepository(cwd)) {
    return false
  }

  try {
    execGitSafe(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], { cwd })
    return true
  } catch {
    return false
  }
}

/**
 * リポジトリの基本情報を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns リポジトリ情報オブジェクト
 * @throws {Error} Gitリポジトリではない場合
 */
export function getRepositoryInfo(cwd?: string) {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const root = getGitRoot(cwd)
  const currentBranch = getCurrentBranch(cwd)

  // リポジトリの状態をチェック
  let isClean: boolean
  try {
    const status = execGitSafe(["status", "--porcelain"], { cwd })
    isClean = status.length === 0
  } catch {
    isClean = false
  }

  return {
    root,
    currentBranch,
    isClean,
    isGitRepository: true,
  }
}

// ExecOptions is kept for backward compatibility with any callers
export type { ExecOptions }
