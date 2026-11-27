/**
 * 本地会话清理。供两条路径共用：
 *
 *  1. 用户主动登出（useUser.logout：先调上游 /logout，再走这里）
 *  2. 接口返回 301 未登录（request.ts 响应拦截器）
 *
 * 注意：301 路径绝不能反过来调上游 /logout —— logout 接口自身也会 301，
 * 会形成循环。所以这里只做本地清理：Cookie、React Query 缓存（含全部
 * 用户数据，防止账号切换后残留上一个账号的内容）、桌面端账号。
 *
 * 多个并发请求同时 301 会重复触发，节流窗口内只执行第一次。
 */
import { IpcChannels } from '@/shared/IpcChannels'
import reactQueryClient from './reactQueryClient'
import { removeAllCookies } from './cookie'

const TEARDOWN_THROTTLE_MS = 3000
let lastTeardownAt = 0

export const teardownLocalSession = async (): Promise<void> => {
  const now = Date.now()
  if (now - lastTeardownAt < TEARDOWN_THROTTLE_MS) return
  lastTeardownAt = now

  removeAllCookies()

  // 清缓存不能用 clear()/cancelQueries()：它们会 cancel 进行中的查询，
  // retryer promise 以 CancelledError 拒绝且无人接管，成为未处理的
  // rejection（冒烟实测抓到）。改为结算感知移除：
  //  - 已结算的查询直接移除（其 retryer 已完成，destroy 不再触发 cancel）
  //  - 进行中的查询等结算后再移除（其结果最多短暂可见，随后即从缓存消失）
  const cache = reactQueryClient.getQueryCache()
  cache.getAll().forEach(query => {
    if (query.state.fetchStatus === 'fetching') {
      const unsubscribe = cache.subscribe(event => {
        if (event.query === query && query.state.fetchStatus !== 'fetching') {
          unsubscribe()
          // 通知回调里不做变更，推迟一拍再移除
          setTimeout(() => cache.remove(query), 0)
        }
      })
    } else {
      cache.remove(query)
    }
  })

  await window.ipcRenderer?.invoke(IpcChannels.Logout)
}
