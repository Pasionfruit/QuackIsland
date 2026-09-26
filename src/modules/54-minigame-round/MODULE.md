# 54-minigame-round

## What this is

The third playable rule in Volcano Island. When every player has taken a board
turn, the host deterministically selects one registered free-for-all minigame.
Every party member receives the same briefing, can read its description and
controls, and follows the host into any number of practice attempts. The host
then starts one locked final attempt and publishes its placements for the next
reward-dice module.

This module coordinates the round; it does not duplicate the minigame system.
`15-minigames` continues to own briefings, countdowns, gameplay, pausing,
standings, and podiums. Existing minigame modules continue to own their own
simulation and controls.

## Public contract

| Export | Meaning |
| --- | --- |
| `MinigameRound` | Scene-safe coordinator and host-control overlay |
| `MINIGAME_ROUND` | Player, practice, action-history, and message bounds |
| `eligibleFreeForAll(available)` | Catalogue-ordered intersection of built and free-for-all games |
| `createMinigameRound(board, available)` | Selects one seeded game for an exact completed board round |
| `beginMinigameAttempt(snapshot, kind, action)` | Starts a practice or locks the one final attempt |
| `finishFinalMinigame(snapshot, standings, action)` | Normalizes host standings into final roster placements |
| `requestRewardHandoff(snapshot, action)` | Records the host's one synchronized Continue request after final placements |
| `getMinigameRound` / `useMinigameRound` | Current revisioned coordinator snapshot |
| `startMinigamePractice` / `startFinalMinigame` | Host-only runtime controls |
| `continueToMinigameRewards` | Host-only Continue action consumed by the downstream reward module |
| `acknowledgeMinigameRound(session)` | Stable downstream handoff after placements are consumed |
| `isMinigameRoundAcknowledged` / `useMinigameRoundAcknowledged` | Plain and React-safe handoff state |
| `encodeMinigameRoundMessage` / `decodeMinigameRoundMessage` | Bounded room protocol |
| `encodeMinigameRoundReady` / `decodeMinigameRoundReady` | Separate bounded briefing-loaded acknowledgement protocol |
| `allConnectedMinigamePlayersReady` | Pure preload barrier for the current connected roster |
| `markMinigameRoundReady` / `isMinigameRoundReadyToStart` | Runtime preload acknowledgement and host launch guard |

The completed snapshot contains the board session and round, selected game,
locked two-to-eight-player roster, practice count, normalized placements, and
bounded action history.

## Selection and authority

Only ids that are both registered in `15-minigames` and catalogued as
`free-for-all` are eligible. Registry order does not affect selection: eligible
ids are restored to catalogue order, then one index is derived from the board
seed, board session, and round using `00-core`'s seeded RNG. Replaying the same
input therefore selects the same game without `Math.random`.

The elected browser host creates and advances the coordinator snapshot. Guests
accept snapshots only from the elected host, revisions only move forward, and
late subscribers request the current full snapshot. The selected roster is
copied from board movement and never admits a later relay id.

Adopting a host briefing snapshot also opens the selected game locally before
the later Play call arrives. This makes every browser construct and display the
game behind the shared countdown instead of first mounting it after 3-2-1.

If that host snapshot arrives while a guest is still showing the final board
movement, it is retained instead of discarded. The guest adopts the newest
authenticated snapshot as soon as its matching board round visibly settles.

Once the briefing is actually mounted, each connected player sends a bounded
ready acknowledgement. Practice and Start final remain disabled on the host
until every currently connected member of the locked round roster is ready.
Disconnected members are excluded from this preload barrier, matching the
existing rule that a disconnected player cannot hold the party forever. The
ready channel contains only the session and round and adds no polling loop.

`53-board-movement` is acknowledged only after its public visual-settlement
signal confirms the final player's last hop has landed and this module has
adopted the matching round. That keeps the board visible through the complete
move, then hides its panel without discarding positions. The board is
deliberately not resumed here.

## Practice and final attempts

The first screen is the selected game's existing description and controls
page. A host-only footer provides two choices:

- **Practice** starts a fresh ordinary minigame run whose result is ignored.
  Once it ends, the host may practice again or begin the final.
- **Start final** changes the revisioned coordinator to `final` before the
  minigame starts. No later practice or second final command is accepted, and
  Escape cannot open the restart/leave controls during that attempt.

