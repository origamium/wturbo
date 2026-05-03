/**
 * @fileoverview ls コマンドのテスト
 */

import type { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EXIT_CODES } from "../../constants/index.js"
import * as commitInfoModule from "../../core/git/commit-info.js"
import * as repositoryModule from "../../core/git/repository.js"
import * as worktreeModule from "../../core/git/worktree.js"
import { CLIError } from "../../utils/error.js"
import { lsCommand } from "./ls.js"

vi.mock("../../core/git/repository.js")
vi.mock("../../core/git/worktree.js")
vi.mock("../../core/git/commit-info.js")

describe("ls command", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let command: Command

  beforeEach(() => {
    vi.clearAllMocks()
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    command = lsCommand()

    vi.mocked(repositoryModule.getGitRootOrThrow).mockReturnValue("/repo")
    vi.mocked(worktreeModule.listWorktrees).mockReturnValue([
      { path: "/repo", branch: "main", head: "abc" },
      { path: "/repo-feature", branch: "feature", head: "def" },
    ])
  })

  afterEach(() => {
    writeSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it("has name 'ls' and alias 'list'", () => {
    expect(command.name()).toBe("ls")
    expect(command.aliases()).toContain("list")
  })

  it("exposes -l, --json, and -p options", () => {
    const flags = command.options.map((o) => o.flags)
    expect(flags).toContain("-l, --long")
    expect(flags).toContain("--json")
    expect(flags).toContain("-p, --paths")
  })

  it("exits NOT_GIT_REPOSITORY when outside a git repo", async () => {
    vi.mocked(repositoryModule.getGitRootOrThrow).mockImplementation(() => {
      throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
    })
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited")
    })

    await expect(command.parseAsync([], { from: "user" })).rejects.toThrow("exited")
    expect(mockExit).toHaveBeenCalledWith(3)
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not in a git repository"))
    mockExit.mockRestore()
  })

  it("default invocation writes compact listing to stdout", async () => {
    await command.parseAsync([], { from: "user" })
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    expect(output).toContain("main")
    expect(output).toContain("feature")
    expect(output).toContain("[main]")
    expect(commitInfoModule.enrichWorktree).not.toHaveBeenCalled()
  })

  it("--paths prints paths only, no tags, no marker", async () => {
    await command.parseAsync(["--paths"], { from: "user" })
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    expect(output).toBe("/repo\n/repo-feature\n")
  })

  it("--json prints valid JSON without enrichment by default", async () => {
    await command.parseAsync(["--json"], { from: "user" })
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).not.toHaveProperty("shortHash")
  })

  it("--long invokes enrichWorktree for each worktree", async () => {
    vi.mocked(commitInfoModule.enrichWorktree).mockImplementation(async (wt) => ({
      ...wt,
      shortHash: "aaa",
      subject: "s",
      ageRelative: "now",
      ageTimestamp: "2026-04-19T00:00:00Z",
      dirty: false,
    }))

    await command.parseAsync(["-l"], { from: "user" })
    expect(commitInfoModule.enrichWorktree).toHaveBeenCalledTimes(2)
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    expect(output).toContain("BRANCH")
    expect(output).toContain("aaa")
  })

  it("--long --json emits enrichment fields in output", async () => {
    vi.mocked(commitInfoModule.enrichWorktree).mockImplementation(async (wt) => ({
      ...wt,
      shortHash: "aaa",
      subject: "hello",
      ageRelative: "now",
      ageTimestamp: "2026-04-19T00:00:00Z",
      dirty: true,
    }))

    await command.parseAsync(["-l", "--json"], { from: "user" })
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed[0]).toMatchObject({ shortHash: "aaa", subject: "hello", dirty: true })
  })

  it("one failing enrichment does not abort others", async () => {
    vi.mocked(commitInfoModule.enrichWorktree)
      .mockImplementationOnce(async (wt) => ({
        ...wt,
        shortHash: "aaa",
        subject: "ok",
        ageRelative: "now",
        ageTimestamp: "2026-04-19T00:00:00Z",
        dirty: false,
      }))
      .mockImplementationOnce(async (wt) => ({
        ...wt,
        shortHash: "",
        subject: "",
        ageRelative: "",
        ageTimestamp: "",
        dirty: false,
        enrichmentError: "failed",
      }))

    await command.parseAsync(["-l"], { from: "user" })
    const output = writeSpy.mock.calls.map((c) => c[0]).join("")
    expect(output).toContain("main")
    expect(output).toContain("feature")
  })
})
