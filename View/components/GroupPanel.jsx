import { createContext, use, useCallback, useState } from 'react'
import { members } from '../../Model/site.js'
import LitText from './LitText.jsx'
import SlidePanel from './SlidePanel.jsx'

/* ===========================================================================
   The panel the group photographs open. It rises from the bottom rather than
   sliding in from the side: the portraits are a row of people and their panels
   come in beside them, while this one is about all of us and comes up under
   the picture it was opened from.

   Two pictures open it - the one that fills the landing and the one in
   Medlemmer - so there is one panel, mounted once above both, and a hook
   either picture calls to raise it.

   A template until it is written. Whatever is filled in is shown - the intro
   lighting itself word by word on the way up, the same as the descriptions -
   and whatever is not is left out rather than printed blank.
   =========================================================================== */

const { group, detail } = members

const GroupPanelContext = createContext(null)

export function GroupPanelProvider({ children }) {
  const [open, setOpen] = useState(false)
  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setOpen(false), [])

  return (
    <GroupPanelContext value={show}>
      {children}
      <GroupPanel open={open} onClose={hide} />
    </GroupPanelContext>
  )
}

/* What a picture calls to open the panel. */
export function useGroupPanel() {
  const show = use(GroupPanelContext)
  if (!show) throw new Error('useGroupPanel must be used inside <GroupPanelProvider>')
  return show
}

export default function GroupPanel({ open, onClose }) {
  const { panel } = group
  const intro = panel.intro?.trim()
  const paragraphs = (panel.paragraphs ?? []).map((text) => text?.trim()).filter(Boolean)
  const bare = !intro && paragraphs.length === 0

  /* The first frame stands for the set: the panel is about the group, not
     about which photograph of them happens to be showing. */
  const [photo] = group.photos

  return (
    <SlidePanel
      block="group-panel"
      open={open}
      onClose={onClose}
      closeLabel={detail.close}
      /* The name alone tells a screen reader nothing about what opened; the
         subtitle is what says it. */
      label={panel.subtitle ? `${panel.title} - ${panel.subtitle}` : panel.title}
    >
      {/* The photograph is the room the text stands in rather than a picture
          beside it: blurred out behind everything, with the edges falling away
          into dark blue so the words keep their contrast wherever they land. */}
      <div className="group-panel__backdrop" aria-hidden="true">
        <img
          className="group-panel__photo"
          src={photo.src}
          alt=""
          width={photo.width}
          height={photo.height}
          decoding="async"
        />
      </div>

      <div className="group-panel__text">
        <h2 className="group-panel__title">{panel.title}</h2>
        {panel.subtitle ? <p className="group-panel__subtitle">{panel.subtitle}</p> : null}

        {intro ? <LitText text={intro} className="group-panel__intro" revision={open} /> : null}

        {paragraphs.map((text) => (
          <LitText text={text} className="group-panel__body" revision={open} key={text.slice(0, 40)} />
        ))}

        {bare ? <p className="group-panel__empty">{detail.empty}</p> : null}
      </div>
    </SlidePanel>
  )
}
