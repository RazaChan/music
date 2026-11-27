import CoverWall from '@/web/components/CoverWall'
import PageTransition from '@/web/components/PageTransition'
import { AsyncEmpty, AsyncError, AsyncLoading } from '@/web/components/AsyncState'
import Icon from '@/web/components/Icon'
import { fetchPlaylistWithReactQuery, fetchFromCache } from '@/web/api/hooks/usePlaylist'
import { fetchTracksWithReactQuery } from '@/web/api/hooks/useTracks'
import { fetchTopPlaylist } from '@/web/api/playlist'
import player from '@/web/states/player'
import { sampleSize } from 'lodash-es'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cx } from '@emotion/css'
import { FetchPlaylistResponse } from '@/shared/api/Playlists'

interface DiscoverAlbum {
  id: number
  coverUrl: string
  large: boolean
}

interface DiscoverData {
  albums: DiscoverAlbum[]
  /** 本次发现抽中的曲目（"播放全部"用），顺序即随机顺序 */
  trackIDs: number[]
}

/**
 * 发现方向：featured 是人工精选歌单池（保持原行为），其余方向经
 * /top/playlist?cat= 动态取真实歌单，避免硬编码可能失效的歌单 ID。
 */
const DIRECTIONS: { key: string; cat?: string }[] = [
  { key: 'featured' },
  { key: 'chinese', cat: '华语' },
  { key: 'western', cat: '欧美' },
  { key: 'japanese', cat: '日语' },
  { key: 'korean', cat: '韩语' },
  { key: 'cantonese', cat: '粤语' },
  { key: 'instrumental', cat: '纯音乐' },
]

const FEATURED_PLAYLIST_IDS = [
  2859214503, // 一周欧美上新
  2829816518, // 欧美私人订制
  5327906368, // 乐迷雷达
  5362359247, // 宝藏雷达
  3136952023, // 私人雷达
  60198, // Billboard 排行榜
  180106, // UK 排行榜
  5212729721, // 欧美点唱机
  2724708415, // 私藏推荐精选
  5300458264, // 新歌雷达
  7463185187, // 开发者夹带私货
]

const getAlbumsFromAPI = async (cat?: string): Promise<DiscoverData> => {
  let playlistIds: number[]
  if (cat) {
    // 方向筛选：按分类取热门歌单（真实数据，无硬编码失效风险）
    const top = await fetchTopPlaylist({ cat, limit: 30, offset: 0 })
    playlistIds = (top?.playlists ?? []).map(p => p.id)
  } else {
    playlistIds = FEATURED_PLAYLIST_IDS
  }
  if (!playlistIds.length) return { albums: [], trackIDs: [] }

  const playlists: FetchPlaylistResponse[] = await Promise.all(
    sampleSize(playlistIds, 5).map(async id => {
      const cache = await fetchFromCache({ id })
      if (cache) return cache
      return fetchPlaylistWithReactQuery({ id })
    })
  )

  let ids: number[] = []
  playlists.forEach(playlist => playlist?.playlist?.trackIds?.forEach(t => ids.push(t.id)))
  if (!ids.length) return { albums: [], trackIDs: [] }
  ids = sampleSize(ids, 100)

  const tracks = await fetchTracksWithReactQuery({ ids })
  if (!tracks?.songs?.length) {
    return { albums: [], trackIDs: [] }
  }

  // 从歌单中抽出歌曲
  const pickedIds: number[] = []
  const albums: DiscoverAlbum[] = []
  tracks.songs.forEach(t => {
    if (pickedIds.includes(t.al?.id as number)) return
    pickedIds.push(t.al?.id as number)
    albums.push({
      id: t.al?.id as number,
      coverUrl: t.al?.picUrl as string,
      large: false,
    })
  })

  // 挑选出大图
  const largeCover = sampleSize([...Array(100).keys()], ~~(100 / 3))
  albums.map((album, index) => (album.large = largeCover.includes(index)))

  return { albums, trackIDs: tracks.songs.map(t => t.id) }
}

