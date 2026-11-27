import player from '@/web/states/player'
import { handleTrackRowEvent, TrackRowEvent } from '@/web/utils/trackActivation'
import { cx } from '@emotion/css'
import { useCallback, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import React from 'react'
import { Virtuoso } from 'react-virtuoso'
import TrackRow from './Track'

function TrackList({
  tracks,
  onPlay,
  className,
  isLoading,
  Header,
}: {
  tracks?: Track[]
  onPlay: (id: number) => void
  className?: string
  isLoading?: boolean
  placeholderRows?: number
  Header?: React.FC
}) {
  // Only subscribe to the two fields we actually render. Skipping `progress`
  // here is critical: without it, this list re-renders ~12×/s during playback.
  const { trackID, state } = useSnapshot(player)

  // 统一激活规则：移动单击 / 桌面双击 / 键盘 Enter（utils/trackActivation.ts）
  const handleClick = useCallback(
    (e: TrackRowEvent, id: number) => handleTrackRowEvent(e, id, { onPlay, isLoading }),
    [isLoading, onPlay]
  )

  // No scrollSeekConfiguration: we render real <Track> rows during fast
  // scroll. Track is memoized + cover uses lazy <img>, so it's cheap; the
  // generous overscan/viewport keeps content mounted ahead of the user.
  const components = useMemo(() => ({ Header }), [Header])

  return (
    <div className={cx('@container', className)}>
      <Virtuoso
        className=' no-scrollbar'
        style={{
          height: 'calc(100dvh - 132px)',
        }}
        data={tracks}
        components={components}
        defaultItemHeight={80}
        overscan={2000}
        increaseViewportBy={{ top: 1600, bottom: 1600 }}
        totalCount={tracks?.length}
        itemContent={index => {
          const track = tracks?.[index]
          return (
            <TrackRow
              key={track?.id ?? index}
              track={track}
              index={index}
              playingTrackID={trackID}
              state={state}
              handleClick={handleClick}
            />
          )
        }}
      />
    </div>
  )
}

const TrackListVirtualMemo = React.memo(TrackList)
TrackListVirtualMemo.displayName = "TrackListVirtual"

export default TrackListVirtualMemo
