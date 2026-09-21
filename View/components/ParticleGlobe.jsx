import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMotion } from '../lib/motion.jsx'

/* ===========================================================================
   The particle globe: the Earth, as some twenty-odd thousand points that
   hold its surface until something disturbs them, turning slowly.

   The points live on the GPU. Their resting places - spread evenly over a
   sphere, with the land (read off a map, see public/media/earth/README.md)
   given several times the points of the sea, so the continents draw
   themselves in the dark and the oceans in a faint grey - sit in one float
   texture, and every frame a simulation shader reads that texture and writes
   each point's place for this frame into a render target: its resting
   place, pushed along a curl-noise field. The push is weighted by how far it
   would go, to the fifth power, so nearly every point stays and holds the
   globe while a few in the strongest currents wander off it. The points
   themselves are drawn by a shader that looks its own position up in that
   render target - the classic FBO particle setup.

   Three things move the field:

     arriving   the section scrolls into view with the noise wound up high, so
                the points begin as a loose cloud and settle into the globe
     the pointer  the globe tilts a little toward it, and the further from the
                centre it is the more restless the surface
     a press    a finger or a button held on the globe blows the points apart
                from where it landed, swirling; let go, and they find their
                way home

   Everything is a target the frame damps toward, so a press half-way through
   an arrival, or a release half-way through a burst, simply changes course.
   The spin is the rig's, not the field's: the whole cloud turns together.
   =========================================================================== */

const EARTH_ROOT = `${import.meta.env.BASE_URL}media/earth/`
/* The canvas is drawn much larger than the globe's frame, so points blown
   off the globe are not cut off at an invisible edge: it reaches this far
   past the frame on every side, and the camera stands correspondingly
   further back so the globe stays the same size on screen. */
const OVERFLOW = 0.6
const SPREAD = 1 + 2 * OVERFLOW
const DISTANCE = 3.7 * SPREAD
const CAMERA = { position: [0, 0.04 * SPREAD, DISTANCE], fov: 38, near: 0.1, far: 40 }
const CONTEXT = { alpha: true, antialias: true, powerPreference: 'low-power', stencil: false }
const DPR = [1, 1.75]
const CANVAS_STYLE = {
  position: 'absolute',
  inset: `${-OVERFLOW * 100}%`,
  width: 'auto',
  height: 'auto',
  pointerEvents: 'none',
}
/* A press must not stop the page from scrolling under a finger. */
const HOST_STYLE = { touchAction: 'pan-y', cursor: 'pointer' }

/* The globe's size, and how the points are shared out over it: every
   candidate on land is kept, and one in three at sea. The spiral the
   candidates are laid along is regular enough to show as a lattice, so each
   is nudged off its place by up to two thirds of the spacing. */
const RADIUS = 1.18
const CANDIDATES = 52000
const SEA_SHARE = 0.34
const JITTER = 0.011
/* One turn in about half a minute. */
const SPIN = 0.18

/* How the field sits when nothing is happening, and how it is when the
   points have been blown apart. Distances are in the globe's own units - its
   radius is 1.18 - and the curl over it runs about 5 at the median and 11 at
   most, so an amplitude of 0.045 pushes a typical point a fifth of a unit and
   the strongest currents half; against a reach of 0.62, that holds the
   surface still and lets only the odd point wander. */
const REST = { amplitude: 0.045, frequency: 4.2, reach: 0.62, burst: 0 }
const PRESSED = { amplitude: 0.12, frequency: 2.4, reach: 0.3, burst: 0.2 }
/* The cloud a section arrives as. */
const SCATTERED = { amplitude: 0.3, frequency: 3.4, reach: 0.25, burst: 0 }
/* The kick the moment a press lands, before it settles to PRESSED.burst. */
const IMPULSE = 0.7

/* Half the height of the view at the globe's depth: what an on-screen point
   maps to in the model's space. */
const HALF_VIEW = Math.tan((CAMERA.fov / 2) * (Math.PI / 180)) * CAMERA.position[2]

const SIMULATION_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

/* 2D simplex noise: Ian McEwan, Ashima Arts (MIT), the standard textureless
   implementation. The curl is taken over three slices of it, one per axis,
   by finite differences. */
