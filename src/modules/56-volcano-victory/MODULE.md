# 56-volcano-victory

## Purpose

This module owns the final boundary of a Volcano Island match. It consumes the
frozen board's terminal `won` state, waits until the winner's last visible hop
has landed, synchronizes that winner from the host, and shows the same stable
end screen to every player.

The board remains the authority for movement and for deciding who reached the
summit first. This module neither predicts a win nor changes a position. It
accepts only the board-declared `winnerId` whose position is exactly the last
tile. The frozen board already rejects further rolls in `won`, so no second
movement lock or private board access is needed.

## Public contract

The public surface is `index.ts`.

- `volcanoWinner` validates the winner against the board roster and final tile.
- `createVolcanoVictory` creates a winner only from a visually settled board.
- `isVolcanoVictorySnapshot` validates bounded synchronized winner state.
- `VolcanoVictorySnapshot`, `VolcanoWinner`, and the constants describe that
  state.
- `encodeVolcanoVictoryMessage` and `decodeVolcanoVictoryMessage` define the
  bounded `volcano-victory/v1` room protocol.
- `getVolcanoVictory` and `useVolcanoVictory` expose the local snapshot.
- `listenForVolcanoVictory`, `requestVolcanoVictorySync`, and
  `syncVolcanoVictoryLifecycle` coordinate host authority and late guest sync.
- `resetVolcanoVictory` clears local state when the Island match changes.
- `VolcanoVictory` mounts the DOM end screen outside react-three-fiber.

## Authority and lifecycle

Only the elected party host creates a victory snapshot. Its identity is derived
from the exact board session and contains the room, board round, tile count,
locked roster size, and winner. The host announces it once. Guests request the
same session after their local final movement settles and accept snapshots only
from the elected host.

Received snapshots must still match the guest's current room and terminal board
session, round, winner, tile count, roster, and visual-settlement signal. Stale,
foreign, duplicated, malformed, or prematurely delivered state is ignored. A
guest that settles after an early announcement requests the host's retained
snapshot through the sync message.

The overlay has no replay, menu, or continue action. The terminal board state
remains underneath it and accepts no further roll. Restart and party navigation
belong to a later module rather than being coupled to winner detection.

## Human review

Use one host browser and one guest browser in the same two-player Island party:

1. Continue normal board and minigame rounds until a player reaches the final
   summit tile.
2. Watch the winning move on both browsers. The ordinary board must remain
   visible during every tile hop; the victory screen must not appear early.
3. After the winner visibly lands, confirm both browsers show the winner screen
   with the same name, board-round count, final tile, and player count.
4. On the winning player's browser, confirm the heading says “You conquered the
   volcano.” On the other browser it should name the winner.
5. Confirm neither browser can roll again and no minigame, reward, replay,
   continue, or menu control appears over the winner screen.
6. Leave one browser open briefly and confirm the end state remains stable
   without duplicate animation or changing winner data.

Automated coverage includes two-player and eight-player rosters, non-terminal
and inconsistent winner rejection, visual-settlement gating, bounded protocol
decoding, host-only creation, guest late sync, non-host rejection, and duplicate
lifecycle calls.

## Non-goals

- Replay, rematch, return-to-menu, or party restart flow.
- Tile actions, obstacles, or branching movement.
- Persistent match history or durable server authority.
- Changes inside frozen board, minigame, or reward modules.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
