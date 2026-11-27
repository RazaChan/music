export const changeTheme = (theme: 'light' | 'dark') => {
  document.body.setAttribute('class', theme)
  if (!window.env?.isElectron) {
    document.documentElement.style.background = theme === 'dark' ? '#000' : '#fff'
  }
}

/** 设置值（含 'system'）→ 实际应用的主题 */
export const resolveTheme = (theme: string | undefined): 'light' | 'dark' => {
  if (theme === 'light' || theme === 'dark') return theme
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

export const getTheme = () => {
  return document.body.getAttribute('class')
}

export const changeAccentColor = (color: string) => {
  document.body.setAttribute('data-accent-color', color)
}

const settingsInStorage = localStorage.getItem('settings')
const settings = settingsInStorage ? JSON.parse(settingsInStorage) : {}

changeTheme(resolveTheme(settings.theme))
changeAccentColor(settings?.accentColor || 'lime')

// 主题为「跟随系统」时，系统深浅色变化即时跟随。
// 直接读 localStorage 而非 states/settings —— 本模块在 store 初始化前就被导入。
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    try {
      const current = JSON.parse(localStorage.getItem('settings') || '{}')
      if (current.theme === 'system') changeTheme(resolveTheme('system'))
    } catch {
      /* ignore */
    }
  })
