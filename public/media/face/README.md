# Particle face geometry

The `face-source.obj` model is **face2.obj** from **3D Human Parts Pack** by
**byzmod3d**, published on OpenGameArt.org under **CC0 1.0 Universal** (public
domain). The author's page explicitly permits use for any purpose and does not
require attribution. Credit is retained here as provenance.

- Author and source: https://opengameart.org/content/3d-human-parts-pack
- Download: https://opengameart.org/sites/default/files/face2_0.obj
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Retrieved: September 21, 2026

`face-points.bin` and `face-fallback.svg` are derived from the original `FACE2`
head mesh, omitting the separate hair object and unused line primitives. The
face points are sampled uniformly over the surface with a fixed random seed.
The mesh is centered on its bounding box, scaled to a height of 2.4, with Y up
and the face looking toward positive Z. It includes the complete head, ears,
eyes, nose, and lips, with no neck or shoulders.

The binary is 22,000 XYZ positions followed by 22,000 XYZ normals, each stored
as three little-endian Float32 values (528,000 bytes total). Regenerate both
derived assets with:

```sh
node scripts/prepare-face.mjs
```

The visual interaction is an original implementation inspired by the particle
face concept at https://visualdata.org/partfemale. No code or assets from
Visualdata are included.
