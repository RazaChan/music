/**
 * trackActivation.ts 单元测试 —— 统一曲目激活规则
 *
 * 规则（2026-11-27 产品决策）：
 *  - 移动布局：单击播放
 *  - 桌面：双击播放，单击不播放（留给未来的选中态）
 *  - 键盘：Enter 播放
 *  - contextmenu 永不触发播放（走右键菜单）
 */
import { describe, expect, it } from 'vitest'
import {
  isTrackPlayKey,
  shouldActivateTrackRow,
  shouldPlayOnClick,
} from '@/web/utils/trackActivation'

const click = (detail: number) => ({ type: 'click', detail })
const contextmenu = { type: 'contextmenu', detail: 0 }
const keydown = (key: string) => ({ type: 'keydown', key })

describe('shouldPlayOnClick', () => {
  it('移动布局：单击播放', () => {
    expect(shouldPlayOnClick(click(1), true)).toBe(true)
  })

  it('桌面：单击不播放、双击播放', () => {
    expect(shouldPlayOnClick(click(1), false)).toBe(false)
    expect(shouldPlayOnClick(click(2), false)).toBe(true)
  })

  it('contextmenu 不触发播放', () => {
    expect(shouldPlayOnClick(contextmenu, true)).toBe(false)
    expect(shouldPlayOnClick(contextmenu, false)).toBe(false)
  })
})

describe('isTrackPlayKey', () => {
  it('Enter 触发，其他键不触发', () => {
    expect(isTrackPlayKey(keydown('Enter'))).toBe(true)
    expect(isTrackPlayKey(keydown('Space'))).toBe(false)
    expect(isTrackPlayKey(keydown('a'))).toBe(false)
  })
})

describe('shouldActivateTrackRow（鼠标 + 键盘总判定）', () => {
  it('桌面 Enter 播放（键盘入口与平台无关）', () => {
    expect(shouldActivateTrackRow(keydown('Enter') as never, false)).toBe(true)
  })

  it('移动布局单击播放、桌面单击不播放', () => {
    expect(shouldActivateTrackRow(click(1) as never, true)).toBe(true)
    expect(shouldActivateTrackRow(click(1) as never, false)).toBe(false)
  })

  it('桌面双击播放', () => {
    expect(shouldActivateTrackRow(click(2) as never, false)).toBe(true)
  })
})
