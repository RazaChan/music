import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import { teardownLocalSession } from './session'

// In dev, Vite proxies '/netease' to the local API server (see vite.config).
// In production builds the env var may be missing; fall back to the same path
// instead of turning `undefined` into the literal string "undefined".
const baseURL = import.meta.env.DEV
  ? '/netease'
  : (import.meta.env.VITE_APP_NETEASE_API_URL ?? '/netease')

const service: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 50000,
})

service.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  return config
})

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response
    return res
  },
  (error: AxiosError) => {
    const { response } = error
    const data = response?.data as any
    if (data?.code === 301 && data?.message === '未登录') {
      // 会话已失效：做本地清理（节流，见 utils/session.ts）。
      // 必须异步延迟执行 —— 同步执行会在当前查询自己的 rejection 链里
      // cancel 它自己，产生未处理的 CancelledError（冒烟实测抓到）。
      // 不能在这里调上游 /logout —— logout 接口自身也会 301，会循环。
      setTimeout(() => {
        teardownLocalSession()
      }, 0)
    }
    return Promise.reject(error)
  }
)

// `config` is forwarded to axios as-is, so per-call `signal` (abort) and
// per-call `timeout` (overrides the 50s instance default above) are honored
// whenever callers provide them, e.g. from react-query queryFns:
//   ({ signal }) => fetchFoo(params, { signal, timeout: 15000 })
const request = async (config: AxiosRequestConfig) => {
  const { data } = await service.request(config)
  return data as any
}

export default request
