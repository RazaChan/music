import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSnapshot } from 'valtio'
import { cx } from '@emotion/css'
import useLyric from '@/web/api/hooks/useLyric'
import { lyricParser, YrcWord } from '@/web/utils/lyric'
import player from '@/web/states/player'
import { subscribeAudioTime } from '@/web/utils/audioTime'
import LyricsWindowTitleBar from '@/web/components/LyricsWindow/LyricsWindowTitleBar'
import YrcWordSpan from '@/web/components/Lyrics/YrcWordSpan'

// Spring-ish easing standing in for the previous framer-motion spring
// ({ duration: 0.6, bounce: 0.36 }) — slight overshoot, driven by a plain
// CSS transition so no per-row animation instances exist.
const SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * One lyric line. Props are minimal so memo() stays effective: when the
 * active line moves, only the affected rows re-render.
 *
 * 与主歌词页对齐：活跃行支持 YRC 逐词 karaoke 填充（words 仅传给活跃行，
 * 非活跃行渲染纯文本），罗马音/翻译作为次级行。
 */
const LyricRow = memo(
  ({
    index,
    lyric,
    tLyric,
    rLyric,
    words,
    registerWord,
    isActive,
  }: {
    index: number
    lyric?: string
    tLyric?: string
    rLyric?: string
    /** 仅活跃行传入：YRC 逐词 */
    words?: YrcWord[]
    registerWord?: (el: HTMLSpanElement | null, w: YrcWord, lineIdx: number) => void
    isActive: boolean
  }) => {
    return (
      <div
        data-index={index}
        className={cx(
          'lyrics-row my-2 p-4 ease-in-out iterms-center text-center',
          'tracking-lyric leading-lyric text-md transition duration-400 dark:hover:bg-white/10 hover:bg-gray-500/10  rounded-lg',
          'font-barlow',
          isActive
            ? 'lyrics-row--active transition duration-400 font-bold text-accent-color-700 dark:text-accent-color-500 text-lg my-2' // 浅色模式使用700提高对比度，深色模式使用500
            : 'transition duration-400 text-black dark:text-white/90 ' // 提高非活跃行对比度
        )}
      >
        <div
          style={{
            transform: isActive ? 'translateY(0px)' : 'translateY(-5px)',
            transition: `transform 0.6s ${SPRING_EASE}`,
          }}
        >
          {words && registerWord ? (
            <span className='lyric-yrc-line block'>
              {words.map((word, wi) => (
                <YrcWordSpan
                  key={`${index}-${wi}-${word.time}`}
                  word={word}
                  lineIndex={index}
                  registerWord={registerWord}
                />
              ))}
            </span>
          ) : (
            <span>{lyric}</span>
          )}
          {rLyric && (
            <>
              <br />
              <span className='text-[0.8em] font-normal opacity-70'>{rLyric}</span>
            </>
          )}
          {tLyric && (
            <>
              <br />
              <span>{tLyric}</span>
            </>
          )}
        </div>
      </div>
    )
  }
)
LyricRow.displayName = 'LyricRow'

