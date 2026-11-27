import { changeTheme, resolveTheme } from '@/web/utils/theme'
import Icon from '../Icon'
import { useSnapshot } from 'valtio'
import settings from '@/web/states/settings'
import { syncTheme } from '@/web/utils/ipcRender'
const Theme = () => {
  const { theme } = useSnapshot(settings)
  return (
    <>
      <div
        className='app-region-no-drag flex h-12 w-12 items-center justify-center rounded-full  bg-white/60 text-neutral-500 transition duration-400 hover:bg-white dark:bg-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-100'
        onClick={() => {
          // 按当前实际生效的主题取反（'system' 时以解析结果为准），点击后转为显式选择
          const next = resolveTheme(theme) === 'dark' ? 'light' : 'dark'
          changeTheme(next)
          settings.theme = next
          syncTheme(next)
        }}
      >
        <Icon name='sun' className='h-9 w-9 text-white' />
      </div>
    </>
  )
}

export default Theme
