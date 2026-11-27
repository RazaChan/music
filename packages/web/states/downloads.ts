/**
 * 显式下载任务状态（valtio）。
 *
 * 与「播放缓存」是两套产品模型：播放缓存自动、可过期、用户无感；
 * 这里的下载是显式任务 —— 有进度、可取消/重试、完成后可定位文件
 * （桌面端）或交给浏览器保存（Web 端）。
 */
import { proxy } from 'valtio'

export type DownloadStatus = 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface DownloadTask {
  /** 以 trackID 作为任务 id：同一曲目同时只有一个任务 */
  id: number
  title: string
  filename: string
  status: DownloadStatus
  loaded: number
  /** 0 = 未知 */
  total: number
  /** 桌面端完成后的磁盘路径（用于"打开所在文件夹"） */
  savedPath?: string
  error?: string
  startedAt: number
}

export const downloads = proxy<{ tasks: DownloadTask[] }>({ tasks: [] })

export const upsertDownloadTask = (task: Omit<DownloadTask, 'startedAt'>) => {
  const existing = downloads.tasks.findIndex(t => t.id === task.id)
  if (existing >= 0) {
    downloads.tasks[existing] = { ...task, startedAt: Date.now() }
  } else {
    downloads.tasks.unshift({ ...task, startedAt: Date.now() })
  }
}

export const updateDownloadProgress = (id: number, loaded: number, total: number) => {
  const task = downloads.tasks.find(t => t.id === id)
  if (!task || task.status !== 'downloading') return
  task.loaded = loaded
  if (total > 0) task.total = total
}

export const setDownloadStatus = (
  id: number,
  status: DownloadStatus,
  extra?: Partial<Pick<DownloadTask, 'savedPath' | 'error'>>
) => {
  const task = downloads.tasks.find(t => t.id === id)
  if (!task) return
  task.status = status
  if (extra?.savedPath !== undefined) task.savedPath = extra.savedPath
  if (extra?.error !== undefined) task.error = extra.error
}

export const clearFinishedDownloads = () => {
  downloads.tasks = downloads.tasks.filter(t => t.status === 'downloading')
}

export const activeDownloadCount = () =>
  downloads.tasks.filter(t => t.status === 'downloading').length