const SIMULATION_FRAGMENT = /* glsl */ `
  uniform sampler2D uBase;
  uniform float uFlow;
  uniform float uFrequency;
  uniform float uAmplitude;
  uniform float uReach;
  uniform vec3 uBurstAt;
  uniform float uBurst;
  varying vec2 vUv;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  /* The curl of a potential whose three components are noise over the
     three planes, so the flow is divergence-free: points swirl rather than
     bunching up or thinning out. */
  vec3 curl(vec3 p) {
    const float e = 0.08;
    float dzdy = snoise(vec2(p.x, p.y + e)) - snoise(vec2(p.x, p.y - e));
    float dydz = snoise(vec2(p.z + e, p.x)) - snoise(vec2(p.z - e, p.x));
    float dxdz = snoise(vec2(p.y, p.z + e)) - snoise(vec2(p.y, p.z - e));
    float dzdx = snoise(vec2(p.x + e, p.y)) - snoise(vec2(p.x - e, p.y));
    float dydx = snoise(vec2(p.z, p.x + e)) - snoise(vec2(p.z, p.x - e));
    float dxdy = snoise(vec2(p.y + e, p.z)) - snoise(vec2(p.y - e, p.z));
    return vec3(dzdy - dydz, dxdz - dzdx, dydx - dxdy) / (2.0 * e);
  }

  void main() {
    vec3 base = texture2D(uBase, vUv).xyz;
    vec3 q = base * uFrequency + uFlow;
    vec3 target = base + curl(q) * uAmplitude;

    /* Weighted by the distance it would travel: a small push is all but
       ignored, a large one taken whole. This is what keeps the surface while
       letting the strays go. */
    float d = min(length(target - base) / uReach, 1.0);
    vec3 pos = mix(base, target, pow(d, 5.0));

    /* The press: away from where it landed, harder the nearer, and swirling
       as it goes. */
    vec3 away = pos - uBurstAt;
    float dist = length(away);
    vec3 dir = away / max(dist, 0.001);
    pos += dir * uBurst / (0.5 + dist * 1.5) + curl(base * 2.6 + uFlow * 1.7 + 4.0) * uBurst * 0.06;

    gl_FragColor = vec4(pos, 1.0);
  }
`

const RENDER_VERTEX = /* glsl */ `
  uniform sampler2D uPositions;
  uniform sampler2D uBase;
  uniform float uSize;
  attribute float aSeed;
  attribute float aLand;
  varying float vAlpha;
  varying float vLight;
  varying float vSeed;
  varying float vDrift;
  varying float vLand;

  void main() {
    /* Where this point is this frame, looked up by the texel it owns: the
       geometry's positions are texture coordinates, not places. */
    vec3 p = texture2D(uPositions, position.xy).xyz;
    vec3 home = texture2D(uBase, position.xy).xyz;
    vDrift = smoothstep(0.02, 0.55, length(p - home));

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    /* The far side of the globe shows through faintly, so it reads as a
       sphere of points and not a disc; a point that has left the surface no
       longer has a side to be on. */
    float facing = mix(dot(viewNormal, normalize(-viewPosition.xyz)), 1.0, vDrift);
    float side = mix(0.1, 1.0, smoothstep(-0.25, 0.3, facing));
    vAlpha = side * mix(0.9, 0.6, vDrift) * mix(0.55, 1.0, aLand);
    vLight = max(0.0, dot(viewNormal, normalize(vec3(-0.45, 0.65, 1.0))));
    vSeed = aSeed;
    vLand = aLand;
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uSize * (1.05 + aSeed * 0.8) * (${DISTANCE.toFixed(3)} / -viewPosition.z) * mix(1.0, 0.85, vDrift) * mix(0.7, 1.0, aLand);
  }
`

