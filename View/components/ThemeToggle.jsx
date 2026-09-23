import { controls } from '../../Model/site.js'
import { useTheme } from '../lib/theme.js'

/* ===========================================================================
   The light/dark switch, floating clear of the page. Its own label names the
   mode the page is in now, not the one a click leads to.
   =========================================================================== */

export default function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isLight ? controls.themeToDark : controls.themeToLight}
      title={isLight ? controls.themeToDark : controls.themeToLight}
    >
      {isLight ? 'Lys' : 'Mørk'}
    </button>
  )
}
