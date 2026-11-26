/**
 * player.ts init() 恢复逻辑测试（2026-11-26 播放器三件套 · 状态恢复）
 *
 * init(params) 直接接收持久化对象，不触碰 localStorage（那是
 * states/player.ts 的职责）。覆盖：
 *  - 进度恢复：pendingSeek 在 Howler load 后一次性应用，且不自动播放
 *  - 音量 0（静音）恢复并同步 Howler 全局音量
 *  - shuffle 恢复：直接还原已洗好的队列，不重洗、不清空
 *  - init 笔误回归：params.state 不得污染 trackList
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  howlSeek: vi.fn(() => 0),
  howlPause: vi.fn(),
  howlPlay: vi.fn(),
  howlPlaying: vi.fn(() => false),
  howlerVolume: vi.fn(),
  howlerUnload: vi.fn(),
  howlInstances: [] as Array<{
    options: Record<string, unknown>
    handlers: Record<string, Array<() => void>>
  }>,
  fetchAudioSource: vi.fn(),
  fetchTracks: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('howler', () => {
  class Howl {
    options: Record<string, unknown>
    handlers: Record<string, Array<() => void>> = {}
    // _cacheAudio 会读 _howler._src（真实 Howler 的内部字段）
    _src: string
    seek = mocks.howlSeek
    pause = mocks.howlPause
    play = mocks.howlPlay
    playing = mocks.howlPlaying
    once(event: string, cb: () => void) {
      const list = (this.handlers[event] ??= [])
      list.push(cb)
    }
    constructor(options: Record<string, unknown> & { src?: string[] }) {
      this.options = options
      this._src = options.src?.[0] ?? ''
      mocks.howlInstances.push(this as never)
    }
  }
  return { Howl, Howler: { volume: mocks.howlerVolume, unload: mocks.howlerUnload } }
})

vi.mock('@/web/api/hooks/useTracks', () => ({
  fetchAudioSourceWithReactQuery: mocks.fetchAudioSource,
  fetchTracksWithReactQuery: mocks.fetchTracks,
}))
vi.mock('@/web/api/hooks/usePersonalFM', () => ({ fetchPersonalFMWithReactQuery: vi.fn() }))
vi.mock('@/web/api/hooks/usePlaylist', () => ({ fetchPlaylistWithReactQuery: vi.fn() }))
vi.mock('@/web/api/hooks/useAlbum', () => ({ fetchAlbumWithReactQuery: vi.fn() }))
vi.mock('@/web/api/hooks/useArtist', () => ({ fetchArtistWithReactQuery: vi.fn() }))
vi.mock('@/web/api/personalFM', () => ({ fmTrash: vi.fn() }))
vi.mock('@/web/api/r3play', () => ({ cacheAudio: vi.fn() }))
vi.mock('@/web/api/user', () => ({ scrobble: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: mocks.toast }))
vi.mock('@/web/utils/isLyricsWindow', () => ({ isLyricsWindow: false }))

import { Player, State } from '@/web/utils/player'

const lastHowl = () => mocks.howlInstances[mocks.howlInstances.length - 1]
const fireLoad = (inst: { handlers: Record<string, Array<() => void>> }) =>
  inst.handlers['load']?.forEach(cb => cb())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.howlInstances.length = 0
  mocks.fetchAudioSource.mockResolvedValue({ data: [{ url: 'https://m8.music.126.net/a.mp3' }] })
  mocks.fetchTracks.mockResolvedValue({ songs: [] })
})

describe('init() 状态恢复', () => {
  it('音量 0（静音）被恢复，并同步到 Howler 全局音量', () => {
    const p = new Player()
    p.init({ _volume: 0 })
    expect(p.volume).toBe(0)
    expect(mocks.howlerVolume).toHaveBeenCalledWith(0)
  })

  it('进度恢复：load 后 seek 到持久化位置，且只加载不自动播放', async () => {
    const p = new Player()
    p.init({ trackList: [11], _trackIndex: 0, _progress: 42, _track: { id: 11 } })

    // 恢复后立即能在 UI 读到进度（state 为 Ready，progress getter 不归零）
    expect(p.progress).toBe(42)
    expect(p.state).toBe(State.Ready)

    await vi.waitFor(() => expect(mocks.howlInstances.length).toBeGreaterThan(0))
    const inst = lastHowl()
    expect(inst.options.autoplay).toBe(false)

    fireLoad(inst)
    expect(mocks.howlSeek).toHaveBeenCalledWith(42)
    expect(p.progress).toBe(42)
    // pendingSeek 一次性消费，不残留
    expect((p as unknown as { _pendingSeek: number | null })._pendingSeek).toBeNull()
  })

  it('shuffle 恢复：直接还原已洗好的队列与原始顺序，不重洗、不清空', () => {
    const p = new Player()
    p.init({
      trackList: [33, 11, 22],
      originTrackList: [11, 22, 33],
      shuffle: true,
      _trackIndex: 1,
    })
    expect(p.trackList).toEqual([33, 11, 22])
    expect(p.originTrackList).toEqual([11, 22, 33])
    expect(p.shuffle).toBe(true)
    expect(p.trackID).toBe(11)
  })

  it('params.state 不再污染 trackList（笔误回归测试）', () => {
    const p = new Player()
    p.init({ state: 'paused', trackList: [11, 22] })
    expect(p.trackList).toEqual([11, 22])
    expect(p.state).toBe(State.Ready)
  })

  it('损坏字段单独丢弃，合法字段仍恢复', () => {
    const p = new Player()
    p.init({ _volume: 'loud', trackList: [11, 'x'], _trackIndex: -3 })
    expect(p.volume).toBe(1) // 默认
    expect(p.trackList).toEqual([])
    expect(p.trackIndex).toBe(0)
  })

  it('持久化输出带 __v 版本标记', () => {
    const p = new Player()
    expect(JSON.parse(JSON.stringify(p)).__v).toBe(1)
  })
})
