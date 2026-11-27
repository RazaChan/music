/**
 * 主进程音频下载器：流式写盘到 userData/downloads，进度经 IPC 推给渲染进程。
 *
 *  - 文件名经 sanitizeDownloadFilename + resolveDownloadPath 双重校验（红线：
 *    只允许写进下载目录内）
 *  - 进度用 PassThrough 计数（不与 pipeline 抢流），~200ms 节流推送
 *  - 取消经 CancelAudioDownload → request.abort()，部分文件清理
 */
import { app, net, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { PassThrough, Readable } from 'stream'
import { pipeline } from 'stream/promises'
import log from './log'
import { IpcChannels } from '@/shared/IpcChannels'
import { resolveDownloadPath, sanitizeDownloadFilename } from './utils/downloadFilename'

const PROGRESS_INTERVAL_MS = 200

export const getDownloadsDir = () => path.join(app.getPath('userData'), 'downloads')

const activeDownloads = new Map<number, { abort: () => void }>()

export function cancelAudioDownload(id: number) {
  activeDownloads.get(id)?.abort()
}

export async function downloadAudioToDisk(
  win: BrowserWindow | null,
  { id, url, filename }: { id: number; url: string; filename: string }
): Promise<{ path: string }> {
  if (!/^https?:\/\//.test(url)) {
    throw new Error('invalid url')
  }
  const safeName = sanitizeDownloadFilename(filename)
  if (!safeName) {
    throw new Error('invalid filename')
  }
  const downloadsDir = getDownloadsDir()
  await fs.promises.mkdir(downloadsDir, { recursive: true })
  const filePath = resolveDownloadPath(downloadsDir, safeName, path)
  if (!filePath) {
    throw new Error('invalid filename')
  }

  // 同一曲目重复下载：先取消旧任务
  cancelAudioDownload(id)

  return new Promise<{ path: string }>((resolve, reject) => {
    const request = net.request(url)
    let settled = false
    let cancelled = false
    const cleanup = () => {
      activeDownloads.delete(id)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      fs.promises.unlink(filePath).catch(() => {})
      reject(cancelled ? new Error('cancelled') : error)
    }

    activeDownloads.set(id, {
      abort: () => {
        cancelled = true
        request.abort()
      },
    })

    request.on('response', response => {
      const status = response.statusCode ?? 0
      if (status < 200 || status >= 300) {
        fail(new Error(`http ${status}`))
        return
      }
      const total = Number(response.headers['content-length'] ?? 0)
      let loaded = 0
      let lastPush = 0

      const counter = new PassThrough()
      counter.on('data', (chunk: Buffer) => {
        loaded += chunk.length
        const now = Date.now()
        if (now - lastPush >= PROGRESS_INTERVAL_MS) {
          lastPush = now
          win?.webContents.send(IpcChannels.AudioDownloadProgress, { id, loaded, total })
        }
      })

      // Electron 的 IncomingMessage 运行时是 Readable，但类型声明不完整
      pipeline(response as unknown as Readable, counter, fs.createWriteStream(filePath))
        .then(() => {
          if (settled) return
          settled = true
          cleanup()
          // 完成前补一帧最终进度
          win?.webContents.send(IpcChannels.AudioDownloadProgress, { id, loaded, total: total || loaded })
          log.info(`[downloader] saved ${filePath} (${loaded} bytes)`)
          resolve({ path: filePath })
        })
        .catch(fail)
    })
    request.on('error', fail)
    request.end()
  })
}
