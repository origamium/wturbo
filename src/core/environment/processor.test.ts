/**
 * @fileoverview environment/processor.ts のユニットテスト
 */

import { existsSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import fs from "fs-extra"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  backupEnvFile,
  copyAndAdjustEnvFile,
  parseEnvContent,
  restoreEnvFile,
  serializeEnvFile,
} from "./processor.js"

// =============================================================================
// テスト用一時ディレクトリ
// =============================================================================

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wtb-test-"))
})

afterEach(() => {
  fs.removeSync(tmpDir)
})

// =============================================================================
// parseEnvContent
// =============================================================================

describe("parseEnvContent", () => {
  it("should parse simple KEY=VALUE entries", () => {
    const content = "APP_PORT=3000\nDB_PORT=5432"
    const parsed = parseEnvContent(content)

    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0]).toMatchObject({ key: "APP_PORT", value: "3000" })
    expect(parsed.entries[1]).toMatchObject({ key: "DB_PORT", value: "5432" })
  })

  it("should preserve comment lines", () => {
    const content = "# Header comment\nAPP_PORT=3000\n# Another comment\nDB_PORT=5432"
    const parsed = parseEnvContent(content)

    expect(parsed.entries).toHaveLength(2)
    // lines should include comments in original positions
    expect(parsed.lines[0]).toMatchObject({ type: "other", content: "# Header comment" })
    expect(parsed.lines[1]).toMatchObject({ type: "entry", key: "APP_PORT", value: "3000" })
    expect(parsed.lines[2]).toMatchObject({ type: "other", content: "# Another comment" })
    expect(parsed.lines[3]).toMatchObject({ type: "entry", key: "DB_PORT", value: "5432" })
  })

  it("should preserve blank lines", () => {
    const content = "APP_PORT=3000\n\nDB_PORT=5432"
    const parsed = parseEnvContent(content)

    expect(parsed.lines[1]).toMatchObject({ type: "other", content: "" })
  })

  it("should strip surrounding quotes from values", () => {
    const content = "KEY1=\"quoted value\"\nKEY2='single quoted'"
    const parsed = parseEnvContent(content)

    expect(parsed.entries[0]).toMatchObject({ key: "KEY1", value: "quoted value" })
    expect(parsed.entries[1]).toMatchObject({ key: "KEY2", value: "single quoted" })
  })

  it("should parse inline comments", () => {
    const content = "APP_PORT=3000 # application port"
    const parsed = parseEnvContent(content)

    expect(parsed.entries[0]).toMatchObject({
      key: "APP_PORT",
      value: "3000",
      comment: "application port",
    })
  })

  it("should handle lowercase variable names (POSIX-compliant)", () => {
    const content = "app_port=3000\nDB_host=localhost"
    const parsed = parseEnvContent(content)

    expect(parsed.entries[0]).toMatchObject({ key: "app_port", value: "3000" })
    expect(parsed.entries[1]).toMatchObject({ key: "DB_host", value: "localhost" })
  })

  it("should return entries array matching lines entries", () => {
    const content = "A=1\nB=2\nC=3"
    const parsed = parseEnvContent(content)

    expect(parsed.entries).toHaveLength(3)
    expect(parsed.lines.filter((l) => l.type === "entry")).toHaveLength(3)
  })
})

// =============================================================================
// serializeEnvFile (ラウンドトリップ)
// =============================================================================

describe("serializeEnvFile", () => {
  it("should preserve original order with interleaved comments", () => {
    const original = "# Header\nAPP_PORT=3000\n# Middle comment\nDB_PORT=5432\n# Footer"
    const parsed = parseEnvContent(original)
    const serialized = serializeEnvFile(parsed)

    expect(serialized).toBe(original)
  })

  it("should round-trip simple env content unchanged", () => {
    const content = "NODE_ENV=development\nAPP_PORT=3000\nDB_PORT=5432\n"
    const parsed = parseEnvContent(content)
    const serialized = serializeEnvFile(parsed)

    expect(serialized).toBe(content)
  })

  it("should serialize inline comments", () => {
    const content = "APP_PORT=3000 # port"
    const parsed = parseEnvContent(content)
    const serialized = serializeEnvFile(parsed)

    expect(serialized).toContain("APP_PORT=3000 # port")
  })

  it("should preserve blank lines in correct positions", () => {
    const content = "A=1\n\nB=2\n\nC=3"
    const parsed = parseEnvContent(content)
    const serialized = serializeEnvFile(parsed)

    expect(serialized).toBe(content)
  })
})

// =============================================================================
// copyAndAdjustEnvFile
// =============================================================================

