/**
 * playerState.ts 的单元测试 —— 持久化状态恢复前的逐字段校验。
 *
 * 核心约定：
 *  - 非法字段单独丢弃，不影响其他合法字段的恢复
 *  - 音量 0（静音）是合法值，必须保留（truthy 检查会丢）
 *  - legacy（无 __v）与未来版本的数据按字段形状尽力恢复
 */
import { describe, expect, it } from 'vitest'
import { parsePersistedPlayerState, sanitizePlayerState } from '@/web/utils/playerState'
import { RepeatMode } from '@/shared/playerDataTypes'

const validTrack = { id: 11, name: 'song', ar: [], al: {} }

describe('sanitizePlayerState：合法数据', () => {
  it('完整合法数据逐字段通过', () => {
    const raw = {
      __v: 1,
      _track: validTrack,
      _trackIndex: 2,
      _progress: 42.5,
      _volume: 0.8,
      _repeatMode: RepeatMode.On,
      mode: 'trackList',
      trackList: [11, 22, 33],
      originTrackList: [22, 11, 33],
      trackListSource: { type: 'playlist', id: 456 },
      fmTrackList: [77],
      shuffle: true,
      fmTrack: validTrack,
    }
    expect(sanitizePlayerState(raw)).toEqual({
      _track: validTrack,
      _trackIndex: 2,
      _progress: 42.5,
      _volume: 0.8,
      _repeatMode: RepeatMode.On,
      mode: 'trackList',
      trackList: [11, 22, 33],
      originTrackList: [22, 11, 33],
      trackListSource: { type: 'playlist', id: 456 },
      fmTrackList: [77],
      shuffle: true,
      fmTrack: validTrack,
    })
  })

  it('音量 0（静音）被保留 —— 这是 truthy 检查会丢掉的值', () => {
    expect(sanitizePlayerState({ _volume: 0 })._volume).toBe(0)
  })

  it('无 __v 的 legacy 数据正常恢复', () => {
    const out = sanitizePlayerState({ _volume: 0.5, trackList: [1, 2] })
    expect(out._volume).toBe(0.5)
    expect(out.trackList).toEqual([1, 2])
  })

  it('比当前更新的 __v 也按已知字段尽力恢复', () => {
    const out = sanitizePlayerState({ __v: 999, _volume: 0.5, futureField: 'x' })
    expect(out._volume).toBe(0.5)
    expect(out).not.toHaveProperty('futureField')
  })
})

describe('sanitizePlayerState：非法字段逐项丢弃', () => {
  it('非对象输入返回空', () => {
    expect(sanitizePlayerState(null)).toEqual({})
    expect(sanitizePlayerState('paused')).toEqual({})
    expect(sanitizePlayerState(undefined)).toEqual({})
    expect(sanitizePlayerState(42)).toEqual({})
  })

  it('字符串音量被丢弃，但同对象的合法字段仍恢复', () => {
    const out = sanitizePlayerState({ _volume: 'loud', _trackIndex: 3 })
    expect(out).not.toHaveProperty('_volume')
    expect(out._trackIndex).toBe(3)
  })

  it('越界音量（>1 / <0）被丢弃', () => {
    expect(sanitizePlayerState({ _volume: 1.5 })).not.toHaveProperty('_volume')
    expect(sanitizePlayerState({ _volume: -0.1 })).not.toHaveProperty('_volume')
  })

  it('负的 / 非有限的 trackIndex 被丢弃', () => {
    expect(sanitizePlayerState({ _trackIndex: -1 })).not.toHaveProperty('_trackIndex')
    expect(sanitizePlayerState({ _trackIndex: NaN })).not.toHaveProperty('_trackIndex')
    expect(sanitizePlayerState({ _trackIndex: Infinity })).not.toHaveProperty('_trackIndex')
  })

  it('0 或负的进度被丢弃（默认就是 0，无需恢复）', () => {
    expect(sanitizePlayerState({ _progress: 0 })).not.toHaveProperty('_progress')
    expect(sanitizePlayerState({ _progress: -5 })).not.toHaveProperty('_progress')
  })

  it('非法 repeatMode / mode 被丢弃', () => {
    expect(sanitizePlayerState({ _repeatMode: 'bogus' })).not.toHaveProperty('_repeatMode')
    expect(sanitizePlayerState({ mode: 'bogus' })).not.toHaveProperty('mode')
  })

  it('混入非数字的 trackList 整体丢弃（宁可不恢复，不可恢复到坏队列）', () => {
    expect(sanitizePlayerState({ trackList: [11, 'x', 33] })).not.toHaveProperty('trackList')
    expect(sanitizePlayerState({ trackList: 'not-array' })).not.toHaveProperty('trackList')
  })

  it('缺少数字 id 的 _track / fmTrack 被丢弃', () => {
    expect(sanitizePlayerState({ _track: { name: 'no-id' } })).not.toHaveProperty('_track')
    expect(sanitizePlayerState({ fmTrack: null })).not.toHaveProperty('fmTrack')
  })

  it('非法 trackListSource 被丢弃', () => {
    expect(sanitizePlayerState({ trackListSource: { type: 'bogus', id: 1 } })).not.toHaveProperty(
      'trackListSource'
    )
    expect(sanitizePlayerState({ trackListSource: { type: 'album' } })).not.toHaveProperty(
      'trackListSource'
    )
  })

  it('非布尔 shuffle 被丢弃', () => {
    expect(sanitizePlayerState({ shuffle: 'yes' })).not.toHaveProperty('shuffle')
    expect(sanitizePlayerState({ shuffle: false }).shuffle).toBe(false)
  })

  it('运行态脏字段（_progressInterval 等）不会进入恢复结果', () => {
    const out = sanitizePlayerState({ _progressInterval: 123, state: 'playing', __v: 1 })
    expect(out).toEqual({})
  })
})

describe('parsePersistedPlayerState：损坏数据不打爆启动', () => {
  it('非法 JSON 返回 {}', () => {
    expect(parsePersistedPlayerState('{invalid json')).toEqual({})
    expect(parsePersistedPlayerState('undefined')).toEqual({})
  })

  it('null / 空字符串返回 {}', () => {
    expect(parsePersistedPlayerState(null)).toEqual({})
    expect(parsePersistedPlayerState('')).toEqual({})
  })

  it('非对象 JSON（数字、字符串、数组语义外的值）返回 {}', () => {
    expect(parsePersistedPlayerState('42')).toEqual({})
    expect(parsePersistedPlayerState('"paused"')).toEqual({})
    expect(parsePersistedPlayerState('null')).toEqual({})
  })

  it('合法对象原样返回', () => {
    expect(parsePersistedPlayerState('{"_volume":0,"trackList":[1,2]}')).toEqual({
      _volume: 0,
      trackList: [1, 2],
    })
  })
})
