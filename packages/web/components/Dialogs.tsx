/**
 * 轻量对话框原语：输入框对话框（新建/重命名）与确认对话框（删除等
 * 破坏性操作）。role=dialog + aria-modal + Escape 关闭 + 自动聚焦。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '@emotion/css'
import { ease } from '@/web/utils/const'

const Backdrop = ({ onClose }: { onClose: () => void }) => (
  <motion.div
    className='fixed inset-0 z-40 bg-black/60 backdrop-blur-xl'
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease }}
    onClick={onClose}
  />
)

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className='pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6'>
    <motion.div
      role='dialog'
      aria-modal='true'
      className={cx(
        'pointer-events-auto w-full max-w-md rounded-24 p-6 shadow-2xl',
        'border border-black/10 bg-white/95 backdrop-blur-2xl dark:border-white/10 dark:bg-black/95'
      )}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </motion.div>
  </div>
)

export function InputDialog({
  open,
  title,
  defaultValue = '',
  placeholder,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  defaultValue?: string
  placeholder?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open, defaultValue])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClose={onClose} />
          <Panel>
            <div className='mb-4 text-16 font-bold'>{title}</div>
            <input
              ref={inputRef}
              value={value}
              placeholder={placeholder}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  onClose()
                  return
                }
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                e.preventDefault()
                submit()
              }}
              className='mb-5 w-full rounded-12 bg-black/5 px-4 py-2.5 text-14 font-medium outline-hidden placeholder:text-black/30 dark:bg-white/10 dark:placeholder:text-white/30'
            />
            <div className='flex justify-end gap-2'>
              <button
                onClick={onClose}
                className='rounded-full px-5 py-2 text-14 font-bold text-black/50 transition-colors hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10'
              >
                {t`common.cancel`}
              </button>
              <button
                onClick={submit}
                disabled={!value.trim()}
                className='bg-accent-color-500 rounded-full px-5 py-2 text-14 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40'
              >
                {t`common.confirm`}
              </button>
            </div>
          </Panel>
        </>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClose={onClose} />
          <Panel>
            <div className='mb-2 text-16 font-bold'>{title}</div>
            {description && (
              <div className='mb-5 text-14 font-medium text-black/50 dark:text-white/50'>
                {description}
              </div>
            )}
            <div className='mt-4 flex justify-end gap-2'>
              <button
                onClick={onClose}
                className='rounded-full px-5 py-2 text-14 font-bold text-black/50 transition-colors hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10'
              >
                {t`common.cancel`}
              </button>
              <button
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                className='rounded-full bg-red-500 px-5 py-2 text-14 font-bold text-white transition-opacity hover:opacity-90'
              >
                {t`common.confirm`}
              </button>
            </div>
          </Panel>
        </>
      )}
    </AnimatePresence>
  )
}
