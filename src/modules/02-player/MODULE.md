# 02-player

## What this is

A body you walk around the island with, in third person: WASD to move, **shift
to run**, space to jump, and the mouse for the camera.

**Hold left and drag to look. Hold right and drag to slide the view off the
player. Wheel to pull back. F, or the button in the panel, snaps back.** In the
lobby, click the canvas once for free look and press Escape to release it. The
Player settings tab has a saved 20%–300% sensitivity control that applies to
every mouse-look path. It resolves height through `01-terrain`, so it stands on
exactly the ground being drawn.

Walk into the sea and it **swims**: the duck sits upright on the surface with
its feet tucked underneath, turning toward its movement. It remains seated
when floating still and stands again on returning to shallow ground. Hold
either **Control** key on land to sit; release it to stand. Sitting pauses
walking and jumping while camera and head-look controls remain available.

All of the movement is pure arithmetic in `internal/controller.ts` with no
three.js in it, so how the player moves is tested in Node rather than by eye.

## Public contract

| Export | Meaning |
| --- | --- |
| `Player` | The R3F component. Registered in `src/app/scene.ts` |
| `PlayerProps` | `{ spawnX?, spawnZ?, surfaceAt?, groundAt?, bounds?, collide?, inputBlocked?, freeLook? }` |
| `toggleViewMode()` / `setViewMode(m)` / `useViewMode()` | First or third person |
| `placeCamera(mode, rig, player, eyeHeight, groundAt?)` | Where the camera goes. Pure |
| `lookDirection(yaw, pitch)` | The way it looks. Pure, shared by both views |
| `clampPitch(mode, pitch)` | Keeps the pitch inside what a view can cope with |
| `VIEW`, `VIEW_MODES`, `RigState`, `Placement`, `ViewMode` | The shapes above |
| `AVATAR` | The body's look: colours, where the face sits, how far it tips |
| `createAvatar(colour?, options?)` | One duck, feet on `y = 0`, facing +Z, over shared geometry. Movement animation is automatic by default |
| `facePoints()` | Where each piece of the face sits on the body. Pure |
| `armPoints()` | Where each arm hangs and how far it swings out. Pure |
| `bodyPose(lean, height, radius, fall?)` | How high the middle rides and how far it tips, swimming or knocked over. Pure |
| `stunPlayer(seconds)` / `isStunned()` | Put the body on its back, and ask whether it is |
| `stunFall(remaining, total)` / `STUN` | How far over a stunned body is, and the timings. Pure |
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
| `getCameraSensitivity()` / `setCameraSensitivity(n)` / `useCameraSensitivity()` | The saved camera-look multiplier, from 20% through 300% |
| `FACE_EMOTES` / `setFaceEmote(emote)` / `useFaceEmote()` | The current face expression, used by the lobby emote wheel |

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

`inputBlocked` is passed in for the same reason again: whether a minigame or a
board has the keyboard is not this module's business. While it says yes, keys
going down are ignored and not swallowed, the body stands still, and keys held
when it started are let go - so the duck does not walk and jump on the island,
footsteps and all, behind a minigame using the same WASD and Space. Keys coming
up are always heard, so nothing is left held down when the screen closes.

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
- **Swimming stays upright.** The legacy `lean` movement blend still targets
  one while swimming with directional input, but the duck's swim tip is zero.
  The local seated pose remains active while moving or floating still.
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
- **No swimming strokes or wake.** The duck uses a seated floating posture.
- **No diving.** Swimming is horizontal only: you are held
  at the surface and cannot go under or climb out onto anything but the beach.
- **No drowning, stamina, or any other state that could kill you.**
- **No skeletal animation.** Three rigid meshes provide the body, movable head
  and expression. Walking and wing flapping are not rigged.
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

The shared character is a procedural 3D duck. It has a broad bill with a lower
jaw and nostrils, eyes with highlights, a pale breast, folded wings with feather
tips, a raised tail fan and three-toed webbed feet. Player colours tint the
feathers while feet and bill stay orange. There are no downloads or model assets.

`createAvatar(colour?, options?)` returns an independent `Group`, facing +Z with
feet at y=0 and a neutral height of 1.8 metres. The controller, collision radius,
movement, camera height and network packet shape keep their existing contracts.
The longer bill and tail are cosmetic and do not enlarge gameplay hitboxes.

