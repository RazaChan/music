import { Howl, Howler } from 'howler'
import {
  fetchAudioSourceWithReactQuery,
  fetchTracksWithReactQuery,
} from '@/web/api/hooks/useTracks'
import { fetchPersonalFMWithReactQuery } from '@/web/api/hooks/usePersonalFM'
import { fmTrash } from '@/web/api/personalFM'
import { cacheAudio } from '@/web/api/r3play'
import { clamp, random } from 'lodash-es'
import axios from 'axios'
import { resizeImage } from './common'
import { fetchPlaylistWithReactQuery } from '@/web/api/hooks/usePlaylist'
import { fetchAlbumWithReactQuery } from '@/web/api/hooks/useAlbum'
import { RepeatMode } from '@/shared/playerDataTypes'
import toast from 'react-hot-toast'
import { scrobble } from '@/web/api/user'
import { fetchArtistWithReactQuery } from '../api/hooks/useArtist'
import { appName } from './const'
import { isLyricsWindow } from './isLyricsWindow'
import { PLAYER_STATE_VERSION, sanitizePlayerState } from './playerState'
import settings from '@/web/states/settings'

type TrackID = number
export enum TrackListSourceType {
  Album = 'album',
  Playlist = 'playlist',
  Artist = 'artist',
}
interface TrackListSource {
  type: TrackListSourceType
  id: number
}

export enum Mode {
  TrackList = 'trackList',
  FM = 'fm',
}
export enum State {
  Initializing = 'initializing',
  Ready = 'ready',
  Playing = 'playing',
  Paused = 'paused',
  Loading = 'loading',
}

const PLAY_PAUSE_FADE_DURATION = 200

let _howler = new Howl({ src: [''], format: ['mp3', 'flac'] })
export class Player {
  private _track: Track | null = null
  private _trackIndex: number = 0
  private _progress: number = 0
  private _progressInterval: ReturnType<typeof setInterval> | undefined
  private _volume: number = 1 // 0 to 1
  private _repeatMode: RepeatMode = RepeatMode.Off

  state: State = State.Initializing
  mode: Mode = Mode.TrackList
  trackList: TrackID[] = []
  originTrackList: TrackID[] = []
  trackListSource: TrackListSource | null = null
  fmTrackList: TrackID[] = []
  shuffle: boolean = false
  fmTrack: Track | null = null
  /** 当前曲目音源的实际音质信息（level 为上游/缓存回报的真实档位，可能因权益降级） */
  audioQuality: { level: string | null; br: number | null; source: string | null } | null = null
  /** 持久化数据版本标记，随 JSON.stringify(player) 一起写入 localStorage */
  __v: number = PLAYER_STATE_VERSION

  /**
   * 恢复播放时的待应用进度（秒）。init() 设置后，由 _playAudioViaHowler 的
   * load 回调一次性消费；任何显式切歌（_setStateToLoading）都会取消它。
   */
  private _pendingSeek: number | null = null
  /** 连续播放失败计数，成功 load 时清零 */
  private _consecutiveFailures: number = 0
  /** 本曲目是否已做过一次「重新取 URL」重试（CDN 链接会过期） */
  private _retriedTrackID: TrackID | null = null

  /**
   * Persistence hook, set by the store (states/player.ts). Invoked after a
   * user-initiated seek — a seek only mutates `_progress`, which the
   * throttled persistence deliberately skips, so the resume position is
   * written eagerly through this hook instead.
   */
  _onUserSeek: (() => void) | null = null

