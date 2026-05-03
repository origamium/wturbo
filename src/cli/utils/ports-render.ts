/**
 * @fileoverview `wtb ports` 用 pure renderer
 * 入力された WorktreePorts / WorktreePorts[] を JSON または人間可読テーブルに変換する
 */

import type { WorktreePorts } from "../../types/index.js"

/**
 * JSON 出力
 * 単一の WorktreePorts を渡すとオブジェクト、配列を渡すと配列として返す。
 */
export function renderPortsJson(rows: WorktreePorts | WorktreePorts[]): string {
  return JSON.stringify(rows, null, 2)
}

/**
 * 人間向けテーブル出力
 */
export function renderPortsPretty(rows: WorktreePorts[]): string {
  if (rows.length === 0) return "No worktrees found\n"

  const lines: string[] = []
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) lines.push("")
    const wt = rows[i]
    lines.push(`${wt.branch}`)
    lines.push(`  path: ${wt.path}`)

    const envKeys = Object.keys(wt.env).sort()
    if (envKeys.length > 0) {
      lines.push("  env:")
      for (const key of envKeys) {
        lines.push(`    ${key}=${wt.env[key]}`)
      }
    }

    if (wt.compose.file) {
      lines.push(`  compose: ${wt.compose.file}`)
      const serviceNames = Object.keys(wt.compose.services).sort()
      for (const name of serviceNames) {
        const svc = wt.compose.services[name]
        const mapping = svc.host_ports
          .map((h, idx) => `${h}→${svc.container_ports[idx] ?? "?"}`)
          .join(", ")
        lines.push(`    ${name}: ${mapping || "(no ports)"}`)
      }
    }

    if (wt.endpoints.length > 0) {
      lines.push("  endpoints:")
      for (const ep of wt.endpoints) {
        lines.push(`    ${ep}`)
      }
    }
  }
  return `${lines.join("\n")}\n`
}