The Island footer is the only launch surface during this flow. Its larger,
labelled Practice and Start final cards call the shared minigame runtime
directly, while the standalone Play button is hidden. Once an Island practice
or final reaches its podium, the standalone Replay and Minigame dashboard
buttons and Escape navigation are also hidden. Those controls are restored as
soon as the Island round is no longer active, so ordinary minigame browsing is
unchanged.

The minigame's existing finish flow supplies standings. The host ranks those
through the existing podium rules and broadcasts the resulting placements.
Ties share ranks and skip following ranks. If everybody ties, every placement
uses rank zero so the reward module can correctly give no podium bonus.
A disconnected roster member omitted by the result is placed after the
submitted field instead of blocking the party forever.

## Handoff to rewards

`complete` remains visible with a host-only Continue button. Pressing it records
and broadcasts `continueRequested` exactly once; guests see a waiting state,
then a preparing-rewards state after the host continues. A downstream module
consumes that exact synchronized session with `acknowledgeMinigameRound`. It can
map rank 1 to a golden d6, rank 2 to a silver d4, rank 3 to a bronze d2, give
every player their base d6, install the board dice provider, and resume the
preserved board round.

## Render and server footprint

The module adds no three.js draw calls or triangles. Its UI is a small DOM
overlay above the already-mounted minigame screen. It reuses the existing room
socket and sends one small snapshot for selection, each attempt, final results,
and late-subscriber recovery. There is no server tick, polling loop, database,
or additional Render service.

## Workflow

- `npm run brief:minigame-round`
- `npm run test:minigame-round`
- `npm run gate:minigame-round`
- `npm run dev:multi` for a build plus the existing relay

## Known limitations

- Authority remains the elected browser host. A modified host can falsify a
  selection or standings; authoritative competition would require a separate
  relay contract.
- The minigame runtime shares the host's open/play call, while each individual
  game still owns its own networking or deterministic simulation.
- A game must hand standings to the shared minigame finish flow before this
  coordinator can publish placements.
- A reconnect receives a new relay id and is not admitted to the locked board
  or minigame roster.
- Random selection can choose the same game in consecutive board rounds.
- Reward dice and board resumption are intentionally the next module.

## How to review

Run `npm run dev:multi`, then use a normal and private browser window.

1. Create and join a two-player Volcano Island party, ready both players, and
   start as host.
2. Complete turn order and one full board round. The last player must visibly
   land on their destination tile before the board panel is replaced by the
   same randomly selected free-for-all briefing in both browsers.
3. Switch between the description and controls tabs in both browsers. The
   standalone Play button must be absent. The guest should see `Waiting for the
   host`; only the host has the polished Practice and Start final cards. The
   cards must remain disabled with `Loading the minigame for every player...`
   until the guest's briefing is mounted.
4. Press Practice. Both browsers should enter the same game through its normal
   countdown and show a Practice badge stating that results do not count.
5. Finish the practice. Replay and Minigame dashboard must be absent and Escape
   must not leave the Island flow. The host should be offered Practice and
   Start final again, and the displayed practice count should increase. Run a
   second practice to confirm each attempt starts fresh.
6. Press Start final. Both browsers should show Final attempt. Escape must not
   expose restart or leave controls, and no practice control should return.
7. Finish the game. Both browsers should retain the ordinary podium without
   Replay or Minigame dashboard controls and show the same final placement list.
   Only the host should have Continue; the guest waits for the host.
8. Press Continue. Both browsers should switch to `Preparing reward dice...`
   exactly once. The board does not begin another round yet because reward dice
   and board resumption belong to the next module.
9. Refresh neither browser during the test; reconnect identity preservation is
   outside the current network contract.

Seeded selection, two-player and eight-player rosters, repeat practices,
irreversible final state, ties, omitted players, duplicate actions, malformed
messages, host-only controls, and result handoff are covered by automated
tests.

To exercise the generation 2 race, let the guest's final board movement remain
in progress when the host settles. The guest must still open the selected
briefing after landing, acknowledge readiness, and enable the host controls.
Starting either mode must then load both browsers before countdown.

## Gate record

Generation 3 retains early host snapshots and adds an explicit connected-player
preload barrier before the host can launch. Its Island controls now use the
same rounded sun/coral treatment as the minigame screen, the briefing back
button is hidden, and the active-party pause card cannot restart or leave the
coordinated round. Pending a new human review.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
