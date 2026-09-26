# 53-board-movement

## What this is

The second playable rule in Volcano Island. It consumes the completed,
immutable order from `52-turn-order`, gives each player one turn in that order,
asks the elected host for a d6, and moves the player along the existing
120-tile volcano track. A round ends after every connected player has moved. A
player who reaches the last tile wins immediately and no later turn is accepted.

The module is a complete vertical slice from pure rules through room sync and
local avatar movement to a compact browser interface. It deliberately stops at
`round_complete`; random minigame selection is the next module.

## Public contract

| Export | Meaning |
| --- | --- |
| `BoardMovement` | Scene entry: room lifecycle, DOM controls, and local track animation |
| `BOARD_MOVEMENT` | Player, die, history, and animation limits |
| `createBoardMovement(order, seed, tiles)` | Creates round one from an exact completed turn-order session |
| `activeBoardPlayer(snapshot)` | The only player currently allowed to request a roll |
| `applyBoardRoll(snapshot, player, dice, action)` | Pure validated movement, round completion, and summit victory |
| `beginNextBoardRound(snapshot, action)` | Starts another ordered round without resetting positions |
| `reconcileBoardPlayers(snapshot, connected)` | Removes disconnected pending relay ids and never admits late joiners |
| `boardPosition(snapshot, player)` | Current zero-based tile index |
| `validBoardDice(dice)` | Validates one base d6 and at most one typed bonus die |
| `getBoardMovement` / `useBoardMovement` | Current revisioned snapshot |
| `isBoardMovementVisualSettled` / `useBoardMovementVisualSettled` | True after the latest visible tile traversal has had time to land |
| `requestBoardRoll()` | Requests the local active player's roll |
| `setBoardDiceProvider(provider)` | Future reward module seam; defaults to one base d6 |
| `BOARD_LANDING_EFFECT` | Public bounds for downstream movement-effect definitions |
| `boardLandingContext(snapshot)` | Describes the latest unresolved rolled landing, or `null` |
| `applyBoardLandingEffect(snapshot, effect, action)` | Pure bounded movement effect after a rolled landing |
| `validBoardLandingEffect(effect)` | Validates a named integer displacement from -12 through +12 tiles |
| `setBoardLandingEffectResolver(resolver)` | Registers the host-side resolver used after visible landing; `null` restores no effect |
| `acknowledgeBoardRound(session, round)` | Future minigame handoff that hides presentation without discarding positions |
| `resumeBoardMovement(session, round)` | Host resumes the next round after the future minigame/reward phase |
| `encodeBoardMovementMessage` / `decodeBoardMovementMessage` | Bounded room protocol |
| `BOARD_TILES`, `tileWorldPoint`, `boardPointAt` | Public tile-to-world placement and hop interpolation |
| `BOARD_SHARED_TILE`, `sharedTileOffset` | Stable turn-order slots for players occupying the same tile |
| `BOARD_CAMERA`, `boardCameraSubject`, `boardCameraPose` | Deterministic active-player framing and camera placement |

## State and authority

The first board snapshot copies the exact ordered players and session id from
`52-turn-order`. Every position begins at tile zero. Only the player named by
`activeTurnIndex` can act. Guests send requests containing no die result; the
elected host derives the dice from the seeded stream, applies the move once,
and broadcasts a complete monotonically revisioned snapshot.

Accepted action ids are bounded and make repeated network requests harmless.
All received players, positions, dice, moves, indices, counts, ids, revisions,
and strings are bounded and validated. New relay ids are never admitted after
the order is locked. A disconnected pending player is removed so the remaining
party cannot wait forever.

The relay remains an opaque room fan-out. There is no server tick, frame
simulation, database, polling, or new service.

## Movement

`10-party`'s board coordinates are island-local. `tileWorldPoint` adds the
party island centre, places the player's feet on top of the raised tile, and
never duplicates the volcano geometry. After an accepted move, the owning
browser advances over the intervening tiles at one and a half tiles per second
with a small hop between each pair. `02-player`'s existing room publishing
carries that body movement to every other browser.

