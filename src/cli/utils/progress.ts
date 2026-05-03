/**
 * @fileoverview CLI プログレス表示ユーティリティ
 * ターミナルでのプログレスバー表示を担当
 */

import type { VolumeCopyProgress } from "../../core/docker/volume.js"
import { formatBytes, formatEta } from "../../core/docker/volume.js"

/**
 * プログレスバーのオプション
 */
export interface ProgressBarOptions {
  /** バーの幅（文字数） */
  width?: number
  /** 完了文字 */
  completeChar?: string
  /** 未完了文字 */
  incompleteChar?: string
  /** 色を使用するか */
  useColors?: boolean
}

/**
 * シンプルなプログレスバーを生成
 *
 * @param percentage - 進捗率 (0-100)
 * @param options - オプション
 * @returns プログレスバー文字列
 */
export function createProgressBar(percentage: number, options: ProgressBarOptions = {}): string {
  const { width = 30, completeChar = "█", incompleteChar = "░", useColors = true } = options

  const completed = Math.floor((percentage / 100) * width)
  const remaining = width - completed

  const bar = completeChar.repeat(completed) + incompleteChar.repeat(remaining)
  const percentStr = `${percentage.toFixed(0).padStart(3)}%`

  if (useColors) {
    // 緑色でプログレスバーを表示
    return `\x1b[32m${bar}\x1b[0m ${percentStr}`
  }

  return `${bar} ${percentStr}`
}

/**
 * ボリュームコピーの進捗表示を生成
 *
 * @param progress - 進捗情報
 * @param options - オプション
 * @returns 表示用文字列
 */
export function formatVolumeCopyProgress(
  progress: VolumeCopyProgress,
  options: ProgressBarOptions = {}
): string {
  const bar = createProgressBar(progress.percentage, options)
  const transferred = formatBytes(progress.bytesTransferred)
  const total = formatBytes(progress.totalBytes)
  const speed = `${formatBytes(progress.speed)}/s`
  const eta = formatEta(progress.eta)

  return `${bar} | ${transferred}/${total} | ${speed} | ETA: ${eta}`
}

/**
 * ターミナルの同じ行を更新して進捗表示
 *
 * @param message - 表示するメッセージ
 */
export function updateProgressLine(message: string): void {
  process.stdout.write(`\r\x1b[K${message}`)
}

/**
 * 進捗表示を完了（改行を追加）
 */
export function finishProgressLine(): void {
  process.stdout.write("\n")
}

/**
 * ボリュームコピー用のプログレスハンドラーを作成
 *
 * @param label - 表示ラベル
 * @returns 進捗コールバック関数
 *
 * @example
 * ```typescript
 * await copyVolume('source', 'target', {
 *   onProgress: createVolumeCopyProgressHandler('Copying database')
 * })
 * ```
 */
export function createVolumeCopyProgressHandler(
  label: string
): (progress: VolumeCopyProgress) => void {
  return (progress: VolumeCopyProgress) => {
    const formatted = formatVolumeCopyProgress(progress)
    updateProgressLine(`${label}: ${formatted}`)

    if (progress.percentage >= 100) {
      finishProgressLine()
    }
  }
}

/**
 * 複数ボリュームのコピー進捗を管理
 */
export class MultiVolumeProgressTracker {
  private volumes: Map<string, VolumeCopyProgress> = new Map()
  private startTime: number = Date.now()

  /**
   * ボリュームの進捗を更新
   *
   * @param volumeName - ボリューム名
   * @param progress - 進捗情報
   */
  update(volumeName: string, progress: VolumeCopyProgress): void {
    this.volumes.set(volumeName, progress)
    this.render()
  }

  /**
   * 進捗表示をレンダリング
   */
  private render(): void {
    const lines: string[] = []
    let totalBytes = 0
    let transferredBytes = 0

    for (const [name, progress] of this.volumes) {
      totalBytes += progress.totalBytes
      transferredBytes += progress.bytesTransferred

      const bar = createProgressBar(progress.percentage, { width: 20 })
      const status = progress.percentage >= 100 ? "✅" : "⏳"
      lines.push(`  ${status} ${name}: ${bar}`)
    }

    const overallPercentage = totalBytes > 0 ? Math.floor((transferredBytes / totalBytes) * 100) : 0

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    const overallBar = createProgressBar(overallPercentage, { width: 30 })

    // カーソルを上に移動して上書き
    const moveUp = `\x1b[${lines.length + 2}A`
    const clearLine = "\x1b[K"

    process.stdout.write(moveUp)
    console.log(
      `${clearLine}📦 Volume Copy Progress: ${overallBar} | Elapsed: ${formatEta(elapsed)}`
    )
    console.log(`${clearLine}`)
    for (const line of lines) {
      console.log(`${clearLine}${line}`)
    }
  }

  /**
   * 進捗追跡を完了
   */
  finish(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    console.log(`\n✅ All volumes copied in ${formatEta(elapsed)}`)
  }

  /**
   * 進捗コールバックを作成
   *
   * @param volumeName - ボリューム名
   * @returns 進捗コールバック関数
   */
  createHandler(volumeName: string): (progress: VolumeCopyProgress) => void {
    return (progress: VolumeCopyProgress) => {
      this.update(volumeName, progress)
    }
  }
}

/**
 * スピナーアニメーション
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  private currentFrame = 0
  private interval: NodeJS.Timeout | null = null
  private message: string = ""

  /**
   * スピナーを開始
   *
   * @param message - 表示メッセージ
   */
  start(message: string): void {
    this.message = message
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame]
      updateProgressLine(`${frame} ${this.message}`)
      this.currentFrame = (this.currentFrame + 1) % this.frames.length
    }, 80)
  }

  /**
   * メッセージを更新
   *
   * @param message - 新しいメッセージ
   */
  update(message: string): void {
    this.message = message
  }

  /**
   * スピナーを成功で終了
   *
   * @param message - 完了メッセージ
   */
  succeed(message: string): void {
    this.stop()
    console.log(`✅ ${message}`)
  }

  /**
   * スピナーを失敗で終了
   *
   * @param message - エラーメッセージ
   */
  fail(message: string): void {
    this.stop()
    console.log(`❌ ${message}`)
  }

  /**
   * スピナーを停止
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
      updateProgressLine("")
    }
  }
}
