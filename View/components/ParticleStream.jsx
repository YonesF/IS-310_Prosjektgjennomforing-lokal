import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useMotion } from '../lib/motion.jsx'

const COMPACT_QUERY = '(max-width: 767px), (pointer: coarse)'
const HOST_STYLE = { position: 'absolute', inset: 0, pointerEvents: 'none' }

const SIMULATION_VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const SIMULATION_FRAGMENT = /* glsl */ `
  uniform sampler2D uPositions;
  uniform float uResolution;
  uniform float uInitialize;
  uniform float uTime;
  uniform float uDelta;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float ribbon(float x, float lane, float seed) {
    float phase = lane * 1.55;
    float arch = sin(x * 2.1 + uTime * 0.16 + phase) * 0.21;
    float ripple = sin(x * 4.8 - uTime * 0.12 + phase) * 0.045;
    float spread = (seed - 0.5) * 0.115;
    return (lane - 1.0) * 0.37 + arch + ripple + spread;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    if (uInitialize > 0.5) {
      float seed = hash(uv + 2.73);
      float lane = floor(hash(uv + 9.17) * 3.0);
      float x = mix(-1.18, 1.18, hash(uv + 0.41));
      gl_FragColor = vec4(x, ribbon(x, lane, seed), seed, lane);
      return;
    }

    vec4 particle = texture2D(uPositions, uv);
    float x = particle.x + uDelta * (0.034 + particle.z * 0.025);
    bool wrapped = x > 1.18;
    if (wrapped) x -= 2.36;
    float targetY = ribbon(x, particle.w, particle.z);
    float y = wrapped ? targetY : mix(particle.y, targetY, 1.0 - exp(-uDelta * 1.8));
    gl_FragColor = vec4(x, y, particle.zw);
  }
`

const PARTICLE_VERTEX = /* glsl */ `
  uniform sampler2D uPositions;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uAspect;
  uniform float uRadius;
  attribute vec2 aLookup;
  varying float vAlpha;
  varying float vTint;

  void main() {
    vec4 particle = texture2D(uPositions, aLookup);
    vec2 p = particle.xy;
    // A local bend in the existing draw pass leaves the FBO flow undisturbed.
    // Aspect correction keeps the touch area circular on every screen.
    if (uPointer.z > 0.001) {
      vec2 aspect = vec2(uAspect, 1.0);
      vec2 offset = (p - uPointer.xy) * aspect;
      float falloff = 1.0 - smoothstep(0.0, uRadius * uRadius, dot(offset, offset));
      vec2 bend = offset + vec2(-offset.y, offset.x) * 0.3;
      p += bend / aspect * falloff * uPointer.z * 0.26;
    }
    float edge = (1.0 - smoothstep(0.78, 1.12, abs(p.x)))
      * (1.0 - smoothstep(0.73, 0.98, abs(p.y)));
    vAlpha = mix(0.28, 0.68, particle.z) * edge;
    vTint = fract(particle.z * 3.7 + particle.w * 0.21);
    gl_Position = vec4(p, 0.0, 1.0);
    gl_PointSize = mix(1.15, 2.35, particle.z) * uPixelRatio;
  }
`

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uCyan;
  varying float vAlpha;
  varying float vTint;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.12, 0.5, radius)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uBlue, uCyan, vTint), alpha);
    #include <colorspace_fragment>
  }
