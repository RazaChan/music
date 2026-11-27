import { useLocation, useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import SearchBox from './SearchBox'
import SettingsButton from './SettingsButton'
import Icon from '@/web/components/Icon'

/** 一级页面（底部导航可达）不显示返回按钮 */
const TOP_LEVEL_PATHS = ['/', '/discover', '/browse', '/lyrics']

const TopbarMobile = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const showBack = !TOP_LEVEL_PATHS.includes(location.pathname)

  return (
    <div data-testid='mobile-topbar' className='mb-5 mt-10 flex items-center px-2.5'>
      {showBack && (
        <button
          data-testid='mobile-back-button'
          aria-label='back'
          onClick={() => navigate(-1)}
          className='mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10'
        >
          <Icon name='left-arrow' className='h-5 w-5' />
        </button>
      )}
      <div className='grow'>
        <SearchBox />
      </div>

      <div className='ml-6 flex shrink-0'>
        <SettingsButton />
        <div className='ml-3'>
          <Avatar />
        </div>
      </div>
    </div>
  )
}

export default TopbarMobile
