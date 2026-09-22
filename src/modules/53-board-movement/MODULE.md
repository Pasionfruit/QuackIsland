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
| `acknowledgeBoardRound(session, round)` | Future minigame handoff that hides presentation without discarding positions |
| `resumeBoardMovement(session, round)` | Host resumes the next round after the future minigame/reward phase |
| `encodeBoardMovementMessage` / `decodeBoardMovementMessage` | Bounded room protocol |
| `BOARD_TILES`, `tileWorldPoint`, `boardPointAt` | Public tile-to-world placement and hop interpolation |

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
6. Roll from the second browser. Both panels should enter `Board round
   complete`, retain both positions, expose visual settlement after the last
   hop lands, and accept no further roll.
7. Compare every player name, tile, last die, active player, round, and revision
   between the two browsers; they should agree.
8. Hold WASD and Space while the panel is active. Manual movement must not pull
   the body away from its board tile.
9. Close a browser before its turn. The host should remove that pending relay
   id instead of waiting forever; below two players it should explain that the
   party is interrupted.
10. Join after the board is locked. The new relay id must not enter the board
    roster or receive a roll.

Eight-player sequencing, bonus-die summing, duplicate rejection, multi-round
position preservation, disconnect advancement, world placement, clamping, and
immediate summit victory are covered by the automated tests.

## Gate record

Pending human review.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
