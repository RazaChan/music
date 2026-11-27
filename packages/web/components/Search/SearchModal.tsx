import { cx } from '@emotion/css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import uiStates from '@/web/states/uiStates'
import player from '@/web/states/player'
import Icon from '@/web/components/Icon'
import { useSearchHot, useSearchSuggestions } from '@/web/api/hooks/useSearch'
import useLockMainScroll from '@/web/hooks/useLockMainScroll'
import useOSPlatform from '@/web/hooks/useOSPlatform'
import { addSearchHistory, clearSearchHistory, getSearchHistory } from '@/web/utils/searchHistory'
import { ease } from '@/web/utils/const'

const SUGGEST_DEBOUNCE_MS = 300

type SuggestItem = {
  key: string
  type: 'song' | 'artist' | 'album' | 'playlist'
  id: number
  name: string
  sub?: string
}

const SUGGEST_TYPE_LABEL: Record<SuggestItem['type'], string> = {
  song: '歌曲',
  artist: '艺人',
  album: '专辑',
  playlist: '歌单',
}

const SearchModal = () => {
  const { showSearchModal } = useSnapshot(uiStates)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const platform = useOSPlatform()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | undefined>(undefined)

  const [searchText, setSearchText] = useState('')

  const close = () => {
    uiStates.showSearchModal = false
  }

  // ── Debounce cleanup (input state itself is uncommitted — the modal
  // never shows live results; Enter jumps to the full results page). ──
  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    },
    []
  )

  const handleChange = (text: string) => {
    setSearchText(text)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (text.trim().length === 0) {
      // 清空输入立即清空建议（不等防抖）
      setDebouncedText('')
      debounceRef.current = undefined
      return
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = undefined
      setDebouncedText(text.trim())
    }, SUGGEST_DEBOUNCE_MS)
  }

  useLockMainScroll(showSearchModal)

  // ── ⌘F / Ctrl+F toggle — fixed listener, works even while typing in an
  // input (useApplyKeyboardShortcuts deliberately skips input targets). ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return
      const mod =
        platform === 'darwin' ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (!mod) return
      e.preventDefault()
      uiStates.showSearchModal = !uiStates.showSearchModal
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [platform])

  // Auto-focus + select-all on open: keep the previous query but select it
  // so retyping replaces it (Spotlight behavior). 关闭时把焦点还给打开前的
  // 元素（dialog 可访问性：焦点不丢进 body）。
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (showSearchModal) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      // Wait a tick for the input to mount before focusing.
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    } else {
      restoreFocusRef.current?.focus?.()
      restoreFocusRef.current = null
    }
  }, [showSearchModal])

  const submit = (override?: string) => {
    const keywords = (override ?? searchText).trim()
    // Never navigate with an empty keyword — it renders a blank search page.
    if (!keywords) return
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }
    setHistory(addSearchHistory(keywords))
    close()
    navigate(`/search/${encodeURIComponent(keywords)}`)
  }

  // Hot search words for the empty state (fetched only while the modal is
  // open on an empty query; cached 10 min afterwards).
  const empty = searchText.trim().length === 0
  const hotQuery = useSearchHot(showSearchModal && empty)
  const hotWords = useMemo(
    () => (hotQuery.data?.code === 200 ? (hotQuery.data.data ?? []).slice(0, 10) : []),
    [hotQuery.data]
  )

  // ── 搜索历史（localStorage，打开时读取，提交时更新） ──
  const [history, setHistory] = useState<string[]>([])
  useEffect(() => {
    if (showSearchModal) setHistory(getSearchHistory())
  }, [showSearchModal])

  // ── 搜索建议：输入防抖 300ms 后请求，扁平化为可键盘导航的列表 ──
  const [debouncedText, setDebouncedText] = useState('')
  const suggestQuery = useSearchSuggestions(showSearchModal ? debouncedText : '')
  const [activeIndex, setActiveIndex] = useState(-1)
  useEffect(() => setActiveIndex(-1), [debouncedText])

  const suggestItems = useMemo<SuggestItem[]>(() => {
    const result = suggestQuery.data?.result
    if (!result) return []
    const items: SuggestItem[] = []
    for (const group of result.order ?? []) {
      if (group === 'songs') {
        for (const song of (result.songs ?? []).slice(0, 3)) {
          items.push({
            key: `song-${song.id}`,
            type: 'song',
            id: song.id,
            name: song.name,
            sub: song.ar?.map(a => a.name).join(', '),
          })
        }
      } else if (group === 'artists') {
        for (const artist of (result.artists ?? []).slice(0, 2)) {
          items.push({ key: `artist-${artist.id}`, type: 'artist', id: artist.id, name: artist.name })
        }
      } else if (group === 'albums') {
        for (const album of (result.albums ?? []).slice(0, 2)) {
          items.push({
            key: `album-${album.id}`,
            type: 'album',
            id: album.id,
            name: album.name,
            sub: album.artist?.name,
          })
        }
      } else if (group === 'playlists') {
        for (const playlist of (result.playlists ?? []).slice(0, 2)) {
          items.push({ key: `playlist-${playlist.id}`, type: 'playlist', id: playlist.id, name: playlist.name })
        }
      }
    }
    return items.slice(0, 8)
  }, [suggestQuery.data])

  const activateSuggest = (item: SuggestItem) => {
    close()
    if (item.type === 'song') {
      // 单曲建议直接播放（启动器效率优先），其余进对应详情页
      player.playAList([item.id])
    } else if (item.type === 'artist') {
      navigate(`/artist/${item.id}`)
    } else if (item.type === 'album') {
      navigate(`/album/${item.id}`)
    } else {
      navigate(`/playlist/${item.id}`)
    }
  }

  return (
    <>
      {/* Backdrop — click closes */}
      <AnimatePresence>
        {showSearchModal && (
          <motion.div
            className='fixed inset-0 z-30 bg-black/60 backdrop-blur-3xl'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease }}
            onClick={close}
          />
        )}
      </AnimatePresence>

      {/* Content — top-biased center, Spotlight style */}
      <AnimatePresence>
        {showSearchModal && (
          <div className='pointer-events-none fixed inset-0 z-30 flex items-start justify-center pt-[10vh]'>
            <motion.div
              role='dialog'
              aria-modal='true'
              aria-label='Search'
              className={cx(
                'app-region-no-drag pointer-events-auto flex flex-col rounded-24 shadow-2xl',
                'border border-black/10 bg-white/95 dark:border-white/10 dark:bg-black/95',
                'backdrop-blur-2xl',
                'w-[min(640px,92vw)]'
              )}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: 0.25, ease },
              }}
              exit={{
                opacity: 0,
                y: -8,
                scale: 0.98,
                transition: { duration: 0.15, ease },
              }}
            >
              {/* Input row — divider only when hot words render below it,
                  otherwise the border dangles as a stray line. */}
              <div
                className={cx(
                  'flex items-center p-4',
                  (empty && (hotWords.length > 0 || history.length > 0) ||
                    (!empty && suggestItems.length > 0)) &&
                    'border-b border-black/10 dark:border-white/10'
                )}
              >
                <Icon name='search' className='mr-3 h-6 w-6 shrink-0 opacity-50' />
                <input
                  ref={inputRef}
                  placeholder={t`search.search`.toString()}
                  className='grow bg-transparent text-18 font-medium outline-hidden placeholder:text-black/40 dark:placeholder:text-white/40'
                  value={searchText}
                  onChange={e => handleChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      close()
                      return
                    }
                    // 建议列表的键盘导航（上下移动、Enter 激活）
                    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestItems.length > 0) {
                      e.preventDefault()
                      const offset = e.key === 'ArrowDown' ? 1 : -1
                      // 状态空间是 -1（无选中）..len-1，共 len+1 个
                      setActiveIndex(
                        prev =>
                          ((prev + 1 + offset + suggestItems.length + 1) %
                            (suggestItems.length + 1)) -
                          1
                      )
                      return
                    }
                    if (e.key !== 'Enter') return
                    // The Enter that confirms an IME composition (zh-CN input
                    // methods report isComposing / keyCode 229) must not navigate.
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    e.preventDefault()
                    if (activeIndex >= 0 && suggestItems[activeIndex]) {
                      activateSuggest(suggestItems[activeIndex])
                      return
                    }
                    submit()
                  }}
                />
              </div>

              {/* 搜索建议：非空输入时替换热词区。单曲直接播放，其余进详情页 */}
              {!empty && suggestItems.length > 0 && (
                <div className='max-h-[50vh] overflow-y-auto p-3' data-testid='search-suggestions'>
                  {suggestItems.map((item, index) => (
                    <button
                      key={item.key}
                      onClick={() => activateSuggest(item)}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-12 px-3 py-2.5 text-left transition-colors',
                        index === activeIndex
                          ? 'bg-black/10 dark:bg-white/10'
                          : 'hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      <span className='shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-12 font-bold text-black/40 dark:bg-white/5 dark:text-white/40'>
                        {SUGGEST_TYPE_LABEL[item.type]}
                      </span>
                      <span className='line-clamp-1 grow text-14 font-medium'>{item.name}</span>
                      {item.sub && (
                        <span className='line-clamp-1 max-w-[40%] shrink-0 text-12 font-medium text-black/40 dark:text-white/40'>
                          {item.sub}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state — 搜索历史 + 热词；点击直达完整结果页 */}
              {empty && history.length > 0 && (
                <div className='p-3 pb-0' data-testid='search-history'>
                  <div className='flex items-baseline justify-between px-3 pb-1 pt-3'>
                    <div className='text-12 font-medium uppercase tracking-wider text-black/40 dark:text-white/40'>
                      {t`search.history`}
                    </div>
                    <button
                      onClick={() => {
                        clearSearchHistory()
                        setHistory([])
                      }}
                      className='text-12 font-bold text-black/30 hover:text-black/60 dark:text-white/30 dark:hover:text-white/60'
                    >
                      {t`search.clear-history`}
                    </button>
                  </div>
                  <div className='flex flex-wrap gap-2 p-1 pt-1'>
                    {history.map(word => (
                      <button
                        key={word}
                        onClick={() => submit(word)}
                        className={cx(
                          'rounded-full px-3 py-1.5 text-14 font-medium transition-colors',
                          'bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                        )}
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {empty && hotWords.length > 0 && (
                <div className='p-3'>
                  <div className='px-3 pb-1 pt-3 text-12 font-medium uppercase tracking-wider text-black/40 dark:text-white/40'>
                    {t`search.hot-search`}
                  </div>
                  <div className='flex flex-wrap gap-2 p-1 pt-1'>
                    {hotWords.map((hot, i) => (
                      <button
                        key={`${hot.searchWord}-${i}`}
                        onClick={() => submit(hot.searchWord)}
                        className={cx(
                          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-14 font-medium transition-colors',
                          'bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                        )}
                      >
                        <span
                          className={cx(
                            'text-12 font-bold',
                            i < 3 ? 'text-brand-700' : 'text-black/30 dark:text-white/30'
                          )}
                        >
                          {i + 1}
                        </span>
                        {hot.searchWord}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

export default SearchModal
