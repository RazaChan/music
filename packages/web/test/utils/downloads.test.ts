/**
 * states/downloads.ts 下载任务状态测试
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  downloads,
  upsertDownloadTask,
  updateDownloadProgress,
  setDownloadStatus,
  clearFinishedDownloads,
  activeDownloadCount,
} from '@/web/states/downloads'

const makeTask = (id: number, status: 'downloading' | 'completed' = 'downloading') => ({
  id,
  title: `track ${id}`,
  filename: `track-${id}.mp3`,
  status: status as 'downloading',
  loaded: 0,
  total: 0,
})

beforeEach(() => {
  downloads.tasks = []
})

describe('下载任务状态', () => {
  it('新任务插入到列表头部', () => {
    upsertDownloadTask(makeTask(1))
    upsertDownloadTask(makeTask(2))
    expect(downloads.tasks.map(t => t.id)).toEqual([2, 1])
  })

  it('同曲目重复 upsert 是重置而不是新增', () => {
    upsertDownloadTask(makeTask(1))
    updateDownloadProgress(1, 500, 1000)
    upsertDownloadTask(makeTask(1))
    expect(downloads.tasks).toHaveLength(1)
    expect(downloads.tasks[0].loaded).toBe(0)
  })

  it('进度更新只作用于下载中的任务', () => {
    upsertDownloadTask(makeTask(1))
    updateDownloadProgress(1, 500, 1000)
    expect(downloads.tasks[0].loaded).toBe(500)
    expect(downloads.tasks[0].total).toBe(1000)

    setDownloadStatus(1, 'completed')
    updateDownloadProgress(1, 999, 1000)
    expect(downloads.tasks[0].loaded).toBe(500) // 完成后不再更新
  })

  it('total 为 0（未知）时不覆盖已有 total', () => {
    upsertDownloadTask(makeTask(1))
    updateDownloadProgress(1, 100, 2000)
    updateDownloadProgress(1, 200, 0)
    expect(downloads.tasks[0].total).toBe(2000)
  })

  it('完成时记录保存路径，失败时记录错误', () => {
    upsertDownloadTask(makeTask(1))
    setDownloadStatus(1, 'completed', { savedPath: '/downloads/a.mp3' })
    expect(downloads.tasks.find(t => t.id === 1)?.savedPath).toBe('/downloads/a.mp3')

    upsertDownloadTask(makeTask(2))
    setDownloadStatus(2, 'failed', { error: 'http 500' })
    expect(downloads.tasks.find(t => t.id === 2)?.error).toBe('http 500')
  })

  it('清空已完成保留进行中的任务', () => {
    upsertDownloadTask(makeTask(1))
    upsertDownloadTask(makeTask(2))
    upsertDownloadTask(makeTask(3))
    setDownloadStatus(1, 'completed')
    setDownloadStatus(2, 'failed')
    clearFinishedDownloads()
    expect(downloads.tasks.map(t => t.id)).toEqual([3])
  })

  it('activeDownloadCount 只统计下载中', () => {
    upsertDownloadTask(makeTask(1))
    upsertDownloadTask(makeTask(2))
    setDownloadStatus(2, 'cancelled')
    expect(activeDownloadCount()).toBe(1)
  })
})
