/**
 * 统一的异步状态组件（阶段 1 · 第三批）：
 *
 *  - AsyncLoading：居中加载指示
 *  - AsyncEmpty：空内容
 *  - AsyncError：加载失败 + 重试（沉淀自 Search 页的 SectionError 模式）
 *  - PleaseLogin：未登录引导，按钮打开全局登录弹窗
 *
 * 页面约定：数据区块按 isPending → AsyncLoading、isError → AsyncError、
 * 空数组 → AsyncEmpty 的顺序渲染，不再让区块静默空白或显示 PLACEHOLDER 文本。
 */
import { cx } from '@emotion/css'
import { useTranslation } from 'react-i18next'
import Icon from '@/web/components/Icon'
import uiStates from '@/web/states/uiStates'

export const AsyncLoading = ({ className }: { className?: string }) => {
  const { t } = useTranslation()
  return (
    <div
      data-testid='async-loading'
      className={cx('flex flex-col items-center justify-center gap-3 py-10', className)}
    >
      <Icon name='loading' className='h-6 w-6 animate-spin text-black/40 dark:text-white/40' />
      <div className='text-12 font-bold text-black/40 dark:text-white/40'>{t`common.loading`}</div>
    </div>
  )
}

export const AsyncEmpty = ({
  text,
  className,
}: {
  text?: string
  className?: string
}) => {
  const { t } = useTranslation()
  return (
    <div
      data-testid='async-empty'
      className={cx('flex flex-col items-center justify-center gap-3 py-10', className)}
    >
      <Icon name='music-note' className='h-8 w-8 text-black/20 dark:text-white/20' />
      <div className='text-14 font-bold text-black/40 dark:text-white/40'>
        {text ?? t`common.empty`}
      </div>
    </div>
  )
}

export const AsyncError = ({
  onRetry,
  text,
  className,
}: {
  onRetry?: () => void
  text?: string
  className?: string
}) => {
  const { t } = useTranslation()
  return (
    <div
      data-testid='async-error'
      className={cx('flex flex-col items-center justify-center gap-3 py-10', className)}
    >
      <div className='text-14 font-bold text-neutral-700 dark:text-neutral-300'>
        {text ?? t`common.error`}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className='flex items-center gap-1.5 rounded-full bg-black/10 px-4 py-1.5 text-14 font-bold text-neutral-800 hover:bg-black/20 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20'
        >
          <Icon name='refresh' className='h-4 w-4' />
          {t`common.retry`}
        </button>
      )}
    </div>
  )
}

export const PleaseLogin = ({ className }: { className?: string }) => {
  const { t } = useTranslation()
  return (
    <div
      data-testid='please-login'
      className={cx('flex flex-col items-center justify-center gap-4 py-24', className)}
    >
      <Icon name='user' className='h-10 w-10 text-black/20 dark:text-white/20' />
      <div className='text-14 font-bold text-black/40 dark:text-white/40'>
        {t`common.please-login-hint`}
      </div>
      <button
        onClick={() => (uiStates.showLoginPanel = true)}
        className='rounded-full bg-black/10 px-6 py-2 text-14 font-bold text-neutral-800 transition-colors hover:bg-black/20 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20'
      >
        {t`auth.login`}
      </button>
    </div>
  )
}