Each duck is three draw calls: body, movable head, and expression. Body/head
geometry is cached per colour, with vertex colours for the bill, feet, breast
and feathers. Expressions share geometry and material across all colours.
The neutral duck is 1,400 triangles; every expression is below 3,000 triangles.
No caller should dispose these cached geometries or materials.

`setAvatarHeadLook` rotates the whole head, including the bill and expression;
yaw and pitch are limited to 1.35 radians so the duck cannot turn its head
backwards. All seven lobby emotes have duck-specific eyes, brows and bill poses.
`facePoints` and `armPoints` remain available as compatibility placement guides;
they no longer build the rendered character.

The home-page player, remote lobby players and existing `createAvatar` minigames
inherit this design through the public contract. The separate 69?72 game scenes
also consume this builder, adapting scale and their -Z forward convention.
The podium interface uses matching duck illustrations, including raised wings
and a fallen pose. The app-wide request supersedes the earlier module-only
scope for those character consumers. Frozen modules were not edited.

## Being knocked over

`stunPlayer(seconds)` puts the body on its back and takes it out of its owner's
hands for a while. It is the one thing a minigame reaches for: Zombie Tag's
push stuns for a second, Helping Dad's wall for one and a half.

**A stunned body takes no instructions, and is still subject to everything that
is not one.** `stepPlayer` drops the movement and the jump while `stun` is
running, and changes nothing else — it still falls, still lands, still floats
if it went over in deep water. Being stunned is not being removed from the
world.

**It goes over backwards, not face first.** A swimmer goes face down because
that is how anybody swims; a body that has been knocked over goes on its back
so the face keeps pointing at the room, and being able to see whose face it is
is most of what makes a stun readable from across an arena. `bodyPose` takes
both and uses whichever is further over rather than adding them — a body cannot
be face down and on its back at once.

`stunFall` is the whole of the animation and it is pure arithmetic: given how
much of a stun is left and how long it was for, the body goes over, lies there,
and gets up. A stun too short to do all three goes over and comes straight back
without ever quite reaching the floor, which is why it never snaps upright from
halfway. It is eased at both ends, and it is temporary in exactly the way the
arms are.

A stun that arrives while one is already running takes whichever is longer, so
two zombies landing on the same player cannot cut each other's short.

## How far it tips when it swims

`lean` remains a movement blend in the controller for existing consumers, but
`AVATAR.swimTip` is zero: swimming never pitches the duck's head into the water.
The local resting blend tucks the feet and lowers the belly into a seated
pose. Stuns can still tip the body fully onto its back.

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
- Facial expressions and cursor-driven head look are supported; there is no
  automatic blink animation.
- The controller uses a fixed capsule and no ground friction, so stopping is
  instant. Fine for inspection, worth revisiting for game feel.

## How to review

1. Open `http://localhost:5199/`. Check the body is a duck, with a wide bill,
   folded feathered wings, a pale breast, raised tail and webbed feet. Orbit
   the camera and confirm the model points the way it walks.
2. Use WASD, Shift and Space to walk, run and jump. Feet should settle on the
   ground. The decorative bill and tail extend beyond the original collision
   capsule; check tight gaps and groups visually.
3. Join a lobby in a separate browser profile. Both players should be ducks
   in their own colours. Walk and look around; use the E emote wheel and check
   the other browser sees the chosen eyes/bill expression.
4. Walk into deep water. The duck should sit upright on the surface with its
   feet tucked underneath. Walk ashore, hold Control to sit, and release it to
   stand. A stun should still knock it onto its back, and first person hides it.
5. Open several minigames from the dashboard. Their existing avatar calls
   should show ducks. Check colours, owner markers and head/held-item placement.
6. Review the podium art for every placement: raised wings, happy/straight
   faces and fallen ducks, with existing names and replay/dashboard controls.
7. For the separate game previews, follow `review/README.md`. Screenshots and
   machine-readable browser results are retained there for comparison.

## Lobby walking animation

The locally controlled duck now alternates its webbed feet, lifts the swinging
foot and gently waddles from side to side while travelling on land. Running
increases the cadence, capped so the steps remain readable. The gait uses
resolved horizontal movement, so pushing against a wall or world boundary
does not keep the feet marching. It blends back to a standing pose when the
duck stops, jumps, swims or gets stunned. Camera placement and collision stay
driven by the controller rather than the cosmetic bob.

