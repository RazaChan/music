import {
  fetchDailyRecommendPlaylists,
  fetchDailyRecommendSongs,
  fetchRecommendedPlaylists,
} from '@/web/api/playlist'
import { PlaylistApiNames } from '@/shared/api/Playlists'
import { useQuery } from '@tanstack/react-query'
import TrackList from '@/web/components/TrackList/TrackListVirtual'
import player from '@/web/states/player'
import Icon from '@/web/components/Icon'
import Wave from '@/web/components/Animation/Wave'
import { formatDuration, resizeImage } from '@/web/utils/common'
import { State as PlayerState } from '@/web/utils/player'
import { css, cx } from '@emotion/css'
import { Fragment, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import React from 'react'
import { useSnapshot } from 'valtio'
import { handleTrackRowEvent, TrackRowEvent } from '@/web/utils/trackActivation'
import { motion } from 'framer-motion'
import { map } from 'lodash-es'
import Track from '@/web/components/TrackList/Track'

const reactQueryOptions = {
  refetchOnWindowFocus: false,
  refetchInterval: 1000 * 60 * 60, // 1 hour
  refetchOnMount: false,
}

const Daily = ({ className }: { className?: string }) => {

  const { data: dailyRecommendSongs, isLoading: isLoadingDaily } = useQuery({
    queryKey: [PlaylistApiNames.FetchDailyRecommendSongs],
    queryFn: () => fetchDailyRecommendSongs(),
    ...reactQueryOptions,
  })
  const { trackID, state } = useSnapshot(player)
  const tracks = dailyRecommendSongs?.data?.dailySongs || []

  let playingTrack = tracks?.find(track => track.id === trackID)
  const songIDs = tracks.map(track => {
    return track.id
  }) ?? []

  const onPlay = (trackID: number | null = null) => {
    player.playAList(songIDs, trackID)
  }

  // 统一激活规则：移动单击 / 桌面双击 / 键盘 Enter（utils/trackActivation.ts）
  const handleClick = (e: TrackRowEvent, trackID: number) =>
    handleTrackRowEvent(e, trackID, { onPlay, isLoading: isLoadingDaily })

  return (
    <motion.div>
      {(isLoadingDaily ? [] : tracks)?.map((track, index) => {
        return <Track
          track={track}
          index={index}
          playingTrackID={playingTrack?.id || 0}
          state={state}
          handleClick={handleClick} />
      })}
    </motion.div>
  )
}

export default Daily
