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
| `PlayerProps` | `{ spawnX?, spawnZ?, surfaceAt?, groundAt?, bounds?, collide? }` |
| `toggleViewMode()` / `setViewMode(m)` / `useViewMode()` | First or third person |
| `placeCamera(mode, rig, player, eyeHeight, groundAt?)` | Where the camera goes. Pure |
| `lookDirection(yaw, pitch)` | The way it looks. Pure, shared by both views |
| `clampPitch(mode, pitch)` | Keeps the pitch inside what a view can cope with |
| `VIEW`, `VIEW_MODES`, `RigState`, `Placement`, `ViewMode` | The shapes above |
| `AVATAR` | The body's look: colours, where the face sits, how far it tips |
| `createAvatar()` | One body, feet on `y = 0`, facing +Z, over shared geometry |
| `facePoints()` | Where each piece of the face sits on the body. Pure |
| `bodyPose(lean, height, radius)` | How high the middle rides and how far it tips. Pure |
| `stepPlayer(state, input, dt, groundAt, opts?)` | One step of movement. Pure |
| `createPlayer(x, z, groundAt)` | A player standing on the ground at that spot |
| `StepOptions` | `{ bounds?, seaLevel?, surfaceAt?, collide? }`. All optional |
| `PlayerState` | `{ x, y, z, vy, facing, grounded, speed, swimming, lean }`. `y` is at the feet |
| `PlayerInput` | `{ forward, back, left, right, jump, run, cameraYaw }` |
| `PLAYER` | Speeds (walk, run, swim), gravity, capsule size, eye height, depths |
| `getPlayerState()` | The live player, or `null` when the module is off |
| `refocusCamera()` | Snap the view back onto the player and reset the zoom |
| `isCameraOffPlayer()` | Whether the view has been slid away |
| `CAM_DISTANCE_MIN` / `MAX` | The zoom limits, in metres |

`groundAt` is passed in rather than imported, so a test can hand it flat ground
or a slope. The component passes `heightAt` from `01-terrain`.

`collide` is passed in for the same reason, and it is the sharpest example:
this module has never heard of a rock, and rocks have never heard of a player.
It is handed where the body is trying to be and returns where it may actually
be, so an obstacle can slide the body round itself rather than stopping it
dead. It gets the **feet**, not the middle, because how high something is
compared with your feet is the whole question — below them it is floor, just
above them a step, well above them a wall.

It runs after the bounds clamp and **before the ground is sampled**, or the
ground under the body would be the top of the thing it is standing inside.

`seaLevel` and `surfaceAt` are passed in the same way, and for a stronger
reason — see **Why the water module does not own swimming** below.

## Invariants you may rely on

- **The player never ends a frame below the ground**, on any terrain, tested
  over hundreds of frames of rough ground.
- **Diagonals are not faster than cardinals.** Input is normalised before the
  basis is applied.
- **The body faces the way it is going**, on land and in the water alike.
  Movement itself stays camera-relative — forward is still away from the camera
  and D is still screen-right — but the body turns to follow it, so A turns and
  walks left rather than side-stepping left while still facing forward, and
  backing up turns around instead of moon-walking.

  This replaced a strafe model, where the body faced the camera. That suited a
  featureless capsule and does not suit one with a face: anything with a front
  has to point where it is going, or it walks sideways and reverses with its
  face to you.

  The turn is **cosmetic** — it must never feed back into the movement basis,
  or holding forward would send the body spiralling. There is a test for that.
  The body only turns while there is movement input, so looking around while
  stood still does not spin it on the spot.
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
- **Swimming and walking agree about which way the body points**, so wading
  ashore does not swing the body round for no visible reason.
- **The swell never decides anything.** `surfaceAt` changes how the body sits
  while floating and nothing else. Whether you swim comes from the bed and
  `seaLevel`, so a heaving surface cannot make wading flicker into swimming.
