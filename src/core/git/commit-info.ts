/**
 * @fileoverview Git commit information helpers
 * `wtb ls -l` 用のworktree拡張情報取得
 */

import type { EnrichedWorktreeInfo, WorktreeInfo } from "../../types/index.js"
import { getErrorMessage } from "../../utils/error.js"
import { execGitSafe } from "../../utils/exec.js"

export interface CommitInfo {
  shortHash: string
  subject: string
  ageRelative: string
  ageTimestamp: string
}

const UNIT_SEPARATOR = "\x1f"

/**
 * 指定worktreeの最新コミット情報を単一の git log 呼び出しで取得する
 * サブジェクトにタブ等が含まれても安全に扱えるよう US (\x1f) で区切る
 */
export function getCommitInfo(cwd: string): CommitInfo {
  const format = ["%h", "%s", "%cr", "%cI"].join(UNIT_SEPARATOR)
  const output = execGitSafe(["log", "-1", `--format=${format}`, "HEAD"], { cwd })
  const parts = output.split(UNIT_SEPARATOR)

  return {
    shortHash: parts[0] ?? "",
    subject: parts[1] ?? "",
    ageRelative: parts[2] ?? "",
    ageTimestamp: parts[3] ?? "",
  }
}

/**
 * 指定worktreeに未コミット変更があるかチェック
 */
export function isDirty(cwd: string): boolean {
  try {
    const output = execGitSafe(["status", "--porcelain"], { cwd })
    return output.trim().length > 0
  } catch {
    return false
  }
}

/**
 * WorktreeInfo に最新コミット情報と dirty 状態を付与する
 * 個別のworktreeで失敗した場合でも `enrichmentError` に格納して返す
 */
export async function enrichWorktree(wt: WorktreeInfo): Promise<EnrichedWorktreeInfo> {
  try {
    const commit = getCommitInfo(wt.path)
    const dirty = isDirty(wt.path)
    return {
      ...wt,
      shortHash: commit.shortHash,
      subject: commit.subject,
      ageRelative: commit.ageRelative,
      ageTimestamp: commit.ageTimestamp,
      dirty,
    }
  } catch (error) {
    return {
      ...wt,
      shortHash: "",
      subject: "",
      ageRelative: "",
      ageTimestamp: "",
      dirty: false,
      enrichmentError: getErrorMessage(error),
    }
  }
}
