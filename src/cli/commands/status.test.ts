/**
 * @fileoverview Status コマンドのテスト
 * 新しいディレクトリ構造に対応したテストファイル
 */

import type { Command } from "commander"
import { existsSync } from "fs-extra"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as loaderModule from "../../core/config/loader.js"
import * as dockerClientModule from "../../core/docker/client.js"
import * as dockerComposeModule from "../../core/docker/compose.js"
import * as repositoryModule from "../../core/git/repository.js"
import * as worktreeModule from "../../core/git/worktree.js"
import { statusCommand } from "./status.js"

// Mock dependencies
vi.mock("../../core/config/loader.js")
vi.mock("../../core/git/repository.js")
vi.mock("../../core/git/worktree.js")
vi.mock("../../core/docker/client.js")
vi.mock("../../core/docker/compose.js")
vi.mock("fs-extra", () => ({
  existsSync: vi.fn(),
}))

describe("Status Command (Refactored)", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let command: Command

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    command = statusCommand()

    // Default: Docker IS configured so existing Docker-probe tests keep working.
    vi.mocked(repositoryModule.getGitRoot).mockReturnValue("/project")
    vi.mocked(loaderModule.loadConfig).mockReturnValue({
      base_branch: "main",
      docker_compose_file: "./docker-compose.yml",
      copy_files: [],
      link_files: [],
      env: { file: [], adjust: {} },
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe("statusCommand", () => {
    it("should create command with correct configuration", () => {
      expect(command.name()).toBe("status")
      expect(command.description()).toBe("Show status of worktrees and their Docker environments")
    })

    it("should have correct options", () => {
      const options = command.options
      expect(options).toHaveLength(2)

      const allOption = options.find((opt) => opt.flags === "-a, --all")
      expect(allOption?.description).toBe("Show all worktrees, not just current")

      const dockerOnlyOption = options.find((opt) => opt.flags === "--docker-only")
      expect(dockerOnlyOption?.description).toBe("Show only Docker-related information")
    })

    it("should exit with error when not in git repository", async () => {
      vi.mocked(repositoryModule.isGitRepository).mockReturnValue(false)

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called")
      })

      await expect(async () => {
        await command.parseAsync([], { from: "user" })
      }).rejects.toThrow("process.exit called")

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Not in a git repository")
      expect(mockExit).toHaveBeenCalledWith(3) // NOT_GIT_REPOSITORY

      mockExit.mockRestore()
    })
  })

  describe("showWorktreeStatus", () => {
    beforeEach(() => {
      vi.mocked(repositoryModule.isGitRepository).mockReturnValue(true)
      vi.mocked(worktreeModule.listWorktrees).mockReturnValue([])
      vi.mocked(repositoryModule.getCurrentBranch).mockReturnValue("main")
      vi.mocked(repositoryModule.getGitRoot).mockReturnValue("/project")
      vi.mocked(dockerClientModule.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerClientModule.getDockerVolumes).mockReturnValue([])
      vi.mocked(existsSync).mockReturnValue(false)
    })

    it("should show message when no worktrees found", async () => {
      vi.mocked(worktreeModule.listWorktrees).mockReturnValue([])

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("📁 Git Worktrees Status\n")
      expect(consoleSpy).toHaveBeenCalledWith("No worktrees found")
    })

    it("should display worktree information with --all flag", async () => {
      const mockWorktrees = [
        {
          path: "/project",
          branch: "main",
          head: "abc123",
        },
        {
          path: "/project-feature",
          branch: "feature",
          head: "def456",
        },
      ]

      vi.mocked(worktreeModule.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(repositoryModule.getCurrentBranch).mockReturnValue("main")
      vi.mocked(repositoryModule.getGitRoot).mockReturnValue("/project")

      await command.parseAsync(["--all"], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("→ main (main)")
      expect(consoleSpy).toHaveBeenCalledWith("   📂 /project")
      expect(consoleSpy).toHaveBeenCalledWith("  feature")
      expect(consoleSpy).toHaveBeenCalledWith("   📂 /project-feature")
    })

    it("should show docker-compose file information when present", async () => {
      const mockWorktrees = [
        {
          path: "/project",
          branch: "main",
          head: "abc123",
        },
      ]

      vi.mocked(worktreeModule.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(repositoryModule.getCurrentBranch).mockReturnValue("main")
      vi.mocked(repositoryModule.getGitRoot).mockReturnValue("/project")

      // Mock compose file exists
      vi.mocked(dockerComposeModule.findComposeFile).mockReturnValue("/project/docker-compose.yml")
      vi.mocked(dockerComposeModule.readComposeFile).mockReturnValue({
        version: "3.8",
        services: {
          web: { image: "nginx" },
          db: { image: "postgres" },
        },
      })

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("   🐳 Docker: docker-compose.yml")
      expect(consoleSpy).toHaveBeenCalledWith("   📦 Services: 2")
    })
  })

  describe("showDockerStatus", () => {
    beforeEach(() => {
      vi.mocked(repositoryModule.isGitRepository).mockReturnValue(true)
      vi.mocked(worktreeModule.listWorktrees).mockReturnValue([])
      vi.mocked(dockerClientModule.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerClientModule.getDockerVolumes).mockReturnValue([])
    })

    it("should skip Docker checks and show message when docker_compose_file is not configured", async () => {
      vi.mocked(loaderModule.loadConfig).mockReturnValue({
        base_branch: "main",
        docker_compose_file: "",
        copy_files: [],
        link_files: [],
        env: { file: [], adjust: {} },
      })

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("🐳 Docker Environment Status\n")
      expect(consoleSpy).toHaveBeenCalledWith("⚙️  Docker checks skipped (not configured)")
      expect(dockerClientModule.getRunningContainers).not.toHaveBeenCalled()
      expect(dockerClientModule.getDockerVolumes).not.toHaveBeenCalled()
      expect(dockerClientModule.getDockerInfo).not.toHaveBeenCalled()
    })

    it("should show running containers information", async () => {
      const mockContainers = [
        {
          id: "container1",
          name: "app_web_1",
          image: "nginx:alpine",
          status: "Up 5 minutes",
          ports: ["0.0.0.0:3000->80/tcp"],
          volumes: [],
          networks: [],
        },
        {
          id: "container2",
          name: "wtb_api_1",
          image: "node:16",
          status: "Up 1 hour",
          ports: ["0.0.0.0:8080->8080/tcp"],
          volumes: [],
          networks: [],
        },
      ]

      vi.mocked(dockerClientModule.getRunningContainers).mockReturnValue(mockContainers)
      vi.mocked(dockerClientModule.isWtbContainer)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("🐳 Docker Environment Status\n")
      expect(consoleSpy).toHaveBeenCalledWith("📦 Running Containers: 2")
      expect(consoleSpy).toHaveBeenCalledWith("📦 app_web_1")
      expect(consoleSpy).toHaveBeenCalledWith("🌿 wtb_api_1")
    })

    it("should show docker version information", async () => {
      vi.mocked(dockerClientModule.getDockerInfo).mockReturnValue({
        dockerVersion: "Docker version 20.10.17",
        composeVersion: "1.29.2",
        isAvailable: true,
      })

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("🔧 Docker Information")
      expect(consoleSpy).toHaveBeenCalledWith("   Docker version 20.10.17")
      expect(consoleSpy).toHaveBeenCalledWith("   Docker Compose: 1.29.2")
    })

    it("should handle docker version command failure", async () => {
      vi.mocked(dockerClientModule.getDockerInfo).mockImplementation(() => {
        throw new Error("Docker not available")
      })

      await command.parseAsync([], { from: "user" })

      expect(consoleSpy).toHaveBeenCalledWith("⚠️  Could not retrieve Docker version information")
    })
  })
})
