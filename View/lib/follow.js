/* ===========================================================================
   A photograph that follows the pointer by a few pixels inside its frame.

   Where the pointer is, as a pair from -0.5 to 0.5 across the element, is
   written straight to two custom properties on it rather than through state,
   so the whole thing is one style write and never re-renders anything. What
   the picture does with the pair is the CSS's business.

   Mouse only: a finger already drags the page, and a picture that shifts
   under it would read as the scroll going wrong.
   =========================================================================== */
export function follow(event) {
  if (event.pointerType !== 'mouse') return
  const node = event.currentTarget
  const rect = node.getBoundingClientRect()
  node.style.setProperty('--mx', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3))
  node.style.setProperty('--my', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3))
}

export function release(event) {
  const node = event.currentTarget
  node.style.setProperty('--mx', '0')
  node.style.setProperty('--my', '0')
}
