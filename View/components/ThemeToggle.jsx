import { controls } from '../../Model/site.js'
import { useTheme } from '../lib/theme.js'

/* ===========================================================================
   The light/dark switch, floating clear of the page. A checkbox under the
   hood, since that is what a two-state switch already is; the pill and dot
   are just its label re-drawn.
   =========================================================================== */

export default function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const isLight = theme === 'light'

  return (
    <div className="theme-toggle">
      <label className="switch">
        <input
          type="checkbox"
          className="input__check"
          checked={isLight}
          onChange={toggle}
          aria-label={isLight ? controls.themeToDark : controls.themeToLight}
          title={isLight ? controls.themeToDark : controls.themeToLight}
        />
        <span className="slider" aria-hidden="true" />
      </label>
    </div>
  )
}
