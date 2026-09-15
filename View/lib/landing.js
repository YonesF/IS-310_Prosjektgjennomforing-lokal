import { useEffect, useState } from 'react'

/* ===========================================================================
   Whether the landing is on screen. The navigation arrives once the landing
   has gone; this is the one place that decides where that line falls.
   =========================================================================== */
export function useLandingInView() {
  /* True to begin with: the landing is the first thing on the page, and the
     observer's first callback only arrives after a frame. */
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const landing = document.querySelector('.landing')
    if (!landing) return undefined

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    })
    observer.observe(landing)
    return () => observer.disconnect()
  }, [])

  return inView
}