The authoritative board state still changes immediately, while a deterministic
duration derived from the move distance keeps the next roll locked until the
visible hop sequence lands. The public visual-settlement signal lets the
downstream minigame coordinator preserve the final player's movement before it
covers the board. The movement component runs at the project `world` frame
priority, after ordinary player simulation, and holds the body to the tile
while manual movement keys are captured.

The roll button now spends 1.25 seconds spinning before it submits exactly one
request. Every additional click during that window accelerates the CSS die up
to a bounded ten-click boost; it never influences the seeded authoritative die
value. Reduced-motion users receive a pulse instead of 3D rotation.

Forward and backward authoritative position changes now share the same measured
tile speed and visual-settlement lock. Ordinary revisions that do not move a
player settle immediately.

Players who share a tile are arranged in stable slots around its centre rather
than occupying the same point. Slot order follows the locked turn order, so all
browsers independently agree on the arrangement. One player remains centred;
groups of two through eight use an evenly spaced ring capped at 0.82 metres.
During movement, the travel path stays centred and blends into the player's
slot over the final tile hop. The resulting local body position continues over
the existing ordinary player sync, with no board protocol change.

## Board camera

While the board panel is active, every browser frames the same subject. Before
a roll this is the active roller. Once a roll is accepted, the previous roller
remains the subject while their visible route position advances at the same
measured tile speed as the body. Only after that movement settles does the
camera pan to the next roller. Backward tile effects use the same path, the
last mover remains framed at round completion, and a summit winner remains the
subject on the terminal board state.

The camera is placed above and radially outside the volcano so the player and
upcoming route remain visible. Position and look target ease between players;
the initial board view focuses immediately. Shared-tile offsets are included,
so the camera looks at the chosen duck rather than the centre of a group.
Every client derives this from the synchronized board snapshot—there is no new
camera message or remote-position dependency. The override uses the project
camera frame priority and releases as soon as the board round is acknowledged
for the minigame handoff.

The normal board frame is deliberately wider than the player camera, and a
moving roll pulls much farther back so the route is readable. Once movement is
settled, only the player whose turn it is can drag the canvas to take the
local view, then continue dragging to pan and use the wheel to zoom. Those
adjustments are never synchronized, and they end as soon as the turn or
movement changes. The active player also sees six compact labels that map each
possible d6 value to its landing tile.

## Landing-effect extension

A downstream tile module may register one `BoardLandingEffectResolver`. The
resolver runs only on the elected host and only after the rolled movement has
visibly landed. It receives a read-only landing context and board snapshot and
may return one named integer displacement from -12 through +12 tiles. Returning
`null`, throwing, or returning malformed data leaves the board unchanged.

The displacement is clamped to the existing track. It cannot chain: once a
player's authoritative position differs from the rolled landing tile, that move
has no unresolved landing context. Duplicate evaluation is also suppressed per
session, round, and move number. A forward effect that reaches the summit uses
the same terminal winner state as an ordinary roll.

The rolled `BoardMove` remains unchanged, preserving every existing public
signature and allowing downstream code to distinguish the dice landing from
the final authoritative position. The resulting board snapshot is broadcast by
the existing protocol; no extra relay channel or service is introduced.

## Round and future-module handoffs

At `round_complete`, positions remain immutable and the interface stays visible
until a future minigame coordinator calls
`acknowledgeBoardRound(sessionId, round)`. After the minigame and rewards, the
host calls `resumeBoardMovement(sessionId, round)`. That increments the round,
returns the active turn to the first ordered player, and leaves all positions
where they were.

`setBoardDiceProvider` is the future reward seam. The default provider returns
one base d6. A reward module may return the base die plus exactly one gold d6,
silver d4, or bronze d2. The host still generates every value, and the pure
movement rule validates the result before applying it.

## Render footprint

The module reuses the existing board, player bodies, room connection, and DOM.
It adds zero three.js draw calls and zero triangles. Network cost is one request
and one small snapshot per turn, with at most eight players.

## Workflow

