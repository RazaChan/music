/**
 * 下载文件名净化（纯函数）。
 *
 * filename 来自渲染进程（含歌曲名/艺人名），写入磁盘前必须：
 *  - 去掉路径分隔符与 Windows 保留字符，防目录穿越
 *  - 去掉控制字符与首尾空白/结尾点（Windows 不允许结尾点）
 *  - 限制长度（文件系统上限 255 字节，留足余量）
 * 返回 null 表示净化后为空，调用方应拒绝。
 */
// eslint-disable-next-line no-control-regex -- 刻意匹配控制字符以从文件名中剔除
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
const TRAILING_DOTS = /\.+$/

export function sanitizeDownloadFilename(filename: string): string | null {
  const cleaned = filename
    .replace(ILLEGAL_CHARS, '')
    .trim()
    .replace(TRAILING_DOTS, '')
    .slice(0, 180)
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

/**
 * 校验解析后的目标路径仍在下载目录内（与 cacheAudioPath 同款的
 * resolve 兜底，双保险）。
 */
export function resolveDownloadPath(
  downloadsDir: string,
  filename: string,
  pathImpl: Pick<typeof import('path'), 'resolve' | 'sep'>
): string | null {
  const candidate = pathImpl.resolve(downloadsDir, filename)
  const root = pathImpl.resolve(downloadsDir)
  if (candidate === root || candidate.startsWith(root + pathImpl.sep)) return candidate
  return null
}
