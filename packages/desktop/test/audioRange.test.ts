import { describe, expect, it } from 'vitest'
import { parseRangeHeader } from '../main/utils/audioRange'

const SIZE = 10000

describe('parseRangeHeader', () => {
  it('无 Range 头返回 null（调用方回 200 全量）', () => {
    expect(parseRangeHeader(undefined, SIZE)).toBeNull()
    expect(parseRangeHeader(null, SIZE)).toBeNull()
    expect(parseRangeHeader('', SIZE)).toBeNull()
  })

  it('标准闭区间 bytes=start-end', () => {
    expect(parseRangeHeader('bytes=0-1023', SIZE)).toEqual({ start: 0, end: 1023 })
    expect(parseRangeHeader('bytes=5000-6000', SIZE)).toEqual({ start: 5000, end: 6000 })
  })

  it('开区间 bytes=start- 到文件尾', () => {
    expect(parseRangeHeader('bytes=5000-', SIZE)).toEqual({ start: 5000, end: SIZE - 1 })
    expect(parseRangeHeader('bytes=0-', SIZE)).toEqual({ start: 0, end: SIZE - 1 })
  })

  it('后缀区间 bytes=-N 取最后 N 字节', () => {
    expect(parseRangeHeader('bytes=-500', SIZE)).toEqual({ start: SIZE - 500, end: SIZE - 1 })
    // 后缀超过文件大小 → 整个文件
    expect(parseRangeHeader('bytes=-99999999', SIZE)).toEqual({ start: 0, end: SIZE - 1 })
  })

  it('end 越界按规范截断到 size-1', () => {
    expect(parseRangeHeader('bytes=0-99999999', SIZE)).toEqual({ start: 0, end: SIZE - 1 })
  })

  it('start 越界 / end<start / 零后缀 → invalid（调用方回 416）', () => {
    expect(parseRangeHeader(`bytes=${SIZE}-`, SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=5000-100', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('invalid')
  })

  it('畸形与多区间 → invalid', () => {
    expect(parseRangeHeader('bytes=abc-def', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=0-100,200-300', SIZE)).toBe('invalid')
    expect(parseRangeHeader('items=0-100', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=-', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=1.5-2.5', SIZE)).toBe('invalid')
  })

  it('空文件 → invalid', () => {
    expect(parseRangeHeader('bytes=0-100', 0)).toBe('invalid')
  })
})
