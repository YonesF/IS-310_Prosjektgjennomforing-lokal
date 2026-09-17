/* ===========================================================================
   The mark on a picture that opens something: a chevron pointing the way its
   panel comes in. Up under the group, whose panel rises from the bottom; left
   on a portrait, whose panel slides in from the right.

   Purely for the eye - the button it sits on already says what it does - so
   it is hidden from assistive technology here rather than at every use.
   =========================================================================== */

const PATHS = {
  up: 'M5 15.5 12 8.5l7 7',
  left: 'M15.5 5 8.5 12l7 7',
}

export default function Chevron({ className, direction = 'up' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
      <path d={PATHS[direction]} stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
