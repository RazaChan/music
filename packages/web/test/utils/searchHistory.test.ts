import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  MAX_HISTORY,
} from '@/web/utils/searchHistory'

beforeEach(() => {
  localStorage.removeItem('searchHistory')
})

describe('搜索历史', () => {
  it('新增记录最新在前', () => {
    addSearchHistory('周杰伦')
    addSearchHistory('晴天')
    expect(getSearchHistory()).toEqual(['晴天', '周杰伦'])
  })

  it('重复词条去重置顶', () => {
    addSearchHistory('a')
    addSearchHistory('b')
    addSearchHistory('a')
    expect(getSearchHistory()).toEqual(['a', 'b'])
  })

  it('超过上限截断最旧的', () => {
    for (let i = 0; i < MAX_HISTORY + 3; i++) addSearchHistory(`kw${i}`)
    const history = getSearchHistory()
    expect(history).toHaveLength(MAX_HISTORY)
    expect(history[0]).toBe(`kw${MAX_HISTORY + 2}`)
  })

  it('空白词条不入库', () => {
    addSearchHistory('   ')
    expect(getSearchHistory()).toEqual([])
  })

  it('损坏的存储数据降级为空历史', () => {
    localStorage.setItem('searchHistory', '{bad json')
    expect(getSearchHistory()).toEqual([])
    localStorage.setItem('searchHistory', '{"not":"array"}')
    expect(getSearchHistory()).toEqual([])
    localStorage.setItem('searchHistory', '[1, "ok", null]')
    expect(getSearchHistory()).toEqual(['ok'])
  })

  it('清空', () => {
    addSearchHistory('a')
    clearSearchHistory()
    expect(getSearchHistory()).toEqual([])
  })
})
