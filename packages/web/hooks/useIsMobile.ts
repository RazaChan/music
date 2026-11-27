import { MOBILE_BREAKPOINT } from '@/web/utils/common'

const useIsMobile = () => {
  // const breakpoint = useBreakpoint()
  // return ['xs', 'sm', 'md'].includes(breakpoint)
  // return false
  return window.innerWidth <= MOBILE_BREAKPOINT
}

export default useIsMobile