- `npm run brief:board-movement`
- `npm run test:board-movement`
- `npm run gate:board-movement`
- `npm run build` followed by refreshing the already-running relay at
  `http://localhost:8791`

## Known limitations

- Authority is the elected browser host, not the Render relay. This matches the
  existing room and party contracts; a modified host can cheat.
- `09-net` has no identity-preserving automatic reconnect. A rejoined browser
  receives a new relay id and is a late joiner, not the player it replaced.
- Active games are not durable across a Render process or room loss.
- Player facing is not publicly writable, so dice movement changes position
  but retains the body's last heading.
- There is no minigame transition yet, so the first round deliberately stops
  on its completion message.
- There are no reward dice in ordinary play yet; only the extension contract
  and validation exist.
- Tiles have no actions, obstacles, branches, or movement choices.
- The new landing resolver is an extension contract only. This generation does
  not register an effect catalogue or change any tile by itself.

## How to review

Run `npm run build`, keep one relay running, then open
`http://localhost:8791` in a normal and private browser.

1. Create and join one two-player Volcano Island party, ready both, and start.
2. Complete the d6 turn-order screen. When the final order locks, both browsers
   should automatically replace it with the compact board panel.
3. Both panels must name the same first player. Only that browser's Roll d6
   button should be enabled.
4. Click Roll repeatedly during its spin window. The die should visibly rotate
   faster with each click, but exactly one authoritative move must be recorded.
5. Both panels should display the same value and destination tile. The owning
   body should hop at the slower pace along the volcano track, and the next
   player must remain locked until that movement lands.
6. On the active player's browser, confirm the **Roll to land on** labels map
   each value from 1 through 6 to the corresponding next tile. Drag the canvas
   to take the local view and pan, then use the wheel to zoom. The other
   browser must keep its synchronized automatic frame. Roll and confirm manual
   control ends when movement starts.
7. Roll from the second browser. Both panels should enter `Board round
   complete`, retain both positions, expose visual settlement after the last
   hop lands, and accept no further roll.
8. Compare every player name, tile, last die, active player, round, and revision
   between the two browsers; they should agree.
9. Hold WASD and Space while the panel is active. Manual movement must not pull
   the body away from its board tile.
10. Close a browser before its turn. The host should remove that pending relay
   id instead of waiting forever; below two players it should explain that the
   party is interrupted.
11. Join after the board is locked. The new relay id must not enter the board
   roster or receive a roll.

Eight-player sequencing, bonus-die summing, duplicate rejection, multi-round
position preservation, disconnect advancement, world placement, clamping, and
immediate summit victory are covered by the automated tests.

For generation 3, repeat the ordinary two-browser roll and confirm there is no
change when no resolver is registered. The next player must still unlock only
after the visible movement lands. Also recheck the dependent flow: the final
round move must finish before the minigame appears, reward dice must resume the
next round, and reaching the summit must still show the shared winner screen.
Bounded forward/backward effects, one-shot host resolution, protocol round-trip,
effect-driven victory, and backward settlement timing are covered by automated
tests until the first visible tile-action module registers the seam.

For generation 4, let both players remain on the starting tile and confirm
they stand on opposite sides rather than overlapping. Move one player onto a
tile occupied by the other and confirm the arriving duck blends into its slot
during the final hop while both browsers show the same arrangement. Recheck
the dependent minigame, rewards, victory, tile-action, and landmark flow.
Single-player centring, two-player opposition, deterministic snapshot ordering,
and eight-player bounded unique slots are covered by automated tests.

For generation 5, compare both browsers throughout a full board round. Before
each roll, both views must frame the named roller. During movement, both views
must follow the moving duck through every hop before easing to the next roller.
Confirm the camera follows an Ash Slide backward, stays on the last mover until
the minigame appears, and focuses a summit winner. The minigame must still open
on both browsers after the final movement settles.

## Gate record

Generation 5 adds synchronized board camera direction derived entirely from
the existing snapshot. Pending human review, including regression review of
modules 54-56, 59, and 60.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
