/**
 * @fileoverview parseWorktreeList のテスト
 * git worktree list --porcelain 出力のパース動作を検証
 */

import { describe, expect, it } from "vitest"
import { parseWorktreeList } from "./worktree.js"

describe("parseWorktreeList", () => {
  it("returns empty array for empty input", () => {
    expect(parseWorktreeList("")).toEqual([])
    expect(parseWorktreeList("   \n  ")).toEqual([])
  })

  it("parses a single main worktree", () => {
    const input = [
      "worktree /Users/me/proj",
      "HEAD abc123def456abc123def456abc123def456abcd",
      "branch refs/heads/main",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      path: "/Users/me/proj",
      branch: "main",
      head: "abc123def456abc123def456abc123def456abcd",
    })
    expect(result[0].locked).toBeUndefined()
    expect(result[0].prunable).toBeUndefined()
    expect(result[0].bare).toBeUndefined()
    expect(result[0].detached).toBeUndefined()
  })

  it("parses multiple worktrees", () => {
    const input = [
      "worktree /Users/me/proj",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /Users/me/worktree-feature",
      "HEAD def456",
      "branch refs/heads/feature",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result).toHaveLength(2)
    expect(result[0].branch).toBe("main")
    expect(result[1].branch).toBe("feature")
    expect(result[1].path).toBe("/Users/me/worktree-feature")
  })

  it("captures locked flag (no reason)", () => {
    const input = [
      "worktree /Users/me/wt-locked",
      "HEAD abc",
      "branch refs/heads/locked-branch",
      "locked",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result[0].locked).toBe(true)
  })

  it("captures locked flag with reason", () => {
    const input = [
      "worktree /Users/me/wt-locked",
      "HEAD abc",
      "branch refs/heads/locked-branch",
      "locked WIP: preserving for review",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result[0].locked).toBe(true)
  })

  it("captures prunable flag", () => {
    const input = [
      "worktree /Users/me/wt-gone",
      "HEAD abc",
      "branch refs/heads/gone-branch",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result[0].prunable).toBe(true)
  })

  it("captures bare flag on main repo", () => {
    const input = [
      "worktree /Users/me/bare.git",
      "bare",
      "",
      "worktree /Users/me/wt-a",
      "HEAD abc",
      "branch refs/heads/a",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result).toHaveLength(2)
    expect(result[0].bare).toBe(true)
    expect(result[1].bare).toBeUndefined()
  })

  it("marks detached HEAD with branch label and flag", () => {
    const input = [
      "worktree /Users/me/wt-detached",
      "HEAD abc123",
      "detached",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result[0].branch).toBe("(detached)")
    expect(result[0].detached).toBe(true)
  })

  it("does not set flags when their lines are absent", () => {
    const input = [
      "worktree /Users/me/proj",
      "HEAD abc",
      "branch refs/heads/main",
      "",
    ].join("\n")

    const result = parseWorktreeList(input)
    expect(result[0].locked).toBeUndefined()
    expect(result[0].prunable).toBeUndefined()
    expect(result[0].bare).toBeUndefined()
    expect(result[0].detached).toBeUndefined()
  })
})
