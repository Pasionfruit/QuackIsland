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

All of the movement is pure arithmetic in `internal/controller.ts` with no
three.js in it, so how the player moves is tested in Node rather than by eye.

## Public contract

| Export | Meaning |
| --- | --- |
| `Player` | The R3F component. Registered in `src/app/scene.ts` |
| `stepPlayer(state, input, dt, groundAt, bounds?)` | One step of movement. Pure |
| `createPlayer(x, z, groundAt)` | A player standing on the ground at that spot |
| `PlayerState` | `{ x, y, z, vy, facing, grounded, speed }`. `y` is at the feet |
| `PlayerInput` | `{ forward, back, left, right, jump, cameraYaw }` |
| `PLAYER` | Speeds (walk and run), gravity, capsule size, eye height |
| `getPlayerState()` | The live player, or `null` when the module is off |
| `refocusCamera()` | Snap the view back onto the player and reset the zoom |
| `isCameraOffPlayer()` | Whether the view has been slid away |
| `CAM_DISTANCE_MIN` / `MAX` | The zoom limits, in metres |

`groundAt` is passed in rather than imported, so a test can hand it flat ground
or a slope. The component passes `heightAt` from `01-terrain`.

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
- **Forward is always away from the camera, at every angle.** `cameraYaw` is
  the direction the camera looks, and forward is `(sin(yaw), cos(yaw))`. The
  basis is built from that directly rather than by rotating a vector - an
  earlier version rotated, with a sign wrong on Z, which was correct at one
  camera angle and inverted at another. It felt like the controls breaking
  whenever you looked around while walking. There is a test that walks at
  seven different angles.
- **`dt` is clamped**, so a tab left in the background does not come back and
  teleport the player across the island.
- Jump is edge-detected by the component, so holding space does not hover.
- `y` is the **feet**, not the middle. Add `PLAYER.height / 2` for the centre of
  the capsule, or `PLAYER.eyeHeight` for the head.

## Deliberate non-goals

- **No collision with anything but the ground.** There is nothing else in the
  world yet; when there is, that is a physics module's job.
- No swimming. Below sea level you simply walk along the seabed, because water
  does not exist yet.
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
stepPlayer(state, { ...IDLE_INPUT, forward: true, cameraYaw }, delta, heightAt)
```

## Known limitations

- Walking off the island keeps going down the seabed rather than swimming.
  That is expected until water exists.
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
- **WASD walks relative to the camera** and the body turns to face where it is
  going, smoothly rather than snapping. Walking while turning should feel like
  steering, not like the world spinning.
- **Space jumps**, once, from the ground. Holding it does not hover or repeat.
- **The feet stay on the sand** over every slope, and across chunk and
  level-of-detail borders. This is the same check as the terrain probe, but
  under a body that is actually moving.
- Walking into the sea keeps you on the seabed rather than falling through.
- Walking to the edge of the world stops you rather than dropping you off it.
- The camera does not clip into the ground when you walk downhill.
- Try it at **night** as well as daylight — the body should still read against
  the sand.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