const RENDER_FRAGMENT = /* glsl */ `
  uniform vec3 uDark;
  uniform vec3 uLit;
  uniform vec3 uDust;
  varying float vAlpha;
  varying float vLight;
  varying float vSeed;
  varying float vDrift;
  varying float vLand;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.28, 0.5, radius)) * vAlpha;
    if (alpha < 0.025) discard;
    /* Land in the dark tones, sea in the dust grey; the ones that have flown
       lighten to dust wherever they came from. */
    vec3 color = mix(uDark, uLit, vLight * 0.8 + vSeed * 0.2);
    color = mix(uDust, color, vLand);
    color = mix(color, uDust, max(step(0.91, vSeed) * 0.65, vDrift * 0.5));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const damp = THREE.MathUtils.damp

/* The map, read once: how much of each pixel is land. The specular map is
   white over water and black over land, which is exactly the mask wanted. */
function readLand(image) {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  return {
    width,
    height,
    /* Longitude and latitude in radians, east and north positive. */
    at(lon, lat) {
      const x = Math.min(width - 1, Math.floor(((lon / (2 * Math.PI) + 0.5) % 1) * width))
      const y = Math.min(height - 1, Math.floor((0.5 - lat / Math.PI) * height))
      return 1 - data[(y * width + x) * 4] / 255
    },
  }
}

function Globe({ pointer, press, still, lowPower, active, onReady }) {
  /* Two frames: the outer one is tilted by the pointer, the inner one spins
     inside it. Kept apart so that the pointer can never add to or take from
     the spin - it only leans the axis the globe turns on. */
  const frame = useRef(null)
  const rig = useRef(null)
  const spin = useRef(0)
  const { gl, size, invalidate } = useThree()
  const map = useLoader(THREE.TextureLoader, `${EARTH_ROOT}earth_specular_2048.jpg`)

  /* The globe, laid out for the GPU: every point owns one texel. Its resting
     place goes in the base texture; the geometry only carries which texel
     is whose, plus the surface normal for the light, whether it stands on
     land, and a seed for variety.

     Candidates are spread evenly over the sphere along a golden spiral, and
     one is kept or dropped by what the map says lies under it. */
  const layout = useMemo(() => {
    const land = readLand(map.image)
    const candidates = lowPower ? Math.floor(CANDIDATES / 3) : CANDIDATES
    const golden = Math.PI * (3 - Math.sqrt(5))

    const positions = []
    const normals = []
    const lands = []
    let seed = 90211
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < candidates; i += 1) {
      const y0 = 1 - (2 * (i + 0.5)) / candidates
      const ring = Math.sqrt(1 - y0 * y0)
      const angle = golden * i
      let x = Math.cos(angle) * ring + (random() - 0.5) * 2 * JITTER
      let y = y0 + (random() - 0.5) * 2 * JITTER
      let z = Math.sin(angle) * ring + (random() - 0.5) * 2 * JITTER
      const length = Math.hypot(x, y, z)
      x /= length
      y /= length
      z /= length
      /* Longitude from the front of the globe, eastward to the right - so
         the map is not mirrored. */
      const onLand = land.at(Math.atan2(x, z), Math.asin(y)) > 0.5
      if (!onLand && random() > SEA_SHARE) continue
      positions.push(x * RADIUS, y * RADIUS, z * RADIUS)
      normals.push(x, y, z)
      lands.push(onLand ? 1 : 0)
    }

    const count = lands.length
    const width = Math.ceil(Math.sqrt(count))
    const height = Math.ceil(count / width)
    const base = new Float32Array(width * height * 4)
    const texels = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      base[i * 4] = positions[i * 3]
      base[i * 4 + 1] = positions[i * 3 + 1]
      base[i * 4 + 2] = positions[i * 3 + 2]
      base[i * 4 + 3] = 1
      texels[i * 3] = ((i % width) + 0.5) / width
      texels[i * 3 + 1] = (Math.floor(i / width) + 0.5) / height
      seeds[i] = ((i * 16807 + 17) % 65521) / 65521
    }

    const baseTexture = new THREE.DataTexture(base, width, height, THREE.RGBAFormat, THREE.FloatType)
    baseTexture.minFilter = THREE.NearestFilter
    baseTexture.magFilter = THREE.NearestFilter
    baseTexture.needsUpdate = true

    return {
      width,
      height,
      baseTexture,
      texels,
      normals: new Float32Array(normals),
      lands: new Float32Array(lands),
      seeds,
    }
  }, [lowPower, map])

  /* The simulation: a quad the size of the texture, drawn into a float
     render target every frame. Full floats where the context can render to
     them, half floats otherwise - the globe is a couple of units across, well
     within what a half float places to a pixel. */
  const simulation = useMemo(() => {
    const type = gl.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType
    const target = new THREE.WebGLRenderTarget(layout.width, layout.height, {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    const uniforms = {
      uBase: { value: layout.baseTexture },
      uFlow: { value: 0 },
      uFrequency: { value: SCATTERED.frequency },
      uAmplitude: { value: SCATTERED.amplitude },
      uReach: { value: SCATTERED.reach },
      uBurstAt: { value: new THREE.Vector3() },
      uBurst: { value: 0 },
    }
    const scene = new THREE.Scene()
    scene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ uniforms, vertexShader: SIMULATION_VERTEX, fragmentShader: SIMULATION_FRAGMENT }),
      ),
    )
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { target, uniforms, scene, camera }
  }, [gl, layout])

  useEffect(() => {
    return () => {
      simulation.target.dispose()
      simulation.scene.traverse((node) => {
        node.geometry?.dispose()
        node.material?.dispose()
      })
    }
  }, [simulation])

  useEffect(() => () => layout.baseTexture.dispose(), [layout])

  const uniforms = useMemo(
    () => ({
      uPositions: { value: simulation.target.texture },
      uBase: { value: layout.baseTexture },
      uSize: { value: 1 },
      /* Black, in three tones: the shadowed side, the lit side, and the dust
         of the sea and of whatever has left the surface. */
      uDark: { value: new THREE.Color('#0b0d11') },
      uLit: { value: new THREE.Color('#2b2f37') },
      uDust: { value: new THREE.Color('#7c828c') },
    }),
    [layout, simulation],
  )

  useEffect(() => {
    /* Sized from the frame the globe is seen in, not the larger canvas. */
    uniforms.uSize.value = gl.getPixelRatio() * Math.max(0.8, Math.min(1.3, size.height / SPREAD / 460))
    invalidate()
  }, [gl, invalidate, size.height, uniforms])

  useEffect(() => {
    onReady(true)
    invalidate()
  }, [invalidate, onReady])

  useEffect(() => {
    invalidate()
  }, [invalidate, still])

  /* Each time the section comes into view the points start out scattered
     and gather into the globe. A visitor who asked for stillness gets the
     globe at once. */
  useEffect(() => {
    const { uniforms: sim } = simulation
    const from = still ? REST : SCATTERED
    sim.uAmplitude.value = from.amplitude
    sim.uFrequency.value = from.frequency
    sim.uReach.value = from.reach
    sim.uBurst.value = 0
    invalidate()
  }, [active, invalidate, simulation, still])

  /* A press just landed: kick the field once, from where it landed. The
     field is in the rig's own space, which has turned; the point is carried
     back through that turn. */
  const kicked = useRef(0)
  const landing = useMemo(() => ({ point: new THREE.Vector3() }), [])

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05)
    const { uniforms: sim } = simulation
    const pressed = !still && press.current.down

    if (!still) {
      sim.uFlow.value += step * (0.07 + (pressed ? 0.4 : 0))
      spin.current += step * SPIN
    }

    /* Where the field is heading: rest, restless with the pointer far from
       the centre, or blown apart. The press arrives fast and leaves slowly,
       so letting go reads as the points finding their way back. */
    const x = still ? 0 : pointer.current.x
    const y = still ? 0 : pointer.current.y
    const unrest = Math.min(Math.hypot(x, y), 1)
    const goal = pressed
      ? PRESSED
      : {
          amplitude: REST.amplitude + 0.02 * unrest,
          frequency: REST.frequency - 1.6 * unrest,
          reach: REST.reach + 0.12 * unrest,
          burst: 0,
        }
    const rate = pressed ? 7 : 1.7

    /* The globe turns at its own pace; the pointer leans the axis it turns
       on - forward and back with the pointer's height, side to side with
       its reach - and nudges the whole thing a little its way. */
    const smooth = (from, to) => (still ? to : damp(from, to, 4.5, step))
    rig.current.rotation.y = spin.current
    frame.current.rotation.x = smooth(frame.current.rotation.x, y * 0.08)
    frame.current.rotation.z = smooth(frame.current.rotation.z, -x * 0.1)
    frame.current.position.x = smooth(frame.current.position.x, x * 0.01)
    frame.current.position.y = smooth(frame.current.position.y, -y * 0.006)

    if (still) {
      sim.uAmplitude.value = goal.amplitude
      sim.uFrequency.value = goal.frequency
      sim.uReach.value = goal.reach
      sim.uBurst.value = 0
    } else {
      sim.uAmplitude.value = damp(sim.uAmplitude.value, goal.amplitude, rate, step)
      sim.uFrequency.value = damp(sim.uFrequency.value, goal.frequency, rate, step)
      sim.uReach.value = damp(sim.uReach.value, goal.reach, rate, step)
      if (press.current.kick !== kicked.current) {
        kicked.current = press.current.kick
        sim.uBurst.value = IMPULSE
        /* The press is measured against the frame; the view is SPREAD times
           wider than that. */
        landing.point.set(
          (press.current.x * HALF_VIEW * (size.width / size.height)) / SPREAD,
          (press.current.y * HALF_VIEW) / SPREAD,
          0.3,
        )
        frame.current.updateMatrixWorld()
        rig.current.worldToLocal(landing.point)
        sim.uBurstAt.value.copy(landing.point)
      }
      sim.uBurst.value = damp(sim.uBurst.value, goal.burst, pressed ? 3 : 2.2, step)
    }

    /* Step the simulation, then let the points read the result. */
    const { gl: renderer } = state
    renderer.setRenderTarget(simulation.target)
    renderer.render(simulation.scene, simulation.camera)
    renderer.setRenderTarget(null)

    /* Keep drawing while anything is still on its way. */
    const moving =
      Math.abs(sim.uAmplitude.value - goal.amplitude) > 0.002 || sim.uBurst.value > 0.002 || pressed
    if (moving && !still && active) invalidate()
  })

  return (
    <group ref={frame}>
      <group ref={rig}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[layout.texels, 3]} />
            <bufferAttribute attach="attributes-normal" args={[layout.normals, 3]} />
            <bufferAttribute attach="attributes-aSeed" args={[layout.seeds, 1]} />
            <bufferAttribute attach="attributes-aLand" args={[layout.lands, 1]} />
          </bufferGeometry>
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={RENDER_VERTEX}
            fragmentShader={RENDER_FRAGMENT}
            transparent
            depthWrite={false}
          />
        </points>
      </group>
    </group>
  )
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFailure()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function ContextGuard({ onFailure }) {
  const { gl } = useThree()
  useEffect(() => {
    const lost = () => onFailure()
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onFailure])
  return null
}

function hasWebGL2() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    const supported = Boolean(context)
    context?.getExtension('WEBGL_lose_context')?.loseContext()
    return supported
  } catch {
    return false
  }
}

export default function ParticleGlobe() {
  const host = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })
  /* Whether something is pressing on the globe, where it landed (in the
     same -1..1 space as the pointer), and a counter that ticks on each new
     press so the frame can tell a fresh one from one still held. */
  const press = useRef({ down: false, x: 0, y: 0, kick: 0 })
  const { still, lowPower } = useMotion()
  const [supported] = useState(hasWebGL2)
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting))
    observer.observe(host.current)
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  /* Where the pointer is, across the page, in the globe's own frame - so it
     also tilts toward the reading column. Mouse only: a finger has no place
     to be between taps. */
  useEffect(() => {
    const reset = () => {
      pointer.current = { x: 0, y: 0 }
    }
    reset()
    if (still || !active || !visible || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined
    const move = (event) => {
      if (event.pointerType === 'touch') return
      const rect = host.current.getBoundingClientRect()
      pointer.current.x = THREE.MathUtils.clamp((event.clientX - rect.left - rect.width / 2) / (rect.width * 0.85), -1, 1)
      pointer.current.y = THREE.MathUtils.clamp((event.clientY - rect.top - rect.height / 2) / (rect.height * 0.85), -1, 1)
    }
    const leave = (event) => {
      if (!event.relatedTarget) reset()
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerout', leave, { passive: true })
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', reset)
      reset()
    }
  }, [active, still, visible])

  /* The press. It starts on the globe, with any pointer, and ends wherever
     the pointer is let go - or when the page takes the gesture for a
     scroll, which arrives as a cancel. */
  useEffect(() => {
    const node = host.current
    if (!node || still) return undefined

    const release = () => {
      press.current.down = false
    }
    const down = (event) => {
      if (event.button !== undefined && event.button !== 0) return
      const rect = node.getBoundingClientRect()
      press.current.down = true
      press.current.x = THREE.MathUtils.clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 2), -1, 1)
      press.current.y = THREE.MathUtils.clamp(-(event.clientY - rect.top - rect.height / 2) / (rect.height / 2), -1, 1)
      press.current.kick += 1
    }

    node.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      node.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
      release()
    }
  }, [still])

  return (
    <div className={`particle-globe${ready && !failed ? ' is-ready' : ''}`} ref={host} style={HOST_STYLE}>
      {supported && !failed ? (
        <SceneBoundary onFailure={() => setFailed(true)}>
          <Canvas
            camera={CAMERA}
            dpr={lowPower ? 1 : DPR}
            frameloop={active && visible && !still ? 'always' : 'demand'}
            gl={CONTEXT}
            style={CANVAS_STYLE}
          >
            <ContextGuard onFailure={() => setFailed(true)} />
            <Suspense fallback={null}>
              <Globe pointer={pointer} press={press} still={still} lowPower={lowPower} active={active} onReady={setReady} />
            </Suspense>
          </Canvas>
        </SceneBoundary>
      ) : null}
    </div>
  )
}
