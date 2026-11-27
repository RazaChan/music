import { useMedia } from 'react-use'
import { MOBILE_BREAKPOINT } from '@/web/utils/common'

/**
 * 是否使用移动布局（<= MOBILE_BREAKPOINT px）。
 * 响应式：窗口缩放跨越断点时实时切换（此前是非响应式的 innerWidth 读取，
 * 缩放窗口不会触发重渲染，导致布局与视口脱节）。
 */
const useIsMobile = () => useMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`, false)

export default useIsMobile
