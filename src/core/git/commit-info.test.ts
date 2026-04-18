/**
 * @fileoverview commit-info のテスト
 */

import { execFileSync } from "node:child_process"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { enrichWorktree, getCommitInfo, isDirty } from "./commit-info.js"

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}))

describe("getCommitInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("splits git log output on unit separators", () => {
    // Simulate git log output with \x1f separators (subject contains a tab to prove we don't split on it)
    const output = ["a1b2c3d", "feat: \tadd thing", "2 hours ago", "2026-04-19T10:00:00+00:00"].join(
      "\x1f"
    )
    vi.mocked(execFileSync).mockReturnValue(output)

    const info = getCommitInfo("/some/worktree")
    expect(info).toEqual({
      shortHash: "a1b2c3d",
      subject: "feat: \tadd thing",
      ageRelative: "2 hours ago",
      ageTimestamp: "2026-04-19T10:00:00+00:00",
    })
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["log", "-1", "--format=%h\x1f%s\x1f%cr\x1f%cI", "HEAD"],
      expect.objectContaining({ cwd: "/some/worktree" })
    )
  })

  it("returns empty strings when git log output is partial", () => {
    vi.mocked(execFileSync).mockReturnValue("only-hash")

    const info = getCommitInfo("/some/worktree")
    expect(info).toEqual({
      shortHash: "only-hash",
      subject: "",
      ageRelative: "",
      ageTimestamp: "",
    })
  })

  it("propagates error from git log", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("spawnSync git ENOENT")
    })
    expect(() => getCommitInfo("/missing")).toThrow()
  })
})

describe("isDirty", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns false when working tree is clean", () => {
    vi.mocked(execFileSync).mockReturnValue("")
    expect(isDirty("/clean")).toBe(false)
  })

  it("returns true when there are modifications", () => {
    vi.mocked(execFileSync).mockReturnValue(" M src/foo.ts\n")
    expect(isDirty("/dirty")).toBe(true)
  })

  it("returns false when git status itself fails (non-fatal)", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("fatal")
    })
    expect(isDirty("/bad")).toBe(false)
  })
})

describe("enrichWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("merges commit info and dirty state into worktree", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(["a1b2c3d", "hello", "1h ago", "2026-04-19T10:00:00Z"].join("\x1f")) // getCommitInfo
      .mockReturnValueOnce("") // isDirty (clean)

    const enriched = await enrichWorktree({
      path: "/x",
      branch: "main",
      head: "abc",
    })

    expect(enriched).toMatchObject({
      path: "/x",
      branch: "main",
      head: "abc",
      shortHash: "a1b2c3d",
      subject: "hello",
      ageRelative: "1h ago",
      ageTimestamp: "2026-04-19T10:00:00Z",
      dirty: false,
    })
    expect(enriched.enrichmentError).toBeUndefined()
  })

  it("captures enrichment errors instead of throwing", async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("worktree is gone")
    })

    const enriched = await enrichWorktree({
      path: "/gone",
      branch: "orphan",
      head: "def",
    })

    expect(enriched.enrichmentError).toContain("worktree is gone")
    expect(enriched.dirty).toBe(false)
    expect(enriched.shortHash).toBe("")
  })
})
