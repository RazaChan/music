import usePlaylist from '@/web/api/hooks/usePlaylist'
import useUser from '@/web/api/hooks/useUser'
import useUserPlaylists, {
  useMutationDeletePlaylist,
  useMutationLikeAPlaylist,
  useMutationRenamePlaylist,
} from '@/web/api/hooks/useUserPlaylists'
import TrackListHeader from '@/web/components/TrackListHeader'
import { ConfirmDialog, InputDialog } from '@/web/components/Dialogs'
import player from '@/web/states/player'
import { formatDate } from '@/web/utils/common'
import { useWhyDidYouUpdate } from 'ahooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

const Header = () => {
  const params = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: playlistRaw, isLoading } = usePlaylist({
    id: Number(params.id),
  })
  const { data: user } = useUser()

  const { data: userLikedPlaylists } = useUserPlaylists()

  const playlist = playlistRaw?.playlist

  // For <Cover />
  const cover = playlist?.coverImgUrl || playlist?.picUrl

  // For <Info />
  const title = playlist?.name
  const creatorName = playlist?.creator?.nickname
  const creatorLink = undefined // TODO: 链接到用户页面
  const description = playlist?.description || ''
  const extraInfo = useMemo(() => {
    return (
      <>
        Updated at {formatDate(playlist?.updateTime || 0, 'en')} · {playlist?.trackCount} tracks
      </>
    )
  }, [playlist])

  // For <Actions />
  const isLiked = useMemo(() => {
    const id = Number(params.id)
    if (!id) return false
    return !!userLikedPlaylists?.playlist.find(p => p.id === id)
  }, [params.id, userLikedPlaylists?.playlist])

  const onPlay = async (trackID: number | null = null) => {
    await player.playPlaylist(playlist?.id, trackID)
  }

  const likeAPlaylist = useMutationLikeAPlaylist()
  const onLike = async () => {
    likeAPlaylist.mutateAsync(playlist?.id || Number(params.id))
  }

  // ── 自建歌单管理：重命名 / 删除（仅创建者可见） ──
  const isOwner = !!user?.account?.id && user.account.id === playlist?.creator?.userId
  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const renamePlaylist = useMutationRenamePlaylist()
  const deletePlaylist = useMutationDeletePlaylist()

  const manageActions = isOwner ? (
    <>
      <button
        data-testid='playlist-rename'
        onClick={() => setShowRename(true)}
        className='rounded-full bg-black/10 px-4 py-2 text-14 font-bold text-black/60 transition-colors hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20'
      >
        {t`playlist.rename`}
      </button>
      <button
        data-testid='playlist-delete'
        onClick={() => setShowDelete(true)}
        className='rounded-full bg-black/10 px-4 py-2 text-14 font-bold text-red-500/80 transition-colors hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20'
      >
        {t`playlist.delete`}
      </button>
    </>
  ) : undefined

  return (
    <>
      <TrackListHeader className='mb-5'
        {...{
          title,
          creatorName,
          creatorLink,
          description,
          extraInfo,
          cover,
          isLiked,
          onLike: isOwner ? undefined : onLike,
          onPlay,
          extraActions: manageActions,
        }}
      />
      <InputDialog
        open={showRename}
        title={t`playlist.rename-title`}
        defaultValue={playlist?.name ?? ''}
        onClose={() => setShowRename(false)}
        onSubmit={name => {
          if (playlist?.id) renamePlaylist.mutate({ id: playlist.id, name })
        }}
      />
      <ConfirmDialog
        open={showDelete}
        title={t`playlist.delete-title`}
        description={t`playlist.delete-description`}
        onClose={() => setShowDelete(false)}
        onConfirm={() => {
          if (playlist?.id) {
            deletePlaylist.mutateAsync(playlist.id).then(() => navigate('/'))
          }
        }}
      />
    </>
  )
}

export default Header
