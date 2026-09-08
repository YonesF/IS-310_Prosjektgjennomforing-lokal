import { useEffect, useState } from 'react'
import { members } from '../../Model/site.js'
import LitText from './LitText.jsx'
import SlidePanel from './SlidePanel.jsx'

/* ===========================================================================
   The panel a portrait opens: the same face again, larger, with whatever is
   known about the person beside it. It slides in from the side.

   The dialog itself, the drag-to-scroll and the close button come from
   SlidePanel; what is left here is only what this panel says.

   Any field left empty in the model is left out rather than printed as a blank
   row, so an entry that is still being written never looks broken.
   =========================================================================== */

const { detail } = members

export default function MemberPanel({ person, onClose }) {
  /* The panel keeps showing whoever it last showed while it slides out. The
     content is only ever replaced by the next person, never emptied, so the
     closing animation has something to animate. A closed dialog is not
     rendered to anyone, so what it still holds cannot be read or tabbed into. */
  const [shown, setShown] = useState(null)

  useEffect(() => {
    if (person) setShown(person)
  }, [person])

  const interests = shown?.interests?.filter(Boolean) ?? []
  const description = shown?.description?.trim()
  const bare = !shown?.age && interests.length === 0 && !description
  const title = shown ? (shown.fullName ?? shown.name) : ''

  /* A link with an address is a link; one without is shown as waiting rather
     than as a button that goes nowhere. */
  const links = detail.linkOrder.map((entry) => ({
    ...entry,
    href: shown?.links?.[entry.key]?.trim() ?? '',
  }))

  return (
    <SlidePanel
      block="member-panel"
      open={Boolean(person)}
      onClose={onClose}
      closeLabel={detail.close}
      label={shown ? `${detail.open} ${title}` : undefined}
    >
      {shown ? (
        <>
          <img
            className="member-panel__photo"
            src={shown.src}
            alt=""
            width={members.portrait.width}
            height={members.portrait.height}
            decoding="async"
          />

          <div className="member-panel__text">
            <h2 className="member-panel__name">{title}</h2>

            {shown.role ? <p className="member-panel__role">{shown.role}</p> : null}
            {shown.study ? <p className="member-panel__study">{shown.study}</p> : null}

            {shown.age ? (
              <p className="member-panel__age">
                {detail.age}: {shown.age} {detail.years}
              </p>
            ) : null}

            {interests.length > 0 ? (
              <section className="member-panel__block">
                <h3 className="member-panel__label">{detail.interests}</h3>
                <ul className="member-panel__interests">
                  {interests.map((interest) => (
                    <li key={interest}>{interest}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {description ? (
              <section className="member-panel__block">
                <h3 className="member-panel__label">{detail.about}</h3>
                <LitText text={description} className="member-panel__about" revision={shown} />
              </section>
            ) : null}

            {bare ? <p className="member-panel__empty">{detail.empty}</p> : null}

            <section className="member-panel__block">
              <h3 className="member-panel__label">{detail.links}</h3>
              <ul className="member-panel__links">
                {links.map((link) => (
                  <li key={link.key}>
                    {link.href ? (
                      <a
                        className="member-panel__link"
                        href={link.href}
                        target="_blank"
                        /* noreferrer as well as noopener: the new tab has no
                           business knowing where it was opened from. */
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <span className="member-panel__link is-pending">
                        {link.label}
                        <span className="member-panel__link-note">{detail.linkPending}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </SlidePanel>
  )
}
