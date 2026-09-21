import { useEffect, useRef } from 'react'
import { ScrollTrigger } from '../lib/gsap.js'
import { useMotion } from '../lib/motion.jsx'

/* ===========================================================================
   A paragraph that lights word by word as it is scrolled up the screen: dim
   ahead of the reading line, full strength behind it. It works in a panel
   that scrolls on its own, and on the page itself.

   The whole thing is one custom property written on the paragraph, and the
   words work out their own share of it in CSS - so a scroll costs one style
   write, whatever the word count. Same trick the contour map uses for its
   lines.

   Nothing may be left stranded half-read. A panel is only as tall as what is
   in it, so most of them barely scroll at all - and a reveal measured in
   paragraph-heights would then ask for travel the panel does not have, leaving
   the words part-lit at the bottom of the scroll with no gesture left to
   finish them. Two rules keep that from happening: a panel without room enough
   to be worth scrolling simply shows its text, and one with some room lights
   its words across the room it actually has.
   =========================================================================== */

/* The line down the panel that words light up as they rise past. */
const READING_LINE = 0.78

/* The same line down the page - a little higher, since a page has the whole
   screen to carry a paragraph across and the eye rests nearer its middle. */
const PAGE_LINE = 0.72

/* Words light one after another rather than all at once: this is how much of
   the paragraph's travel each one takes to come up. */
const WORD_SPAN = 0.16

/* Less scroll than this - measured against the height of the panel - is not a
   scroll, it is a nudge. Below it there is no progression worth showing, so the
   text is simply lit rather than animated against a gesture nobody would make. */
const MIN_TRAVEL = 0.14

export default function LitText({ text, className, revision }) {
  const paragraph = useRef(null)
  const { still } = useMotion()
  const words = text.split(' ')

  useEffect(() => {
    const node = paragraph.current
    if (!node) return undefined

    if (still) {
      node.style.setProperty('--lit', '1')
      return undefined
    }

    const lit = (value) => node.style.setProperty('--lit', value)

    /* On the page, the scroll is the page's own, and ScrollTrigger already
       measures it - through Lenis, against the viewport the page actually has.
       The paragraph lights between its top edge reaching the reading line and
       its bottom edge reaching it, progress tied to the scroll and nothing
       else, so the words come up at the pace the visitor reads. */
    const panel = node.closest('dialog')
    if (!panel) {
      const trigger = ScrollTrigger.create({
        trigger: node,
        start: `top ${PAGE_LINE * 100}%`,
        end: `bottom ${PAGE_LINE * 100}%`,
        onUpdate: (self) => lit(self.progress.toFixed(4)),
        onRefresh: (self) => lit(self.progress.toFixed(4)),
      })
      return () => trigger.kill()
    }

    /* In a panel, the panel does the scrolling. */
    const port = panel

    const update = () => {
      const room = port.scrollHeight - port.clientHeight
      const view = port.clientHeight

      /* Nothing to scroll, or so little of it that scrolling would not read as
         a movement: show the end of the reveal, the same answer reduced motion
         gets. */
      if (room <= Math.max(view * MIN_TRAVEL, 1)) {
        lit('1')
        return
      }

      /* The panel stands still and its box is the origin everything inside is
         measured from. */
      const origin = port.getBoundingClientRect().top
      const box = node.getBoundingClientRect()
      const line = view * READING_LINE

      /* The two scroll positions this paragraph lights between: where its top
         edge reaches the reading line, and where its bottom edge does. */
      let start = box.top - origin + port.scrollTop - line
      let end = start + box.height

      /* Already up past the line with the panel at rest - there is no reveal
         left to play, only text to read. */
      if (end <= 0) {
        lit('1')
        return
      }

      /* Finishing out of reach is the one thing this must never do. Where the
         panel is too short to carry the paragraph its whole height past the
         line, slide the window back so it ends exactly where the scroll ends -
         keeping its length, and so its pace, wherever there is room for it. */
      if (end > room) {
        const travel = end - start
        end = room
        start = Math.max(end - travel, 0)
      }

      const travelled = (port.scrollTop - start) / Math.max(end - start, 1)
      lit(Math.min(Math.max(travelled, 0), 1).toFixed(4))
    }

    update()
    port.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    /* The first reading happens before the panel's photograph has arrived, when
       there is nothing to scroll yet and every word is therefore lit. Once the
       picture lands the panel grows and the answer changes, so watch the sheet
       and read it again rather than leaving the stale one in place. */
    const sheet = port.firstElementChild
    const grew = sheet ? new ResizeObserver(update) : null
    grew?.observe(sheet)

    return () => {
      port.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      grew?.disconnect()
    }
  }, [revision, still, text])

  return (
    <p className={className} data-lit="" ref={paragraph}>
      {words.map((word, index) => (
        <span
          className="lit-word"
          /* Spread across the progress up to one span short of the end, so the
             last word finishes lighting exactly as the paragraph finishes its
             travel. Running these to 1.0 instead leaves the closing words
             permanently half-lit. */
          style={{
            '--from': ((index / Math.max(words.length - 1, 1)) * (1 - WORD_SPAN)).toFixed(4),
          }}
          key={`${word}-${index}`}
        >
          {index < words.length - 1 ? `${word} ` : word}
        </span>
      ))}
    </p>
  )
}
