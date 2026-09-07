# 00-core

## What this is

The canvas, the render loop, the lights, and the handful of decisions every
other module is built against. It draws no content of its own. It exists first
because all of this is singular — there is one camera, one tone mapping, one
frame ordering — and none of it could be corrected later without unfreezing
whichever module got it wrong.

## Public contract

Import from `../00-core`. Never reach into `internal/`.

| Export | Meaning |
| --- | --- |
| `CONVENTIONS` | `units: 'meters'`, `upAxis: '+Y'`, `seaLevelY: 0`, `worldSeed: 1337`, `frameBudgetMs: 16.6` |
| `PRIORITY` | Frame bands: `input 0`, `simulation 10`, `world 20`, `camera 30`, `post 40` |
| `useGameFrame(cb, priority)` | Per-frame work in a named band. `cb(state, deltaSeconds)` |
| `createRng(seed) => () => number` | Deterministic stream, values in `[0, 1)` |
| `hashSeed(seed, label) => number` | Stable sub-seed, so two features do not shift each other |
| `assetUrl(id) => string` | Resolves an asset path. Never hardcode one |
| `readPerf() => PerfSample` | `fps`, `frameMs`, `drawCalls`, `triangles`, `geometries`, `textures` |
| `GameCanvas` | The canvas. Modules render as its children |
| `PerfHUD` | DOM overlay showing the above. Mounted outside the canvas |
| `SceneEntry` | `{ id, order, enabled, Component }` — the registry row type |
| `getDayTime()` / `setDayTime(t)` | Where in the cycle we are, `0..1` |
| `sectionAt(t)` | `{ from, to, blend }` - the two times being mixed. Pure |
| `advanceCycle(dt)` | Moves the clock. Called by the renderer |
| `setCycleRunning(b)` / `setTimeScale(n)` | Pause, and how many times real speed |
| `setTimeOfDay(name)` / `getTimeOfDay()` | Jump to, and name, a section |
| `CYCLE_SECONDS`, `SECTION_SECONDS` | 3600 and 900 |
| `LIGHTING`, `TIMES_OF_DAY`, `TIME_LABELS` | The presets and their order |
| `setCameraMode(m)` / `useCameraMode()` | Who drives the camera: `'orbit'` or `'player'` |

**Units are metres. +Y is up. Right-handed. -Z is north. Sea level is exactly
`y = 0`.** Terrain is expected to go negative below it.

## Invariants you may rely on

- `createRng` is deterministic: same seed, same sequence, forever. No module
  may call `Math.random` — a world that cannot be reproduced cannot be tested,
  and two players would not see the same island.
- `PRIORITY` bands run in ascending order. Anything in `world` has finished
  before `camera` runs, which finishes before the frame is drawn.
- The canvas background and fog are set here, so a module rendering nothing
  still gets a sky rather than a black void.

## The one thing that will surprise you

**This module owns the render call.** In react-three-fiber, any `useFrame` with
a priority above `0` switches the loop to manual and react-three-fiber stops
rendering for you. Because every module here uses a named `PRIORITY` band, that
is permanently the case, so `GameCanvas` renders explicitly at `PRIORITY.post`
and samples the frame counters immediately afterwards.

What this means for you: **use `useGameFrame` with a band and ignore all of the
above.** Do not call `gl.render` yourself, and do not use `useFrame` directly
with priority `0` — mixing the two modes is how the screen goes black.

## Times of day, and why they live here

There is one sun and one sky, so a content module installing its own lights
would fight whatever else did the same. Instead this module owns them and
exposes `setTimeOfDay`. Changes are **blended over about half a second** rather
than switched, so dragging the slider looks like the sun moving.

A later sky module should drive this rather than adding lights of its own —
that is the seam that keeps the sun singular.

## Camera arbitration

Same reasoning: one camera. The built-in debug orbit stands down when a module
calls `setCameraMode('player')`, and resumes when it is set back to `'orbit'`.
A module that takes the camera must hand it back on unmount.

## Deliberate non-goals

- No scene content of any kind. No terrain, sky, water, props.
- No physics, no collision.
- No asset *loading* — only URL resolution through `assetUrl`.
- No gameplay. No input handling beyond the debug orbit camera.
- No sky dome, sun disc, stars or clouds — only the light, fog and background
  colour. A sky module adds the geometry and drives the time of day.
- No post-processing stack.

## How to use it from a new module

```tsx
import { PRIORITY, useGameFrame, createRng, CONVENTIONS } from '../00-core'

export function MyThing() {
  const rng = createRng(CONVENTIONS.worldSeed)
  useGameFrame((_state, delta) => {
    // per-frame work, ordered against every other module
  }, PRIORITY.world)
  return <mesh>{/* ... */}</mesh>
}
```

Then append one line to `src/app/scene.ts`:

```ts
SCENE.push({ id: '0N-mything', order: N * 10, enabled: true, Component: MyThing })
```

## Extension guidance

- Need a new frame band? You almost certainly do not. Use the nearest existing
  one; the bands are coarse on purpose.
- Need post-processing, a different camera rig, or shadows tuned differently?
  That is a new module that composes with this one, or a reason to ask the
  human to unfreeze this. Do not shadow these settings locally.
- Need an asset? Route it through `assetUrl` so assets can move to a CDN later
  without touching a frozen module.

## Known limitations

- The debug orbit camera is a placeholder for inspection, not a game camera. A
  real camera rig is its own later module.
- Shadow map is a single 2048 cascade tuned for a roughly 500 m scene. Larger
  worlds will want cascaded shadow maps, which is a new module.
- `PerfHUD` samples four times a second, so a single bad frame will not show up
  as a spike — it is for steady-state reading, not profiling.

## How to review

- The page loads, shows sky-blue rather than black, and does not error.
- Drag to orbit, scroll to zoom, right-drag to pan. The camera never goes
  underneath the world.
- The perf HUD reads plausibly: fps near your refresh rate, frame time in
  single-digit milliseconds, draw calls very low (there is nothing to draw).
- Resize the window; the canvas follows without stretching.
- Reload with React StrictMode on — no duplicated controls, no leaked context,
  no console errors.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
