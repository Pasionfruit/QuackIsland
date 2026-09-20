# 52-turn-order

## What this is

The first playable rule in Volcano Island: after the existing party host starts
the island game, the connected roster is locked and every player rolls a d6.
The elected host generates the rolls, broadcasts revisioned snapshots, and asks
only tied groups to roll again. Every browser finishes with the same immutable
turn order.

This is deliberately a vertical slice. `10-party` still owns creating and
joining a room, readying up, starting, and moving everybody to the volcano.
This module begins when that party reaches `playing` in the `island` game mode.
It ends on a visible `board_ready` equivalent: the completed order remains on
screen until the next module confirms that it has consumed that exact session.

## Public contract

| Export | Meaning |
| --- | --- |
| `TurnOrder` | Scene-safe bridge that mounts the browser roll interface |
| `TURN_ORDER` | Two-player minimum, eight-player maximum, d6 rules |
| `createTurnOrder` | Locks a roster into a new pure order session |
| `applyTurnOrderRoll` | Applies one validated, idempotent roll and resolves ties |
| `reconcileTurnOrderPlayers` | Removes disconnected pending relay ids without admitting late joiners |
| `rollsFor` | A player's ordered roll history |
| `encodeTurnOrderMessage` / `decodeTurnOrderMessage` | Bounded room protocol |
| `getTurnOrder` / `useTurnOrder` | Current revisioned snapshot, plain or React-safe |
| `acknowledgeTurnOrder(sessionId)` | Releases the completed overlay after a downstream module consumes that exact session |
| `isTurnOrderAcknowledged` / `useTurnOrderAcknowledged` | Plain and React-safe handoff state without changing the immutable result |
| `requestTurnOrderRoll` | Requests one roll for the local player |
| `listenForTurnOrder` | Subscribes to the opaque `09-net` room channel |
| `syncTurnOrderLifecycle` | Starts, resets, reconciles, or requests a full snapshot |
| `resetTurnOrder` | Returns the local store to idle |

`TurnOrderSnapshot` contains the session and room ids, deterministic seed,
revision, locked players, pending players, complete roll history, final order,
and the bounded action-id history used for idempotency.

## Authority and synchronization

The relay deliberately knows only rooms and opaque messages, so authority stays
with the same elected host that already owns party phase, time, weather, and
game mode. Guests send a roll request. The host verifies the relay sender is
locked into the roster, derives the next d6 from the project seed and accepted
roll count, applies it once, then broadcasts a full snapshot.

Full snapshots are small at eight players and make recovery from missed room
messages simple. Every snapshot has a monotonically increasing revision; stale
or duplicate snapshots are ignored. A late subscriber asks for the current
snapshot instead of replaying history. New relay ids are never added after the
roster is locked.

All incoming data is bounded and validated before it reaches state. Dice come
from `00-core`'s seeded RNG. There is no `Math.random`, server loop, polling,
per-party timer, or networked animation.

## Completion handoff

The final order is data that later modules depend on, while the roll dialog is
only its presentation. They deliberately have separate lifetimes. A downstream
module reads a `complete` snapshot, creates its own state, then calls
`acknowledgeTurnOrder(snapshot.sessionId)`. The call succeeds only for the
currently completed session, hides the dialog locally, and leaves the snapshot
unchanged. A stale session id cannot dismiss a new game's order screen.

Without an acknowledgement the original behavior is preserved: the final
order remains visible. Resetting or starting a new session clears the handoff.

## Tie rule

Roll histories are compared lexicographically, highest first. A player starts
with one value. Players whose complete histories are identical form a tied
group and append another value. Separate tie groups remain inside their
original score bands, so a player resolving a tie at 2 can never jump ahead of
a player whose first roll was 6.

## Render footprint

The module adds no backend process, database, timer, draw call, or triangle. It
uses the already-open room connection and sends one small request per click and
one small snapshot per accepted change. An eight-player session therefore
changes message fan-out, not simulation cost. When nobody is connected, this
module does no work and does not interfere with Render's normal free-service
sleep behavior.

## Workflow

- `npm run brief:turn-order` prints only this assignment and its dependencies.
- `npm run test:turn-order` runs the focused rule and protocol suite.
- `npm run gate:turn-order` runs the complete repository gate for this module.
- `npm run dev:multi` builds the current client and starts the existing relay
  for multi-browser testing.

## Known limitations

- Authority is the elected browser host, not the Render relay. A modified host
  can cheat. Moving competitive authority into the server requires a separate
  networking module and an explicit change to the relay contract.
- `09-net` intentionally has no automatic reconnection. A reconnect receives a
  new relay id, which is correctly treated as a late joiner after roster lock.
- Active sessions live in browser and room memory only. A Render process
  replacement or room loss cannot restore a match.
- `10-party` owns its Start button and supports a broader lobby. This module
  rejects rosters outside two through eight after start rather than reaching
  into that module to alter its frozen-facing contract.
- Board movement, minigames, reward dice, tile actions, and the summit win
  condition are not part of this module.

## How to review

Run `npm run dev:multi`, then use a normal and private browser window.

1. Create a lobby in the first browser and join its code in the second.
2. Select Volcano Island, ready both players, and start as the host.
3. Both browsers should land on the volcano and see the same locked two-player
   roll screen.
4. The guest cannot manufacture a value: clicking sends a request and the host
   supplies the displayed d6.
5. Roll once in each browser. A second click must not add another roll.
6. If the values differ, both browsers should show the same final order.
7. If they tie, only those two players should receive a tie-breaker button;
   repeat until both browsers show the same final order.
8. Close a still-pending guest. The host should remove it rather than wait
   forever; with fewer than two remaining players the screen should explain
   that Volcano Island needs two through eight.
9. Join after the roster is locked. The new relay id should be shown the locked
   party message and must not receive a roll.
10. Confirm the final screen says board movement is the next module and that
    walking controls do not move the duck behind the overlay. Until a downstream
    module acknowledges the completed session, the screen must remain visible.

Eight-player behavior is covered by the automated suite; the same manual flow
can be repeated with up to eight browsers when desired.

## Gate record

Pending human review.

## Measured

DOM-only module: zero three.js draw calls and zero triangles.
