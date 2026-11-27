import IpcRendererReact from '@/web/IpcRendererReact'
import Layout from '@/web/components/Layout'
import Devtool from '@/web/components/Devtool'
import ErrorBoundary from '@/web/components/ErrorBoundary'
import useIsMobile from '@/web/hooks/useIsMobile'
import LayoutMobile from '@/web/components/LayoutMobile'
import ScrollRestoration from '@/web/components/ScrollRestoration'
import Toaster from './components/Toaster'
import useApplyKeyboardShortcuts from './hooks/useApplyKeyboardShortcuts'
import { MotionConfig } from 'framer-motion'
const App = () => {
  useApplyKeyboardShortcuts()

  const isMobile = useIsMobile()

  return (
    <ErrorBoundary>
      {/* reducedMotion="user"：尊重系统减少动效偏好 —— framer-motion 的
          位移/缩放动画降级为透明度过渡（CSS 动画由 global.css 的
          prefers-reduced-motion 规则压制） */}
      <MotionConfig reducedMotion='user'>
        {isMobile ? <LayoutMobile /> : <Layout />}
      </MotionConfig>
      <Toaster />
      {/* What's this for */}
      <ScrollRestoration />
      <IpcRendererReact />
      {import.meta.env.DEV && <Devtool />}
    </ErrorBoundary>
  )
}

export default App
