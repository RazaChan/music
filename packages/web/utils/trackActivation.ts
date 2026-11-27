/**
 * 统一的曲目行激活规则（2026-11-27 产品决策，见 vision-design-and-roadmap 阶段 1）：
 *
 *  - 触屏 / 移动布局：单击即播放（此前 8 处曲目行硬编码双击，移动端要点两次）
 *  - 桌面：双击播放（保留既有习惯；单击留给未来的选中态）
 *  - 键盘：Enter 播放（行需 tabIndex 可聚焦）
 *  - 右键：统一曲目上下文菜单
 *
 * 各页面把同一个 handler 同时挂到 onClick / onContextMenu / onKeyDown，
 * 用 e.type 区分来源，避免每个页面各写一套判断。
 */
import { openContextMenu } from '@/web/states/contextMenus'
import { isMobileViewport } from './common'

export type TrackRowEvent =
  | React.MouseEvent<HTMLElement>
  | React.KeyboardEvent<HTMLElement>

/** click 事件是否应触发播放：移动布局单击、桌面双击 */
export const shouldPlayOnClick = (
  e: { type: string; detail: number },
  isMobile: boolean
): boolean => e.type === 'click' && (isMobile || e.detail === 2)

/** 键盘事件是否应触发播放 */
export const isTrackPlayKey = (e: { type: string; key?: string }): boolean =>
  e.type === 'keydown' && e.key === 'Enter'

/** 行激活总判定：鼠标按平台规则，键盘 Enter */
export const shouldActivateTrackRow = (e: TrackRowEvent, isMobile: boolean): boolean =>
  isTrackPlayKey(e) || shouldPlayOnClick(e, isMobile)

/** 统一的曲目右键菜单（此前 PlayingNext 漏了 preventDefault） */
export function openTrackContextMenu(e: TrackRowEvent, trackID: number) {
  e.preventDefault()
  openContextMenu({
    event: e as React.MouseEvent<HTMLElement>,
    type: 'track',
    dataSourceID: trackID,
    options: { useCursorPosition: true },
  })
}

/**
 * 各页面 handleClick 的标准实现。调用方只需提供 onPlay 与加载态：
 *
 *   const handleClick = (e: TrackRowEvent, trackID: number) =>
 *     handleTrackRowEvent(e, trackID, { onPlay, isLoading })
 */
export function handleTrackRowEvent(
  e: TrackRowEvent,
  trackID: number,
  opts: { onPlay?: (id: number) => void; isLoading?: boolean }
) {
  if (opts.isLoading) return
  if (e.type === 'contextmenu') {
    openTrackContextMenu(e, trackID)
    return
  }
  if (shouldActivateTrackRow(e, isMobileViewport())) opts.onPlay?.(trackID)
}
