# 71-me-in-team

The app-wide character update uses `02-player.createAvatar` for every player,
fitted to the existing scene's height and -Z forward convention. Chains, player
colours, movement and ownership rings retain their behavior. `02-player` is
declared in the proposed local dependency entry.

ME in Team is a procedural, third-person, one-vs-all blocking game. Code,
preview, tests and review evidence are scoped to this directory. Dependencies
(public contracts): `00-core`, `09-net`, `15-minigames`, `68-minigame-kit`.

Concrete objective: the solo player must collect three ordered checkpoint flags
and reach the exit within 60 seconds. The chained team wins by blocking until
time runs out. All movement uses WASD relative to the mouse-controlled camera.

Blocks:
- [x] 71.1 Seeded course, kit setup, ordered objective, chained physics and blocking.
- [x] 71.2 Kit arena loop, validated intent messages and authoritative chain snapshots.
- [x] 71.3 Procedural scene, chain links, camera, controls and HUD.
- [x] 71.4 Standalone preview, tests, browser review and handoff.
- [ ] 71.5 Pipeline/catalogue registration and human gate (outside authorized scope).

Per the user's earlier instruction, catalogue, pipeline and composition files
remain unchanged. A standalone preview and registration metadata live here.

## Play

With the repo's Vite server running, open:

<http://localhost:5199/src/modules/71-me-in-team/preview.html>

From the repository root, if needed:

```powershell
npx vite D:/Projects/LocalRot --port 5199 --strictPort
# For multiplayer, in another terminal:
npm run relay
```

Click Play, then click the course to capture the mouse. WASD moves relative to
the camera; the mouse orbits it; Escape releases the mouse. Lost focus and
pause clear held movement. The camera avoids course pillars.

The solo must collect flags **1 → 2 → 3**, then enter the exit gate, before
60 seconds. The team wins at the deadline, including a finish-line tie.
Flags are collected by entering their marked circles. There are no attacks,
jumps or elimination: the team stops the solo by physically blocking routes.

Alone, the human is the solo and four stand-ins form a coordinated opposing
chain. For human multiplayer, create a lobby and join its code from separate
browsers. The host chooses the solo. Three or more people give the opposing
team at least two people to chain together. With two people, the team has one
blocker; the shared kit deliberately does not fill multiplayer seats with bots.

## Chain and movement model

- Each active teammate connects to the next in roster order. A link permits
  slack but cannot extend beyond 2.6 m. Opposing inputs transmit a pull rather
  than breaking the chain; coordinated inputs move it together.
- Body collisions, course boundaries and pillars constrain movement. The chain
  also collides with pillars and blocks the solo between its endpoints. The
  solo can go around either end, and body contact can move other players.
- The deterministic position solver uses small movement substeps and repeated
  distance/contact projections. Visual links sag when slack and change colour
  when taut. This is a lightweight character/chain constraint model, rather
  than a general rigid-body or knot simulator.
- A departing teammate is removed and the remaining chain re-forms. If the
  solo leaves, the team wins; if the entire team leaves, the solo wins.
- Stand-ins steer as a line toward the path between the solo and the next flag,
  so they attempt to block together instead of choosing unrelated directions.

## Shared base and public surface

`oneVsAllSetup` supplies roster, identity, seeds, host selection and the waiting
round. `castOneVsAll` deals the solo; the tests assert `oneVsAllProblems` is empty.

`useArenaNet(TEAM_RULES)` supplies the host/guest loop, clocks, message filtering,
snapshots, pause and departures. The game reports input vectors alongside the
kit pose codec; the host ignores clients' claimed positions and simulates all
players and constraints. Guest prediction uses the same solver. Every player's
position, including the local player's, accepts authoritative snapshot corrections
so remote pulls affect the same chain everywhere. Stale input stops after 350 ms.

`GameCanvas` owns rendering; simulation, scene and camera use the core's named
priority bands. Camera mode is restored on unmount. Geometry, flags, characters,
chain links and HUD are procedural; there are no external model/raster assets.

`index.ts` exports `TeamPanel`, the standard `meInTeamBuild: MinigameBuild`, setup
helpers, pure rule functions and course queries/types. The build hands standings
to the common `useFinish`/podium seam when integrated. The standalone preview
owns its launch controls/results and returns to its lobby if its original host
leaves. Neither the build nor preview mutates or repurposes a catalogue entry.

Proposed dependency/budget and block metadata: [`module-entry.json`](module-entry.json).

## Checks recorded on 2026-10-21

- **23 module tests passed:** setup conformance, deterministic chain physics,
  opposing/coordinated pulls, solo blocking/outmaneuvering, pillar collision,
  ordered objectives, timeout, stale input, departures, wire validation,
  authoritative guest inputs, three-client sync, pause and final snapshots.
- **2,811 repository tests / 261 files passed.**
- Typecheck and the standalone production build passed. Its JavaScript is
  **327.80 kB gzip**, including React, Three and shared modules.
- Repository boundary, frozen-file and frozen-contract checks passed.
- **Nine browser checks passed**, including a guest's complete solo escape
  using real keyboard/mouse events, human chain blocking/pulling in three
  browsers, and a real 60-second timed team win. No console errors captured.
- Local render samples: **62–63 draw calls, 2,998–3,010 triangles, 60 fps**.
  At 800×600 the game viewport was 392 px high, with no horizontal overflow.
  Screenshots and captured state: [`review/README.md`](review/README.md).

Build the standalone preview with:

```powershell
npx vite build --config src/modules/71-me-in-team/vite.preview.config.ts
```

`preview-dist/` is local to this module and git-ignored.

`npm run gate -- 71-me-in-team` reports **Unknown module** because pipeline
registration remains outside the authorized scope. The module's status stays
`in_progress` in its proposed metadata; no machine gate or human PASS is claimed.

## How to review

1. Play solo against stand-ins. Collect the flags in order and find a route
   around the chain; touching the exit early must not win.
2. Use three separate browsers. Drive only one chained player: the idle one
   should get pulled once the link tightens. Try opposite inputs and then move
   together. Check that links stay connected around pillars and boundaries.
3. Walk the solo into the middle of a chain, then around one end. The middle
   blocks passage; the end can be outmaneuvered.
4. Choose a guest as solo and complete the route. Every screen should agree on
   the flags and result. Let a round reach 60 seconds to check the team ending.
5. Pause/resume and leave from different roles. Check the chain re-forms and
   the appropriate side wins when an entire side departs.
6. Check real mouse capture, Escape/focus recovery and balance with people.
   Headless review stands in for pointer-lock acquisition before exercising
   the real input handlers; it does not establish gameplay feel.

Human review and eventual catalogue/pipeline registration remain pending. No
commit, existing-module edit, `gate:pass`, or approval of this work was made.


## Procedural asset depth pass

Uses the public `76-minigame-art` contract for me in team scenery and lightly beveled existing box assets. Each scene supplies its own play bounds; decorative meshes ignore aiming rays and remain beyond the clear gameplay envelope. Game rules, collision, camera framing, player colours and controls are unchanged. Geometry is procedural, batched to at most three extra draws, with no added textures or lights.

Visual review is pending. Check the actual game, obstacle silhouettes, aiming, the smallest supported window and an eight-player round. Compare themed props in `/src/modules/76-minigame-art/review/gallery.html#me-in-team`. Existing screenshots and runtime measurements predate this pass.
