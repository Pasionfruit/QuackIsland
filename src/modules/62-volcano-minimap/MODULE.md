# 62-volcano-minimap

## What this is

A small, read-only route display for an active Volcano Island game. It is a
single horizontal line, with one coloured dot for every player at that
player's current board tile. The left end is start and the right end is the
summit.

The overlay uses the already synchronized `53-board-movement` snapshot. It
does not send a message, change a turn, or move an avatar. A colour is derived
from the player's stable id, so it stays with that player rather than with a
place in the current turn order.

## Behaviour

- The map appears only while a Volcano Island party is playing and has a board
  roster. It vanishes when the game ends.
- Tile zero maps to the route's left end and the final tile maps to its right
  end. Out-of-range values are defensively clamped.
- Players on one tile are fanned above and below the line. Their horizontal
  position remains the exact shared tile, while every dot stays visible.
- The overlay has `pointer-events: none`; it never captures board controls,
  camera input, or clicks.

## Public contract

| Export | Meaning |
| --- | --- |
| `routePercent` | Converts a zero-based board tile into a clamped route percentage. |
| `playerColour` / `MINIMAP_COLOURS` | Stable player-id colour selection. |
| `minimapDots` | Produces position, colour, and same-tile stacking data. |
| `VolcanoMinimap` | The scene component that mounts the overlay. |

## Non-goals

- No world-space rendering, board mutations, network messages, or new host
  authority.
- No interaction or labels that compete with the existing board panel.

## How to review

1. Start a two-player Volcano Island game and finish turn order.
2. A compact **Summit route** line should appear at the bottom centre, with a
   differently coloured dot for each player at start.
3. Roll for one player. Their dot should move right to their current tile in
   both browsers, while the other dot remains at start.
4. Move both players to the same tile. Both dots should remain visible, one a
   little above and one a little below the route.
5. End the party. The minimap should disappear and it must never block clicks
   on the board UI.

## Validation

`npm run typecheck` and `npm run test:volcano-minimap` pass. The helper tests
cover start/summit clamping, repeatable colours, and same-tile stacking.
