import toast from 'react-hot-toast'
import i18n from '@/web/i18n/i18n'
import { fetchTracksWithReactQuery } from '@/web/api/hooks/useTracks'
import { fetchAudioSourceWithReactQuery } from '@/web/api/hooks/useTracks'
import settings from '@/web/states/settings'
import { IpcChannels } from '@/shared/IpcChannels'
import {
  downloads,
  setDownloadStatus,
  updateDownloadProgress,
  upsertDownloadTask,
} from '@/web/states/downloads'

/**
 * 显式下载（与自动播放缓存是两套产品模型）。
 *
 *  - 文件名用真实编码扩展名（响应的 type 字段），不再一律 .mp3
 *  - 桌面端：主进程流式下载到 userData/downloads，进度经 IPC 推送，
 *    完成后可"打开所在文件夹"
 *  - Web 端：fetch 流式读取（进度可见）→ blob → 浏览器接管保存
 *  - 任务状态在 states/downloads.ts，面板可取消/重试
 */

// Web 端下载的取消控制器（桌面端取消走 IPC）
const webAbortControllers = new Map<number, AbortController>()

const sanitizeForFilename = (name: string) =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim()

/** 从 url 兜底推断扩展名（响应缺 type 时） */
const formatFromUrl = (url: string) => {
  const match = /\.(mp3|flac|m4a|ogg|opus|aac|wav)(\?|$)/i.exec(url)
  return match ? match[1].toLowerCase() : null
}

export async function downloadTrack(trackID: number) {
  // 同曲目任务进行中则忽略重复触发
  if (downloads.tasks.some(t => t.id === trackID && t.status === 'downloading')) return

  let url: string | null = null
  let format = 'mp3'
  let title = String(trackID)
  try {
    const [source, tracks] = await Promise.all([
      fetchAudioSourceWithReactQuery({ id: trackID, level: settings.audioQuality }),
      fetchTracksWithReactQuery({ ids: [trackID] }),
    ])
    const info = source?.data?.[0]
    url = info?.url ?? null
    if (url && url.includes('126.net')) {
      // 与 player._fetchAudioSource 一致的协议升级
      url = url.replace('http://', 'https://')
    }
    format = info?.type || (url ? formatFromUrl(url) : null) || 'mp3'
    const track = tracks?.songs?.[0]
    const artists = track?.ar?.map(a => a.name).join(', ')
    title = `${artists ? `${artists} - ` : ''}${track?.name ?? String(trackID)}`
  } catch {
    toast.error(i18n.t('toasts.download-failed'))
    return
  }
  if (!url) {
    toast.error(i18n.t('toasts.download-failed'))
    return
  }

  const filename = `${sanitizeForFilename(title)}.${format}`
  upsertDownloadTask({
    id: trackID,
    title,
    filename,
    status: 'downloading',
    loaded: 0,
    total: 0,
  })
  toast.success(i18n.t('toasts.download-started'))

  if (window.ipcRenderer) {
    await downloadViaMainProcess(trackID, url, filename)
  } else {
    await downloadViaBrowser(trackID, url, filename)
  }
}

/** 桌面端：主进程流式写盘，进度经 AudioDownloadProgress IPC 推送 */
async function downloadViaMainProcess(trackID: number, url: string, filename: string) {
  try {
    const result = await window.ipcRenderer!.invoke(IpcChannels.DownloadAudioToDisk, {
      id: trackID,
      url,
      filename,
    })
    setDownloadStatus(trackID, 'completed', { savedPath: result?.path })
  } catch (error) {
    const message = String((error as Error)?.message ?? error)
    if (message.includes('cancelled')) {
      setDownloadStatus(trackID, 'cancelled')
    } else {
      setDownloadStatus(trackID, 'failed', { error: message })
      toast.error(i18n.t('toasts.download-failed'))
    }
  }
}

/** Web 端：流式读取（进度可见）→ blob → 浏览器接管保存 */
async function downloadViaBrowser(trackID: number, url: string, filename: string) {
  const abort = new AbortController()
  webAbortControllers.set(trackID, abort)
  try {
    const response = await fetch(url, { signal: abort.signal })
    if (!response.ok || !response.body) throw new Error(`http ${response.status}`)
    const total = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body.getReader()
    const chunks: BlobPart[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      updateDownloadProgress(trackID, loaded, total)
    }
    const blobUrl = URL.createObjectURL(new Blob(chunks))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
    setDownloadStatus(trackID, 'completed')
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      setDownloadStatus(trackID, 'cancelled')
    } else {
      // 跨域拦截等：退化为裸链交给浏览器（无进度，直接标记完成）
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setDownloadStatus(trackID, 'completed')
    }
  } finally {
    webAbortControllers.delete(trackID)
  }
}

export function cancelDownload(trackID: number) {
  if (window.ipcRenderer) {
    window.ipcRenderer.invoke(IpcChannels.CancelAudioDownload, { id: trackID })
  } else {
    webAbortControllers.get(trackID)?.abort()
  }
  setDownloadStatus(trackID, 'cancelled')
}

export function retryDownload(trackID: number) {
  downloadTrack(trackID)
}

export function showDownloadInFolder(path: string) {
  window.ipcRenderer?.invoke(IpcChannels.ShowItemInFolder, { path })
}

export function openDownloadsFolder() {
  window.ipcRenderer?.invoke(IpcChannels.OpenDownloadsFolder)
}