/** Last line whose time <= t — O(log n) instead of the old O(n) scan. */
const findLineIndex = (time: number, lines: { time: number }[]) => {
  let lo = 0
  let hi = lines.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

const LyricsDesktop = memo(() => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Only re-renders when the active line actually changes.
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const { trackID } = useSnapshot(player)

  const lyricsRes = useLyric({ id: trackID })
  const lyricsResponse = lyricsRes.data

  // Parse once per lyric response — the full LRC regex parse used to run
  // in the render body twice a second.
  const { lyric: lyrics, tlyric, yrc, romalrc } = useMemo(
    () => lyricParser(lyricsResponse),
    [lyricsResponse]
  )

  // 与主歌词页同源：有逐字歌词时以 YRC 行作为行跟踪与渲染基准
  const hasYrc = yrc.length > 0
  const mainLines = useMemo(
    () => (hasYrc ? yrc.map(line => ({ time: line.time, content: line.content })) : lyrics),
    [hasYrc, yrc, lyrics]
  )

  const linesRef = useRef(mainLines)
  const lastIndexRef = useRef(-1)
  useEffect(() => {
    linesRef.current = mainLines
    lastIndexRef.current = -1
    setCurrentLineIndex(0)
  }, [mainLines])

  // ── 活跃行的逐词注册表：仅活跃行挂载 word spans，行切换时重建 ──
  const activeWordsRef = useRef<{ el: HTMLSpanElement; start: number; end: number }[]>([])
  const registerWord = useCallback(
    (el: HTMLSpanElement | null, w: YrcWord) => {
      if (el) {
        activeWordsRef.current.push({ el, start: w.time, end: w.time + w.duration })
      } else {
        activeWordsRef.current = activeWordsRef.current.filter(word => word.el !== el)
      }
    },
    []
  )
  // 行切换时清空注册表（旧行的 spans 卸载时也会自行移除，这里是兜底重置）
  useEffect(() => {
    activeWordsRef.current = activeWordsRef.current.filter(word =>
      document.contains(word.el)
    )
  }, [currentLineIndex])

  // Line tracking + 逐词填充 run on the shared RAF loop (utils/audioTime.ts)
  // reading liveCurrentTime() — no per-frame React state. The lyrics window
  // has no Howl of its own; its progress arrives via IPC SyncProgress.
  useEffect(() => {
    return subscribeAudioTime(time => {
      const lines = linesRef.current
      if (lines.length === 0) return
      // +0.2s lead so lines highlight slightly early, as before.
      const index = findLineIndex(time + 0.2, lines)
      if (index !== lastIndexRef.current) {
        lastIndexRef.current = index
        setCurrentLineIndex(index)
      }
      // 逐词填充：直接改活跃行 word spans 的 --p（CSS 变量，零 React 渲染）
      const bucket = activeWordsRef.current
      for (let i = 0; i < bucket.length; i++) {
        const w = bucket[i]
        let p: number
        if (time >= w.end) p = 1
        else if (time <= w.start) p = 0
        else p = (time - w.start) / Math.max(w.end - w.start, 0.001)
        w.el.style.setProperty('--p', p.toFixed(3))
      }
    })
  }, [])

  // Keep the active line centered.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || mainLines.length === 0) return
    const line = scroller.querySelector(
      `.lyrics-row[data-index='${currentLineIndex}']`
    ) as HTMLElement | null
    if (!line) return
    // Rect-based math — independent of offsetParent chains.
    const scrollerRect = scroller.getBoundingClientRect()
    const lineRect = line.getBoundingClientRect()
    const target =
      scroller.scrollTop +
      (lineRect.top - scrollerRect.top) +
      lineRect.height / 2 -
      scroller.clientHeight / 2
    scroller.scrollTo({ top: target, behavior: 'smooth' })
  }, [currentLineIndex, mainLines])

  const renderedLyrics = useMemo(() => {
    const maxLength = Math.max(mainLines.length, tlyric.length)
    return Array.from({ length: maxLength }, (_, index) => {
      const isActive = index === currentLineIndex
      return (
        <LyricRow
          key={index}
          index={index}
          lyric={mainLines[index]?.content}
          tLyric={tlyric[index]?.content}
          rLyric={romalrc[index]?.content}
          words={hasYrc && isActive ? yrc[index]?.words : undefined}
          registerWord={hasYrc && isActive ? registerWord : undefined}
          isActive={isActive}
        />
      )
    })
  }, [mainLines, tlyric, romalrc, hasYrc, yrc, currentLineIndex, registerWord])

  return (
    <>
      <LyricsWindowTitleBar />
      <div
        ref={scrollerRef}
        className={cx(
          'h-[600px] overflow-scroll rounded-md',
          'no-scrollbar text-center',
          'font-Roboto font-bold'
        )}
      >
        <div className={cx('inline-block py-80 text-center')}>
          {renderedLyrics.length == 0 ? <>Enjoy the music</> : renderedLyrics}
        </div>
      </div>
    </>
  )
})
LyricsDesktop.displayName = 'LyricsDesktop'

export default LyricsDesktop
