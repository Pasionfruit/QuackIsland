# 02-player

## What this is

A body you walk around the island with, in third person: WASD to move, **shift
to run**, space to jump, and the mouse for the camera.

**Hold left and drag to look. Hold right and drag to slide the view off the
player. Wheel to pull back. F, or the button in the panel, snaps back.** The
camera only ever moves while a button is genuinely held and the mouse is
moving, so a plain click - either button - leaves the view exactly where it
was. There is no pointer lock, on purpose: a lock makes every stray mouse
movement turn the camera, which is the opposite of what a click should do. It resolves height through
`01-terrain`, so it stands on exactly the ground being drawn.

Walk into the sea and it **swims**: past a certain depth the body tips flat,
floats at the surface, turns to face the way it is going, and stands back up
when it reaches the shallows. Stop swimming and it stands upright where it is,
treading water.

All of the movement is pure arithmetic in `internal/controller.ts` with no
three.js in it, so how the player moves is tested in Node rather than by eye.

## Public contract

| Export | Meaning |
| --- | --- |
| `Player` | The R3F component. Registered in `src/app/scene.ts` |
| `PlayerProps` | `{ spawnX?, spawnZ?, surfaceAt? }` |
| `stepPlayer(state, input, dt, groundAt, opts?)` | One step of movement. Pure |
| `createPlayer(x, z, groundAt)` | A player standing on the ground at that spot |
| `StepOptions` | `{ bounds?, seaLevel?, surfaceAt? }`. All optional |
| `PlayerState` | `{ x, y, z, vy, facing, grounded, speed, swimming, lean }`. `y` is at the feet |
| `PlayerInput` | `{ forward, back, left, right, jump, run, cameraYaw }` |
| `PLAYER` | Speeds (walk, run, swim), gravity, capsule size, eye height, depths |
| `getPlayerState()` | The live player, or `null` when the module is off |
| `refocusCamera()` | Snap the view back onto the player and reset the zoom |
| `isCameraOffPlayer()` | Whether the view has been slid away |
| `CAM_DISTANCE_MIN` / `MAX` | The zoom limits, in metres |

`groundAt` is passed in rather than imported, so a test can hand it flat ground
or a slope. The component passes `heightAt` from `01-terrain`.

`seaLevel` and `surfaceAt` are passed in the same way, and for a stronger
reason — see **Why the water module does not own swimming** below.

## Invariants you may rely on

- **The player never ends a frame below the ground**, on any terrain, tested
  over hundreds of frames of rough ground.
- **Diagonals are not faster than cardinals.** Input is normalised before the
  basis is applied.
- **The body faces the camera, not the way it is walking.** A and D are
  side-steps: hold A and you slide left while still facing forward, rather than
  pivoting to face left and walking off. Backing up moon-walks, which is the
  accepted cost of the strafe model. The body only turns while there is
  movement input, so looking around while stood still does not spin it on the
  spot.
- **Forward is always away from the camera, and D is always screen-right.**
  `cameraYaw` is the direction the camera looks; forward is
  `(sin(yaw), cos(yaw))` and right is `(-cos(yaw), sin(yaw))`.

  Both of these have been wrong at some point, silently and at every angle,
  because the algebra looks reasonable either way round. The tests now build a
  real `PerspectiveCamera`, place it exactly as the rig does, read its own
  right vector out of its world matrix, and check the movement against that.
  **Do not re-derive this by hand** - a sign error here is invisible in review
  and obvious the moment anyone plays.
- **Out of your depth, you swim.** The test is the *ground*: if the bed sits
  `PLAYER.swimDepth` or more below `seaLevel`, the body floats at
  `PLAYER.floatDepth` under the surface instead of walking. Because the test
  asks about the bed and not about where the body currently is, it cannot
  oscillate between the two at the boundary.
- **Wading is not swimming.** Shallow water is walked through normally; only
  water deep enough to lift you off the bottom changes anything.
- **You cannot jump while swimming**, and running is ignored in the water —
  `swimSpeed` is slower than a walk.
- **You only lie flat to go somewhere.** `lean` runs 0 (upright) to 1 (flat)
  at `PLAYER.leanRate` per second, and it targets 1 only while swimming *and*
  holding a direction. Float still and the body stands up — that is treading
  water, and it is what makes stopping in deep water look deliberate rather
  than like a body face down in the sea.
- **Swimming turns the body to face where it is going.** On land the body
  faces the camera and A and D are side-steps; in the water it turns to the
  direction of travel, because something lying flat goes head first and
  strafing face-up would look like being dragged sideways. Either way it only
  turns while there is movement input.
- **The swell never decides anything.** `surfaceAt` changes how the body sits
  while floating and nothing else. Whether you swim comes from the bed and
  `seaLevel`, so a heaving surface cannot make wading flicker into swimming.
- **`dt` is clamped**, so a tab left in the background does not come back and
  teleport the player across the island.
- Jump is edge-detected by the component, so holding space does not hover.
- `y` is the **feet**, not the middle. Add `PLAYER.height / 2` for the centre of
  the capsule, or `PLAYER.eyeHeight` for the head.

## Deliberate non-goals

- **No collision with anything but the ground.** There is nothing else in the
  world yet; when there is, that is a physics module's job.
