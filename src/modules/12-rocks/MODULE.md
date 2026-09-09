# 12-rocks

## What this is

Rocks of every size around the island — from things you could kick to boulders
you have to walk round. Three size classes, each varying within itself, so the
range is better than ten to one from smallest to largest.

One instanced mesh per class, so the whole island costs **three draw calls**
however many rocks are on it.

Distinct from `07-shore`, which does pebbles and shells along the water line. A
pebble on the strand has been carried there from somewhere else; a boulder is
the island showing through. They have different palettes, different bands, and
different rules for good reasons.

## Public contract

| Export | Meaning |
| --- | --- |
| `Rocks` | The R3F component. Registered in `src/app/scene.ts` at order 75 |
| `scatterRocks(ground, options)` | Every rock, largest first. Pure |
| `scatterClass(class, ground, options, placed?)` | One size class. Pure |
| `settleHeight(x, z, radius, groundAt, probes?)` | Where a rock rests. Pure |
| `ROCKS` | Classes, band, slope limit, spacing, bedding |
| `ROCK_COLOURS` | The palette |
| `Rock` | `{ size, x, y, z, radius, scaleXYZ, turnXYZ, tint }` |
| `Ground` | `{ heightAt, slopeAt }` — what a scatter needs to know |
| `RockSize`, `RockClass`, `ScatterOptions` | The shapes above |

`Ground` is passed in rather than imported, so a test can hand it flat ground,
a cliff, or open ocean and check the rules directly.

## Invariants you may rely on

- **Nothing floats.** For every rock, every point of ground under its footprint
  is at or above where the rock sits. There is a test that walks twenty-four
  points around every rock on the island.
- **`Placement.y` is where the bottom rests**, already bedded in. The view adds
  half a rock to get the middle and does no sampling of its own.
- **Nothing sits in deep water or on the peaks**, and nothing on ground it
  would slide down.
- **The middle of the island is clear.** The player starts at the origin, and
  arriving inside a boulder is a poor introduction.
- **Nothing overlaps anything else**, with the gap measured in radii rather
  than metres: two boulders a metre apart is a very different picture from two
  pebbles a metre apart.
- **The same island comes back every load.** Everything derives from the world
  seed and there is no `Math.random` here.
- **The scatter always terminates.** Rejection sampling with a fixed attempt
  budget, so ground with nowhere usable returns an empty list rather than
  spinning — and it runs on the first frame.
- **Nothing here moves.** The scatter runs once, the matrices are written once.

## Deliberate non-goals

- **No collision.** You walk through them, boulders included. That is a physics
  module's job and there is not one — and it is the most obviously missing
  thing here.
- **No picking up, climbing, pushing or breaking.**
- **No rock faces, cliffs or outcrops.** These are rocks *on* the terrain, not
  terrain that is rock. Changing the shape of the island belongs to `01-terrain`.
- **No moss, lichen, cracks or texture.** Flat-shaded stone, coloured per
  instance.
- **No rocks underwater beyond the shallows**, and none on the sea bed.

## Why the settle matters

Sampling the ground at the middle of a rock and putting it there is what
`07-shore` does for a shell, and it is *wrong* for anything bigger. On a slope
the middle is higher than the downhill edge, so a five-metre boulder hangs in
the air on one side and buries its top on the other.

`settleHeight` samples a ring around the footprint as well and takes the
**lowest** point, so the lowest edge is the one that touches. The cost is that
a rock on a slope beds further into the hill on its uphill side — which is what
a rock on a slope does.

It samples eight points, so a narrow dip *between* two of them is not seen.
That is covered by the bedding-in rather than by more samples: every rock is
pressed `ROCKS.sink` of its radius into the ground, which is always larger than
what the sampling misses. There is a test asserting exactly that relation per
rock, rather than an absolute number — a boulder samples a much wider ring than
a pebble and will always miss more.

## Why the big ones go down first

`scatterRocks` sorts the classes largest first. Scattering the small ones first
fills the island and leaves the boulders nowhere to go, and **a boulder that
could not be placed is far more missed than a pebble that could not be**.

## Why the geometry is knocked about

An icosahedron reads as a low-polygon ball however you scale it. The same
shape with its vertices pushed off centre by the seeded generator reads as
stone, and costs one pass over a few dozen vertices at startup.

The push is keyed by vertex *position*, not by index: the same corner is shared
by several faces, and moving it differently for each one tears the surface
open along the seams.

## Known limitations

- **You walk through them.** See the non-goals; it is the first thing anyone
  will notice.
- Three base shapes, distinguished by tumble, stretch and colour rather than by
  being different rocks. It holds up at a distance and less so up close.
- The band is fixed in world height, so a rock in the shallows is covered and
  uncovered by the tide rather than being placed relative to it.
- Rejection sampling means the counts in `ROCKS` are targets, not guarantees.
- No rock is oriented *to* the ground — they tumble freely, which suits a rock
  and would not suit anything with a top.
- The overlap check is linear in what has been placed; fine in the hundreds.

## How to review

- **Walk inland.** Rocks of visibly different sizes, all round the island, not
  in lines or clumps.
- **Find a boulder and walk round it.** It should sit *in* the ground, not on
  it, with no gap under any edge.
- **Find one on a slope.** It should rest on its downhill edge and dig into the
  hill above — no hovering, no half-buried top.
- **Look at a group.** No two should be the same shape: they tumble on all
  three axes and stretch differently.
- **Look at the colours.** Greys and browns with a bit of iron. Anything
  brightly coloured is a bug, not variety.
- **Stand at the spawn.** The middle should be clear.
- **Walk the waterline.** Some rocks should stand in the shallows; scrub the
  tide and they should be covered and uncovered.
- **Look out to sea and up at the peaks.** Nothing in either.
- **Reload.** Identical island.
- **Check the perf HUD** with the module on and off: three draw calls, and the
  frame time should barely move.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
