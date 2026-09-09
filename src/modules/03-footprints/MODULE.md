# 03-footprints

## What this is

Webbed duck prints left in the sand behind the player, fading over about half
a minute. One instanced mesh for the whole trail, so however many are on the
ground it stays a single draw call.

The bookkeeping — spacing, alternating feet, recycling — is pure and lives in
`internal/trail.ts` with no three.js in it. The *shape* of a foot is pure too,
in `internal/foot.ts`. Neither imports three.js, so both are tested in Node.

## Public contract

| Export | Meaning |
| --- | --- |
| `Footprints` | The R3F component. Registered in `src/app/scene.ts` |
| `FootprintsProps` | `{ groundAt?, printableAt? }`. Both optional |
| `stepTrail(state, walker, dt, groundAt, config?, id?)` | One walker. Pure |
| `stepTrails(state, walkers, dt, groundAt, config?)` | Everybody at once. Pure |
| `forgetWalker(state, id)` | Drops a walker's stride bookkeeping |
| `addWalker(id, source)` / `removeWalker(id)` | Register somebody else who walks |
| `SELF` | The id used when nobody says who is walking |
| `createTrail(config?)` | A trail with every slot free |
| `fadeOf(print, config?)` | `1` when fresh, `0` once gone |
| `strideFor(speed, config?)` | Spacing at that pace. Running lengthens it |
| `TRAIL` | `{ capacity, stride, life, spread }` |
| `duckFootAt(x, y)` | Signed distance to the foot in the unit square. Negative inside |
| `duckFootGlsl()` | The same field as GLSL source, generated from `DUCK_FOOT` |
| `DUCK_FOOT` | Heel, toes and webbing — the numbers the shape is built from |
| `Footprint`, `TrailState`, `Walker`, `Toe` | The shapes above |

`Walker` is `{ x, z, facing, grounded, speed? }` — deliberately narrower than
the player's state, so anything that walks can leave prints, not just the
player. `facing` is only a fallback; see below.

## What ground takes a print

Sand, and only sand.

Two things can veto a print, and both are decided per step rather than once:

- **Under the waterline.** The tide moves the edge of the sea several metres up
  and down the beach, and a print under water would wash out rather than sit
  there. So the test is against where the water is *now*, not against y=0.
- **On a rock.** Passed in as `printableAt`, because this module has never
  heard of a rock and should not start now.

The second one matters more than it sounds. A print is tilted by the
**island's** surface normal, and the island knows nothing about what is piled
on top of it — so a print left on a boulder would lie flat on something that is
not flat, at a height decided by ground it is not touching. Vetoing is the only
right answer: not moving the print, not flattening it, just not leaving one.

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
- **Nothing is left while airborne** — you are not touching the sand. That
  makes the prints a live check on the player being properly grounded: when
  running downhill stopped leaving prints, the bug was in the player's ground
  handling, not here.
- **Nothing is left below the waterline**, and the waterline moves with the
  tide rather than sitting at the datum.
- **The trail never grows.** It is a fixed ring of `TRAIL.capacity` slots and
  the oldest is overwritten - **shared by everybody**, so the whole beach is
  one draw call however many people are on it.
- **Everyone has their own stride**, their own last position and their own foot
  to put down next. Only the prints are shared; a print in the sand does not
  care who made it.
- **Prints age once a frame, not once per walker.** That is the whole reason
  `stepTrails` takes everyone at once rather than being called in a loop: a
  full lobby would otherwise fade the beach eight times too fast. There is a
  test that fails if the ageing moves inside the walker loop.
- Each print sits at the ground height where it was left, so a print on a dune
  stays on the dune.
- Losing the walker (the player module switched off) and getting it back does
  not print one enormous stride between the two positions.

## Deliberate non-goals

- **No prints from anything but people.** The `Walker` shape is general, and
  `09-net` registers everyone in the lobby through it, but nothing else does.
- No prints below the waterline — no seabed trail, and nothing while swimming,
  since the walker is not grounded.
- **Nothing washes prints away.** A print left below the high-water line stays
  until it fades on its own, even once the tide has covered it. Prints stop
  being *left* under water; they are not *removed* by it.
- **No real depth.** A print is a dark shape sunk into the surface - a solid
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

## The foot is a distance field, not a texture

