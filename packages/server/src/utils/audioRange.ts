/**
 * HTTP Range 头的解析（纯函数，供缓存音频的流式读取使用）。
 * 与 desktop/main/utils/audioRange.ts 为同构双实现，改动需两端同步
 * （desktop 侧有单测 packages/desktop/test/audioRange.test.ts）。
 *
 * 语义（RFC 7233 子集，只支持单区间）：
 *  - 无 Range 头 → null（调用方返回 200 全量）
 *  - `bytes=start-end` / `bytes=start-` / `bytes=-suffix` → { start, end }（闭区间）
 *  - 越界、畸形、多区间 → 'invalid'（调用方返回 416 + `Content-Range: bytes *\/size`）
 */
export type ParsedRange = { start: number; end: number } | 'invalid' | null

export function parseRangeHeader(range: string | undefined | null, size: number): ParsedRange {
  if (!range) return null
  if (size <= 0) return 'invalid'

  const match = /^bytes=(.*)$/.exec(range.trim())
  if (!match) return 'invalid'

  const spec = match[1].trim()
  // 多区间不支持（Howler/HTMLAudio 只发单区间）
  if (spec.includes(',')) return 'invalid'

  const parts = spec.split('-')
  if (parts.length !== 2) return 'invalid'
  const [rawStart, rawEnd] = parts

  // 后缀区间：bytes=-500 → 最后 500 字节
  if (rawStart === '') {
    if (rawEnd === '' || !/^\d+$/.test(rawEnd)) return 'invalid'
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  if (!/^\d+$/.test(rawStart)) return 'invalid'
  const start = Number(rawStart)
  if (start >= size) return 'invalid'

  // 开区间：bytes=500- → 到文件尾
  if (rawEnd === '') return { start, end: size - 1 }

  if (!/^\d+$/.test(rawEnd)) return 'invalid'
  const end = Math.min(Number(rawEnd), size - 1) // end 越界按规范截断
  if (end < start) return 'invalid'
  return { start, end }
}
