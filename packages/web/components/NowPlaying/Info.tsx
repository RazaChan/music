import player from '@/web/states/player'
import { MotionConfig, motion } from 'framer-motion'
import { cx, css } from '@emotion/css'
import { useSnapshot } from 'valtio'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ArtistInline from '../ArtistsInLine'
import Progress from './Progress'
import { ease } from '@/web/utils/const'

/** 音质档位 → 展示标签（专有名词不翻译） */
const QUALITY_LABELS: Record<string, string> = {
  standard: '128K',
  higher: '192K',
  exhigh: '320K',
  lossless: '无损',
  hires: 'Hi-Res',
}

/** 当前曲目音源的实际音质徽标（上游按权益降级后的真实档位） */
const QualityBadge = () => {
  const { t } = useTranslation()
  const { audioQuality } = useSnapshot(player)
  if (!audioQuality) return null

  const label = audioQuality.level
    ? (QUALITY_LABELS[audioQuality.level] ?? audioQuality.level)
    : t`common.alternative-source`
  const bitrate =
    audioQuality.br && audioQuality.br > 0 ? ` · ${Math.round(audioQuality.br / 1000)}kbps` : ''

  return (
    <div
      data-testid='now-playing-quality'
      className='mt-1.5 rounded-full bg-black/5 px-2 py-0.5 text-10 font-bold text-black/40 dark:bg-white/10 dark:text-white/40'
    >
      {label}
      {bitrate}
    </div>
  )
}

const Info = () => {
  const { track } = useSnapshot(player)
  const navigate = useNavigate()

  const goToLyrics = () => {
    if (track) navigate('/lyrics')
  }

  return (
    <MotionConfig transition={{ ease, duration: 0.5 }}>
      <motion.div
        className={cx(
          // blur 45px→12px + ~10% higher tint: same legibility for a
          // fraction of the backdrop-filter cost.
          'm-3 flex flex-col items-center rounded-20 bg-white/70 p-8 font-medium backdrop-blur-xl dark:bg-black/80'
        )}
      >
        {/* Track Info — click the title to open the lyrics page */}
        <div
          className='line-clamp-1 cursor-pointer text-lg text-black transition-colors duration-400 hover:text-black/50 dark:text-white dark:hover:text-white/70'
          onClick={goToLyrics}
        >
          {track?.name}
        </div>
        <ArtistInline
          artists={track?.ar || []}
          className='text-black/30 dark:text-white/30'
          hoverClassName='hover:text-black/50 dark:hover:text-white/70 transition-colors duration-400'
        />

        {/* Actual audio quality of the current source */}
        <QualityBadge />

        {/* Dividing line */}
        <div className='mt-2 h-px w-2/5 bg-black/10 dark:bg-white/10'></div>

        {/* Progress */}
        <Progress />

        {/* Controls placeholder */}
        <div className='h-11'></div>
      </motion.div>
    </MotionConfig>
  )
}
export default Info
