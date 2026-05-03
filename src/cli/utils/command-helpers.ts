/**
 * @fileoverview コマンド共通ヘルパー
 */

import { EXIT_CODES } from "../../constants/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"

/**
 * コマンド action の標準エラーハンドリングラッパー
 *
 * Commander の `.action(...)` に渡すハンドラを包み、CLIError は exitCode を尊重して、
 * その他のエラーは GENERAL_ERROR で終了させる。
 */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await handler(...args)
    } catch (error) {
      if (error instanceof CLIError) {
        console.error(`Error: ${error.message}`)
        process.exit(error.exitCode)
      }
      console.error(`Error: ${getErrorMessage(error)}`)
      process.exit(EXIT_CODES.GENERAL_ERROR)
    }
  }
}
