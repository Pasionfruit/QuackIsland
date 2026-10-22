# 70-duck-szn

The app-wide character update uses `02-player.createAvatar` for ducks and the
hunter, preserving their original heights, facing, crouch and hunter equipment.
`02-player` is declared in the proposed local dependency entry.

Duck Szn is a first-person, one-vs-all hunt in a procedural marsh. One human is
the Hunter; everyone else is a duck. The Hunter has 60 seconds to tag every
duck with one hit each. If any active duck survives at 60 seconds, the ducks
win together. The clock wins a tie: shots at or after 60 seconds do not count.

Code, preview, tests and review files stay inside this module. Dependencies:
`00-core`, `09-net`, `15-minigames`, `68-minigame-kit` (public contracts).
[`module-entry.json`](module-entry.json) records the proposed dependency and
budget declaration for later pipeline registration.

Blocks:
- [x] 70.1 Seeded marsh, cover collision, one-vs-all deal, 60-second rules and authoritative shots.
- [x] 70.2 Kit pose/claim/header wire and shared arena loop.
- [x] 70.3 Procedural scene, first-person controls, duck hide action and HUD.
- [x] 70.4 Standalone solo/lobby preview, tests, browser checks and handoff.
- [ ] 70.5 Pipeline/catalogue registration, module gate and human approval (outside the authorized scope).

Scope blocker: per the user's standing instruction, no catalogue, composition or
pipeline edits are made. Main dashboard registration and the module gate therefore
remain pending. This module will provide its own playable preview URL.

## Play the preview

From the repo root:

```powershell
npx vite D:/Projects/LocalRot --port 5199 --strictPort
# In a second terminal, for multiplayer only:
npm run relay
```

Open <http://localhost:5199/src/modules/70-duck-szn/preview.html>.
Alone, the human is the Hunter and four seeded stand-in ducks run and hide.
For multiplayer, open two separate browsers, create a lobby in one, and join
its code in the other. The host chooses the Hunter and starts the hunt.

- **Hunter:** WASD moves, mouse aims, left click shoots. Click the marsh once
  to capture the mouse; subsequent clicks fire. Shots have a 0.72-second cooldown.
- **Duck:** WASD moves, mouse looks, **hold Space** to crouch. Crouching lowers
  the camera and hitbox and slows movement; a low log can conceal a crouched
  duck. Crouching does not make a duck invisible or immune to a clear shot.
- **Escape:** releases the mouse. Lost focus clears movement and firing input.
- **Pause:** the preview host pauses both sides and their simulation clocks.
- Tagged ducks spectate a surviving duck or the Hunter. The HUD tracks the
  flock, cooldown and confirmed tags; the preview provides both result screens.

## Public contract

`index.ts` exports `DuckSznPanel`, `duckSznBuild`, setup helpers, arena geometry
queries and the pure rule functions/types. `duckSznBuild` is a standard
`MinigameBuild`, ready for registration once a catalogue id is authorized.
It does not register itself under another game's id or mutate the catalogue.
When integrated, it hands standings to the shared `useFinish`/podium flow.

## Design and networking

- `oneVsAllSetup` owns roster, identity, seeds, host pick and waiting round.
  `castOneVsAll` chooses the Hunter; tests assert `oneVsAllProblems(...)` is empty.
- `useArenaNet` owns the host/guest loop, snapshots, guest clock, pause and
  departures. This module supplies only `DUCK_RULES`.
- Wire messages use kit pose, claim and one-vs-all header codecs, plus validated
  player rows. A duck cannot shoot. Claims do not name the victim to eliminate:
  the host computes the first duck hit by the ray, checks solid cover and
  cooldown, and awards the tag. Guest motion is clamped to the host clock and
  swept through cover in small fixed steps.
- Round decisions stop input but keep the net loop active long enough to share
  the final snapshot. A departing Hunter awards the ducks the round; departed
  ducks stop counting as survivors. The preview returns to its lobby if the
  original host leaves, rather than silently continuing its launch session.
- Rocks and logs, ground, puddles, reeds, boundary trees and characters are
  procedural. Reeds and trees are instanced. No external models or raster assets.
- `GameCanvas` owns rendering. Camera and simulation use the core priority bands;
  the first-person camera takes and returns the public camera-mode arbitration.

## Validation recorded on 2026-10-21

- Final module suite: **22 tests passed** (rules, setup conformance, cover,
  hiding, cooldown, victory timing, validated wire, guest actions, pause,
  disconnects and guest teleport clamping).
- Repository suite: **2,787 tests / 259 files passed** during implementation;
  the final scoped run includes one additional movement-clamping regression.
- Typecheck and standalone production build passed. The standalone JavaScript
  bundle is 327.87 kB gzip, including React, Three and the shared modules.
- Repository boundary, frozen-file and frozen-contract checks passed.
- Eight real browser checks passed, with no captured console errors. Evidence
  and screenshots: [`review/README.md`](review/README.md).
- Final rendering sample: **69 draw calls, 3,828 triangles, 60 fps** at 1200×820.
  The 800×600 layout had a 413 px game viewport and no horizontal overflow.
- `npm run gate -- 70-duck-szn` reports **Unknown module** because pipeline
  registration is deferred. No machine gate or human PASS is claimed.

Build the standalone artifact with:

```powershell
npx vite build --config src/modules/70-duck-szn/vite.preview.config.ts
```

The generated `preview-dist/` stays inside this module and is git-ignored.

## How to review

1. Play solo: move, look and shoot, confirm cover blocks shots, and try catching
   all four stand-ins within the minute.
2. In two separate browsers, select the guest as Hunter. Move/crouch as the
   host duck; confirm a guest shot tags it and both browsers show Hunter victory.
3. Start another round and survive as a duck for the full minute. Confirm the
   flock wins even if other ducks were tagged.
4. Pause and resume; verify the clock and bodies stop together. Leave as Hunter
   and confirm the remaining ducks receive the win.
5. Check real pointer-lock acquisition, Escape/focus recovery and game feel.
   The headless tests stand in for pointer lock, then use keyboard/mouse/pointer
   events through the real input code.

Human review is pending. No commit, catalogue edit, pipeline edit or `gate:pass`
was made by this implementation.