  init(params: { [key: string]: any }) {
    // 逐字段校验恢复：非法字段单独丢弃（见 utils/playerState.ts），
    // 音量 0、进度、原始队列都在这里恢复。
    const restored = sanitizePlayerState(params)
    if (restored._track !== undefined) this._track = restored._track
    if (restored._trackIndex !== undefined) this._trackIndex = restored._trackIndex
    // 经 setter 恢复，同步 Howler 全局音量；音量为 0（静音）也能恢复
    if (restored._volume !== undefined) this.volume = restored._volume
    if (restored._repeatMode !== undefined) this._repeatMode = restored._repeatMode
    if (restored.mode !== undefined) this.mode = restored.mode
    if (restored.trackList !== undefined) this.trackList = restored.trackList
    // 已洗好的队列顺序直接还原（含 originTrackList 供取消随机时恢复），
    // 不再调 shufflePlayList() 重洗 —— 那会把队列清空或改变顺序
    if (restored.originTrackList !== undefined) this.originTrackList = restored.originTrackList
    if (restored.trackListSource !== undefined) this.trackListSource = restored.trackListSource
    if (restored.fmTrackList !== undefined) this.fmTrackList = restored.fmTrackList
    if (restored.shuffle !== undefined) this.shuffle = restored.shuffle
    if (restored.fmTrack !== undefined) this.fmTrack = restored.fmTrack

    this.state = State.Ready
    // The desktop-lyrics window is a read-only consumer of player state
    // (progress/track synced via IPC). Loading audio there would create a
    // muted Howl with html5 preload=auto that downloads the full track, and
    // _initFM would fire network calls — all for a window that never plays.
    if (!isLyricsWindow) {
      // 恢复上次进度：pendingSeek 在音频 load 后应用，播放仍保持暂停
      if (restored._progress !== undefined && this.trackID) {
        this._progress = restored._progress
        this._pendingSeek = restored._progress
      }
      if (this.trackID) this._playAudio(false) // just load the audio, not play
      this._initFM()
    }
    this._initMediaSession()

    // window.ipcRenderer?.send(IpcChannels.Repeat, { mode: this._repeatMode })
  }

  get howler() {
    return _howler
  }

  /**
   * Get prev track index
   */
  get _prevTrackIndex(): number | undefined {
    switch (this.repeatMode) {
      case RepeatMode.One:
        return this._trackIndex
      // shuffle 开启时列表已被 shufflePlayList() 物理洗牌，
      // ShuffleOff 与 Off 一样不环绕，Shuffle 与 On 一样环绕
      case RepeatMode.Off:
      case RepeatMode.ShuffleOff:
        if (this._trackIndex === 0) return 0
        return this._trackIndex - 1
      case RepeatMode.On:
      case RepeatMode.Shuffle:
        if (this._trackIndex - 1 < 0) return this.trackList.length - 1
        return this._trackIndex - 1
      default:
        return undefined
    }
  }

  /**
   * Get next track index
   */
  get _nextTrackIndex(): number | undefined {
    switch (this.repeatMode) {
      case RepeatMode.One:
        return this._trackIndex
      case RepeatMode.Off:
      case RepeatMode.ShuffleOff:
        if (this._trackIndex + 1 >= this.trackList.length) return
        return this._trackIndex + 1
      case RepeatMode.On:
      case RepeatMode.Shuffle:
        if (this._trackIndex + 1 >= this.trackList.length) return 0
        return this._trackIndex + 1
      default:
        return undefined
    }
  }

  /**
   * Get current playing track ID
   */
  get trackID(): TrackID {
    if (this.mode === Mode.TrackList) {
      const { trackList, _trackIndex } = this
      return trackList[_trackIndex] ?? 0
    }
    return this.fmTrackList[0] ?? 0
  }

  /**
   * Set current playing track ID
   * !!
   */
  set trackID(value) {
    const { trackList, _trackIndex } = this
    trackList[_trackIndex] = value
    this.fmTrackList[0] = value
  }

  /**
   * Get current playing track
   */
  get track(): Track | null {
    return this.mode === Mode.FM ? this.fmTrack : this._track
  }

  set track(value) {
    this._track = value
  }

  get trackIndex() {
    return this._trackIndex
  }

  /**
   * Get/Set progress of current track
   */
  get progress(): number {
    return this.state === State.Loading ? 0 : this._progress
  }
  set progress(value) {
    this._progress = value
    _howler.seek(value)
    this._onUserSeek?.()
  }

  /**
   * Read playback time directly from howler (no 80ms throttle).
   * Used by RAF-driven consumers (lyrics karaoke, progress bar) that want
   * frame-accurate sync without paying for valtio snapshot churn.
   */
  liveCurrentTime(): number {
    if (this.state === State.Loading) return 0
    // The lyrics window has no Howl of its own (audio plays in the main
    // window); its progress is pushed via IPC into `_progress`.
    if (isLyricsWindow) return this._progress
    try {
      const t = _howler.seek()
      if (typeof t === 'number' && !isNaN(t)) return t
    } catch {
      /* howler not ready */
    }
    return this._progress
  }

