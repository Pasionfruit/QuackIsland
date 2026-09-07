# 07-shore

## What this is

Shells and coloured pebbles along the water's edge — the strand line, where
things wash up.

Three kinds: pebbles in ten colours, clam shells, and cone shells. One
instanced mesh each, so the whole beach is three draw calls however many things
are on it, and every shape is geometry rather than a model.

Where things go is decided by `internal/scatter.ts`, which is pure and takes
the ground as two functions. The terrain is a pure function too, so the entire
scatter runs in Node — which is why the tests can check every single placement
against the real island rather than checking a beach by looking at it.

## Public contract

| Export | Meaning |
| --- | --- |
| `Shore` | The R3F component. Registered in `src/app/scene.ts` at order 70 |
| `scatterShore(ground, options)` | Every kind, in one list. Pure |
| `scatterKind(kind, count, ground, options)` | One kind. Pure |
| `SHORE` | The band, the slope limit, the counts, the spacing |
| `PALETTES` | The colours, per kind |
| `Placement` | `{ kind, x, y, z, turn, scale, tint, sink }` |
| `Ground` | `{ heightAt, slopeAt }` — what a scatter needs to know |
| `ShoreKind` | `'pebble' \| 'clam' \| 'cone'` |

`Ground` is passed in rather than imported, so a test can hand it flat ground,
a cliff, or open ocean and check the rules directly. The component passes the
real island.

## Invariants you may rely on

- **Nothing is placed out at sea or up the dunes.** Everything sits between
  `SHORE.fromHeight` and `SHORE.toHeight`, which straddle the waterline.
- **Nothing sits on a slope it would roll off.**
- **`Placement.y` is exactly the ground height at that point.** The view trusts
  it rather than sampling again, so a stale value would be a shell hovering or
  buried, and a test pins it to nine decimal places.
- **Nothing overlaps anything of its own kind**, which is what stops two shells
  reading as one broken one.
- **The same beach comes back every load.** Everything derives from the world
  seed; there is no `Math.random` here. A shell in the wrong place can be found
  twice.
- **Each kind has its own random stream**, so adding pebbles cannot move the
  shells.
- **The scatter always terminates.** It is rejection sampling with a fixed
  attempt budget, so a world with no shore at all returns an empty list rather
  than spinning — and it runs on the first frame, so that matters.
- **Nothing here moves.** The scatter runs once, the matrices are written once,
  and after that it costs three draw calls and no frame time.

## Deliberate non-goals

- **No collision.** You walk through them. Collision is a physics module's job
  and there is not one.
- **No picking up, kicking, or any interaction at all.**
- **No movement with the tide.** Things are placed once. Real shells shift
  about; these are scenery.
- **No models.** Every shape is geometry — see below.
- **No seaweed, driftwood, crabs, or anything that is not a shell or a pebble.**
- **No change to the terrain.** They sit on the ground; they do not dent it.

## Why the shapes are geometry rather than models

At the size these are seen — fifteen centimetres, usually a few metres away —
a squashed icosahedron *is* a pebble, a flattened half-sphere *is* a clam, and
a seven-sided cone *is* a cone shell. Modelling them properly would buy detail
that is never on screen, and it would cost an asset, a loader trip, and a
normalisation pass each.

The pebbles are flat-shaded on purpose so they read as chipped stone rather
than as low-polygon balls; the shells are smooth, because shells are.

## Why colour is per instance

Ten pebble colours as ten materials would be ten draw calls, or thirty across
the kinds. `InstancedMesh` carries a colour per instance, so it stays at three.

The pebbles get the wide spread — that is the point of them. The shells stay
close to bone and shell-pink: a bright green shell reads as a bug rather than
as variety, and there is a test asserting the shell palettes stay pale and
close to neutral.

## Known limitations

- **The band is fixed in world height**, so as the tide comes in it simply
  covers the lower ones. That is roughly right, and it is not simulated.
- Density is uniform along the coast; there are no drifts or tide lines where
  things pile up, which is what a real strand line does.
- Rejection sampling means the counts in `SHORE` are targets, not guarantees.
  On this island every kind reaches its target comfortably.
- The overlap check is linear in what has been placed. Fine in the hundreds;
  it would want a grid in the thousands.
- Nothing is oriented to the ground, only turned about Y — so on a noticeable
  slope a pebble sits level rather than lying along it. At this size it does
  not show.

## How to review

- **Walk the waterline.** There should be shells and pebbles scattered along
  it, thicker near the water and thinning out up the beach.
- **Look at the pebbles.** They should be visibly *different colours* — greys,
  browns, a rust, a slate, a couple of pale ones — not one colour repeated.
- **Look closely at one.** Pebbles faceted, shells smooth, everything pressed
  into the sand rather than balanced on top of it.
- **Look for anything floating.** Nothing should hover above the sand or sink
  into it, on any slope, anywhere.
- **Walk the whole coast.** Things should be all the way round the island, not
  gathered on one side.
- **Look out to sea, and up at the dunes.** Nothing should be in either.
- **Scrub the tide through a full cycle.** The lower ones should go under and
  come back; nothing should move.
- **Reload the page.** The beach should be identical.
- **Check the perf HUD.** Three draw calls, and no measurable frame time.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
