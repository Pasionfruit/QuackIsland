# 04-water

## What this is

The sea. One plane at `SEA_LEVEL`, one draw call, carrying a calm swell that
is displaced on the GPU and lit per fragment.

It **renders and nothing else.** Whether something is in the water is decided
from the terrain's height, not from here — which is why the player still swims
with this module switched off in the panel.

The swell maths is pure and lives in `internal/swell.ts` with no three.js in
it, so it is tested in Node. The shader is *generated* from that same table.

## Public contract

| Export | Meaning |
| --- | --- |
| `Water` | The R3F component. Registered in `src/app/scene.ts` at order 40 |
| `swellAt(x, z, time)` | Surface height above sea level, metres. Pure |
| `swellNormal(x, z, time)` | Unit surface normal `[x, y, z]`, +Y up. Analytic |
| `swellGlsl()` | The same two functions as GLSL source, generated from `SWELL` |
| `SWELL` | The wave table: amplitude (m), wavelength (m), direction, speed (m/s) |
| `SWELL_MAX` | The most the surface can ever rise or fall. Currently 0.142 m |
| `WATER_HALF` | Half the width of the plane, metres (900) |
| `WATER_SEGMENTS` | Grid resolution (240) |
| `DEEP_AT` | Depth in metres at which the water is as dark as it gets (9) |
| `SwellWave` | The shape in the table above |

Units are metres, `time` is seconds, +Y is up — the same conventions as
everything else.

## Invariants you may rely on

- **The surface sits at exactly `SEA_LEVEL`**, which `01-terrain` fixes at
  zero. The swell moves about it, never away from it.
- **`|swellAt(...)| <= SWELL_MAX`**, everywhere, at every time. It is a sum of
  bounded sines, so this is structural rather than tuned.
- **`swellNormal` is a unit vector and agrees with the slope of `swellAt`.**
  It is the analytic derivative, not a difference of samples, and a test pins
  the two together — if they drift, the lighting stops describing the shape and
  the sea reads as foil.
- **The CPU and the GPU use the same numbers.** `swellGlsl()` is generated from
  `SWELL`, so tuning an amplitude cannot leave a hand-copied shader behind.
- **Pure and time-driven.** No state, no history: the surface at a point is a
  function of `(x, z, time)` alone.
- **The swell flattens as the water shallows**, so it does not bob up through
  the beach at the water's edge.
- **One draw call.** However far you look, the sea is one mesh.

## Deliberate non-goals

- **No swimming logic.** The player decides that from the terrain height. Water
  that owned the answer would mean the player falls to the sea bed the moment
  this module is toggled off, and would make `SEA_LEVEL` two facts instead of
  one.
- **No buoyancy, no floating objects, no boats.** Nothing asks yet.
- **No refraction, reflection, caustics or screen-space anything.** All of those
  want a second render pass, which is a decision about the frame, and the frame
  belongs to `00-core`.
- **No foam, no breakers, no shore wash.** The brief was calm, and a breaking
  wave is a different simulation, not a bigger amplitude.
- **No tide.** Sea level is a constant, and half the project resolves heights
  against it.
- **No underwater view** — no fog change, no colour grade when the camera goes
  under. The surface is `DoubleSide` so it does not vanish, and that is all.
- **No sound.**

## How to use it from a new module

To ask where the surface actually is — a buoy, a jetty, spray:

```ts
import { SWELL_MAX, swellAt, swellNormal } from '../04-water'

const y = SEA_LEVEL + swellAt(x, z, elapsedSeconds)
const [nx, ny, nz] = swellNormal(x, z, elapsedSeconds)
```

To ask whether something is *in* the water, do **not** use this module — ask
the terrain:

```ts
import { SEA_LEVEL, heightAt } from '../01-terrain'
const depth = Math.max(0, SEA_LEVEL - heightAt(x, z))
```

## Why the normals are per fragment

The plane is 1800 m across on a 240 × 240 grid — about 7.5 m per quad. A swell
74 m long is carried by ten vertices, which is enough for the *shape* and
nowhere near enough for the *light*. Per-vertex normals on that grid give large
flat facets that read as a folded sheet.

Computing the normal per fragment from the same analytic derivative costs a few
cosines and gives a sea that glints correctly at any distance. This is most of
why it reads as water at all, and it is the reason the grid can stay coarse.

## Why depth is baked into the mesh

Shallow water is pale, deep water is dark, and the shoreline fades out instead
of ending on a cut line. All three need to know how deep the water is at a
point — `SEA_LEVEL - heightAt(x, z)`.

The sea bed never moves, so this is baked into an `aDepth` vertex attribute
once at build time rather than sampled every frame. It also means the fade is
interpolated across the fragment for free.

## Known limitations

- **The plane is finite** (1800 m across). Fog swallows the edge long before
  you reach it, but a camera pulled far enough back will find it.
- **Depth is baked at vertex resolution** (~7.5 m), so the shoreline fade is
  smooth but not precise. It is a wet edge, not a waterline.
- **`depthWrite` is off**, so the sea does not occlude anything. Correct while
  it is the only transparent surface; a second one will need sorting.
- **The swell is a sum of sines, not Gerstner waves** — crests are rounded
  rather than sharpened. At this amplitude the difference is invisible; it
  would not be for real waves.
- Nothing reacts to the player. No wake, no ripples, no displacement.
- `WATER_SEGMENTS` is fixed; there is no LOD on the sea.

## How to review

- **Stand on the beach and look out.** It should read as calm water — a slow
  breathing swell, no chop, no visible waves rolling in.
- **Watch the waterline.** The swell should flatten into the sand rather than
  bobbing up through the beach, and the edge should be a wet fade, not a cut.
- **Look along the sun's reflection.** The glint should travel with the swell.
  This is the thing that says water; if it looks like a flat coloured sheet the
  per-fragment normals are not working.
- **Fly high.** The shallows around the island should be pale and the deep water
  dark, with the change following the shape of the coast.
- **Look at it in all four lighting modes.** Night is the hard one — it should
  stay legible as water, not become a black hole or a grey plastic sheet.
- **Walk into the sea.** You should wade, then tip forward and swim when it gets
  out of your depth, then stand back up on the way out. (That behaviour belongs
  to `02-player`, but this is where you will see it.)
- **Swim out and look around from the surface.** The body should sit *in* the
  water, at about half a metre down, not on top of it.
- **Toggle this module off in the panel and walk into the sea again.** You must
  still swim. If you do not, the sea has quietly become the source of truth for
  sea level.
- **Look for tiling.** Pan along the coast — the surface must not repeat.
- Check the perf HUD: the sea should cost one draw call, and the frame time
  should barely move when you toggle it.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