  /**
   * Get/Set current volume
   */
  get volume(): number {
    return this._volume
  }
  set volume(value) {
    this._volume = clamp(value, 0, 1)
    Howler.volume(this._volume)
  }

  get repeatMode(): RepeatMode {
    return this._repeatMode
  }
  set repeatMode(value) {
    this._repeatMode = value
    // window.ipcRenderer?.send(IpcChannels.Repeat, { mode: this._repeatMode })
  }

  private async _initFM() {
    if (this.fmTrackList.length === 0) await this._loadMoreFMTracks()

    const trackId = this.fmTrackList[0]
    const track = await this._fetchTrack(trackId)
    if (track) this.fmTrack = track

    this._loadMoreFMTracks()
  }

  private _setStateToLoading() {
    this._scrobble()
    this.state = State.Loading
    // 显式切歌取消恢复期的 pendingSeek（init 的恢复路径不经过这里）
    this._pendingSeek = null
    // 旧曲目的音质信息不再代表当前加载中的曲目
    this.audioQuality = null
    _howler.pause()
  }

  private async _setupProgressInterval() {
    // Persisted progress for resume / scrobble / IPC SyncProgress. The
    // smooth UI progress bar is driven by `subscribeAudioTime`'s RAF
    // loop (see utils/audioTime.ts) which reads `_howler.seek()` at
    // paint time — so this interval only needs to be frequent enough
    // for resume-after-reload accuracy and scrobble correctness.
    // 500ms cuts valtio rerenders and IPC SyncProgress traffic by ~6x
    // vs. the old 80ms without any user-visible regression.
    this._progressInterval = setInterval(() => {
      if (this.state === State.Playing) this._progress = _howler.seek()
    }, 500)
  }

  private async _scrobble() {
    if (!this.track?.id || !this.trackListSource?.id) {
      return
    }
    if (this.progress <= this.track.dt / 1000 / 3) {
      return
    }
    scrobble({
      id: this.track.id,
      sourceid: this.trackListSource.id,
      time: ~~this.progress,
    })
  }

  /**
   * Fetch track details from Netease based on this.trackID
   */
  private async _fetchTrack(trackID: TrackID) {
    const response = await fetchTracksWithReactQuery({ ids: [trackID] })
    return response?.songs?.length ? response.songs[0] : null
  }

  // set play device
  setDevice(deviceId: MediaDeviceInfo['deviceId']) {
    // Get the currently playing audio element
    const audioElement = (_howler as any)._sounds[0]._node
    audioElement
      .setSinkId(deviceId)
      .then(() => {
        console.log('Audio output device set successfully')
      })
      .catch((error: any) => {
        console.error('Error setting audio output device:', error)
      })
  }

  async getAudioSource(track_id: TrackID) {
    return await this._fetchAudioSource(track_id)
  }

  /**
   * Fetch track audio source url from Netease
   * @param {TrackID} trackID
   */
  private async _fetchAudioSource(trackID: TrackID) {
    try {
      // 按用户设置的音质档位请求；queryKey 含 params（含 level），切档位不会命中旧缓存
      const response = await fetchAudioSourceWithReactQuery({
        id: trackID,
        level: settings.audioQuality,
      })
      let audio = response.data?.[0]?.url ?? null
      if (audio && audio.includes('126.net')) {
        audio = audio.replace('http://', 'https://')
      }
      const info = response.data?.[0]
      return {
        audio,
        id: trackID,
        // 实际音质信息（上游按权益自动降级后的真实档位；缓存命中时为缓存档位）
        quality: info
          ? {
              level: info.level ?? null,
              br: info.br ?? null,
              source: info.source ?? null,
            }
          : null,
      }
    } catch {
      // 与「无数据」分支统一返回 null，调用方只需判断 !audio
      return {
        audio: null,
        id: trackID,
        quality: null,
      }
    }
  }