- **The feet stay down walking downhill.** Going downhill the ground falls
  away faster than gravity pulls you into it, so without help the body spends
  the whole descent a few centimetres airborne. `PLAYER.groundSnap` is how far
  it will reach down to stay on the ground. It applies only when the feet were
  already down, so it can never cut a jump short, and it is short enough that
  walking off a ledge is still a fall.
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
- **No animation.** The body is one rigid piece: no walk cycle, no limbs, no
  blink. The face is baked into its geometry, so anything that moves it means
  a different way of building the body, not more code here.
- **No first-person body.** The whole body is hidden in first person rather
  than a separate pair of hands being drawn — see the limitation below.
- No first person, and no aiming beyond turning the camera.
- **No model, and no loader.** The body is primitives. That is the point: there
  is no download to fail, no axis convention to get wrong, and no asset to fix.
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

## The body

A capsule the colour of a red pill, `PLAYER.height` tall and `PLAYER.radius`
across, with a face on the front. It is built out of primitives in
`internal/avatar.ts` — there is no model and no loader.

That is a deliberate step back from a glTF duck that used to stand here. A
model is a whole category of silent failure: upside down, backwards, a hundred
times too big, feet that ship detached, a download that never arrives. All of
it still renders something, so only looking catches it. None of that can happen
to a capsule and four numbers.

**The face is what says which way is forward.** A featureless pill cannot show
its heading, and the heading is the one thing you must be able to read — a body
that walks sideways looks like a controls bug. So it gets two eyes and a smile,
on +Z, which is where a heading of zero looks.

**The face sits on the body, not in front of it.** Every piece is placed
against the curve of the capsule at its own sideways offset and then pushed in
by half its own radius, so each one reads as a dome on the surface whatever
size it is — an eye and a dot of the smile stand equally proud without either
being given its own number. All of the face is kept on the straight part of the
capsule, between the two rounded ends, which is what makes that placement exact
arithmetic rather than a guess. There is a test for each of those.

**The smile is drawn as overlapping dots** on the bottom of a circle, rather
than as a ring or a flat decal. A flat shape in front of a round body either
cuts into it or hangs off it at the ends; dots follow the curve. A test checks
that consecutive dots overlap, so it reads as one line and not as a dotted one.

**A whole body is two draw calls**, and every body in the world shares one set
of geometry and materials. The face is merged into a single geometry when the
first body is built, so eyes and smile cost one call between them however many
pieces they are made of. `createAvatar` hands out a fresh `Group` over that
shared geometry — a local player and a remote one must never share a transform.

The face is left out of the shadow pass on purpose. It is a few centimetres of
detail pressed against a body that is already casting, and nothing it could add
would be visible.

## How far it tips when it swims

`lean` in the controller means *lie flat*, and `AVATAR.swimTip` is the fraction
of that quarter turn the body actually takes. It is `1`: a pill swims the way
it always did, flat out with its long axis along the way it is going.

The cost of that is that the face points at the sea bed while you swim. Turn
`swimTip` down — 0.2 or so — to float upright and lean into the stroke instead,
keeping the face out of the water. The controller is untouched either way, and
`bodyPose` is what both the local body and every remote one are placed with, so
they cannot end up floating at different heights.

## First and third person

**V**, or the buttons in the panel's VIEW section. Third person to start.

Both views are built from **one** `lookDirection`, which is the point of
`camera.ts` being a pure module: if the two disagreed about which way `yaw`
pointed, swapping would feel exactly like the controls inverting, and that is
a thing that has already happened once in this module. A test builds a real
`PerspectiveCamera` for each view at seven yaws and four pitches and checks
they point the same way to within half a degree.

Writing that test found a real inconsistency straight away. Third person used
to *place* the camera relative to a focus 2.6 m up and *aim* it at eye height
— two different points, so the actual view ran five degrees below the rig at
normal zoom and thirteen at close zoom. Swapping to first person jumped the
horizon. It now orbits and aims at the same point, the eyes, so the two views
are exactly parallel.

What changes between them:

- **First person** puts the camera at the eyes and ignores panning and zoom —
  there is nothing to zoom out from and sliding your own head sideways is not
  a thing. It can look nearly straight up, because there is a sky.
