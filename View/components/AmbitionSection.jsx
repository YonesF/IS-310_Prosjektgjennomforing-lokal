import { lazy } from 'react'
import { ambition } from '../../Model/site.js'
import BlurProse from './BlurProse.jsx'
import SceneSlot from './SceneSlot.jsx'

const LazyParticleGlobe = lazy(() => import('./ParticleGlobe.jsx'))
const LazyParticleStream = lazy(() => import('./ParticleStream.jsx'))

/* ===========================================================================
   Ambisjonsnivå: under the heading, the ambitions as prose, coming into
   focus as they are scrolled to; under that, the globe of particles turning.
   =========================================================================== */
export default function AmbitionSection() {
  return (
    <>
      <SceneSlot className="ambition__background" aria-hidden="true">
        <LazyParticleStream />
      </SceneSlot>

      <BlurProse className="ambition__prose" lead={ambition.lead} paragraphs={ambition.goals} />

      <SceneSlot className="ambition__scene" aria-hidden="true">
        <LazyParticleGlobe />
      </SceneSlot>
    </>
  )
}