  /**
   * Play a track based on this.trackID
   * @param autoplay 透传给 _playAudio —— 恢复路径（false）的失败推进不得自动出声
   */
  private async _playTrack(autoplay: boolean = true) {
    const id = this.trackID
    if (!id) return
    this.state = State.Loading
    // fetch 抛错（网络/上游 500）与返回空同样处理 —— 本方法常被
    // fire-and-forget 调用，未捕获的 rejection 会变成全局未处理异常
    let track: Track | null = null
    try {
      track = await this._fetchTrack(id)
    } catch {
      track = null
    }
    if (!track) {
      toast('加载歌曲信息失败')
      // 不能停留在 Loading —— 那会让 UI 永久卡在加载态
      this.state = State.Ready
      return
    }
    if (this.mode === Mode.TrackList) this._track = track
    if (this.mode === Mode.FM) this.fmTrack = track
    this._updateMediaSessionMetaData()
    this._playAudio(autoplay)
  }

  /**
   * Play audio via howler
   */
  private async _playAudio(autoplay: boolean = true) {
    // 恢复期的 pendingSeek 拥有进度值，不能清零（见 init）
    if (this._pendingSeek === null) this._progress = 0
    const { audio, id, quality } = await this._fetchAudioSource(this.trackID)

    // 过期响应：用户已经切到别的歌了
    if (this.trackID !== id) return
    if (!audio) {
      this._handlePlaybackFailure(id, autoplay)
      return
    }
    this.audioQuality = quality
    this._playAudioViaHowler(audio, id, autoplay)
  }

  /**
   * 统一的播放失败处理（无可用 URL / Howler load 错误 / play 错误）。
   *
   * 策略：每首曲目先重试一次（重新取 URL —— CDN 链接会过期），仍失败则
   * 计入连续失败并跳下一首；连续失败达到 min(列表长度, 10) 说明整列大概率
   * 不可播（断网、VIP 限定等），暂停并提示，而不是无限跳歌。
   */
  private _handlePlaybackFailure(id: TrackID, autoplay: boolean) {
    // 过期回调：错误回来时已经切到别的歌了
    if (this.trackID !== id) return

    if (this._retriedTrackID !== id) {
      this._retriedTrackID = id
      this._playAudio(autoplay)
      return
    }

    this._consecutiveFailures += 1
    const listLength = this.mode === Mode.FM ? this.fmTrackList.length : this.trackList.length
    const cap = Math.min(Math.max(listLength, 1), 10)
    if (this._consecutiveFailures >= cap) {
      this._consecutiveFailures = 0
      this._retriedTrackID = null
      toast('多首歌曲无法播放，已停止播放')
      this.pause()
      return
    }
    toast('无法播放此歌曲')
    // 推进时保留原始 autoplay 意图：恢复路径（false）的失败推进不得自动出声
    this.nextTrack(false, autoplay)
  }

  private async _playAudioViaHowler(audio: string, id: number, autoplay: boolean = true) {
    Howler.unload()

    const url = audio.includes('?') ? `${audio}&dash-id=${id}` : `${audio}?dash-id=${id}`
    const howler = new Howl({
      src: [url],
      format: ['mp3', 'flac', 'webm'],
      html5: true,
      autoplay,
      volume: 1,
      onend: () => {
        this._howlerOnEndCallback()
      },
      onloaderror: () => {
        this._handlePlaybackFailure(id, autoplay)
      },
      onplayerror: () => {
        this._handlePlaybackFailure(id, autoplay)
      },
    })
    _howler = howler

    // 设置 crossOrigin 以支持 Web Audio API 分析（呼吸灯效果）
    // 必须在 src 触发实际网络请求前设置，否则音频会被标记为跨域污染，
    // AnalyserNode.getByteFrequencyData 会持续返回全 0。
    // 由于 Howler 在 new Howl() 内部已经赋值 src，这里需要重新 load() 一次
    // 强制带上 Origin 请求头重新拉取（NetEase CDN 已配置 ACAO: *）。
    try {
      const node = (howler as any)._sounds?.[0]?._node
      if (node && node instanceof HTMLMediaElement && node.crossOrigin !== 'anonymous') {
        node.crossOrigin = 'anonymous'
        // 重新触发带 CORS 的请求；不会打断 autoplay，因为 Howler 还会在 canplay 后调用 play()
        try {
          node.load()
        } catch {
          /* ignore */
        }
      }
    } catch { /* ignore */ }

    ;(window as any).howler = howler
    if (autoplay) {
      this.play()
      this.state = State.Playing
    }
    _howler.once('load', () => {
      // 恢复期的进度在这里一次性应用（init 设置的 pendingSeek）
      if (this._pendingSeek !== null) {
        const resumeAt = this._pendingSeek
        this._pendingSeek = null
        this._progress = resumeAt
        try {
          _howler.seek(resumeAt)
        } catch {
          /* ignore */
        }
      }
      // 静默加载（恢复 / 失败推进且 autoplay=false）完成后回到 Ready，
      // 不能卡在 Loading
      if (!autoplay && this.state === State.Loading) this.state = State.Ready
      // 成功加载即视为播放链路恢复，清零失败计数
      this._consecutiveFailures = 0
      this._retriedTrackID = null
      this._cacheAudio((_howler as any)._src)
    })

    if (!this._progressInterval) {
      this._setupProgressInterval()
    }

  }

