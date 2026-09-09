# 12-rocks

## What this is

Rocks of every size around the island — from things you could kick to boulders
you have to walk round. Three size classes, each varying within itself, so the
range is better than ten to one from smallest to largest.

One instanced mesh per class, so the whole island costs **three draw calls**
however many rocks are on it.

They are **solid**: you bump into the big ones, walk over the small ones, and
can jump up onto anything in between and stand on top of it.

Distinct from `07-shore`, which does pebbles and shells along the water line. A
pebble on the strand has been carried there from somewhere else; a boulder is
the island showing through. They have different palettes, different bands, and
different rules for good reasons.

## Public contract

| Export | Meaning |
| --- | --- |
| `Rocks` | The R3F component. Registered in `src/app/scene.ts` at order 75 |
| `getRocks()` | Every rock on *this* island. Cached; the one answer |
| `getSolidRocks()` | The same rocks with collision shapes worked out. Cached |
| `standHeightAt(x, z, rocks, below)` | Ground, raised to a rock top. Pure |
| `onRockAt(x, z, rocks, ground)` | Whether stone is underfoot, not sand. Pure |
| `resolveRocks(x, z, feetY, radius, rocks)` | Pushed out of anything solid. Pure |
| `halfExtents(rock)` / `topOf` / `girthOf` | How big a tumbled rock is. Pure |
| `solidify(rocks)` | Collision shapes, once. Pure |
| `rotationXYZ(x, y, z)` | The rotation three draws with, row-major. Pure |
| `COLLISION` | Step height, clearance, passes |
| `SolidRock` | `{ x, z, base, top, girth }` |
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
- **You are never pushed inside another rock.** The push runs three passes, so
  somebody wedged between two comes out clear of both.
- **A rock you are standing on never pushes you off**, and one you have jumped
  over never pushes you back. Both are decided from your feet, not your middle.
- **The collision shape is at the angle you can see.** `rotationXYZ` is checked
  against three's own `makeRotationFromEuler` — a collision box at a different
  angle from the mesh is the worst kind of wrong, because it looks fine.
- **The push never returns NaN**, including from dead centre of a rock, where
  there is no direction to be pushed in.

## Deliberate non-goals

- **No physics.** Rocks are upright cylinders to walk into and flat discs to
  stand on. Nothing rolls, nothing tips, and you cannot shelter under an
  overhang, because there are no overhangs.
- **No removing them, and nothing to do with shells.** The seam is written down
  below; the buying is not built.
- **No picking up, pushing or breaking.**
- **No rock faces, cliffs or outcrops.** These are rocks *on* the terrain, not
  terrain that is rock. Changing the shape of the island belongs to `01-terrain`.
- **No moss, lichen, cracks or texture.** Flat-shaded stone, coloured per
  instance.
- **No rocks underwater beyond the shallows**, and none on the sea bed.

## Standing on one, and walking into one

Two halves, and only one of them is hard.

**Standing on a rock is just a height function.** `standHeightAt` returns the
top of the rock you are over, or the ground if you are not over one. Everything
the player already does — falling, landing, the ground snap, leaving
footprints — then works on a boulder without knowing a boulder exists.

**Bumping into one is the hard half, and it exists precisely because of the
easy half.** A ground function that reports the top of a three-metre boulder
will teleport you up it the moment you touch its edge, because the controller
snaps to the ground whenever it finds itself below it. So anything worth
climbing has to be solid enough to stop you walking through, or the climbing is
free and the boulder may as well be a ramp.

`COLLISION.stepUp` is the line between the two. Below it a rock is a kerb: you
walk on over and the ground carries you up, which is what you want for a pebble
that would otherwise stop you dead. Above it the rock is solid and you go round
it or jump onto it. Both halves read your **feet**, because how high something
is compared with your feet is the entire question — below them it is floor,
just above them a step, well above them a wall.

The push is along the line out from the rock's middle, so walking into a
boulder at an angle slides you round rather than stopping you dead. That is the
difference between a world and a set of boxes.

A rock is a circle for this, of the *mean* of its two horizontal half-extents.
Taking the larger would put an invisible wall round the narrow side of every
stretched rock, and the error the mean makes is smaller than the rock is rough.

### What that comes out as, on this island

Measured, not guessed — 452 rocks against a 1.8 m duck that jumps 2.33 m:

| | Rocks | What it feels like |
| --- | --- | --- |
| Under `stepUp` (0.55 m) | 17 | Walk straight over |
| Jumpable (up to 2.33 m) | ~380 | Hop up and stand on it |
| Taller than a jump | ~55 | Walk round it |

The middle row is the point of the whole thing, and it is where the small class
lands: those rocks are a median 0.97 m, so they stop you and then reward you for
jumping. Every boulder is in the bottom row, which is what a boulder is for.

**`stepUp` is the dial** if the island ever feels like an obstacle course.
Raising it moves rocks from the middle row into the top one; there is no other
knob, because that one threshold is the only thing separating a kerb from a
wall.

## Which module knows what

Neither the player nor this module imports the other. `02-player` takes an
optional `collide` alongside the `groundAt` it already had, and
`src/app/scene.ts` supplies both:

```ts
const standOn = (x, z) => standHeightAt(x, z, getSolidRocks(), currentGround(x, z))
const pushOutOfRocks = (x, z, feetY, r) => resolveRocks(x, z, feetY, r, getSolidRocks())
```

The **sea deliberately does not get `standOn`**. Its depth is baked once over a
hundred and thirty thousand vertices, and asking each of them about four
hundred rocks would be sixty million checks to make the water slightly
shallower beside some boulders. It keeps the plain ground.

## The seam for buying rocks away

Paying shells to clear a rock is not built. What *is* built is the shape it
needs: `getRocks()` is the **single** answer to where the rocks are, the mesh
and the collision both read it, and a rock's identity is its index in that
list — stable, because the scatter is seeded and ordered.

So removal is a filter at one choke point, plus a rebuild of the two things
that currently only build once: the instanced matrices in `RocksView`, and the
cached `getSolidRocks()`. None of the maths has to change, and `11-currency`
already has the paying half.

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

- **A rock is a cylinder to walk into and a disc to stand on**, both sized from
  the ellipsoid's bounding box. On a rock stretched flat you can stand slightly
  past its visible edge; on a jagged one you stop slightly short of it.
- **The top is flat.** You do not slide off a boulder, and standing on the very
  edge is as solid as standing in the middle.
- **The push is a teleport, not a force.** Walking hard into a boulder holds
  you at its surface rather than leaning on it; nothing here has momentum.
- **Every rock is tested every step.** Four hundred and fifty distance
  comparisons a frame, which is nothing, and would want a grid the moment there
  were thousands.
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
- **Walk into a boulder.** You should stop against it — not pass through, and
  not be flung. Walk at it on the diagonal and you should slide round it.
- **Walk over a small one.** A pebble should not stop you.
- **Jump onto a medium rock.** You should land on top and stay there: not be
  shoved off as you land, and not sink into it.
- **Walk off the top.** You should drop off cleanly at the edge.
- **Find a rock in the shallows and walk into it.** Still solid.
- **Look hard at where rocks meet the ground** after the placement fix: none
  should hover, and none should be buried past its bedding-in.
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
