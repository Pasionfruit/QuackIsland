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
| `strideFor(speed, config?)` | Spacing at that pace. Running lengthens it |
| `TRAIL` | `{ capacity, stride, life, spread }` |
| `Footprint`, `TrailState`, `Walker` | The shapes above |

`Walker` is `{ x, z, facing, grounded, speed? }` — deliberately narrower than
the player's state, so anything that walks can leave prints, not just the
player. `facing` is only a fallback; see below.

## Invariants you may rely on

- **Prints are spaced by distance walked, not by time.** Standing still leaves
  nothing, and walking slowly does not bunch them up. The leftover distance is
  carried between frames, so spacing does not drift with frame rate.
- **Feet alternate**, and the pair sit either side of the line of travel.
- **Prints lie along the way the foot actually went**, not the way the body is
  pointing. `Footprint.facing` is the heading of the step itself.
- **Running lengthens the stride** rather than taking the same little steps
  faster, capped at `strideMax`. A sprint leaving walk-spaced prints reads as a
  shuffle.
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
- No prints below sea level — no seabed trail, and nothing while swimming,
  since the walker is not grounded.
- **No real depth.** A print is a darker oval sunk into the surface - a solid
  dark middle, the edge feathered off, and nothing else. It is still a decal.
  Genuinely denting the ground would mean the terrain stops being a pure
  function of position, which every other module depends on, so that is a much
  bigger decision than it looks.
- No persistence — the trail is lost on reload.
- No prints from wind, rain, tide, or anything else erasing them beyond time.

## How to use it from a new module

To leave prints for something else that walks:

```ts
const trail = createTrail()
stepTrail(trail, { x, z, facing, grounded }, delta, heightAt)
```

Then draw `trail.prints` however you like, using `fadeOf` for opacity.

## Prints point along the travel, not along the body

The player strafes: the body faces the camera, so it can be facing north while
stepping east. Orienting prints by `Walker.facing` there lays every print
across the direction of travel, which reads as the feet sliding sideways.

So the heading comes from the step itself — the delta between where the walker
was and where it is. `Walker.facing` is used only when the walker has barely
moved, where the delta is numerical noise rather than a direction.

The same heading also decides which side each foot lands on, so a side-step
puts the prints either side of the path rather than in front of and behind it.

## Why there is no rim

An earlier version drew a bright lip around each print, meaning to suggest sand
pushed up at the edge. A bright edge is exactly what makes something read as
*raised*, so every print came out looking like an iris. Shadow alone is what
says "pressed in". There is a test that fails if anything in the injected
fragment code brightens the output again.

## The disc is laid flat at construction

`CircleGeometry` is built in the XY plane, so its normal is `+Z`. Everything
here reasons in `+Y`-up terms, and aligning the disc's "up" to the ground
normal without accounting for that leaves every print standing on its edge.
The geometry is rotated once when it is made, and a test pins that, because it
is not visible in the code that does the aligning.

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
- **Hold shift and run.** The prints should space out, not just arrive faster.
- **Stand still.** Nothing new should appear.
- **Jump.** Nothing should be left mid-air; the next print lands where you do.
- **Walk up a dune.** Prints should lie along the slope, not float flat above
  it.
- **Get close and look at one.** It should be a plain darker oval sunk into the
  sand: no ring, no bright rim, nothing that looks like an eye.
- **Walk in circles for a minute.** The oldest prints should fade out rather
  than the trail growing forever, and the draw call count in the perf HUD must
  not climb.
- **Strafe.** Hold A or D and walk sideways across the beach: the prints should
  lie along the way you are moving, not across it, and should straddle the path
  rather than landing in front of and behind you.
- **Walk a curve.** The prints should turn through it.
- **Walk into the sea.** Prints should stop at the waterline, and nothing should
  be left while swimming.
- Check them at night as well as daylight — they should read as depressions in
  both, not as black holes.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