  private _howlerOnEndCallback() {
    if (this.mode !== Mode.FM && this.repeatMode === RepeatMode.One) {
      _howler.seek(0)
      _howler.play()
    } else {
      this.nextTrack()
    }
  }

  private async _cacheAudio(audio: string) {
    if (audio.includes(appName.toLowerCase()) || !window.ipcRenderer) return
    const id = Number(new URL(audio).searchParams.get('dash-id'))
    if (isNaN(id) || !id) return
    // audio info —— 用与播放相同的音质档位请求，响应里的 br/level 才是这份文件的真实值
    const response = await fetchAudioSourceWithReactQuery({ id, level: settings.audioQuality })
    // 缓存按 (id, level) 键控 —— 用接口回报的实际档位（缓存命中时也是真实值）
    const level = response?.data?.[0]?.level
    // 缓存
    cacheAudio(id, audio, response?.data?.[0]?.br, level)
  }

  private async _nextFMTrack(autoplay: boolean = true) {
    const prefetchNextTrack = async () => {
      const prefetchTrackID = this.fmTrackList[1]
      const track = await this._fetchTrack(prefetchTrackID)
      if (track?.al?.picUrl) {
        axios.get(resizeImage(track.al.picUrl, 'md'))
        axios.get(resizeImage(track.al.picUrl, 'xs'))
      }
    }

    this.fmTrackList.shift()
    if (this.fmTrackList.length === 0) await this._loadMoreFMTracks()
    this._playTrack(autoplay)

    this.fmTrackList.length <= 1 ? await this._loadMoreFMTracks() : this._loadMoreFMTracks()
    prefetchNextTrack()
  }

  private async _loadMoreFMTracks() {
    if (this.fmTrackList.length <= 5) {
      const response = await fetchPersonalFMWithReactQuery()
      const ids = (response?.data?.map(r => r.id) ?? []).filter(r => !this.fmTrackList.includes(r))
      this.fmTrackList.push(...ids)
    }
  }

  /**
   * Play current track
   * @param {boolean} fade fade in
   */
  play(fade: boolean = false) {
    if (_howler.playing()) {
      this.state = State.Playing
      return
    }
    _howler.play()
    if (fade) {
      this.state = State.Playing
      _howler.once('play', () => {
        _howler.fade(0, this._volume, PLAY_PAUSE_FADE_DURATION)
      })
    } else {
      this.state = State.Playing
    }
  }

  /**
   * Pause current track
   * @param {boolean} fade fade out
   */
  pause(fade: boolean = false) {
    if (fade) {
      _howler.fade(this._volume, 0, PLAY_PAUSE_FADE_DURATION)
      this.state = State.Paused
      _howler.once('fade', () => {
        _howler.pause()
      })
    } else {
      this.state = State.Paused
      _howler.pause()
    }
  }

  /**
   * Play or pause current track
   * @param {boolean} fade fade in-out
   */
  playOrPause(fade: boolean = true) {
    this.state === State.Playing ? this.pause(fade) : this.play(fade)
  }