/** 兼容旧的裸数组缓存格式 */
const normalizeCached = (raw: unknown): DiscoverData => {
  if (Array.isArray(raw)) return { albums: raw as DiscoverAlbum[], trackIDs: [] }
  if (raw && typeof raw === 'object' && Array.isArray((raw as DiscoverData).albums)) {
    return raw as DiscoverData
  }
  return { albums: [], trackIDs: [] }
}

const Discover = () => {
  const { t } = useTranslation()
  const [direction, setDirection] = useState('featured')
  // 换一批：nonce 递增触发重新抽样；nonce>0 时跳过 localStorage 缓存
  const [nonce, setNonce] = useState(0)

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['DiscoveryAlbums', direction, nonce],
    queryFn: async (): Promise<DiscoverData> => {
      const cat = DIRECTIONS.find(d => d.key === direction)?.cat
      // 只有默认方向的首次加载走 localStorage 缓存（保持旧的 2 小时节奏）；
      // 换一批与方向筛选都拿新数据
      if (!cat && nonce === 0) {
        const albumsInLocalStorageTime = localStorage.getItem('discoverAlbumsTime')
        if (
          albumsInLocalStorageTime &&
          Date.now() - Number(albumsInLocalStorageTime) <= 1000 * 60 * 60 * 2
        ) {
          return normalizeCached(JSON.parse(localStorage.getItem('discoverAlbums') || '[]'))
        }
      }
      const result = await getAlbumsFromAPI(cat)
      if (!cat) {
        localStorage.setItem('discoverAlbums', JSON.stringify(result))
        localStorage.setItem('discoverAlbumsTime', String(Date.now()))
      }
      return result
    },
    staleTime: 1000 * 60 * 60 * 2, // 2hr
    refetchOnWindowFocus: false,
  })

  const albums = data?.albums ?? []
  const trackIDs = data?.trackIDs ?? []
  const playAll = () => {
    if (trackIDs.length) player.playAList(trackIDs)
  }

  return (
    <PageTransition disableEnterAnimation={true}>
      <div className='mx-2.5 mt-2.5 pb-10 lg:mx-0 lg:mt-0 lg:pb-16'>
        {/* 页头：方向筛选 + 换一批 + 播放全部（Discover 从"随机封面墙"
            升级为可控发现，见路线文档阶段 4） */}
        <div className='mb-4 flex flex-wrap items-center gap-2 px-1' data-testid='discover-header'>
          {DIRECTIONS.map(d => (
            <button
              key={d.key}
              onClick={() => {
                setDirection(d.key)
                setNonce(0)
              }}
              className={cx(
                'rounded-full px-4 py-1.5 text-14 font-bold transition-colors',
                direction === d.key
                  ? 'bg-accent-color-400 text-black/80 dark:bg-neutral-500 dark:text-white/90'
                  : 'bg-black/5 text-black/60 hover:bg-black/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'
              )}
            >
              {t(`discover.direction-${d.key}`)}
            </button>
          ))}
          <div className='grow' />
          <button
            data-testid='discover-refresh'
            onClick={() => setNonce(n => n + 1)}
            disabled={isFetching}
            className='flex items-center gap-1.5 rounded-full bg-black/5 px-4 py-1.5 text-14 font-bold text-black/60 transition-colors hover:bg-black/10 disabled:opacity-50 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'
          >
            <Icon name='refresh' className={cx('h-4 w-4', isFetching && 'animate-spin')} />
            {t`discover.refresh`}
          </button>
          <button
            data-testid='discover-play-all'
            onClick={playAll}
            disabled={!trackIDs.length}
            className='bg-accent-color-500 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-14 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40'
          >
            <Icon name='play' className='h-4 w-4' />
            {t`discover.play-all`}
          </button>
        </div>

        {isPending ? (
          <AsyncLoading className='min-h-[50vh]' />
        ) : isError ? (
          <AsyncError onRetry={() => refetch()} className='min-h-[50vh]' />
        ) : !albums.length ? (
          <AsyncEmpty className='min-h-[50vh]' />
        ) : (
          <CoverWall albums={albums} />
        )}
      </div>
    </PageTransition>
  )
}

export default Discover
