/**
 * player.ts 音源失败生命周期测试（2026-11-26 播放器三件套 · 失败处理）
 *
 * 目标行为：
 *  - 每首曲目失败时先重试一次（重新取 URL，应对过期链接），不计数不跳歌
 *  - 重试后仍失败：计数 +1 并跳下一首
 *  - 连续失败达到上限 min(列表长度, 10)：暂停并提示，不无限跳歌
 *  - 成功 load 后计数清零；过期回调（trackID 已变）被忽略
 *  - playTrack 找不到歌曲 / fetch 曲目失败：state 不卡 Loading
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
    options: Record<string, (...args: unknown[]) => void>
    handlers: Record<string, Array<() => void>>
  }>,
  fetchAudioSource: vi.fn(),
  fetchTracks: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('howler', () => {
  class Howl {
    options: Record<string, (...args: unknown[]) => void>
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
    constructor(options: Record<string, (...args: unknown[]) => void> & { src?: string[] }) {
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
// player.ts 依赖 settings（audioQuality / 源站 cookie），测试里固定为可控对象
vi.mock('@/web/states/settings', () => ({
  default: { audioQuality: 'exhigh', qqCookie: '', miguCookie: '', jooxCookie: '' },
}))

import { Mode, Player, State } from '@/web/utils/player'
import { RepeatMode } from '@/shared/playerDataTypes'

function makePlayer(trackList: number[], trackIndex: number): Player {
  const p = new Player()
  p.trackList = [...trackList]
  p.mode = Mode.TrackList
  ;(p as unknown as { _trackIndex: number })._trackIndex = trackIndex
  return p
}

const playAudio = (p: Player, autoplay = true) =>
  (p as unknown as { _playAudio: (a?: boolean) => Promise<void> })._playAudio(autoplay)
const internals = (p: Player) =>
  p as unknown as { _consecutiveFailures: number; _retriedTrackID: number | null }

const lastHowl = () => mocks.howlInstances[mocks.howlInstances.length - 1]
const fireLoad = () => lastHowl().handlers['load']?.forEach(cb => cb())
const fireError = (type: 'onloaderror' | 'onplayerror' = 'onloaderror') =>
  lastHowl().options[type]?.()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.howlInstances.length = 0
  mocks.fetchAudioSource.mockResolvedValue({ data: [{ url: 'https://m8.music.126.net/a.mp3' }] })
  mocks.fetchTracks.mockImplementation(({ ids }: { ids: number[] }) =>
    Promise.resolve({ songs: ids.map(id => ({ id, name: `t${id}`, ar: [], al: {} })) })
  )
})

describe('音源失败生命周期', () => {
  it('首次失败重试一次（重新取 URL），不计数、不跳歌', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    expect(mocks.howlInstances.length).toBe(1)

    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))
    expect(mocks.fetchAudioSource).toHaveBeenCalledTimes(2)
    expect(internals(p)._consecutiveFailures).toBe(0)
    expect(p.trackIndex).toBe(0)
  })

  it('重试后再次失败：计数 +1 并跳到下一首', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))

    fireError()
    await vi.waitFor(() => expect(p.trackIndex).toBe(1))
    expect(internals(p)._consecutiveFailures).toBe(1)
    expect(mocks.toast).toHaveBeenCalledWith('无法播放此歌曲')
    // 跳到 22 后会为它建新 Howl
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(3))
  })

  it('连续失败达到上限 min(列表长度,10) 后暂停并提示，不无限跳歌', async () => {
    const p = makePlayer([11, 22, 33], 0)
    p.repeatMode = RepeatMode.On // 环绕模式下若无上限会无限循环
    await playAudio(p) // Howl#1 (11)

    // 每首：失败 → 重试（新 Howl）→ 再失败 → 跳下一首（新 Howl）
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2)) // retry 11
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(3)) // advance → 22
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(4)) // retry 22
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(5)) // advance → 33
    fireError()
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(6)) // retry 33
    fireError() // 第 3 次连续失败 → 达到上限

    expect(p.state).toBe(State.Paused)
    expect(mocks.toast).toHaveBeenCalledWith('多首歌曲无法播放，已停止播放')
    // 不再推进：之后不再创建新 Howl
    await new Promise(r => setTimeout(r, 20))
    expect(mocks.howlInstances.length).toBe(6)
    // 每首只 fetch 了一次元数据（11 是测试直接 playAudio 的）
    expect(mocks.fetchTracks).toHaveBeenCalledTimes(2)
  })

  it('过期回调被忽略：错误回来时 trackID 已变', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    const staleHowl = lastHowl()

    await p.playTrack(22)
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))

    staleHowl.options.onloaderror()
    expect(internals(p)._consecutiveFailures).toBe(0)
    expect(internals(p)._retriedTrackID).toBeNull()
    expect(p.trackIndex).toBe(1)
  })

  it('成功 load 后失败计数与重试标记清零', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    fireError() // 重试
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))

    fireLoad()
    expect(internals(p)._consecutiveFailures).toBe(0)
    expect(internals(p)._retriedTrackID).toBeNull()
  })

  it('接口无 URL 也走统一失败入口：重试一次后跳歌', async () => {
    mocks.fetchAudioSource.mockResolvedValue({ data: [] })
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    // 重试重新取了一次 URL
    await vi.waitFor(() => expect(mocks.fetchAudioSource).toHaveBeenCalledTimes(2))
    // 仍无 URL → 跳到 22（随后 22 也会失败并触发上限停止，属于预期连锁）
    await vi.waitFor(() => expect(p.trackIndex).toBe(1))
    // 从未创建过 Howl（没有可用 URL）
    expect(mocks.howlInstances.length).toBe(0)
  })

  it('onplayerror 与 onloaderror 走同一入口', async () => {
    const p = makePlayer([11, 22], 0)
    await playAudio(p)
    fireError('onplayerror')
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))
    expect(mocks.fetchAudioSource).toHaveBeenCalledTimes(2)
    expect(internals(p)._consecutiveFailures).toBe(0)
  })

  it('恢复路径（autoplay=false）的失败推进不自动播放，静默加载后回到 Ready', async () => {
    const p = makePlayer([11, 22], 0)
    p.state = State.Ready
    await playAudio(p, false) // 模拟 init 的恢复加载（只加载不播）
    fireError() // 失败 → 重试
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(2))
    fireError() // 再失败 → 推进到 22，必须保留 autoplay=false
    await vi.waitFor(() => expect(mocks.howlInstances.length).toBe(3))

    expect(p.trackIndex).toBe(1)
    expect(lastHowl().options['autoplay']).toBe(false)
    expect(p.state).not.toBe(State.Playing)

    // 静默加载完成：从 Loading 回到 Ready，不卡加载态
    fireLoad()
    expect(p.state).toBe(State.Ready)
  })
})

describe('playTrack / _playTrack 的状态归宿', () => {
  it('playTrack 找不到歌曲：toast 后返回，不打断当前播放状态', async () => {
    const p = makePlayer([11, 22], 0)
    p.state = State.Playing
    await p.playTrack(999)
    expect(mocks.toast).toHaveBeenCalledWith('播放失败，歌曲不在列表内')
    expect(p.trackIndex).toBe(0)
    expect(p.state).toBe(State.Playing)
    expect(mocks.howlPause).not.toHaveBeenCalled()
  })

  it('fetch 曲目信息失败：state 回到 Ready，不卡 Loading', async () => {
    mocks.fetchTracks.mockResolvedValue({ songs: [] })
    const p = makePlayer([11], 0)
    // _playTrack 在 playTrack 内是 fire-and-forget，用 waitFor 等异步链完成
    p.playTrack(11)
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('加载歌曲信息失败'))
    expect(p.state).toBe(State.Ready)
  })
})