  /**
   * 音质设置变更后重载当前曲目的音源：保持播放/暂停状态与播放进度。
   * 复用 pendingSeek 机制（音频 load 后一次性 seek 回原进度）。
   */
  async reloadAudioSource() {
    if (!this.trackID) return
    const progress = this.liveCurrentTime()
    const wasPlaying = this.state === State.Playing
    this._setStateToLoading()
    if (progress > 0) {
      this._progress = progress
      this._pendingSeek = progress
    }
    await this._playAudio(wasPlaying)
  }

  /**
   * Play previous track
   */
  prevTrack() {
    this._setStateToLoading()
    this._progress = 0
    if (this.mode === Mode.FM) {
      toast('Personal FM not support previous track')
      return
    }
    if (this._prevTrackIndex === undefined) {
      toast('No previous track')
      return
    }
    this._trackIndex = this._prevTrackIndex
    this._playTrack()
  }

  /**
   * Play next track
   * @param forceFM 强制走 FM 队列
   * @param autoplay 失败推进时透传的播放意图（恢复路径为 false，不自动出声）
   */
  nextTrack(forceFM: boolean = false, autoplay: boolean = true) {
    this._setStateToLoading()
    this._progress = 0
    if (forceFM || this.mode === Mode.FM) {
      this.mode = Mode.FM
      this._nextFMTrack(autoplay)
      return
    }
    if (this._nextTrackIndex === undefined) {
      toast('没有下一首了')
      this.pause()
      return
    }
    this._trackIndex = this._nextTrackIndex

    this._playTrack(autoplay)
  }

  /**
   * 播放一个track id列表
   * @param {number[]} list
   * @param {null|number} autoPlayTrackID
   */
  playAList(list: TrackID[], autoPlayTrackID?: null | number) {
    this._setStateToLoading()
    this.mode = Mode.TrackList
    this.trackList = list
    this._trackIndex = autoPlayTrackID ? list.findIndex(t => t === autoPlayTrackID) : 0
    this._playTrack()
  }

  /**
   *
   * @param trackID
   */
  addToFirstPlay(trackID: number) {
    console.log(`trackID:${trackID}`)
    // 判重
    if (this.trackList.includes(trackID)) {
      this.trackList = this.trackList.filter(item => item != trackID)
      this.trackList.splice(0, 0, trackID)
      return
    }
    this.trackList.splice(0, 0, trackID)
  }

  /**
   *
   * @param trackID
   */
  addToNextPlay(trackID: number) {
    // 判重
    if (this.trackList.includes(trackID)) {
      this.trackList = this.trackList.filter(item => item != trackID)
    }
    // 末首（不环绕）时 _nextTrackIndex 为 undefined —— 追加到队尾，
    // 而不是 splice(NaN, 0, x) 插到队首
    const index = this._nextTrackIndex ?? this.trackList.length
    this.trackList.splice(index, 0, trackID)
  }

  /**
   * deleteFromPlaylist() - function to remove a track from current play queue
   * 
   * @param trackID
   */

  deleteFromPlaylist(trackID: number) {
    // Check if the song existed in the tracklist
    if (!this.trackList.includes(trackID)) {
      return
    }
    // Check whether we are deleting the content that we are playing
    if (this.track?.id != undefined && this.track?.id != trackID){
      this.trackList = this.trackList.filter(item => item != trackID)
      return
    }
    // If we are deleting current playing. Switch to the next first
    this.prevTrack()
    this.trackList = this.trackList.filter(item => item != trackID)
    this.nextTrack()
  }

  /**
   *
   * @param trackID
   */
  addToPlayList(trackID: number) {
    // 判重
    if (this.trackList.includes(trackID)) {
      return
    }
    this.trackList.push(trackID)
  }

  /**
   * Play a playlist
   * @param  {number} id
   * @param  {null|number=} autoPlayTrackID
   */
  async playPlaylist(id: number | undefined, autoPlayTrackID?: null | number) {
    if (!id) {
      toast.error('无法播放: 歌单不存在')
      return
    }
    this._setStateToLoading()
    const playlist = await fetchPlaylistWithReactQuery({ id })
    if (!playlist?.playlist?.trackIds?.length) return
    this.trackListSource = {
      type: TrackListSourceType.Playlist,
      id,
    }
    this.playAList(
      playlist.playlist.trackIds.map(t => t.id),
      autoPlayTrackID
    )
  }

