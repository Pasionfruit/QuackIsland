# 04-water

## What this is

The sea. One plane at `SEA_LEVEL`, one draw call, carrying an ocean swell that
is displaced on the GPU and lit per fragment.

Swell, specifically, rather than waves: three long crossing Gerstner waves, the
longest 118 m from crest to crest, running about a metre and a half trough to
crest all together. That is what is left of a distant storm once the short chop
has died out, and it is why it rolls rather than breaks.

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
| `swellDisplace(x, z, time)` | Where that water actually is: `[x, y, z]`, sideways as well as up |
| `swellNormal(x, z, time)` | Unit normal of the displaced surface, +Y up. Analytic |
| `waveSpeed(wavelength)` | Deep-water wave speed, m/s: `sqrt(g * lambda / 2pi)` |
| `swellGlsl()` | The same two functions as GLSL source, generated from `SWELL` |
| `SWELL` | The wave table: amplitude (m), wavelength (m), direction |
| `SWELL_MAX` | The most the surface can rise above the mean. Currently 0.78 m |
| `WATER_HALF` | Half the width of the plane, metres (900) |
| `WATER_SEGMENTS` | Grid resolution (360). Tied to the shortest wavelength - see below |
| `DEEP_AT` | Depth in metres at which the water is as dark as it gets (9) |
| `SwellWave` | The shape in the table above |

Units are metres, `time` is seconds, +Y is up — the same conventions as
everything else.

## Invariants you may rely on

- **The surface sits at `SEA_LEVEL + tideAt(now)`.** `01-terrain` fixes the
  datum at zero and `00-core` owns the tide; this module draws a sheet wherever
  those two put it, and the swell moves about that. It does not decide where
  the sea is.
- **`|swellAt(...)| <= SWELL_MAX`**, everywhere, at every time. It is a sum of
  bounded sines, so this is structural rather than tuned.
- **`swellNormal` is the true normal of the surface the vertex shader builds** -
  taken across the displaced surface, not from the gradient of the height,
  because the water moves sideways as well as up. A test checks it against
  tangents measured numerically off `swellDisplace`; if they drift the lighting
  stops describing the shape and the sea reads as foil.
- **The speeds are derived, not chosen.** `waveSpeed` is the deep-water
  dispersion relation, so a long swell outruns a short one. Hand-picked speeds
  get this wrong and the crests slide like a scrolling texture.
- **The surface never folds over itself.** A Gerstner wave cusps at `k*A = 1`
  and curls through itself past that. The sum here is about 0.06, and a test
  walks along the longest wave checking the displaced points keep their order.
- **The orbits are circles.** Horizontal displacement equals the amplitude, so
  each point travels round rather than bobbing - the true trochoidal wave
  rather than a stylised one.
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
- **No foam, no breakers, no shore wash.** Swell reaching shallow water shoals,
  steepens and breaks; this just flattens out. A breaking wave is a different
  simulation, not a bigger amplitude.
- **No wind chop on top of the swell.** The grid could not carry it - see below
  - and it would want a scrolling normal map rather than geometry.
- **No ownership of the tide.** The sheet rides up and down with it, but
  `tideAt` lives in `00-core`, because the player and the footprints need the
  same answer and neither should have to depend on the sea being drawn.
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

## Why the normals are per fragment, and what fixes the grid size

The plane is 1800 m across on a 360 x 360 grid - 5 m per quad. Per-vertex
normals on a grid that coarse give large flat facets that read as a folded
sheet however good the wave maths underneath is.

Computing the normal per fragment from the same analytic derivative costs a few
cosines and gives a sea that glints correctly at any distance. This is most of
why it reads as water at all.

It does **not** mean the grid can be any size it likes. The normals are free of
the grid; the *shape* is not. Below about eight vertices per wavelength the
crests alias into moving facets, so the shortest wave in `SWELL` sets the
minimum resolution:

```
WATER_HALF * 2 / WATER_SEGMENTS * 8  <=  shortest wavelength
```

The shortest wave here is 43 m against a 5 m quad - about 8.6 vertices per
wavelength, close to the line. **There is a test pinning this**, because adding
a short, pretty, cheap-looking wave to the table is exactly the change that
would quietly wreck the sea and then look like a driver problem.

## Why the tide is a uniform and not a re-bake

The depth baked into the mesh is measured from the **datum**, not from the
waterline, and it is deliberately *not* clamped at zero — so a vertex over
ground standing half a metre above mean water carries `-0.5`.

The shader works out the depth that matters as `max(0, aDepth + uTide)`. That
is exact, it costs one uniform, and it means the shallows, the shoreline fade
and the swell damping all follow the tide up and down the beach without
touching 130,000 vertices every frame.

Clamping at bake time would have thrown away exactly the information the tide
needs: how far *above* the water a piece of ground was.

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
- **`swellAt` is parametric.** It answers for the water whose *rest* position
  is `(x, z)`, and that water has been pulled up to about 0.66 m sideways.
  Anything asking "how high is the sea at this world point" lives with that
  error - a few centimetres of height on a swell seventy metres long. A test
  pins the slip. It would matter if the waves were ever steep.
- **The swell does not shoal.** Real swell slows, steepens and shortens running
  into shallow water. This just fades out over the last six metres of depth,
  which is right at the waterline and wrong halfway in.
- Nothing reacts to the player. No wake, no ripples, no displacement.
- `WATER_SEGMENTS` is fixed; there is no LOD on the sea.

## How to review

- **Stand on the beach and look out.** It should read as an ocean: long swells
  rolling through, well spaced, no chop, nothing breaking.
- **Watch one crest travel.** Steady, holding its shape, at a pace somewhere
  between walking and jogging - not shimmering and not scrolling.
- **Watch the waterline.** The swell should flatten out into the sand rather
  than heaving up through the beach, and the edge should be a wet fade rather
  than a cut line.
- **Look along the sun's reflection.** The glint should travel with the swell.
  This is the thing that says water; if it looks like a flat coloured sheet the
  per-fragment normals are not working.
- **Fly high.** The shallows around the island should be pale and the deep
  water dark, with the change following the shape of the coast.
- **Scrub the day slider and watch the beach.** The waterline should walk
  several metres up and down it, and the pale shallows should move with it
  rather than staying put while the sheet slides underneath. There are two high
  waters a day and they are not the same height.
- **Look at it in all four lighting modes.** Night is the hard one — it should
  stay legible as water, not become a black hole or a grey plastic sheet.
- **Walk into the sea.** You should wade, then tip forward and swim when it gets
  out of your depth, then stand back up on the way out. (That behaviour belongs
  to `02-player`, but this is where you will see it.)
- **Swim out and look around from the surface.** The body should sit *in* the
  water, about half a metre down, not on top of it - and it should **rise and
  fall with the swell** rather than holding one level while the sea moves past.
- **Look along the horizon for facets.** If the crests look faceted, or crawl
  in steps, the grid has gone too coarse for the shortest wave.
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
