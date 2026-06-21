export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) || 'light'
}

export function applyTheme(theme: Theme) {
  localStorage.setItem('theme', theme)
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function initTheme() {
  applyTheme(getStoredTheme())
}
