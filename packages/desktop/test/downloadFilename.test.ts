import { describe, expect, it } from 'vitest'
import path from 'path'
import { resolveDownloadPath, sanitizeDownloadFilename } from '../main/utils/downloadFilename'

describe('sanitizeDownloadFilename', () => {
  it('常规歌名原样通过', () => {
    expect(sanitizeDownloadFilename('周杰伦 - 晴天.mp3')).toBe('周杰伦 - 晴天.mp3')
    expect(sanitizeDownloadFilename('Artist - Song.flac')).toBe('Artist - Song.flac')
  })

  it('路径分隔符与 Windows 保留字符被去除', () => {
    expect(sanitizeDownloadFilename('a/b\\c:d*e?f"g<h>i|j.mp3')).toBe('abcdefghij.mp3')
  })

  it('目录穿越被中和（分隔符已去除）', () => {
    const out = sanitizeDownloadFilename('../../etc/passwd')
    expect(out).not.toContain('/')
    expect(out).not.toContain('\\')
  })

  it('控制字符被去除', () => {
    expect(sanitizeDownloadFilename('ab.mp3')).toBe('ab.mp3')
  })

  it('结尾点与首尾空白被去除（Windows 不允许结尾点）', () => {
    expect(sanitizeDownloadFilename('  name.mp3.  ')).toBe('name.mp3')
  })

  it('超长截断到 180 字符', () => {
    const long = 'a'.repeat(300) + '.mp3'
    expect(sanitizeDownloadFilename(long)!.length).toBeLessThanOrEqual(180)
  })

  it('净化后为空返回 null', () => {
    expect(sanitizeDownloadFilename('///')).toBeNull()
    expect(sanitizeDownloadFilename('   ')).toBeNull()
    expect(sanitizeDownloadFilename('...')).toBeNull()
  })
})

describe('resolveDownloadPath', () => {
  const dir = '/tmp/downloads'

  it('正常文件名解析到目录内', () => {
    expect(resolveDownloadPath(dir, 'a.mp3', path)).toBe(path.resolve(dir, 'a.mp3'))
  })

  it('逃逸目录返回 null', () => {
    expect(resolveDownloadPath(dir, '../evil.mp3', path)).toBeNull()
    expect(resolveDownloadPath(dir, 'sub/../../evil.mp3', path)).toBeNull()
  })
})
