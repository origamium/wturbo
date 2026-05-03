#!/usr/bin/env node

/**
 * @fileoverview wtb CLI アプリケーションエントリーポイント
 * 新しいディレクトリ構造に対応したメインエントリーポイント
 */

// 新しいCLIモジュールを使用
export { createMainProgram, main } from "./cli/index.js"

// スクリプトとして実行された場合のみmain()を呼び出し
if (import.meta.url === `file://${process.argv[1]}`) {
  const { main } = await import("./cli/index.js")
  main()
}