- **Third person** keeps the ground clearance and the tighter pitch limit; it
  cannot look far up without burying the camera behind the player.
- The pitch is re-clamped on the way in, so looking at the sky in first person
  and swapping does not leave the camera underground.

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
- `groundSnap` is a fixed distance rather than one scaled to how fast you are
  going, so a much faster body would start skipping off slopes again.
- **You cast no shadow in first person.** The body is hidden, and three skips
  invisible objects in the shadow pass too. Keeping the shadow means putting
  the body on its own layer and enabling that layer on the light, which is a
  reach into `00-core` for a detail you only notice if you look for it.
- Other players still see your body normally; the view is yours alone.
- **The face points down while you swim**, because the body lies flat. See
  `AVATAR.swimTip` above for the knob that changes it.
- **The face is flat colour and does not move.** No blink, no expression, and
  nothing that reacts to what you are doing.
- The controller uses a fixed capsule and no ground friction, so stopping is
  instant. Fine for inspection, worth revisiting for game feel.

## How to review

- **Click once, left and right, without dragging. The camera must not move at
  all.** This is the whole reason there is no pointer lock.
- **Hold shift to run.** Nearly twice walking pace, and it must not punch
  through the ground on a slope or make diagonals faster.
- **Hold A, then D.** You should move left and right relative to the camera,
  with the body turning to face the way it is going, at any camera angle.
- **Hold left and drag** to look, left and right and a little up and down.
- **Hold right and drag** to slide the view off the player; the world should
  follow the cursor. **Wheel** to pull back far enough to see the whole island.
  **F or the button** snaps back to the player.
- **Look around while walking.** Walking forward must keep going away from the
  camera as it turns - steering, not stuttering or reversing.
- **Press V, or the buttons in the panel.** The horizon must not jump and the
  controls must not invert: walking forward before and after the swap should
  go the same way.
- **In first person, look up at the sky and down at your feet.** Both should
  be reachable. Then swap to third person - the camera must not end up in the
  ground.
- **In first person, try to pan and zoom.** Neither should do anything.
- **Swap while swimming, and while jumping.** Nothing should lurch.
- **WASD walks relative to the camera**, and the body turns to face where it
  is going. Walking while turning should feel like steering, not like the world
  spinning — and holding forward must go in a straight line, not a spiral.
- **Hold S.** The body should turn around and walk towards the camera, not
  reverse with its face still pointing away.
- **Space jumps**, once, from the ground. Holding it does not hover or repeat.
- **The feet stay on the sand** over every slope, and across chunk and
  level-of-detail borders. This is the same check as the terrain probe, but
  under a body that is actually moving.
- **Run down the steepest dune you can find, and look behind you.** The feet
  must stay on the sand the whole way and the prints must keep coming. Bouncing
  down a slope a few centimetres in the air looks almost right and leaves no
  prints at all, which is how this was found.
- **Jump while running downhill.** It should still be a proper jump.
- **Walk into the sea, slowly.** You should wade through the shallows upright,
  then tip forward and start swimming once it is over your depth — a lie-down,
  not a snap.
- **Do that again at high tide and at low tide.** Where you start swimming
  should move up and down the beach with the water, because it is decided from
  the tide-adjusted level rather than from a fixed one.
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
- **Look at the body itself.** Standing on the sand rather than sunk into it or
  hovering, and about as tall as you would expect a character to be against the
  dunes.
- **Look at the face.** Two eyes and a smile, sitting *on* the front of the
  body — not floating in front of it, not half swallowed by it, and not sliding
  off the curve at the ends of the smile. Orbit right round: it should go
  behind the body from the back rather than showing through it.
- **Walk in a circle and watch the face.** It should lead, at every angle.
- **Swim.** The body should lie flat, long axis along the way it is going, and
  stand back up when you stop.
- **Check the draw calls in the perf HUD** with the player on and off. A body
  should cost two.
- Try it at **night** as well as daylight — the body should still read against
  the sand.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
