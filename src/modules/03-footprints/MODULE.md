# 03-footprints

## What this is

Prints left in the sand behind the player, fading over about half a minute.
One instanced mesh for the whole trail, so however many are on the ground it
stays a single draw call.

The bookkeeping — spacing, alternating feet, recycling — is pure and lives in
`internal/trail.ts` with no three.js in it, so it is tested in Node.

## Public contract

| Export | Meaning |
| --- | --- |
| `Footprints` | The R3F component. Registered in `src/app/scene.ts` |
| `stepTrail(state, walker, dt, groundAt, config?)` | Ages prints and lays new ones. Pure |
| `createTrail(config?)` | A trail with every slot free |
| `fadeOf(print, config?)` | `1` when fresh, `0` once gone |
| `TRAIL` | `{ capacity, stride, life, spread }` |
| `Footprint`, `TrailState`, `Walker` | The shapes above |

`Walker` is `{ x, z, facing, grounded }` — deliberately narrower than the
player's state, so anything that walks can leave prints, not just the player.

## Invariants you may rely on

- **Prints are spaced by distance walked, not by time.** Standing still leaves
  nothing, and walking slowly does not bunch them up. The leftover distance is
  carried between frames, so spacing does not drift with frame rate.
- **Feet alternate**, and the pair sit either side of the line of travel.
- **Nothing is left while airborne** — you are not touching the sand.
- **The trail never grows.** It is a fixed ring of `TRAIL.capacity` slots and
  the oldest is overwritten.
- Each print sits at the ground height where it was left, so a print on a dune
  stays on the dune.
- Losing the walker (the player module switched off) and getting it back does
  not print one enormous stride between the two positions.

## Deliberate non-goals

- **No prints from anything but the player.** The `Walker` shape is general, but
  only one is wired up.
- No prints below sea level. There is no water yet, but seabed prints would be
  wrong either way.
- **No depth.** These are decals lying on the surface, not deformed terrain.
  Actually pressing them into the heightfield would mean the terrain stops
  being a pure function of position, which is a much bigger decision.
- No persistence — the trail is lost on reload.
- No prints from wind, rain, tide, or anything else erasing them beyond time.

## How to use it from a new module

To leave prints for something else that walks:

```ts
const trail = createTrail()
stepTrail(trail, { x, z, facing, grounded }, delta, heightAt)
```

Then draw `trail.prints` however you like, using `fadeOf` for opacity.

## Known limitations

- One trail, one capacity, shared by whoever walks. Two walkers would fight
  over the same 220 slots.
- A very large single frame step lays one print rather than filling in the
  path behind it, because only the end position is known.
- The prints are a flat circle scaled into an oval — recognisably a footfall,
  not recognisably a foot. A real sole shape wants a texture, which is a job
  for the asset pipeline.
- Fading is linear. Real prints in dry sand collapse faster at the start.

## How to review

- **Walk and look behind you.** Prints should trail off in a believable stride,
  left and right alternating, not a single line down the middle.
- **Stand still.** Nothing new should appear.
- **Jump.** Nothing should be left mid-air; the next print lands where you do.
- **Walk up a dune.** Prints should lie along the slope, not float flat above it
  or sink into it.
- **Walk in circles for a minute.** The oldest prints should fade out rather
  than the trail growing forever, and the draw call count in the perf HUD must
  not climb.
- **Walk into the sea.** Prints should stop at the waterline.
- Check them at night as well as daylight — they should read as depressions in
  both, not as black holes.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
