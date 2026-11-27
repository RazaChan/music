/**
 * 顶栏下载按钮 + 下载任务面板。
 *
 * 有进行中任务时按钮显示数量角标；点击展开任务面板（进度 / 取消 /
 * 重试 / 打开所在文件夹[桌面] / 清空已完成）。
 */
import { useSnapshot } from 'valtio'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { cx } from '@emotion/css'
import Icon from '@/web/components/Icon'
import {
  downloads,
  clearFinishedDownloads,
  DownloadTask,
} from '@/web/states/downloads'
import {
  cancelDownload,
  retryDownload,
  showDownloadInFolder,
  openDownloadsFolder,
} from '@/web/utils/download'
import { ease } from '@/web/utils/const'

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const TaskRow = ({ task }: { task: DownloadTask }) => {
  const { t } = useTranslation()
  const percent =
    task.total > 0 ? Math.min(100, Math.round((task.loaded / task.total) * 100)) : null

  return (
    <div className='rounded-12 p-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0 grow'>
          <div className='line-clamp-1 text-14 font-bold'>{task.title}</div>
          <div className='mt-0.5 text-12 font-medium text-black/40 dark:text-white/40'>
            {task.status === 'downloading' && (
              <>
                {t`downloads.downloading`}
                {percent !== null && ` · ${percent}%`}
                {task.total > 0 && ` · ${formatBytes(task.loaded)} / ${formatBytes(task.total)}`}
              </>
            )}
            {task.status === 'completed' &&
              (task.savedPath ? task.savedPath : t`downloads.completed-browser`)}
            {task.status === 'failed' && t`downloads.failed`}
            {task.status === 'cancelled' && t`downloads.cancelled`}
          </div>
        </div>

        {/* Actions */}
        <div className='flex shrink-0 items-center gap-1'>
          {task.status === 'downloading' && (
            <button
              title={t`downloads.cancel`}
              onClick={() => cancelDownload(task.id)}
              className='flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
            >
              <Icon name='x' className='h-4 w-4' />
            </button>
          )}
          {(task.status === 'failed' || task.status === 'cancelled') && (
            <button
              title={t`downloads.retry`}
              onClick={() => retryDownload(task.id)}
              className='flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
            >
              <Icon name='refresh' className='h-4 w-4' />
            </button>
          )}
          {task.status === 'completed' && task.savedPath && (
            <button
              title={t`downloads.show-in-folder`}
              onClick={() => showDownloadInFolder(task.savedPath!)}
              className='flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
            >
              <Icon name='download' className='h-4 w-4' />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {task.status === 'downloading' && (
        <div className='mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10'>
          <div
            className='h-full rounded-full bg-accent-color-500 transition-[width] duration-300'
            style={{ width: percent !== null ? `${percent}%` : '30%' }}
          />
        </div>
      )}
    </div>
  )
}

const DownloadsButton = () => {
  const { t } = useTranslation()
  const { tasks } = useSnapshot(downloads)
  const [open, setOpen] = useState(false)
  const activeCount = tasks.filter(task => task.status === 'downloading').length
  const hasFinished = tasks.some(task => task.status !== 'downloading')

  return (
    <div className='relative'>
      <button
        data-testid='downloads-button'
        onClick={() => setOpen(v => !v)}
        className='relative flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-300 hover:bg-black/10 dark:hover:bg-white/10'
        title={t`downloads.title`}
      >
        <Icon name='download' className='h-5 w-5' />
        {activeCount > 0 && (
          <span className='bg-accent-color-500 absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white'>
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            data-testid='downloads-panel'
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease }}
            className={cx(
              'absolute right-0 top-14 z-40 w-96 rounded-20 p-3 shadow-2xl',
              'bg-white/90 backdrop-blur-xl dark:bg-neutral-900/90'
            )}
          >
            <div className='mb-2 flex items-center justify-between px-3 pt-1'>
              <div className='text-14 font-bold'>{t`downloads.title`}</div>
              <div className='flex gap-2'>
                {!!window.ipcRenderer && (
                  <button
                    onClick={openDownloadsFolder}
                    className='text-12 font-bold text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70'
                  >
                    {t`downloads.open-folder`}
                  </button>
                )}
                {hasFinished && (
                  <button
                    onClick={clearFinishedDownloads}
                    className='text-12 font-bold text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70'
                  >
                    {t`downloads.clear-finished`}
                  </button>
                )}
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className='px-3 py-8 text-center text-14 font-medium text-black/40 dark:text-white/40'>
                {t`downloads.empty`}
              </div>
            ) : (
              <div className='max-h-96 overflow-y-auto'>
                {tasks.map(task => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default DownloadsButton