Four relative morph targets move the feet and short legs within the existing
body mesh. Geometry and materials remain cached and shared, while each duck
has independent morph influences. The avatar still costs three draw calls
and stays below the existing triangle limit. No rig, model or asset download
is needed. The local Player supplies exact controller state. Shared minigame
and remote avatars also animate from their game-owned transforms.

Validation includes alternating foot positions, toe clearance throughout the
cycle, shared-geometry isolation, frame-rate consistency, running cadence and
settling. For human review, walk and run in several directions, stop suddenly,
walk against a rock, jump, swim and use an emote while moving. Check the feet
from the front and side, and confirm the camera stays steady. Visual review
of this animation is pending; no new browser screenshots are claimed.

## Jump flaps and head tracking

A ground jump now starts a four-beat-per-second wing flap. Both wings extend
from their shoulders and alternate between spread and raised poses throughout
the jump, including descent. They blend closed after landing, entering water
or being stunned. Walking off an edge alone does not start a flap. Two extra
relative morph targets rotate the existing wing geometry and normals; walking
and wing animation have independent per-avatar weights and still use the same
three meshes and shared materials.

Local head yaw and pitch ease toward the camera target rather than snapping
to each mouse sample. Easing is independent of frame rate, retains the existing
1.35-radian limits, and partially counteracts the body's walking roll. The
public immediate head-placement helper remains available to existing callers;
the local Player uses the smoother internally.

Tests exercise actual wing extension, foot isolation, independent ducks,
jump/fall distinction, landing/swim/stun settling, frame-rate consistency and
head convergence without overshoot. Geometry silhouette checks measure visible
vertices because the conservative animation bounds now include extended wings.
Human review: jump while idle and running, inspect the upstroke and downstroke
from the front and side, land and jump again, walk off a ledge, and sweep the
mouse left/right while walking. Check that head motion feels smooth and
responsive. Visual review remains pending.

## Cursor-driven lobby gaze

Moving the unlocked cursor over the lobby canvas now turns the head without
requiring a click, drag or camera rotation. Canvas-relative pointer coordinates
drive a head target using the camera's actual screen-right axis, so the duck
looks toward the appropriate side from front and rear views. The existing
smooth head follower eases into that target. Leaving the canvas or losing
window focus releases the gaze toward a neutral pose.

Clicking still captures the mouse for camera control, and Escape releases it.
While captured, head look follows the camera. The cursor listener respects
blocked input and is removed when Player unmounts. `getPlayerLook` exposes the
smoothed world-space cursor gaze for the existing lobby network publisher.

The regression test sends real DOM mousemove events without a mouse-down,
feeds their targets into the actual duck head, and checks left/right and
up/down motion while the camera stays fixed. Tests also cover offset canvases,
front/rear views, blocked input, leaving, blur, capture and listener cleanup.
For visual review, release the mouse with Escape and move it over the lobby:
the head should follow while the camera stays still. Click to capture, look
around, release again, and check gaze with a second lobby player. Visual
review remains pending.

## Seated swimming and hold-Control sitting

The duck begins floating at 0.65 metres of water depth and follows the water
surface with its foot origin 0.18 metres below it. The local pose folds both
feet back under the feathers and lowers the belly by 0.16 metres, keeping the
head upright and above water. Movement and floating still use the same seated
pose; WASD swimming remains available even with Control held.

`PlayerInput.sit` and `PlayerState.sitting` are optional additions for older
callers. Holding either Control key while grounded stops walking and jumping;
releasing both stands up. Pressing Control in the air waits for landing rather
than suspending gravity. Swimming and stuns take precedence. The pose eases
in and out, using the existing foot morphs and three draw calls. Camera and
collision dimensions remain controlled by the original movement capsule.

The Control listener respects text fields and blocked input and clears on
blur, visibility changes and unmount. Tests cover both Control keys together,
release, text input, gravity, land contact, upright buoyancy and swimming while
Control is held. These sitting morphs are driven by the local Player; adding
a ground-sit flag to multiplayer avatar playback is a separate transport task.

Human review: hold Control on dry ground, try WASD and Space, release it, jump
and hold Control until landing, then swim out from the beach. Check the tucked
feet, seated belly, upright head, surface-following motion and return to a
standing pose on shore. Visual review remains pending.

## Public input leases

`claimPlayerInput(owner)` returns an idempotent release function.
`isPlayerInputLocked()` includes all outstanding leases and the composition
root's existing `inputBlocked` callbacks. Screens can stop movement and head
input without modifying the world composition root or stunning the duck.
Held movement, jump and sit keys are cleared by the existing blocked-frame
path. Each lease is independent, including repeated claims by the same owner;
releasing one screen never unlocks another.

