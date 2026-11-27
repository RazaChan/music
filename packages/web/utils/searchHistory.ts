/**
 * 搜索历史（localStorage）。最新在前、去重、最多 MAX_HISTORY 条。
 * 读写失败（隐私模式等）静默降级为空历史，不影响搜索主流程。
 */
const STORAGE_KEY = 'searchHistory'
export const MAX_HISTORY = 10

export function getSearchHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export function addSearchHistory(keyword: string): string[] {
  const word = keyword.trim()
  if (!word) return getSearchHistory()
  const next = [word, ...getSearchHistory().filter(item => item !== word)].slice(0, MAX_HISTORY)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