A print is a duck's foot: three toes running out from a heel, joined by a
smooth minimum that fills the wedge between them. That fill *is* the webbing,
and it comes out scalloped — curving back towards the heel between the toe
tips — which is what a duck's web looks like from above.

Drawing it as a distance field in the fragment shader rather than as a texture
means no asset to make, no atlas to pack, and nothing to go soft when you stand
right over a print.

The field lives in `internal/foot.ts` in plain arithmetic and the GLSL is
generated from the same numbers, so the two cannot drift. Having it in Node is
what lets the *shape* be checked rather than only looked at: that there really
are three toes, that they stay separate at the tips, that there is webbing
between them but that it falls away before the tips, that the whole thing is
one connected foot, and that it fits inside the quad it is drawn on.

Two numbers are worth knowing before touching it:

- **`web`** is the smoothing width. Too little and the toes are three separate
  sticks; too much and the foot fills into a paddle with no toes visible.
- **`heelCut`** exists because a smooth minimum dips *below* both its inputs —
  that is what makes it smooth — and behind the heel, where all three toes are
  about equally far away, it dipped enough to inflate a blob out the back. Left
  alone the print reached further backwards than its toes reached forward,
  which read as a paw. The cut trims the blob and leaves the heel tapered.

The middle toe is longer than the outer two, and the outer two are not quite
mirror images of each other, so the foot has a handedness. A left print is the
right print mirrored, which the instance matrix does with a negative scale.

## Why there is no rim

An earlier version drew a bright lip around each print, meaning to suggest sand
pushed up at the edge. A bright edge is exactly what makes something read as
*raised*, so every print came out looking like an iris. Shadow alone is what
says "pressed in". There is a test that fails if anything in the injected
fragment code brightens the output again.

## The quad is laid flat at construction

`PlaneGeometry` is built in the XY plane, so its normal is `+Z`. Everything
here reasons in `+Y`-up terms, and aligning the quad's "up" to the ground
normal without accounting for that leaves every print standing on its edge.
The geometry is rotated once when it is made, and a test pins that, because it
is not visible in the code that does the aligning.

A quad rather than a disc because the shape is cut out by the distance field,
so all the geometry has to do is cover the unit square the field is drawn in —
and two triangles do that exactly, with no corner clipping a toe.

## Known limitations

- One capacity shared by whoever walks, so a full lobby gets a shorter trail
  each. At 420 slots that is about fifty paces each with eight people.
- A very large single frame step lays one print rather than filling in the
  path behind it, because only the end position is known.
- The foot is a stylised duck's foot, not a scan of one: three toes and a web,
  with no claws, no scales and no ridges. Those want a texture, which is a job
  for the asset pipeline.
- Every print is the same shape at the same size. Nothing varies with how hard
  the foot landed, how wet the sand is, or how fast the walker was going.
- Fading is linear. Real prints in dry sand collapse faster at the start.

## How to review

- **Walk and look behind you.** Prints should trail off in a believable stride,
  left and right alternating, not a single line down the middle.
- **Hold shift and run.** The prints should space out, not just arrive faster.
- **Stand still.** Nothing new should appear.
- **Jump.** Nothing should be left mid-air; the next print lands where you do.
- **Walk up a dune.** Prints should lie along the slope, not float flat above
  it.
- **Get close and look at one.** It should read as a webbed duck's foot: three
  toes with the web scalloped between them, pointing the way you were going.
  Sunk into the sand — no ring, no bright rim, nothing that looks like an eye.
  The toes are deliberately stubby and the web is the biggest part of it: it
  should read as a duck at a glance rather than survive close anatomical
  inspection.
- **Look at a left and a right print together.** They should mirror.
- **Walk in circles for a minute.** The oldest prints should fade out rather
  than the trail growing forever, and the draw call count in the perf HUD must
  not climb.
- **Strafe.** Hold A or D and walk sideways across the beach: the prints should
  lie along the way you are moving, not across it, and should straddle the path
  rather than landing in front of and behind you.
- **Walk a curve.** The prints should turn through it.
- **Walk into the sea.** Prints should stop at the waterline, and nothing
  should be left while swimming.
- **Walk the beach at high tide and again at low tide.** The line where prints
  stop should move with the water, not stay put.
- **Run down a steep dune.** Prints must keep coming the whole way down — this
  is the easiest place to see the player losing its grip on the ground.
- Check them at night as well as daylight — they should read as depressions in
  both, not as black holes.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
