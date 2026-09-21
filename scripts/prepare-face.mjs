import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Vector3 } from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

// Source: byzmod3d, "3D Human Parts Pack", CC0 1.0.
// See public/media/face/README.md for source and licensing details.
const asset = (name) => new URL(`../public/media/face/${name}`, import.meta.url)
const count = 22000
const source = await readFile(asset('face-source.obj'), 'utf8')
// The export contains stray line primitives; OBJLoader otherwise interprets
// the face object as lines. Keep the full human head, omit the separate hair.
const object = new OBJLoader().parse(source.split('\n').filter((line) => !line.startsWith('l ')).join('\n'))
const mesh = object.getObjectByName('FACE2')
if (!mesh?.isMesh) throw new Error('The source does not contain the expected FACE2 mesh')
const geometry = mesh.geometry
geometry.computeBoundingBox()
const center = geometry.boundingBox.getCenter(new Vector3())
const size = geometry.boundingBox.getSize(new Vector3())
geometry.translate(-center.x, -center.y, -center.z)
geometry.scale(2.4 / size.y, 2.4 / size.y, 2.4 / size.y)
geometry.computeBoundingBox()

let seed = 113107
const random = () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
  return seed / 4294967296
}
const sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(random).build()
const point = new Vector3()
const normal = new Vector3()
// Binary layout: N xyz positions, followed by N xyz normals, float32 LE.
// N = byteLength / (6 * Float32Array.BYTES_PER_ELEMENT).
const data = new Float32Array(count * 6)
const preview = []
for (let i = 0; i < count; i += 1) {
  sampler.sample(point, normal)
  point.toArray(data, i * 3)
  normal.normalize().toArray(data, count * 3 + i * 3)
  // Cull the rear and retain enough front samples to describe eyes and lips.
  if (normal.z > -0.02 && i % 2 === 0) {
    const shade = Math.min(1, Math.max(0, normal.dot(new Vector3(-0.4, 0.5, 0.8).normalize())))
    const opacity = 0.22 + shade * 0.6
    const radius = 0.54 + shade * 0.34
    preview.push({ z: point.z, path: `<circle cx="${(240 + point.x * 198).toFixed(1)}" cy="${(280 - point.y * 198).toFixed(1)}" r="${radius.toFixed(2)}" opacity="${opacity.toFixed(2)}"/>` })
  }
}
await writeFile(asset('face-points.bin'), Buffer.from(data.buffer))
preview.sort((a, b) => a.z - b.z)
await writeFile(asset('face-fallback.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 560" fill="#284dcc" role="img" aria-label="Et ansikt formet av blaa partikler"><title>Et ansikt formet av blaa partikler</title>${preview.map((entry) => entry.path).join('')}</svg>\n`)
console.log(JSON.stringify({ count, bytes: data.byteLength, triangles: geometry.attributes.position.count / 3, bounds: geometry.boundingBox, output: fileURLToPath(asset('face-points.bin')) }, null, 2))
