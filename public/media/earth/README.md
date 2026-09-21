# Earth textures

Local copies of the Earth texture assets distributed in the official
[Three.js examples](https://github.com/mrdoob/three.js/tree/43feb74125410057b3a5ca63407121d7073a9f21/examples/textures/planets).
Downloaded 2026-09-21. These assets are served locally; the globe does not depend
on a third-party image host at runtime.

| Local file | Dimensions | Bytes | Upstream source |
| --- | --- | ---: | --- |
| `earth_day_2048.jpg` | 2048 x 1024 | 713367 | [Three.js r120, earth_atmos_4096.jpg](https://raw.githubusercontent.com/mrdoob/three.js/r120/examples/textures/planets/earth_atmos_4096.jpg) |
| `earth_clouds_1024.png` | 1024 x 512 | 226113 | [Three.js cloud map](https://raw.githubusercontent.com/mrdoob/three.js/43feb74125410057b3a5ca63407121d7073a9f21/examples/textures/planets/earth_clouds_1024.png) |
| `earth_normal_2048.jpg` | 2048 x 1024 | 336774 | [Three.js normal map](https://raw.githubusercontent.com/mrdoob/three.js/43feb74125410057b3a5ca63407121d7073a9f21/examples/textures/planets/earth_normal_2048.jpg) |
| `earth_specular_2048.jpg` | 2048 x 1024 | 223421 | [Three.js specular map](https://raw.githubusercontent.com/mrdoob/three.js/43feb74125410057b3a5ca63407121d7073a9f21/examples/textures/planets/earth_specular_2048.jpg) |

The day map is renamed to reflect its verified dimensions: the original upstream
filename says 4096, but its actual image width is 2048. All files otherwise retain
their original downloaded bytes. Combined image size is 1,499,675 bytes.

## Mapping notes

- All maps use equirectangular projection, north at the top, Greenwich near the
  horizontal center, and the longitude seam across the Pacific.
- The cloud PNG has grayscale RGB plus an alpha channel covering the full 0-255
  range. Use it as a transparent material's color map on a slightly larger sphere;
  its alpha already contains the cloud mask.
- Day and cloud color maps should use sRGB. Normal and specular maps represent data
  and should retain Three.js's default non-color texture space.
- Standard `TextureLoader` orientation works with `SphereGeometry` UVs.

## Attribution and usage

Texture distribution: Three.js authors. The upstream project is distributed
under the [MIT License](https://github.com/mrdoob/three.js/blob/43feb74125410057b3a5ca63407121d7073a9f21/LICENSE),
copied alongside this file as `LICENSE-threejs.txt`.

The Earth imagery is from the Blue Marble family of satellite composites.
NASA's [Blue Marble background](https://visibleearth.nasa.gov/images/57723/the-blue-marble)
credits imagery assembled from NASA and partner observations. NASA's
[images and media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
describe permitted educational and informational use, request source credit, and
prohibit implying NASA endorsement. NASA / Visible Earth is acknowledged as the
underlying Earth-imagery source; the processed normal and specular maps are
distributed here as obtained from Three.js.
