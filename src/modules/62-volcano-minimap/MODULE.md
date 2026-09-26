# 62-volcano-minimap

## What this is

A small, read-only board HUD for an active Volcano Island game. It maps the
actual board route into a compact spiral, with one coloured dot for every
player at that player's current tile, and shows the latest synchronized roll
as animated 3D dice.

The overlay uses the already synchronized `53-board-movement` snapshot. It
does not send a message, change a turn, or move an avatar. Each dot uses the
player's selected avatar colour as synchronized by the roster; a stable id
palette is only a fallback while that colour is unavailable.

## Behaviour

- The map appears only while a Volcano Island party is playing and has a board
  roster. It vanishes when the game ends.
- The map sits in the top-right corner. Its path samples the public board
  positions, so it follows the game's actual spiral to the summit.
- Tile zero maps to the route start and the final tile maps to the summit.
  Out-of-range values are defensively clamped.
- Players on one tile are fanned above and below the route while every dot
  stays visible.
- The most recent roll tumbles as CSS 3D dice and settles with its synchronized
  value on the visible face. It adds no WebGL work or board state.
- The overlay has `pointer-events: none`; it never captures board controls,
  camera input, or clicks.

## Public contract

| Export | Meaning |
| --- | --- |
| `routePercent` | Converts a zero-based board tile into a clamped route percentage. |
| `spiralRoute` / `spiralPoint` | Projects the public board positions into the minimap path. |
| `playerColour` / `MINIMAP_COLOURS` | Stable fallback colour selection. |
| `minimapDots` | Produces position, colour, and same-tile stacking data. |
| `VolcanoMinimap` | The scene component that mounts the overlay. |

## Non-goals

- No world-space rendering, board mutations, network messages, or new host
  authority.
- No interaction or labels that compete with the existing board panel.

## How to review

1. Start a two-player Volcano Island game and finish turn order.
2. A compact **Summit route** spiral should appear at the top right, with a
   differently coloured dot for each player at start.
3. Roll for one player. The dice should tumble in 3D, settle on the shared
   result, and show its total plus each die value; that player's dot should then
   move around the spiral in both browsers.
4. Move both players to the same tile. Both dots should remain visible, one a
   little above and one a little below the route.
5. End the party. The minimap should disappear and it must never block clicks
   on the board UI.
6. Select **Summit route**. The map should collapse while the roll result stays
   visible; select it again to restore the route.

## Validation

`npm run typecheck` and `npm run test:volcano-minimap` pass. The helper tests
cover start/summit clamping, repeatable colours, and same-tile stacking.
