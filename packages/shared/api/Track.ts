export enum TrackApiNames {
  FetchTracks = 'fetchTracks',
  FetchAudioSource = 'fetchAudioSource',
  FetchLyric = 'fetchLyric',
  Unblock = 'unblock',
}

// unblock music
export interface UnblockParam {
  track_id: number
}
export interface UnblockResponse {
  code: number
  url: string
}
// 获取歌曲详情
export interface FetchTracksParams {
  ids: number[]
}
export interface FetchTracksResponse {
  code: number
  songs?: Track[]
  privileges: {
    [key: string]: unknown
  }
}

// 获取音源URL

export interface FetchAudioSourceParams {
  id: number
  level?: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires' // 128kbps 192kbps 320kbps Lossless Hi-Res
  qqCookie?: string
  miguCookie?: string
  jooxCookie?: string
}
export interface FetchAudioSourceResponse {
  code: number
  data: {
    br: number
    canExtend: boolean
    code: number
    encodeType: 'mp3' | null
    expi: number
    fee: number
    flag: number
    freeTimeTrialPrivilege: {
      [key: string]: unknown
    }
    freeTrialPrivilege: {
      [key: string]: unknown
    }
    freeTrialInfo: null
    gain: number
    id: number
    /** 实际提供的音质档位（上游按权益自动降级后的结果；缓存命中时为缓存档位） */
    level: string
    md5: string | null
    payed: number
    size: number
    type: 'mp3' | null
    uf: null
    url: string | null
    urlSource: number
    /** 替代音源来源（unblock / 本地缓存命中时存在） */
    source?: string
  }[]
}

// 获取歌词

export interface FetchLyricParams {
  id: number
}
export interface FetchLyricResponse {
  code: number
  sgc: boolean
  sfy: boolean
  qfy: boolean
  lyricUser?: {
    id: number
    status: number
    demand: number
    userid: number
    nickname: string
    uptime: number
  }
  transUser?: {
    id: number
    status: number
    demand: number
    userid: number
    nickname: string
    uptime: number
  }
  lrc: {
    version: number
    lyric: string
  }
  klyric?: {
    version: number
    lyric: string
  }
  tlyric?: {
    version: number
    lyric: string
  }
}

// 新版歌词 - 包含逐字歌词
export interface FetchLyricNewResponse {
  code: number
  sgc: boolean
  sfy: boolean
  qfy: boolean
  lrc?: {
    version: number
    lyric: string
  }
  tlyric?: {
    version: number
    lyric: string
  }
  klyric?: {
    version: number
    lyric: string
  }
  yrc?: {
    version: number
    lyric: string
  }
  ytlrc?: {
    version: number
    lyric: string
  }
  yromalrc?: {
    version: number
    lyric: string
  }
  romalrc?: {
    version: number
    lyric: string
  }
}

// 收藏歌曲
export interface LikeATrackParams {
  id: number
  like: boolean
}
export interface LikeATrackResponse {
  code: number
  playlistId: number
  songs: Track[]
}
