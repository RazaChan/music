/**
 * Word span — Apple-Music-style karaoke fill（主歌词页与桌面歌词窗共用）。
 *
 * Every word writes its own `--p` CSS variable (0..1) on its DOM node,
 * driven by a single requestAnimationFrame loop in the parent. React only
 * mounts/unmounts spans when the line changes, so playback never triggers
 * a re-render — the karaoke fill is pure CSS variable mutation.
 * （渐变绘制见 global.css 的 .lyric-word 规则块）
 */
import { CSSProperties, memo, useLayoutEffect, useRef } from 'react'
import { YrcWord } from '@/web/utils/lyric'

const YrcWordSpan = memo(
  ({
    word,
    lineIndex,
    registerWord,
  }: {
    word: YrcWord
    lineIndex: number
    registerWord: (el: HTMLSpanElement | null, w: YrcWord, lineIdx: number) => void
  }) => {
    const ref = useRef<HTMLSpanElement>(null)

    useLayoutEffect(() => {
      registerWord(ref.current, word, lineIndex)
      return () => registerWord(null, word, lineIndex)
    }, [registerWord, word, lineIndex])

    return (
      <span
        ref={ref}
        className='lyric-word'
        style={{ '--p': 0 } as CSSProperties}
        data-word-time={word.time}
        data-word-end={word.time + word.duration}
      >
        {word.content}
      </span>
    )
  }
)
YrcWordSpan.displayName = 'YrcWordSpan'

export default YrcWordSpan
