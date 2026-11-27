/**
 * session.ts 单元测试 —— 登出 / 301 的本地会话清理
 *
 * 模块内有节流状态（lastTeardownAt），每个用例用 vi.resetModules +
 * 动态 import 拿全新模块实例；reactQueryClient 也必须动态 import，
 * 才能和 session 内部引用到同一个实例。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  const [{ teardownLocalSession }, { default: client }] = await Promise.all([
    import('@/web/utils/session'),
    import('@/web/utils/reactQueryClient'),
  ])
  return { teardownLocalSession, client }
}

const clearAllCookies = () => {
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; max-age=0`
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  clearAllCookies()
})

describe('teardownLocalSession', () => {
  it('清空 React Query 缓存与全部 Cookie', async () => {
    const { teardownLocalSession, client } = await load()
    client.setQueryData(['user', 'account'], { profile: { userId: 1 } })
    client.setQueryData(['likelist'], { ids: [1, 2, 3] })
    document.cookie = 'MUSIC_U=abc'
    document.cookie = 'NMTID=xyz'

    await teardownLocalSession()

    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(document.cookie).not.toContain('MUSIC_U')
    expect(document.cookie).not.toContain('NMTID')
  })

  it('节流窗口内的重复触发被跳过（并发 301 只清理一次）', async () => {
    const { teardownLocalSession, client } = await load()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100_000)

    await teardownLocalSession()
    // 第一次清理后又出现新的会话痕迹
    document.cookie = 'MUSIC_U=again'
    client.setQueryData(['user'], { profile: { userId: 2 } })

    nowSpy.mockReturnValue(101_000) // +1s，仍在 3s 节流窗口内
    await teardownLocalSession()
    expect(document.cookie).toContain('MUSIC_U=again')
    expect(client.getQueryCache().getAll().length).toBeGreaterThan(0)

    nowSpy.mockReturnValue(104_000) // +4s，窗口外
    await teardownLocalSession()
    expect(document.cookie).not.toContain('MUSIC_U')
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('进行中的查询不被 cancel（避免 CancelledError），结算后被移除', async () => {
    const { teardownLocalSession, client } = await load()
    let resolveQuery!: (v: string) => void
    const inFlight = new Promise<string>(res => {
      resolveQuery = res
    })
    // 不 await —— 保持 fetching 状态
    client.prefetchQuery({ queryKey: ['inflight'], queryFn: () => inFlight })
    client.setQueryData(['settled'], 'done')

    await teardownLocalSession()

    // 已结算的立即移除；进行中的保留（等待结算）
    const keys = () =>
      client
        .getQueryCache()
        .getAll()
        .map(q => q.queryKey[0])
    expect(keys()).not.toContain('settled')
    expect(keys()).toContain('inflight')

    // 结算后被自动移除
    resolveQuery('late-data')
    await new Promise(r => setTimeout(r, 30))
    expect(keys()).not.toContain('inflight')
  })
})
