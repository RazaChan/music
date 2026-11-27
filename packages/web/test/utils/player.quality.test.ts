/**
 * player.ts 音质链路测试（阶段 2 批次 2）
 *
 * 覆盖：
 *  - _fetchAudioSource 按 settings.audioQuality 请求对应档位
 *  - 实际音质信息（上游/缓存回报的真实档位）落到 player.audioQuality
 *  - reloadAudioSource：切档位后重载当前曲目，保持进度与播放状态
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
    options: Record<string, unknown> & { autoplay?: boolean }
    handlers: Record<string, Array<() => void>>
  }>,
  fetchAudioSource: vi.fn(),
  fetchTracks: vi.fn(),
  toast: vi.fn(),
  settings: { audioQuality: 'exhigh', qqCookie: '', miguCookie: '', jooxCookie: '' },
}))

vi.mock('howler', () => {
  class Howl {
    options: Record<string, unknown> & { autoplay?: boolean }
    handlers: Record<string, Array<() => void>> = {}
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
vi.mock('@/web/states/settings', () => ({ default: mocks.settings }))

import { Mode, Player, State } from '@/web/utils/player'

function makePlayer(trackList: number[], trackIndex: number): Player {
  const p = new Player()
  p.trackList = [...trackList]
  p.mode = Mode.TrackList
  ;(p as unknown as { _trackIndex: number })._trackIndex = trackIndex
  return p
}

const playAudio = (p: Player, autoplay = true) =>
  (p as unknown as { _playAudio: (a?: boolean) => Promise<void> })._playAudio(autoplay)
const lastHowl = () => mocks.howlInstances[mocks.howlInstances.length - 1]
const fireLoad = () => lastHowl().handlers['load']?.forEach(cb => cb())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.howlInstances.length = 0
  mocks.settings.audioQuality = 'exhigh'
  mocks.howlSeek.mockReturnValue(0)
  mocks.fetchAudioSource.mockResolvedValue({
    data: [{ url: 'https://m8.music.126.net/a.mp3', level: 'exhigh', br: 320000 }],
  })
  mocks.fetchTracks.mockImplementation(({ ids }: { ids: number[] }) =>
    Promise.resolve({ songs: ids.map(id => ({ id, name: `t${id}`, ar: [], al: {} })) })
  )
})

describe('音质档位传递与实际音质状态', () => {
  it('_fetchAudioSource 按 settings.audioQuality 请求档位', async () => {
    mocks.settings.audioQuality = 'lossless'
    const p = makePlayer([11], 0)
    await playAudio(p)
    expect(mocks.fetchAudioSource).toHaveBeenCalledWith({ id: 11, level: 'lossless' })
  })

  it('成功取流后实际音质信息落到 player.audioQuality', async () => {
    mocks.fetchAudioSource.mockResolvedValue({
      data: [{ url: 'https://m8.music.126.net/a.mp3', level: 'standard', br: 128000, source: 'netease' }],
    })
    const p = makePlayer([11], 0)
    await playAudio(p)
    // 请求 exhigh 但上游按权益降级给了 standard —— 如实记录
    expect(p.audioQuality).toEqual({ level: 'standard', br: 128000, source: 'netease' })
  })

  it('切歌时清空上一首的音质信息', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    expect(p.audioQuality).not.toBeNull()
    await p.playTrack(22)
    // _setStateToLoading 清空；新曲目加载完成后会写入新值
    await vi.waitFor(() => expect(p.audioQuality?.level).toBe('exhigh'))
  })
})

describe('reloadAudioSource：切档位立即生效', () => {
  it('播放中重载：重新取流、保持播放、进度经 pendingSeek 恢复', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    expect(p.state).toBe(State.Playing)
    const fetchCountBefore = mocks.fetchAudioSource.mock.calls.length

    mocks.howlSeek.mockReturnValue(42) // 模拟已播放到 42s
    mocks.settings.audioQuality = 'lossless'
    await p.reloadAudioSource()

    // 重新按新档位取流
    expect(mocks.fetchAudioSource.mock.calls.length).toBeGreaterThan(fetchCountBefore)
    expect(mocks.fetchAudioSource).toHaveBeenLastCalledWith({ id: 11, level: 'lossless' })
    // 新 Howl 保持自动播放
    expect(lastHowl().options.autoplay).toBe(true)
    expect(p.state).toBe(State.Playing)
    // load 后 seek 回原进度
    fireLoad()
    expect(mocks.howlSeek).toHaveBeenCalledWith(42)
    expect(p.progress).toBe(42)
  })

  it('暂停中重载：不自动播放，静默加载后回到 Ready', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p, false)
    p.state = State.Paused
    mocks.howlSeek.mockReturnValue(30)

    await p.reloadAudioSource()
    expect(lastHowl().options.autoplay).toBe(false)
    expect(p.state).not.toBe(State.Playing)
    fireLoad()
    expect(p.state).toBe(State.Ready)
    expect(p.progress).toBe(30)
  })

  it('无当前曲目时不做事', async () => {
    const p = makePlayer([], 0)
    const calls = mocks.fetchAudioSource.mock.calls.length
    await p.reloadAudioSource()
    expect(mocks.fetchAudioSource.mock.calls.length).toBe(calls)
  })
})