describe("copyAndAdjustEnvFile", () => {
  it("should find next free port (+1 from original) for numeric adjustments", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.adjusted")
    fs.writeFileSync(sourcePath, "APP_PORT=3000\nDB_PORT=5432\n")

    const count = copyAndAdjustEnvFile(sourcePath, targetPath, {
      APP_PORT: 1,
      DB_PORT: 1,
    })

    expect(count).toBe(2)
    const result = fs.readFileSync(targetPath, "utf-8")
    // +1 from original, first free port
    expect(result).toContain("APP_PORT=3001")
    expect(result).toContain("DB_PORT=5433")
  })

  it("should resolve within-file port collisions by incrementing further", () => {
    // Two entries both want the next port after 3000 → second must get 3002
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.adjusted")
    fs.writeFileSync(sourcePath, "APP_PORT=3000\nADMIN_PORT=3000\n")

    copyAndAdjustEnvFile(sourcePath, targetPath, {
      APP_PORT: 1,
      ADMIN_PORT: 1,
    })

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("APP_PORT=3001")
    expect(result).toContain("ADMIN_PORT=3002")
  })

  it("should skip already-used ports passed via usedPorts argument", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.adjusted")
    fs.writeFileSync(sourcePath, "APP_PORT=3000\n")

    // 3001 is already used by another worktree; expect 3002
    copyAndAdjustEnvFile(sourcePath, targetPath, { APP_PORT: 1 }, undefined, [3001])

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("APP_PORT=3002")
  })

  it("should replace with string values", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "API_URL=http://localhost:3000\n")

    copyAndAdjustEnvFile(sourcePath, targetPath, {
      API_URL: "http://staging.example.com",
    })

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("API_URL=http://staging.example.com")
  })

  it("should remove variables set to null", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "KEEP=value\nDELETE=me\n")

    copyAndAdjustEnvFile(sourcePath, targetPath, { DELETE: null })

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("KEEP=value")
    expect(result).not.toContain("DELETE")
  })

  it("should not confuse null deletion with literal __DELETE__ value", () => {
    // Variables whose actual value is "__DELETE__" should NOT be deleted
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "SENTINEL=__DELETE__\nOTHER=keep\n")

    // Only delete OTHER, not SENTINEL
    copyAndAdjustEnvFile(sourcePath, targetPath, { OTHER: null })

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("SENTINEL=__DELETE__")
    expect(result).not.toContain("OTHER=keep")
  })

  it("should add new variables not present in source", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "EXISTING=value\n")

    const count = copyAndAdjustEnvFile(sourcePath, targetPath, {
      NEW_VAR: "new_value",
    })

    expect(count).toBe(1)
    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("NEW_VAR=new_value")
  })

  it("should apply function adjustments", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "PORT=3000\n")

    copyAndAdjustEnvFile(sourcePath, targetPath, {
      PORT: (v) => String(parseInt(v, 10) * 2),
    })

    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("PORT=6000")
  })

  it("should skip non-numeric values when adjustment is numeric", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "HOSTNAME=localhost\n")

    const count = copyAndAdjustEnvFile(sourcePath, targetPath, { HOSTNAME: 1000 })

    expect(count).toBe(0)
    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("HOSTNAME=localhost")
  })

  it("should preserve order and comments in output", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    const content = "# App config\nAPP_PORT=3000\n# DB config\nDB_PORT=5432\n"
    fs.writeFileSync(sourcePath, content)

    copyAndAdjustEnvFile(sourcePath, targetPath, { APP_PORT: 1000 })

    const result = fs.readFileSync(targetPath, "utf-8")
    // Comments should be preserved
    expect(result).toContain("# App config")
    expect(result).toContain("# DB config")
    // Order: comment, then entry
    const lines = result.split("\n")
    const appPortIdx = lines.findIndex((l) => l.startsWith("APP_PORT"))
    const commentIdx = lines.indexOf("# App config")
    expect(commentIdx).toBeLessThan(appPortIdx)
  })

  it("should handle zero adjustments correctly", () => {
    const sourcePath = path.join(tmpDir, ".env")
    const targetPath = path.join(tmpDir, ".env.out")
    fs.writeFileSync(sourcePath, "A=1\nB=2\n")

    const count = copyAndAdjustEnvFile(sourcePath, targetPath, {})

    expect(count).toBe(0)
    const result = fs.readFileSync(targetPath, "utf-8")
    expect(result).toContain("A=1")
    expect(result).toContain("B=2")
  })
})

// =============================================================================
// backupEnvFile / restoreEnvFile
// =============================================================================

describe("backupEnvFile", () => {
  it("should create a backup file with .backup extension", () => {
    const filePath = path.join(tmpDir, ".env")
    fs.writeFileSync(filePath, "KEY=value\n")

    const backupPath = backupEnvFile(filePath)

    expect(existsSync(backupPath)).toBe(true)
    expect(backupPath).toBe(`${filePath}.backup`)
    expect(fs.readFileSync(backupPath, "utf-8")).toBe("KEY=value\n")
  })

  it("should use custom suffix", () => {
    const filePath = path.join(tmpDir, ".env")
    fs.writeFileSync(filePath, "KEY=value\n")

    const backupPath = backupEnvFile(filePath, ".bak")

    expect(backupPath).toBe(`${filePath}.bak`)
    expect(existsSync(backupPath)).toBe(true)
  })

  it("should not throw when source does not exist", () => {
    const filePath = path.join(tmpDir, ".nonexistent")
    expect(() => backupEnvFile(filePath)).not.toThrow()
  })
})

describe("restoreEnvFile", () => {
  it("should restore file from backup", () => {
    const filePath = path.join(tmpDir, ".env")
    const backupPath = `${filePath}.backup`
    fs.writeFileSync(filePath, "CURRENT=value\n")
    fs.writeFileSync(backupPath, "ORIGINAL=value\n")

    restoreEnvFile(filePath)

    expect(fs.readFileSync(filePath, "utf-8")).toBe("ORIGINAL=value\n")
  })

  it("should throw when backup does not exist", () => {
    const filePath = path.join(tmpDir, ".env")
    fs.writeFileSync(filePath, "KEY=value\n")

    expect(() => restoreEnvFile(filePath)).toThrow("Backup file not found")
  })
})
