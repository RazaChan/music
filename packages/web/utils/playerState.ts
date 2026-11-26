/**
 * Player 持久化状态的校验与版本标记。
 *
 * localStorage 里的 `player` 是整个 Player 实例的扁平 JSON（见
 * states/player.ts）。这里负责在 init() 恢复前做逐字段校验：
 * 非法字段单独丢弃（降级为该字段默认值），而不是整体拒绝 ——
 * 一条损坏的 trackList 不应该让用户丢掉音量与循环模式。
 *
 * 校验基于字段形状而不是 __v 版本号：legacy（无 __v）数据与当前
 * 版本字段形状一致，未来版本也按已知字段尽力恢复。
 */
import { RepeatMode } from '@/shared/playerDataTypes'
import type { Mode, TrackListSourceType } from './player'

export const PLAYER_STATE_VERSION = 1

export interface SanitizedPlayerState {
  _track?: Track
  _trackIndex?: number
  _progress?: number
  _volume?: number
  _repeatMode?: RepeatMode
  mode?: Mode
  trackList?: number[]
  originTrackList?: number[]
  trackListSource?: { type: TrackListSourceType; id: number }
  fmTrackList?: number[]
  shuffle?: boolean
  fmTrack?: Track
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isTrackLike = (v: unknown): v is Track =>
  typeof v === 'object' && v !== null && isFiniteNumber((v as { id?: unknown }).id)

const isTrackIDArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isFiniteNumber)

const REPEAT_MODES: string[] = Object.values(RepeatMode)
const isRepeatMode = (v: unknown): v is RepeatMode =>
  typeof v === 'string' && REPEAT_MODES.includes(v)

const isMode = (v: unknown): v is Mode => v === 'trackList' || v === 'fm'

const isTrackListSource = (v: unknown): v is { type: TrackListSourceType; id: number } =>
  typeof v === 'object' &&
  v !== null &&
  isFiniteNumber((v as { id?: unknown }).id) &&
  ['album', 'playlist', 'artist'].includes((v as { type?: unknown }).type as string)

export function sanitizePlayerState(raw: unknown): SanitizedPlayerState {
  const out: SanitizedPlayerState = {}
  if (typeof raw !== 'object' || raw === null) return out
  const p = raw as Record<string, unknown>

  if (isTrackLike(p._track)) out._track = p._track
  if (isFiniteNumber(p._trackIndex) && p._trackIndex >= 0) out._trackIndex = Math.floor(p._trackIndex)
  // 0 / 负数进度没有恢复价值，直接丢弃（默认就是 0）
  if (isFiniteNumber(p._progress) && p._progress > 0) out._progress = p._progress
  // 0 是合法音量（静音），不能用 truthy 判断
  if (isFiniteNumber(p._volume) && p._volume >= 0 && p._volume <= 1) out._volume = p._volume
  if (isRepeatMode(p._repeatMode)) out._repeatMode = p._repeatMode
  if (isMode(p.mode)) out.mode = p.mode
  if (isTrackIDArray(p.trackList)) out.trackList = p.trackList
  if (isTrackIDArray(p.originTrackList)) out.originTrackList = p.originTrackList
  if (isTrackListSource(p.trackListSource)) out.trackListSource = p.trackListSource
  if (isTrackIDArray(p.fmTrackList)) out.fmTrackList = p.fmTrackList
  if (typeof p.shuffle === 'boolean') out.shuffle = p.shuffle
  if (isTrackLike(p.fmTrack)) out.fmTrack = p.fmTrack

  return out
}

/**
 * 解析 localStorage 里的持久化字符串。损坏的 JSON 返回 {}（全新启动），
 * 而不是让 JSON.parse 的异常在模块加载时直接打爆整个应用。
 */
export function parsePersistedPlayerState(raw: string | null): { [key: string]: unknown } {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as { [key: string]: unknown }
    return {}
  } catch {
    return {}
  }
}
