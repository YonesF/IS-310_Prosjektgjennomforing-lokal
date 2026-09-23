import { controls } from '../../Model/site.js'
import { useTheme } from '../lib/theme.js'

/* ===========================================================================
   The light/dark switch that sits in the navigation. A single button, since
   there are only two states to move between; which one it moves to next is
   what its label and aria-pressed say.
   =========================================================================== */

export default function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={isLight}
      aria-label={isLight ? controls.themeToDark : controls.themeToLight}
      title={isLight ? controls.themeToDark : controls.themeToLight}
    >
      <span className="theme-toggle__dot" aria-hidden="true" />
    </button>
  )
}
