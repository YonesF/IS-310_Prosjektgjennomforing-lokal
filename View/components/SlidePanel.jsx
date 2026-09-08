import { useEffect, useRef } from 'react'

/* ===========================================================================
   The panel behaviour both sheets share: one slides in from the side over a
   portrait, one rises from the bottom over the group.

   Built on <dialog> rather than a div with a role, because the element brings
   the hard parts with it - Escape closes, focus moves in and comes back to
   whatever was clicked, and the page behind goes inert so a stray tab cannot
   wander off into it.

   Only the behaviour lives here. Where a panel comes from, how wide it is and
   what it looks like is left to the block name the caller passes, so the two
   read as different objects while agreeing about how they work.
   =========================================================================== */

/* How far a press has to travel before it counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4

export default function SlidePanel({ block, open, onClose, label, closeLabel, children }) {
  const dialog = useRef(null)

  useEffect(() => {
    const node = dialog.current
    if (!node) return

    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  /* Escape and the backdrop both close the dialog on their own; this is how
     the state that opened it hears about that. */
  useEffect(() => {
    const node = dialog.current
    if (!node) return undefined

    const closed = () => onClose()
    node.addEventListener('close', closed)
    return () => node.removeEventListener('close', closed)
  }, [onClose])

  /* A click that lands on the dialog itself rather than on anything inside it
     is a click on the backdrop. */
  const backdrop = (event) => {
    if (event.target === dialog.current) onClose()
  }

  /* --- Grab and drag to scroll -------------------------------------------
     Press anywhere in the panel and move, and the content follows the hand:
     drag up, the panel scrolls down. Mouse only - a finger already drags the
     panel natively and the two would fight over the same gesture.

     A press that never travels further than a few pixels is a click, not a
     drag, so links and the close button keep working; past that threshold the
     click that ends the gesture is swallowed, or letting go over the backdrop
     would shut the panel the visitor was reading. */
  const drag = useRef({ id: null, startY: 0, startTop: 0, moved: false })

  const dragStart = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return

    const node = dialog.current
    if (!node || node.scrollHeight <= node.clientHeight) return

    drag.current = {
      id: event.pointerId,
      startY: event.clientY,
      startTop: node.scrollTop,
      moved: false,
    }
  }

  const dragMove = (event) => {
    const state = drag.current
    const node = dialog.current
    if (state.id !== event.pointerId || !node) return

    const travel = event.clientY - state.startY

    if (!state.moved) {
      if (Math.abs(travel) < DRAG_THRESHOLD) return
      state.moved = true
      node.classList.add('is-dragging')
      node.setPointerCapture(event.pointerId)
    }

    node.scrollTop = state.startTop - travel
  }

  const dragEnd = (event) => {
    const state = drag.current
    const node = dialog.current
    if (state.id !== event.pointerId) return

    if (node) {
      node.classList.remove('is-dragging')
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
    }

    state.id = null
  }

  /* Runs before the backdrop handler and before any link, and only ever after
     a gesture that actually moved. */
  const swallowClick = (event) => {
    if (!drag.current.moved) return

    drag.current.moved = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <dialog
      className={block}
      ref={dialog}
      /* Lenis eases the whole window and swallows the wheel to do it, which
         leaves a panel unable to scroll while the page behind it moves
         instead. This is how Lenis is told to keep its hands off. */
      data-lenis-prevent=""
      onClick={backdrop}
      onClickCapture={swallowClick}
      onPointerDown={dragStart}
      onPointerMove={dragMove}
      onPointerUp={dragEnd}
      onPointerCancel={dragEnd}
      aria-label={label}
    >
      <div className={`${block}__sheet`}>
        {/* A bar of no height at all, so the button hangs over the picture
            rather than taking a row above it, and stays put when a long entry
            scrolls underneath. */}
        <div className={`${block}__bar`}>
          <button type="button" className={`${block}__close`} onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="visually-hidden">{closeLabel}</span>
          </button>
        </div>

        {children}
      </div>
    </dialog>
  )
}
