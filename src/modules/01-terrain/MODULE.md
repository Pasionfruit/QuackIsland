# 01-terrain

## What this is

A sandy island: one deterministic height function, drawn as a grid of chunked
meshes with three levels of detail and procedural sand shading. No water, no
trees, no rocks — those are separate modules that will be placed *against* this
one.

The height function is the point of this module. Everything later that touches
the ground resolves through it.

## Public contract

Import from `../01-terrain`. Never reach into `internal/`.

**Metres. +Y is up. Sea level is exactly `y = 0`, and terrain goes negative
below it, so land is simply `height > 0`.**

| Export | Meaning |
| --- | --- |
| `heightAt(x, z): number` | Ground height in metres. Pure, deterministic, finite for every input |
| `heightAtBatch(xs, zs, out)` | Same, in bulk, zero allocation. Use this for scattering |
| `sampleAt(x, z, out?)` | `{ height, normalX/Y/Z, slope, surface }` in one pass. Pass `out` to reuse it |
| `normalAt` via `sampleAt` | Unit surface normal, from the height field not the mesh |
| `slopeAt(x, z): number` | Radians from horizontal. `0` is flat |
| `surfaceAt(x, z): Surface` | `'oceanFloor' \| 'wetSand' \| 'sand' \| 'dune' \| 'rock'` |
| `isLand(x, z): boolean` | `heightAt(x, z) > 0` |
| `worldBounds()` | `{ minX, maxX, minZ, maxZ, radius }` of the meshed square |
| `TERRAIN` | The config: radius, heights, chunk size, LOD table |
| `SEA_LEVEL` | Exactly `0`. Not a tunable |
| `Terrain` | The R3F component, already registered in `src/app/scene.ts` |

Current world: a **576 m square**, six chunks of 96 m per side, island radius
262 m, ground between **-22 m and about +29 m**.

## Invariants you may rely on

- `heightAt` is **pure and deterministic**. Same input, same output, forever,
  in any process. There is no hidden state and no `Math.random`.
- It is **defined and finite for every finite input**, and for `NaN` and
  `Infinity` too — those return the ocean floor rather than poisoning your mesh
  with a `NaN` a hundred lines later.
- It is **continuous**: no adjacent-sample jump above 2 m anywhere, tested on a
  dense grid, so nothing you place will fall through a crack.
- **The mesh agrees with the function to within 1e-4 m**, at every level of
  detail. If you place something at `heightAt(x, z)` it will sit on the ground
  the player can see, not above or below it.
- Normals are computed from the height field, not from triangles, so they do
  not change with level of detail.

## Deliberate non-goals

- **No water, not even a placeholder plane.** Sea level is `y = 0` and that is
  all this module says about it. A placeholder here would become a second
  source of truth the moment `02-water` exists.
- No trees, rocks, props, or any generated asset. Nothing from Meshy.
- **No physics colliders.** `heightAt` *is* the collision contract — a later
  physics module builds a heightfield collider by sampling it.
- No character controller. The camera is the debug orbit from `00-core`.
- No textures. The sand is entirely procedural.
- No biomes, weather, day/night, tides, or terrain editing.
- The island does not stream or extend. It is one fixed square.

## How to use it from a new module

```tsx
import { heightAt, sampleAt, surfaceAt, isLand } from '../01-terrain'

// Put a thing on the ground.
const y = heightAt(x, z)

// Decide whether a thing belongs here at all.
const spot = sampleAt(x, z)
const plantable = spot.surface === 'sand' && spot.slope < 0.5 && spot.height > 2
```

Scattering many things? Use the bulk path, which allocates nothing:

```ts
const xs = new Float32Array(n), zs = new Float32Array(n), hs = new Float32Array(n)
// ...fill xs and zs...
heightAtBatch(xs, zs, hs)
```

## Extension guidance

- **Placing anything on the ground:** use `sampleAt`, and use `surface` and
  `slope` rather than re-deriving them from heights. Two modules computing
  their own idea of "too steep" will drift apart.
- **Water:** the plane goes at `y = 0`. Use `heightAt` for the shoreline blend
  and `surfaceAt` for where foam belongs. Do not change sea level.
- **Physics:** sample `heightAtBatch` on a regular grid to build a heightfield
  collider. Do not build one from the render meshes — they change with level of
  detail.
- **A different island:** that is a reshape of this module, not a new one, and
  it invalidates the golden height table plus everything placed against it.
  Ask the human to unfreeze.

## Known limitations

- One island, one seed, one fixed square. No streaming, so this does not scale
  to a large world without a new module.
- Terrain does not cast shadows onto itself — it only receives them. At this
  scale, with a high sun, self-shadowing costs a whole extra pass over every
  chunk and buys very little. Props will still cast onto it.
- Levels of detail switch on a hard distance, so there is a small pop. Skirts
  hide the crack, not the pop. Geomorphing would fix it and is a fair reason
  for a future module.
- `slopeAt` and `sampleAt` share one scratch buffer, so they are not safe to
  call from more than one thread. There are no threads here yet.

## How to review

- **From high up:** is the silhouette an *island* — an irregular coastline with
  a believable middle — rather than a blob or a cone?
- **Down at the shore:** does it read as a beach? The ground should run into
  the waterline gently, with a visibly darker, shinier damp band just above it,
  not meet it like a cliff.
- **Move continuously across chunk borders.** Levels of detail pop and lighting
  seams only appear while moving; a screenshot hides both. Look for cracks you
  can see through, and for a lighting change along a straight line.
- **Grazing sun:** does the sand read as sand, or as grey plastic? Is there
  grain, or is it flat?
- **The red ball follows the camera and sits on the ground.** Drive it all over
  the island, especially across chunk and level-of-detail borders. It must
  never sink in or float. This is exactly what trees and a character will do
  later, rehearsed.
- **Watch the perf HUD** while flying: frame time, draw calls, triangles. Write
  the numbers into the Measured section below.
- Then read this document cold and ask: could I build trees from this alone?

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
