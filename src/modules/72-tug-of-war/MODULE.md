# 72-tug-of-war

Ready for human review in the standalone preview. Integration and the two-key
gate remain pending. Dependencies (public contracts): `00-core`, `09-net`,
`02-player`, `15-minigames`, `68-minigame-kit`.

The solo taps 1; every teammate types a personal randomized four-key sequence.
Each correct input pulls the rope. Wrong team keys reset that player's sequence
progress without moving the rope. The first side to cross its goal line wins;
there is no timed decision. Team inputs are normalized by active team size.

Blocks:
- [x] 72.1 Kit setup, deterministic sequences, pull rules and input projection.
- [x] 72.2 Validated intents, shared arena loop and acknowledged input snapshots.
- [x] 72.3 Procedural scene, keyboard controls, personal sequences and HUD.
- [x] 72.4 Standalone preview, tests, browser evidence and handoff.
- [ ] 72.5 Catalogue/pipeline registration and human gate (outside authorized scope).
- [x] 72.6 Replace pill-like characters with detailed procedural duck models.

Per the user's earlier scope instruction, catalogue, pipeline and composition
files remain unchanged. Registration metadata and a playable preview live here.

## Public contract

`tugOfWarBuild` implements `MinigameBuild` with a waiting guest round and the
shared finish flow. `TugPanel` also accepts standalone preview runs. The public
entry exports deterministic round/sequence helpers and input types for review.
`module-entry.json` proposes dependencies and budgets; it is not a pipeline
registration. The existing catalogue does not expose this game yet.

## Rules and controls

- Solo: press and release **1** (top row or numpad) for each pull.
- Team: enter the highlighted letter in your personal four-letter sequence,
  drawn from **A S D F J K L**. Each correct letter pulls immediately. Completing
  four letters deals your next sequence. A wrong displayed-alphabet key resets
  your progress on that sequence and adds no pull. Other keys are ignored.
- Solo pulls 0.02 toward -1. Team members each pull 0.032 / active team size
  toward +1. The first side to reach its endpoint wins; there is no time limit,
  passive drift or timeout winner. These constants are tunable pending playtest.
- Held keys and keyboard auto-repeat do not add pulls. Inputs during countdown,
  pause, after departure, in editable fields or after the result are ignored.
- Stand-ins enter the same sequences through the same input rules. They can
  make mistakes. A stand-in is never assigned solo. If solo leaves, team wins;
  if every teammate leaves, solo wins. Remaining team inputs scale to team size.

## Shared kit and authority

`oneVsAllSetup` owns roster, local ID, seeds and non-finishing guest placeholders;
`castOneVsAll` chooses solo. `setup.test.ts` asserts `oneVsAllProblems` is empty.
The shared `useArenaNet` loop owns host/guest stepping, snapshot cadence, pause,
clock synchronization and departures. This keyboard game uses validated custom
intents plus the kit's header, sides, player-row, merge and adoption codecs.

The host validates round, sender, sequence number, allowed key and key order.
A per-player token bucket permits three immediate inputs, then refills at 18/s.
Snapshots acknowledge processed input IDs, including rate rejections. Clients
project only their own key sequence and counters over pending inputs so the next
key changes immediately; rope position and winner remain authoritative. Guests
cannot send pull values or force a result. The network keeps running after a
winner so all guests receive the final snapshot.

All geometry is procedural. The scene uses `GameCanvas`, named frame priorities
and the core renderer. Camera mode is restored on unmount. No textures, model
assets, external packages, or generated art were added.

The pullers now use the application's shared `02-player.createAvatar` duck,
with an adapter for the arena's height and -Z facing. The same body, head, bill,
wing, tail, foot and emote design is used on the home page and in other games.
The neutral model has 1,400 triangles in three meshes. Cached shared geometry
is owned by `02-player`. This arena disables shadow-map casting on its own
instances and uses its existing contact shadows. Team spacing and camera
framing accommodate the longer silhouettes and an eight-player row.

## Validation and limits

- Typecheck, application build and standalone preview build pass.
- Full repository suite: 2,841 tests pass. The module contributes 26 rule,
  conformance, wire and fake-room network tests.
- Frozen hashes, existing public contracts and boundary checks pass.
- Separate GPU-backed Chrome processes: both offline winners; guest solo and
  host/guest team wins replicated to all three players; personal sequence
  feedback; wrong-key reset; countdown; held-key rejection; shared pause and
  resume; solo departure. Native CDP keyboard input and editable-field isolation
  also checked. No runtime/console errors recorded.
- Updated five-player preview: 38 draw calls, 9,362 triangles, about 60 FPS sampled.
  An eight-player static art fixture measures 50 draw calls, 13,616 triangles,
  60 FPS. Both fit the proposed 100 draw / 15,000 triangle scene budgets. The
  eight-player fixture checks rendering, not multiplayer behavior. Both the
  braided rope and each duck fit the 3,000 triangle per-asset budget; no image
  textures added. Current measurements are in `review/duck-results.json`.
- Screenshots visually inspected at 1440×900, 800×600 and 390×700. No horizontal
  scrolling; scene, role and primary control remain visible.
- `npm run gate -- 72-tug-of-war` exits 1 with `Unknown module: 72-tug-of-war`
  because pipeline registration is outside authorized scope. The new module's
  dependency declarations cannot be enforced by the pipeline until registered.
  Human PASS is pending. No commit was created.

Evidence and repeatable browser checks are in `review/`. Automated browser checks
exercise behavior but do not establish human typing feel or competitive balance.
The duck update was also checked with native keyboard input, a compact game
view, a close-up of three model colours/angles, and an eight-player scene. The
module's 26 tests, typecheck and preview build were re-run for this visual change.

## How to review

1. With Vite running, open
   `http://localhost:5199/src/modules/72-tug-of-war/preview.html`.
   Click Play, release/repress 1 rapidly, and drag the centre flag to the left
   goal. Hold 1 and confirm it contributes only one pull.
2. Start a new round and stay idle. The four stand-ins should type and win.
3. Open the same URL in separate browser profiles/windows. Create a lobby and
   join its five-character code. Pick a guest in the solo selector before Play.
   Each team member should see a personal sequence; solo sees a large 1.
4. Have team members type their highlighted keys. Press a wrong letter from the
   alphabet and check that progress resets with visible feedback. Finish several
   sequences rapidly; confirm no repeated/stale display between network updates.
5. Let each side win once and check matching results in every browser. Pause as
   host while players type; resume and check there are no buffered pulls. Try
   solo leaving mid-round and a teammate leaving with other teammates remaining.
6. Review fairness with different team sizes. Team normalization is implemented;
   the relative strengths (0.02 versus 0.032) still require human playtesting.
7. Inspect the ducks' bills, layered wings, tails and webbed feet. Compare
   `review/screenshots/ducks-closeup.png` with `ducks-playing.png`; the same
   generated mesh is used in the close-up and the game.

Repeat automated checks from repo root with:
`node src/modules/72-tug-of-war/review/browser-check.mjs` and
`node src/modules/72-tug-of-war/review/keyboard-check.mjs`.
For the new duck art and renderer budgets, run
`node src/modules/72-tug-of-war/review/duck-check.mjs`.
They require the local Vite/relay and Chrome, use separate temporary profiles,
close their own browsers, and leave the existing servers running.
