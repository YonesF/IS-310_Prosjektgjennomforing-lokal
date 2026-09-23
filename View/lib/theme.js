import { useEffect, useState } from 'react'

/* ===========================================================================
   The light/dark switch. The tokens in base.css are written light-first, so
   the only state this file ever has to apply on top is 'dark' - anything
   else, including a blocked localStorage, simply leaves the light defaults in
   place. The inline script in index.html reads the same key before paint, so
   a returning visitor's choice never flashes the other theme first.
   =========================================================================== */

const STORAGE_KEY = 'is310-theme'
export const THEME_EVENT = 'is310:theme'

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* Private browsing can refuse storage; the toggle still holds for the tab. */
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }))
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    const sync = (event) => setTheme(event.detail)
    window.addEventListener(THEME_EVENT, sync)
    return () => window.removeEventListener(THEME_EVENT, sync)
  }, [])

  const toggle = () => applyTheme(theme === 'light' ? 'dark' : 'light')

  return [theme, toggle]
}