`

/* A small position texture is the entire simulation. The CPU changes only
   time/pointer uniforms; particles never cross back to JavaScript. */
export default function ParticleStream() {
  const host = useRef(null)
  const { still, lowPower } = useMotion()
  const [compact, setCompact] = useState(() => (
    typeof window === 'undefined' || window.matchMedia(COMPACT_QUERY).matches
  ))

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY)
    const sync = () => setCompact(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const node = host.current
    if (!node) return undefined
    const interactionSurface = node.closest('section') || node

    const economical = lowPower || compact
    const resolution = economical ? 64 : 128
    let frameInterval = 1000 / (economical ? 30 : 60)
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none'
    canvas.setAttribute('aria-hidden', 'true')
    node.dataset.quality = economical ? 'low' : 'standard'
    node.dataset.particles = String(resolution * resolution)
    node.dataset.state = 'paused'

    let renderer
    let context
    let simulationGeometry
    let simulationMaterial
    let particleGeometry
    let particleMaterial
    let intersection
    let resizeObserver
    const targets = []
    let frame = 0
    let disposed = false
    let failed = false
    let active = false
    let width = 0
    let height = 0
    let previousFrame = 0
    let previousTick = 0
    let sampleDuration = 0
    let sampleCount = 0
    let slowSamples = 0
    let degraded = false
    let time = 0
    let needsRender = true
    const pointerTarget = new THREE.Vector3(0, 0, 0)
    let pointerX = 0
    let pointerY = 0
    let pointerDirty = false

    // Events only record the latest input. Layout and smoothing happen once
    // per rendered frame, with no React updates or extra animation loop.
    const movePointer = (event) => {
      if (still || !active || document.hidden || failed || disposed || !event.isPrimary) return
      if (event.pointerType === 'touch' && event.buttons === 0) return
      pointerX = event.clientX
      pointerY = event.clientY
      pointerDirty = true
    }
    const resetPointer = () => {
      pointerDirty = false
      pointerTarget.z = 0
    }
    const releasePointer = (event) => {
      if (event.isPrimary && event.pointerType !== 'mouse') resetPointer()
    }

    const cancelFrame = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      previousFrame = 0
      previousTick = 0
      sampleDuration = 0
      sampleCount = 0
      slowSamples = 0
      resetPointer()
      if (particleMaterial) particleMaterial.uniforms.uPointer.value.z = 0
    }

    const contextLost = (event) => {
      event.preventDefault()
      failed = true
      cancelFrame()
      canvas.style.visibility = 'hidden'
      node.dataset.state = 'unavailable'
    }

    let sync = () => {}
    const visibilityChanged = () => sync()

    const dispose = () => {
      if (disposed) return
      disposed = true
      cancelFrame()
      intersection?.disconnect()
      resizeObserver?.disconnect()
      document.removeEventListener('visibilitychange', visibilityChanged)
      interactionSurface.removeEventListener('pointerenter', movePointer)
      interactionSurface.removeEventListener('pointerdown', movePointer)
      interactionSurface.removeEventListener('pointermove', movePointer)
      interactionSurface.removeEventListener('pointerleave', resetPointer)
      window.removeEventListener('pointercancel', resetPointer)
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('blur', resetPointer)
      window.removeEventListener('scroll', resetPointer)
      canvas.removeEventListener('webglcontextlost', contextLost)
      simulationGeometry?.dispose()
      simulationMaterial?.dispose()
      particleGeometry?.dispose()
      particleMaterial?.dispose()
      targets.forEach((target) => target.dispose())
      renderer?.dispose()
      // Releasing the context matters when StrictMode replays this effect.
      if (!context?.isContextLost()) context?.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }

    try {
      const options = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      }
      context = canvas.getContext('webgl2', options)
      // Float textures can be sampled in WebGL2, but rendering into them is
      // optional. Unsupported devices retain the section's normal background.
      if (!context || !context.getExtension('EXT_color_buffer_float')) {
        node.dataset.state = 'unavailable'
        dispose()
        return undefined
      }

      renderer = new THREE.WebGLRenderer({ ...options, canvas, context })
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      canvas.addEventListener('webglcontextlost', contextLost)
      node.appendChild(canvas)

      const camera = new THREE.Camera()
      const simulationScene = new THREE.Scene()
      simulationGeometry = new THREE.BufferGeometry()
      // One oversized triangle covers the FBO without a diagonal seam.
      simulationGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -1, -1, 0, 3, -1, 0, -1, 3, 0,
      ], 3))
      simulationMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uPositions: { value: null },
          uResolution: { value: resolution },
          uInitialize: { value: 1 },
          uTime: { value: 0 },
          uDelta: { value: 0 },
        },
        vertexShader: SIMULATION_VERTEX,
        fragmentShader: SIMULATION_FRAGMENT,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      })
      const triangle = new THREE.Mesh(simulationGeometry, simulationMaterial)
      triangle.frustumCulled = false
      simulationScene.add(triangle)

      for (let index = 0; index < 2; index += 1) {
        const target = new THREE.WebGLRenderTarget(resolution, resolution, {
          type: THREE.FloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
        })
        targets.push(target)
        renderer.setRenderTarget(target)
        if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
          throw new Error('Floating-point framebuffer unavailable')
        }
        renderer.render(simulationScene, camera)
      }
      renderer.setRenderTarget(null)
      simulationMaterial.uniforms.uInitialize.value = 0
      let read = targets[0]
      let write = targets[1]

      const count = resolution * resolution
      const lookup = new Float32Array(count * 2)
      for (let index = 0; index < count; index += 1) {
        lookup[index * 2] = ((index % resolution) + 0.5) / resolution
        lookup[index * 2 + 1] = (Math.floor(index / resolution) + 0.5) / resolution
      }
      particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      particleGeometry.setAttribute('aLookup', new THREE.BufferAttribute(lookup, 2))
      particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uPositions: { value: read.texture },
          uPixelRatio: { value: 1 },
          uPointer: { value: new THREE.Vector3(0, 0, 0) },
          uAspect: { value: 1 },
          uRadius: { value: 0.4 },
          /* Black, with the tinted particles a step lighter, in grey. */
          uBlue: { value: new THREE.Color('#15181e') },
          uCyan: { value: new THREE.Color('#4d535d') },
        },
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        blending: THREE.NormalBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
      const scene = new THREE.Scene()
      const particles = new THREE.Points(particleGeometry, particleMaterial)
      particles.frustumCulled = false
      scene.add(particles)

      const draw = () => {
        renderer.render(scene, camera)
        needsRender = false
      }

      const running = () => !disposed && !failed && active && !document.hidden && width > 0 && height > 0

      const tick = (now) => {
        frame = 0
        if (!running() || still) return
        // One slow frame can be a scroll or resize. Only sustained pressure
        // lowers quality, and it stays lowered instead of oscillating.
        if (!economical && !degraded && previousTick) {
          const interval = now - previousTick
          sampleDuration += interval
          sampleCount += 1
          if (interval > 28) slowSamples += 1
          if (sampleDuration >= 3000 && sampleCount >= 45) {
            if (slowSamples / sampleCount > 0.5) {
              degraded = true
              frameInterval = 1000 / 30
              particleGeometry.setDrawRange(0, count / 4)
              const pixelRatio = Math.min(renderer.getPixelRatio(), 1)
              renderer.setPixelRatio(pixelRatio)
              particleMaterial.uniforms.uPixelRatio.value = pixelRatio
              node.dataset.quality = 'low-adaptive'
              node.dataset.particles = String(count / 4)
            }
            sampleDuration = 0
            sampleCount = 0
            slowSamples = 0
          }
        }
        previousTick = now
        if (!previousFrame) previousFrame = now - frameInterval
        const elapsed = now - previousFrame
        if (elapsed >= frameInterval - 0.5) {
          previousFrame = now
          const delta = Math.min(elapsed / 1000, 0.05)
          const pointer = particleMaterial.uniforms.uPointer.value
          if (pointerDirty) {
            const bounds = node.getBoundingClientRect()
            const x = (pointerX - bounds.left) / bounds.width * 2 - 1
            const y = 1 - (pointerY - bounds.top) / bounds.height * 2
            pointerTarget.set(x, y, Math.abs(x) <= 1 && Math.abs(y) <= 1 ? 1 : 0)
            if (pointer.z < 0.001) pointer.set(x, y, 0)
            pointerDirty = false
          }
          pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 9))
          if (pointerTarget.z === 0 && pointer.z < 0.001) pointer.z = 0
          time += delta
          simulationMaterial.uniforms.uTime.value = time
          simulationMaterial.uniforms.uDelta.value = delta
          simulationMaterial.uniforms.uPositions.value = read.texture
          renderer.setRenderTarget(write)
          renderer.render(simulationScene, camera)
          renderer.setRenderTarget(null)
          const swap = read
          read = write
          write = swap
          particleMaterial.uniforms.uPositions.value = read.texture
          draw()
        }
        frame = requestAnimationFrame(tick)
      }

      sync = () => {
        if (disposed || failed) return
        if (running() && needsRender) draw()
        if (running() && !still) {
          node.dataset.state = 'active'
          if (!frame) frame = requestAnimationFrame(tick)
        } else {
          cancelFrame()
          node.dataset.state = still ? 'still' : 'paused'
        }
      }

      const resize = () => {
        if (disposed || failed) return
        const bounds = node.getBoundingClientRect()
        width = Math.round(bounds.width)
        height = Math.round(bounds.height)
        if (width > 0 && height > 0) {
          // A pixel budget also keeps unusually wide displays inexpensive.
          const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            economical || degraded ? 1 : 1.25,
            Math.sqrt(2_000_000 / (width * height)),
          )
          renderer.setPixelRatio(pixelRatio)
          renderer.setSize(width, height, false)
          particleMaterial.uniforms.uPixelRatio.value = pixelRatio
          particleMaterial.uniforms.uAspect.value = width / height
          particleMaterial.uniforms.uRadius.value = Math.min(width, height, 600) * 0.55 / height
          resetPointer()
          needsRender = true
        }
        sync()
      }

      intersection = new IntersectionObserver(([entry]) => {
        active = entry.isIntersecting
        sync()
      })
      intersection.observe(node)
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(node)
      document.addEventListener('visibilitychange', visibilityChanged)
      if (!still) {
        // Listen on the section so the decorative canvas never captures input
        // or interrupts text selection, links, or native touch scrolling.
        interactionSurface.addEventListener('pointerenter', movePointer, { passive: true })
        interactionSurface.addEventListener('pointerdown', movePointer, { passive: true })
        interactionSurface.addEventListener('pointermove', movePointer, { passive: true })
        interactionSurface.addEventListener('pointerleave', resetPointer, { passive: true })
        window.addEventListener('pointercancel', resetPointer, { passive: true })
        window.addEventListener('pointerup', releasePointer, { passive: true })
        window.addEventListener('blur', resetPointer)
        window.addEventListener('scroll', resetPointer, { passive: true })
      }
      resize()
    } catch {
      node.dataset.state = 'unavailable'
      dispose()
    }

    return dispose
  }, [compact, lowPower, still])

  return <div className="particle-stream" ref={host} style={HOST_STYLE} aria-hidden="true" />
}
