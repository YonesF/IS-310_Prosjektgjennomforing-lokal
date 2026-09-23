import { lazy } from 'react'
import { ambition } from '../../Model/site.js'
import BlurProse from './BlurProse.jsx'
import SceneSlot from './SceneSlot.jsx'

const LazyParticleGlobe = lazy(() => import('./ParticleGlobe.jsx'))
const LazyParticleStream = lazy(() => import('./ParticleStream.jsx'))

/* ===========================================================================
   Ambisjonsnivå: the ambitions come into focus on either side of the
   turning particle globe.
   =========================================================================== */
export default function AmbitionSection() {
  return (
    <>
      <SceneSlot className="ambition__background" aria-hidden="true">
        <LazyParticleStream />
      </SceneSlot>

      <BlurProse
        className="ambition__prose ambition__prose--left"
        lead={ambition.lead}
        paragraphs={ambition.goals.slice(0, 1)}
      />

      <SceneSlot className="ambition__scene" aria-hidden="true">
        <LazyParticleGlobe />
      </SceneSlot>

      <BlurProse
        className="ambition__prose ambition__prose--right"
        paragraphs={[ambition.goals.slice(1).join(' ')]}
      />
    </>
  )
}
