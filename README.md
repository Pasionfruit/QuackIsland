# Polyland

A pixel-art arcade for a cast of polygon characters. One dashboard, one shared
roster, and a growing shelf of games that reuse it.

The first game is **Polyland Smash** - a platform fighter in the shape of
Smash Ultimate / Brawlhalla: percent-based knockback, stocks, blast zones,
drop-through platforms and two fighters with very different movesets.

```
npm install
npm run dev      # http://localhost:5173
npm run smoke    # headless engine tests
npm run build    # typecheck + production bundle
```

## What is here

| Area | Path |
| --- | --- |
| Dashboard (game shelf + roster) | [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) |
| Game catalogue and card art | [src/games/registry.ts](src/games/registry.ts) |
| Smash panel (select screen, arena, move lists) | [src/games/smash/SmashPanel.tsx](src/games/smash/SmashPanel.tsx) |
| Fighter simulation | [src/games/smash/engine/engine.ts](src/games/smash/engine/engine.ts) |
| Characters and frame data | [src/games/smash/engine/characters.ts](src/games/smash/engine/characters.ts) |
| Stage geometry | [src/games/smash/engine/stage.ts](src/games/smash/engine/stage.ts) |
| Renderer | [src/games/smash/engine/render.ts](src/games/smash/engine/render.ts) |
| Pixel primitives + 5x7 bitmap font | [src/lib/](src/lib/) |

## The pixel rule

Everything is drawn into a 480x270 canvas and scaled up with
`image-rendering: pixelated`. Two consequences worth knowing before you add art:

- **No canvas paths.** `ctx.fill()` anti-aliases, which breaks the look.
  Polygons go through `fillPoly` in [src/lib/pixel.ts](src/lib/pixel.ts), which
  scanline-fills whole pixels.
- **No webfont in the canvas.** In-game text uses the 5x7 bitmap font in
  [src/lib/font.ts](src/lib/font.ts). The DOM around the canvas uses
  Press Start 2P.

Characters are regular polygons, so a new fighter is mostly a data entry:
number of sides, radius, palette, physics numbers, and five moves.

## Polyland Smash

### Controls

| | Player 1 | Player 2 |
| --- | --- | --- |
| Move | `A` / `D` | `<` / `>` |
| Jump (double) | `W` | `Up` |
| Drop through / fast fall | `S` | `Down` |
| Attack | `F` | `.` |
| Recovery special | `G` | `/` |

`Esc` pauses, `R` rematches from the results screen, `F1` toggles the hitbox
view.

### Rules

Damage builds a percentage; knockback scales with it, so a fresh fighter barely
budges and one at 130% flies. Leave the blast zone and you lose a stock. Last
fighter with stocks wins.

Each fighter has five moves: neutral, side, up and down attacks, plus a special
that doubles as the recovery - it launches you upward and leaves you helpless
until you land, so spending it early off-stage is how you die.

- **Vex**, the triangle: light and fast with a huge recovery. Wins by touching
  you constantly and dies to one clean hit.
- **Grum**, the hexagon: slow, heavy, and every button kills. Struggles to get
  back on stage.

Frame data lives in [characters.ts](src/games/smash/engine/characters.ts) - it
is meant to be tuned. `npm run smoke` re-checks that the mechanics still hold
after you change numbers.

### Stage

**Prism Point**: one solid island with a walled underside plus three
drop-through platforms. Geometry is in
[stage.ts](src/games/smash/engine/stage.ts); adding a second stage means adding
another `Stage` object and letting the select screen pick it.

## Adding a game

1. Add an entry to `GAMES` in [src/games/registry.ts](src/games/registry.ts)
   with a `art(ctx, frame)` painter for its 160x90 card.
2. Build a panel component under `src/games/<id>/`.
3. Wire it into the route switch in [src/App.tsx](src/App.tsx).

Routing is a hash router, so `#/game/smash` deep-links straight into a game.