The caller handles pointer-lock release and DOM focus and must release its
lease on close or unmount. The casino uses this contract for its game panel.
Tests cover stacked claims, repeated releases, external composition blocks,
unregistration and recursive lock queries. Visual review: open a casino table
while moving, close it, and confirm movement stops and resumes cleanly.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.

## App-wide duck review (October 2026)

`review/app-duck-check.mjs` opens the actual application home page, joins two
separate browser processes to a lobby, drives native WASD, checks that the guest
expression reaches the host, and opens registered Zombie Tag in both browsers.
It also renders a four-place podium art fixture through the public finish API;
that fixture is a visual review, not a claimed gameplay win. Screenshots and
read-only scene reports are kept in `review/`. Existing local servers are reused.

`09-net` interpolation now retains the nearer snapshot's emote; missing older
values fall back to smile. This fixes the remote-expression loss found during
the duck review. All frozen source files and public frozen contracts remain intact.

Human visual approval is pending. Review from `http://localhost:5199/`, walk and
jump, inspect the duck from front/back, use the E emote wheel with a second
browser, swim offshore, and enter minigames. Check the longer decorative bill
and tail around obstacles and dense groups. Palette colours and standings stay
recognizable across the 3D world and podium illustrations.

Machine validation: `npm run gate -- 02-player` and `npm run gate -- 09-net`
both exit 0. Their checks include typecheck, production build, all 2,841 tests,
boundaries, frozen files, frozen contracts and budgets. The 69–71 standalone
previews and Tug-of-war's eight-player art fixture render without console or
runtime errors. Source audit confirms all remaining `createAvatar` consumers
receive the shared duck. Character-specific capsule placeholders in the newer
game scenes and podium have been replaced; other animal species and vehicles
retain their gameplay identities. No human PASS or commit has been created.

## Shared minigame movement animation

`createAvatar()` now automatically animates walking, running and jump wing
flaps from its world movement. The existing shared-builder consumers in 40
minigame modules, plus remote lobby ducks, inherit this behavior. Parent-group
movement, rotated adapters, scaled ducks and bots are supported. Games keep
their existing movement and jump controls; this adds the corresponding poses.

An inner `avatar-motion` group contains cosmetic bob, roll and seated offsets.
The game-owned root position, rotation and scale remain untouched, so collision,
facing and jump trajectories keep their existing behavior. Mesh render hooks
advance each duck once per renderer frame across shadow and colour passes.
The three meshes, cached geometry and materials still have the same draw cost.

The motion observer distinguishes rising jumps from shallow ramps and tiny
bobs, settles on landing (including higher platforms), suppresses gait while
fallen, and resets after teleports or long rendering gaps. Stationary ducks
settle without their own cosmetic movement feeding back into the observer.

Controllers with exact state can use `createAvatar(colour,
{ automaticAnimation: false })` and call the public
`updateAvatarAnimation(duck, delta, motion?)`. `AvatarMotion` optionally supplies
`speed` in world metres per second, `grounded`, `jumped`, `swimming`, `stunned`,
`sitting` and `paused`. Call once per simulation frame; `jumped` is a takeoff
edge. The lobby's local player opts out because its existing controller already
drives exact gait, swimming, sitting and flap state. Vehicle poses and other
custom actors retain their game-specific animations.

Machine coverage includes walk/run cadence, independent ducks, parent movement,
scale, protected gameplay transforms, 15/30/60/120 Hz gait, jump and landing,
ramps, teleports, idle settling, explicit state, pause, automatic opt-out and
shadow/colour callback deduplication. Human visual approval remains pending.

With Vite running, open
`/src/modules/02-player/review/minigame-animation.html` to compare walking,
running, a running jump and idle ducks using the actual automatic render hooks.
Then check existing minigame movement and jumps in the application, including
bots and remote ducks. Confirm feet settle, wings flap during jumps, and game
controls and trajectories feel unchanged. No browser was connected for this
session, so this preview has not been visually verified.

Validation for this change: `npm run gate -- 02-player` exits 0 with 2,931
tests across 284 files, typecheck, production build, boundaries, frozen files,
frozen contracts and bundle budget checks. The standalone animation preview
also builds with Vite. Module status is `ready_for_review`; human PASS is pending.
