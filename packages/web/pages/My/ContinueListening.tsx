/**
 * 继续收听卡片（My 页顶部）。
 *
 * 播放器持久化恢复（阶段 1）已经带回队列、曲目、进度与来源
 * （trackListSource），这里补上可见的入口：显示来源（歌单/专辑/艺人）
 * 与当前曲目，一键续播或回到来源页。
 *
 * 反映的是本地播放器状态，与登录无关 —— 未登录恢复了队列同样显示。
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cx } from '@emotion/css'
import player from '@/web/states/player'
import Icon from '@/web/components/Icon'
import Image from '@/web/components/Image'
import { resizeImage } from '@/web/utils/common'
import { fetchPlaylistWithReactQuery } from '@/web/api/hooks/usePlaylist'
import { fetchAlbumWithReactQuery } from '@/web/api/hooks/useAlbum'
import { fetchArtistWithReactQuery } from '@/web/api/hooks/useArtist'
import { TrackListSourceType } from '@/web/utils/player'

const SOURCE_ROUTE: Record<string, (id: number) => string> = {
  [TrackListSourceType.Playlist]: id => `/playlist/${id}`,
  [TrackListSourceType.Album]: id => `/album/${id}`,
  [TrackListSourceType.Artist]: id => `/artist/${id}`,
}

/** 来源信息（名称 + 封面），按类型分发到对应的缓存查询 */
const useSourceInfo = (source: { type: string; id: number } | null) => {
  return useQuery({
    queryKey: ['continueListeningSource', source?.type, source?.id],
    enabled: !!source?.id,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      if (!source) return null
      if (source.type === TrackListSourceType.Playlist) {
        const res = await fetchPlaylistWithReactQuery({ id: source.id })
        const playlist = res?.playlist
        return playlist ? { name: playlist.name, cover: playlist.coverImgUrl } : null
      }
      if (source.type === TrackListSourceType.Album) {
        const res = await fetchAlbumWithReactQuery({ id: source.id })
        const album = res?.album
        return album ? { name: album.name, cover: album.picUrl } : null
      }
      if (source.type === TrackListSourceType.Artist) {
        const res = await fetchArtistWithReactQuery({ id: source.id })
        const artist = res?.artist
        return artist?.name
          ? { name: artist.name, cover: (artist as { picUrl?: string }).picUrl }
          : null
      }
      return null
    },
  })
}

const ContinueListening = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { track, trackListSource, state } = useSnapshot(player)
  const source = useMemo(
    () => (trackListSource ? { type: trackListSource.type as string, id: trackListSource.id } : null),
    [trackListSource]
  )
  const { data: sourceInfo } = useSourceInfo(source)

  const route = source ? SOURCE_ROUTE[source.type]?.(source.id) : undefined

  // 无曲目、无来源（如搜索单曲播放）或来源信息取不到时不渲染
  if (!track || !source || !route || !sourceInfo?.name) return null

  return (
    <div
      data-testid='continue-listening'
      className={cx(
        'flex items-center gap-4 rounded-24 p-4 transition-colors',
        'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'
      )}
    >
      {/* 封面：点击回来源页 */}
      <button
        onClick={() => navigate(route)}
        className='shrink-0 overflow-hidden rounded-12'
        aria-label={sourceInfo.name}
      >
        <Image
          src={resizeImage(sourceInfo.cover || track.al?.picUrl || '', 'sm')}
          className='aspect-square h-16 w-16'
          animation={false}
          placeholder={false}
        />
      </button>

      {/* 文案区：点击回来源页 */}
      <button onClick={() => navigate(route)} className='min-w-0 grow text-left'>
        <div className='text-12 font-bold uppercase tracking-wider text-black/40 dark:text-white/40'>
          {t`my.continue-listening`}
        </div>
        <div className='line-clamp-1 text-16 font-bold'>{sourceInfo.name}</div>
        <div className='line-clamp-1 mt-0.5 text-12 font-medium text-black/40 dark:text-white/40'>
          {track.name} · {track.ar?.map(a => a.name).join(', ')}
        </div>
      </button>

      {/* 续播/暂停 */}
      <button
        data-testid='continue-listening-play'
        onClick={() => player.playOrPause()}
        className='bg-accent-color-500 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90'
        aria-label={state === 'playing' ? 'pause' : 'play'}
      >
        <Icon name={state === 'playing' ? 'pause' : 'play'} className='h-5 w-5' />
      </button>
    </div>
  )
}

export default ContinueListening
