/**
 * @fileoverview 設定ローダーのテスト
 * 新しいディレクトリ構造に対応したテストファイル
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parse } from "yaml"
import { createDefaultConfig, findConfigFile, loadConfig } from "./loader.js"

// Mock dependencies
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}))
vi.mock("fs-extra", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))
vi.mock("yaml", () => ({
  parse: vi.fn(),
}))

describe("Config Loader (Refactored)", () => {
  const testRepoPath = "/tmp/test-repo"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loadConfig", () => {
    it("should load default config when no wtb.yaml exists", () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const config = loadConfig(testRepoPath)

      expect(config.base_branch).toBe("main")
      expect(config.docker_compose_file).toBe("")
      expect(config.copy_files).toEqual([])
      expect(config.link_files).toEqual([])
      expect(config.env.file).toEqual(["./.env"])
    })

    it("should load custom config from wtb.yaml", () => {
      const mockContent = `
base_branch: develop
docker_compose_file: ./docker-compose.dev.yml
env:
  file:
    - ./.env.custom
  adjust:
    APP_PORT: 1000
`
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)
      vi.mocked(parse).mockReturnValue({
        base_branch: "develop",
        docker_compose_file: "./docker-compose.dev.yml",
        link_files: ["node_modules"],
        env: {
          file: ["./.env.custom"],
          adjust: { APP_PORT: 1000 },
        },
      })

      const config = loadConfig(testRepoPath)

      expect(config.base_branch).toBe("develop")
      expect(config.docker_compose_file).toBe("./docker-compose.dev.yml")
      expect(config.link_files).toEqual(["node_modules"])
      expect(config.env.file).toEqual(["./.env.custom"])
      expect(config.env.adjust.APP_PORT).toBe(1000)
    })

    it("should default link_files to empty array when not specified", () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("base_branch: main")
      vi.mocked(parse).mockReturnValue({ base_branch: "main" })

      const config = loadConfig(testRepoPath)

      expect(config.link_files).toEqual([])
    })

    it("should merge partial config with defaults", () => {
      const mockContent = `base_branch: develop`

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)
      vi.mocked(parse).mockReturnValue({
        base_branch: "develop",
      })

      const config = loadConfig(testRepoPath)

      expect(config.base_branch).toBe("develop")
      expect(config.docker_compose_file).toBe("") // default: no Docker
      expect(config.env.file).toEqual(["./.env"]) // default
    })
  })

  describe("findConfigFile", () => {
    it("should find first existing config file", () => {
      vi.mocked(existsSync)
        .mockReturnValueOnce(false) // wtb.yaml
        .mockReturnValueOnce(true) // wtb.yml

      const result = findConfigFile(testRepoPath)

      expect(result.exists).toBe(true)
      expect(result.path).toContain("wtb.yml")
    })

    it("should return null when no config file exists", () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = findConfigFile(testRepoPath)

      expect(result.exists).toBe(false)
      expect(result.path).toBeNull()
    })
  })

  describe("createDefaultConfig", () => {
    it("should create valid YAML that can be loaded", () => {
      const configPath = path.join(testRepoPath, "wtb.yaml")
      vi.mocked(existsSync).mockReturnValue(false)

      const config = createDefaultConfig(configPath)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('base_branch: "main"'),
        "utf-8"
      )
      expect(config.base_branch).toBe("main")
    })
  })
})
