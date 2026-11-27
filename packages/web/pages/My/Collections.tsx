import { css, cx } from '@emotion/css'
import useUserArtists from '@/web/api/hooks/useUserArtists'
import Tabs from '@/web/components/Tabs'
import { useEffect, useMemo, useRef, useState } from 'react'
import CoverRow from '@/web/components/CoverRow'
import useUserPlaylists, { useMutationCreatePlaylist } from '@/web/api/hooks/useUserPlaylists'
import useUserAlbums from '@/web/api/hooks/useUserAlbums'
import { useSnapshot } from 'valtio'
import uiStates from '@/web/states/uiStates'
import ArtistRow from '@/web/components/ArtistRow'
import { topbarHeight } from '@/web/utils/const'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import VideoRow from '@/web/components/VideoRow'
import useUserVideos from '@/web/api/hooks/useUserVideos'
import persistedUiStates from '@/web/states/persistedUiStates'
import settings from '@/web/states/settings'
import useUser from '@/web/api/hooks/useUser'
import Daily from './Daily'
import Cloud from './Cloud'
import Icon from '@/web/components/Icon'
import FileUploader from '@/web/components/Tools/Upload'
import CoverWall from '@/web/components/CoverWall'
import { IconNames } from '@/web/components/Icon/iconNamesType'
import { InputDialog } from '@/web/components/Dialogs'
import Recent from './Recent'

const collections = ['daily', 'playlists', 'albums', 'artists', 'videos', 'cloud','recent'] as const
type Collection = typeof collections[number]

const Albums = () => {
  const { data: albums } = useUserAlbums()
  return <CoverRow albums={albums?.data} itemTitle='name' itemSubtitle='artist' />
}

const Playlists = () => {
  const { t } = useTranslation()
  const user = useUser()
  const { data: playlists } = useUserPlaylists()
  const createPlaylist = useMutationCreatePlaylist()
  const [showCreate, setShowCreate] = useState(false)
  const myPlaylists = useMemo(
    () => playlists?.playlist?.slice(1).filter(p => p.userId === user?.data?.account?.id),
    [playlists, user]
  )
  const otherPlaylists = useMemo(
    () => playlists?.playlist?.slice(1).filter(p => p.userId !== user?.data?.account?.id),
    [playlists, user]
  )

  return (
    <div>
      {/* My playlists */}
      {myPlaylists && (
        <>
          <div className='mb-4 mt-2 flex items-center justify-between'>
            <div className='text-14 font-medium uppercase text-neutral-400'>Created BY ME</div>
            <button
              data-testid='playlist-create'
              onClick={() => setShowCreate(true)}
              className='flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-12 font-bold text-black/60 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'
            >
              <Icon name='plus' className='h-3.5 w-3.5' />
              {t`playlist.create`}
            </button>
          </div>
          <CoverRow playlists={myPlaylists || []} />
        </>
      )}
      {/* Other playlists */}
      {otherPlaylists && (
        <>
          <div className='mb-4 mt-8 text-14 font-medium uppercase text-neutral-400'>
            Created BY OTHERS
          </div>
          <CoverRow playlists={otherPlaylists || []} />
        </>
      )}
      <InputDialog
        open={showCreate}
        title={t`playlist.create-title`}
        placeholder={t`playlist.create-placeholder`}
        onClose={() => setShowCreate(false)}
        onSubmit={name => createPlaylist.mutate(name)}
      />
    </div>
  )
}

const Artists = () => {
  const { data: artists } = useUserArtists()
  return <ArtistRow artists={artists?.data || []} />
}

const Videos = () => {
  const { data: videos } = useUserVideos()
  return <VideoRow videos={videos?.data || []} />
}

const CollectionTabs = ({ className }: { className:string }) => {
  const { t } = useTranslation()
  const { displayPlaylistsFromNeteaseMusic } = useSnapshot(settings)

  const tabs: { id: Collection; name: string; iconName?: IconNames }[] = [
    {
      id: 'daily',
      name: t`common.daily`,
      // iconName: 'netease',
    },
    {
      id: 'albums',
      name: t`common.album_other`,
      // iconName: 'album',
    },
    {
      id: 'playlists',
      name: t`common.playlist_other`,
      // iconName: 'playlist',
    },
    {
      id: 'artists',
      name: t`common.artist_other`,
      // iconName: 'artist',
    },
    {
      id: 'videos',
      name: t`common.video_other`,
      // iconName: 'video',
    },
    {
      id: 'cloud',
      name: t`common.cloud`,
      // iconName: 'cloud',
    },
    {
      id: 'recent',
      name: t`common.recent`,
      // iconName: 'cloud',
    },

  ]

  const { librarySelectedTab: selectedTab } = useSnapshot(persistedUiStates)
  const setSelectedTab = (id: Collection) => {
    persistedUiStates.librarySelectedTab = id
  }

  return (
    <div className={className}>
      <div className='flex flex-row justify-between z-10'>
        <Tabs
          tabs={tabs.filter(tab => {
            if (!displayPlaylistsFromNeteaseMusic && tab.id === 'playlists') {
              return false
            }
            return true
          })}
          value={selectedTab}
          onChange={(id: Collection) => {
            setSelectedTab(id)
          }}
          className={cx(
            'sticky',
            'z-10',
            'px-2.5 lg:px-0'
          )}
          // style={{
          //   top: `${topbarHeight}px`,
          // }}
        />
        <div className='items-center '>{/* {selectedTab == 'cloud' && <FileUploader/> } */}</div>
      </div>
    </div>
  )
}

const Collections = () => {
  const { librarySelectedTab: selectedTab } = useSnapshot(persistedUiStates)
  return (
    <motion.div>
      <CollectionTabs className='sticky top-[100px] p-1 rounded-bl-lg rounded-br-lg z-10 w-full backdrop-blur-lg pb-5 pt-7'/>
      <div className={cx('px-2.5 pt-10 lg:px-0')}>
        {selectedTab === 'daily' && <Daily />}
        {selectedTab === 'albums' && <Albums />}
        {selectedTab === 'playlists' && <Playlists />}
        {selectedTab === 'artists' && <Artists />}
        {selectedTab === 'videos' && <Videos />}
        {selectedTab === 'cloud' && <Cloud key={"cloud"}/>}
        {selectedTab === 'recent' && <Recent key={"recent"}/>}
      </div>
    </motion.div>
  )
}

export default Collections