- **No swimming animation** — the body tips flat and translates. There are no
  strokes, no wake, and nothing at the waterline.
- **No diving and no treading water.** Swimming is horizontal only: you are held
  at the surface and cannot go under or climb out onto anything but the beach.
- **No drowning, stamina, or any other state that could kill you.**
- No animation. The body is a capsule with a snout so you can see which way it
  faces.
- No first person, and no aiming beyond turning the camera.
- No physics engine — gravity and a ground snap, nothing more.

## How to use it from a new module

The camera is shared, so this module claims it while it is mounted:

```ts
setCameraMode('player')   // on mount
setCameraMode('orbit')    // on unmount
```

If your module also wants the camera, do not fight over it — turn the player
off in the scene registry, or take the claim and hand it back the same way.

To move something else with the same rules, use the controller directly:

```ts
const state = createPlayer(0, 0, heightAt)
stepPlayer(state, { ...IDLE_INPUT, forward: true, cameraYaw }, delta, heightAt, {
  bounds: worldBounds(),
  seaLevel: SEA_LEVEL,
  surfaceAt: (x, z) => SEA_LEVEL + swellAt(x, z, elapsed),
})
```

Every option may be left out. Without `bounds` the body walks off the meshed
world; without `seaLevel` it never swims and simply walks the sea bed; without
`surfaceAt` it floats at a flat sea level instead of riding the swell.

## Why the water module does not own swimming

`seaLevel` comes from `01-terrain`, not from `04-water`, and the decision is
made here rather than there.

Whether you are in water is a fact about *the ground* — how far the bed sits
below a fixed level. `04-water` draws a surface at that level; it does not
define it. If swimming asked the water module instead, toggling the sea off in
the debug panel would drop the player to the sea bed, and `SEA_LEVEL` would
have become two facts that can disagree.

So: **the player swims with the water module switched off.** That is the check
that the seam is the right way round, and it is in both modules' review lists.

## Known limitations

- Swimming holds the body a fixed distance under whatever surface it is given,
  so it rides the swell but does not lean into it — the body stays level while
  the water tilts underneath.
- The transition is a tip and a float, with no push-off entering the water and
  no clamber leaving it.
- Turning to face the swim direction and turning to face the camera share one
  `turnRate`, so leaving the water swings the body round at the same speed it
  turns in it.
- The camera is aimed by the mouse and the body walks where it points, so you
  cannot look behind you while walking forward - a proper strafing camera is a
  separate job.
- Panning slides the view but the player keeps walking relative to the camera
  angle, not the panned focus. Walking while panned far away is disorienting;
  that is what refocus is for.
- No slope limit: the island is gentle enough that nothing is unclimbable, but
  a steeper world would want one.
- The controller uses a fixed capsule and no ground friction, so stopping is
  instant. Fine for inspection, worth revisiting for game feel.

## How to review

- **Click once, left and right, without dragging. The camera must not move at
  all.** This is the whole reason there is no pointer lock.
- **Hold shift to run.** Nearly twice walking pace, and it must not punch
  through the ground on a slope or make diagonals faster.
- **Hold A, then D.** You should side-step left and right without the body
  pivoting to face the step, at any camera angle.
- **Hold left and drag** to look, left and right and a little up and down.
- **Hold right and drag** to slide the view off the player; the world should
  follow the cursor. **Wheel** to pull back far enough to see the whole island.
  **F or the button** snaps back to the player.
- **Look around while walking.** Walking forward must keep going away from the
  camera as it turns - steering, not stuttering or reversing.
- **WASD walks relative to the camera**, and the body faces the camera rather
  than the way it is walking. Walking while turning should feel like steering,
  not like the world spinning.
- **Space jumps**, once, from the ground. Holding it does not hover or repeat.
- **The feet stay on the sand** over every slope, and across chunk and
  level-of-detail borders. This is the same check as the terrain probe, but
  under a body that is actually moving.
- **Walk into the sea, slowly.** You should wade through the shallows upright,
  then tip forward and start swimming once it is over your depth — a lie-down,
  not a snap.
- **Walk back out.** You should stand up again as you reach the shallows, at
  about the same depth you started swimming, and not pop upright early or drag
  on your face up the beach.
- **Stand exactly at the depth where it changes and walk along the shore.** It
  must settle on one or the other, not flicker between standing and swimming.
- **Swim out over deep water.** You should stay at the surface, about half a
  metre down, however deep the sea bed goes — not sink, not ride on top — and
  rise and fall with the swell rather than holding one level.
- **Swim in a direction, then let go of the keys.** The body should stand
  upright and tread water where it is, not stay face down. Press again and it
  should tip back over.
- **Swim while turning the camera.** The body should follow where it is
  *going*, not where the camera points — the opposite of how it behaves on
  land. Check A and D too: swimming right should point the body right.
- **Turn the camera while treading water.** The body must not spin.
- **Press space while swimming.** Nothing should happen.
- **Hold shift while swimming.** No sprint; swimming is slower than walking.
- **Turn the water module off in the panel and walk into the sea.** You must
  still swim.
- Walking to the edge of the world stops you rather than dropping you off it.
- The camera does not clip into the ground when you walk downhill.
- Try it at **night** as well as daylight — the body should still read against
  the sand.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
