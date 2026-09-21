import { useEffect, useRef } from 'react'
import { ScrollTrigger } from '../lib/gsap.js'
import { useMotion } from '../lib/motion.jsx'

/* ===========================================================================
   Prose that is out of focus until it is read: every word starts blurred and
   faint, and they come into focus one after another as the page is scrolled,
   the first clause first and the last word last. The focus follows the
   scroll and nothing else - it runs from the block coming into view to the
   very bottom of the page, so the last of it clears only when there is no
   further to go.

   One number carries it: the progress, written to a custom property on the
   block, and each word works out its own share of it in CSS. A paragraph
   break is only a break in the flow of words, not of the focus.

   The progress is measured from the section the block sits in, not the
   block itself: a block low in the last section would otherwise cross its
   start line only a few pixels before the page ran out, and clear in a jump
   rather than over the last screen of scrolling.
   =========================================================================== */

/* How much of the travel each word takes to come into focus. */
const WORD_SPAN = 0.14

/* Where the section is when the first word starts to clear: its top this far
   down the screen. */
const START_LINE = 0.85

export default function BlurProse({ lead, paragraphs, className }) {
  const block = useRef(null)
  const { still } = useMotion()

  /* The words of every paragraph in one run, so their shares are spread over
     the whole block. The lead opens the first paragraph. */
  const runs = paragraphs.map((text, index) => (index === 0 && lead ? `${lead} ${text}` : text).split(' '))
  const total = runs.reduce((sum, words) => sum + words.length, 0)
  let placed = 0

  useEffect(() => {
    const node = block.current
    if (!node) return undefined

    if (still) {
      node.style.setProperty('--focus', '1')
      return undefined
    }

    const trigger = ScrollTrigger.create({
      trigger: node.closest('section') ?? node,
      start: `top ${START_LINE * 100}%`,
      end: 'max',
      onUpdate: (self) => node.style.setProperty('--focus', self.progress.toFixed(4)),
      onRefresh: (self) => node.style.setProperty('--focus', self.progress.toFixed(4)),
    })
    return () => trigger.kill()
  }, [still, total])

  return (
    <div className={className} data-blur-prose="" ref={block}>
      {runs.map((words, index) => (
        <p key={words.slice(0, 5).join(' ')}>
          {words.map((word, wordIndex) => {
            /* Spread across the progress up to one span short of the end, so
               the last word finishes exactly as the scroll runs out. */
            const from = ((placed / Math.max(total - 1, 1)) * (1 - WORD_SPAN)).toFixed(4)
            placed += 1
            /* The space sits between the spans, not inside: a word is an
               inline block, and a block swallows its trailing space. */
            return (
              <span key={`${word}-${wordIndex}`}>
                <span className="blur-word" style={{ '--from': from }}>
                  {word}
                </span>
                {wordIndex < words.length - 1 ? ' ' : null}
              </span>
            )
          })}
        </p>
      ))}
    </div>
  )
}