  /**
   * shuffle the playList
   * algorithm: https://bost.ocks.org/mike/shuffle/
   */
  async shufflePlayList() {
    let playingSongID = this.trackList[this._trackIndex]
    if (this.shuffle) {
      this.trackList = Array.from(this.originTrackList)
      this._trackIndex = this.trackList.indexOf(playingSongID)
      this.shuffle = !this.shuffle
      return
    }
    this.originTrackList = Array.from(this.trackList)
    this.shuffle = !this.shuffle

    let len = this.trackList.length,
      tmp,
      idx
    while (len) {
      idx = Math.floor(Math.min(random(), 0.99999) * len--)
      tmp = this.trackList[len]
      this.trackList[len] = this.trackList[idx]
      this.trackList[idx] = tmp
    }
    this._trackIndex = this.trackList.indexOf(playingSongID)
  }

  /**
   * Play an album
   * @param  {number} id
   * @param  {null|number=} autoPlayTrackID
   */
  async playAlbum(id: number, autoPlayTrackID?: null | number) {
    this._setStateToLoading()
    const album = await fetchAlbumWithReactQuery({ id })
    if (!album?.songs?.length) return
    this.trackListSource = {
      type: TrackListSourceType.Album,
      id,
    }
    this.playAList(
      album.songs.map(t => t.id),
      autoPlayTrackID
    )
  }

  /**
   * Listen artist's popular tracks
   * @param  {number} id
   * @param  {null|number=} autoPlayTrackID
   */
  async playArtistPopularTracks(id: number, autoPlayTrackID?: null | number) {
    this._setStateToLoading()
    const artist = await fetchArtistWithReactQuery({ id })
    if (!artist?.hotSongs.length) {
      toast('无法播放: 没有热门歌曲')
      return
    }
    this.trackListSource = {
      type: TrackListSourceType.Artist,
      id,
    }
    this.playAList(
      artist.hotSongs.map(t => t.id),
      autoPlayTrackID
    )
  }

  /**
   *  Play personal fm
   */
  async playFM() {
    this._setStateToLoading()
    this.mode = Mode.FM
    if (this.fmTrackList.length > 0 && this.fmTrack?.id === this.fmTrackList[0]) {
      this._track = this.fmTrack
      this._playAudio()
    } else {
      this._playTrack()
    }
  }

  /**
   * Trash current PersonalFMTrack
   */
  async fmTrash() {
    this.mode = Mode.FM
    const trashTrackID = this.fmTrackList[0]
    fmTrash(trashTrackID)
    this._nextFMTrack()
  }

  /**
   * Play track in trackList by id
   */
  async playTrack(trackID: TrackID) {
    const index = this.trackList.findIndex(t => t === trackID)
    if (index === -1) {
      // 找不到就不动任何播放状态 —— 原实现会继续把 _trackIndex 设为 -1，
      // 最终 state 永久卡在 Loading
      toast('播放失败，歌曲不在列表内')
      return
    }
    this._setStateToLoading()
    this._trackIndex = index
    this._playTrack()
  }

  private async _initMediaSession() {
    // console.log('init media session')
    if ('mediaSession' in navigator === false) return
    navigator.mediaSession.setActionHandler('play', () => this.play())
    navigator.mediaSession.setActionHandler('pause', () => this.pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prevTrack())
    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextTrack())
    navigator.mediaSession.setActionHandler('seekto', event => {
      if (event.seekTime) this.progress = event.seekTime
    })
  }

  private async _updateMediaSessionMetaData() {
    if ('mediaSession' in navigator === false || !this.track) return
    const track = this.track
    const metadata = {
      title: track.name,
      artist: track.ar.map(a => a.name).join(', '),
      album: track.al?.name,
      artwork: [
        {
          src: track.al?.picUrl + '?param=256y256',
          type: 'image/jpg',
          sizes: '256x256',
        },
        {
          src: track.al?.picUrl + '?param=512y512',
          type: 'image/jpg',
          sizes: '512x512',
        },
      ],
      length: this.progress,
      trackId: track.id,
    }
    navigator.mediaSession.metadata = new window.MediaMetadata(metadata)
  }
}

if (import.meta.env.DEV) {
  ;(window as any).howler = _howler
}
