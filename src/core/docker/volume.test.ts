import { describe, expect, it } from "vitest"
import type { ComposeConfig } from "../../types/index.js"
import {
  discoverCloneableVolumes,
  formatBytes,
  formatEta,
  resolveVolumeName,
} from "./volume"

describe("Volume Utilities", () => {
  describe("formatBytes", () => {
    it("should format 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B")
    })

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500.00 B")
    })

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.00 KB")
      expect(formatBytes(2048)).toBe("2.00 KB")
    })

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB")
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.50 MB")
    })

    it("should format gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
    })
  })

  describe("formatEta", () => {
    it("should return placeholder for 0 or negative", () => {
      expect(formatEta(0)).toBe("--:--")
      expect(formatEta(-1)).toBe("--:--")
    })

    it("should format seconds only", () => {
      expect(formatEta(45)).toBe("0:45")
    })

    it("should format minutes and seconds", () => {
      expect(formatEta(90)).toBe("1:30")
      expect(formatEta(125)).toBe("2:05")
    })

    it("should format hours, minutes and seconds", () => {
      expect(formatEta(3661)).toBe("1:01:01")
      expect(formatEta(7325)).toBe("2:02:05")
    })
  })

  describe("resolveVolumeName", () => {
    const baseConfig = (volumes: Record<string, unknown>): ComposeConfig => ({
      services: {},
      volumes: volumes as ComposeConfig["volumes"],
    })

    it("returns null when key is missing", () => {
      const config = baseConfig({ other: null })
      expect(resolveVolumeName(config, "missing", "proj")).toBeNull()
    })

    it("returns null when volumes section is absent", () => {
      const config: ComposeConfig = { services: {} }
      expect(resolveVolumeName(config, "data", "proj")).toBeNull()
    })

    it("uses <project>_<key> for null entry", () => {
      const config = baseConfig({ db_data: null })
      expect(resolveVolumeName(config, "db_data", "myproj")).toEqual({
        name: "myproj_db_data",
        external: false,
      })
    })

    it("uses <project>_<key> for empty object entry", () => {
      const config = baseConfig({ db_data: {} })
      expect(resolveVolumeName(config, "db_data", "myproj")).toEqual({
        name: "myproj_db_data",
        external: false,
      })
    })

    it("uses explicit name override", () => {
      const config = baseConfig({ db_data: { name: "shared_db" } })
      expect(resolveVolumeName(config, "db_data", "myproj")).toEqual({
        name: "shared_db",
        external: false,
      })
    })

    it("flags external: true with no name as external using key", () => {
      const config = baseConfig({ shared: { external: true } })
      expect(resolveVolumeName(config, "shared", "myproj")).toEqual({
        name: "shared",
        external: true,
      })
    })

    it("uses external.name when provided", () => {
      const config = baseConfig({ shared: { external: { name: "global_shared" } } })
      expect(resolveVolumeName(config, "shared", "myproj")).toEqual({
        name: "global_shared",
        external: true,
      })
    })

    it("prefers explicit name over external.name", () => {
      const config = baseConfig({
        shared: { external: { name: "ignored" }, name: "override" },
      })
      expect(resolveVolumeName(config, "shared", "myproj")).toEqual({
        name: "override",
        external: true,
      })
    })

    it("treats non-object entry as default", () => {
      const config = baseConfig({ data: "not-an-object" })
      expect(resolveVolumeName(config, "data", "myproj")).toEqual({
        name: "myproj_data",
        external: false,
      })
    })
  })

  describe("discoverCloneableVolumes", () => {
    it("returns empty when no volumes section", () => {
      expect(discoverCloneableVolumes({ services: {} })).toEqual([])
    })

    it("returns all named volumes by default", () => {
      const config: ComposeConfig = {
        services: {},
        volumes: { db: null, cache: {}, mq: { name: "explicit" } },
      }
      expect(discoverCloneableVolumes(config)).toEqual(["db", "cache", "mq"])
    })

    it("excludes external volumes", () => {
      const config: ComposeConfig = {
        services: {},
        volumes: {
          db: null,
          shared: { external: true },
          ext_named: { external: { name: "x" } },
        },
      }
      expect(discoverCloneableVolumes(config)).toEqual(["db"])
    })

    it("respects exclude list", () => {
      const config: ComposeConfig = {
        services: {},
        volumes: { db: null, cache: {}, mq: {} },
      }
      expect(discoverCloneableVolumes(config, ["cache"])).toEqual(["db", "mq"])
    })

    it("combines external + exclude filters", () => {
      const config: ComposeConfig = {
        services: {},
        volumes: {
          db: null,
          cache: {},
          shared: { external: true },
          mq: {},
        },
      }
      expect(discoverCloneableVolumes(config, ["mq"])).toEqual(["db", "cache"])
    })
  })
})
