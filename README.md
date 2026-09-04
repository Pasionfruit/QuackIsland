# Polyland

A little camp of games, played in a desktop browser with a keyboard. One cast of
low-poly campers, one palette, and a shelf of games that all share them.

The first game is **Polyland Smash** - a platform fighter in the shape of Smash
Ultimate / Brawlhalla: percent-based knockback, stocks, blast zones,
drop-through platforms, and two campers who play very differently.

Two people can always play on one keyboard. Anything on the shelf can also be
hosted, so friends join with a four-letter room code.

```
npm install
npm run dev:all   # app + relay server, prints the address to share
npm run dev       # app only
npm run server    # relay only
npm run smoke     # headless engine + netcode tests
npm run build     # typecheck + production bundle
```

## Playing together

**Same keyboard.** Player 1 uses the left-hand keys, player 2 the arrow cluster.
No setup, no menu to find - it is the house rule for every Polyland game.

| | Player 1 | Player 2 |
| --- | --- | --- |
| Move | `A` / `D` | `<` / `>` |
| Jump (double) | `W` | `Up` |
| Drop through / fast fall | `S` | `Down` |
| Attack | `F` | `.` |
| Recovery special | `G` | `/` |

`Esc` pauses, `R` rematches from the results screen, `F1` shows hitboxes.

**Online.** Run `npm run dev:all` - it prints your LAN address. Whoever is
hosting opens the game, clicks **Host game**, and reads out the four-letter
code. Everyone else opens the same address, enters the code, and picks a
camper. Online players each use the *left-hand* keys on their own keyboard.

How it works: the host's browser runs the match and broadcasts the state sixty
times a second; guests send only their key state back. The server in
[server/](server/index.mjs) never simulates anything - it hands out room codes
and forwards payloads - so a new Polyland game can use it unchanged.

```
guest keys ──▶ relay ──▶ host browser (the simulation)
                          │
     guest screen ◀── relay ◀── snapshot, 60x a second
```

The relay listens on `8787`. It is plain `ws://` on a trusted local network -
there is no auth and no TLS, so do not expose it to the open internet as-is.

## What is here

| Area | Path |
| --- | --- |
| Dashboard (game shelf + roster) | [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) |
| Game catalogue and card art | [src/games/registry.ts](src/games/registry.ts) |
| Shared camper artwork | [src/art/avatar.ts](src/art/avatar.ts), [src/art/cast.ts](src/art/cast.ts) |
| Scenery pieces (tents, pines, fire, pets) | [src/art/props.ts](src/art/props.ts) |
| Palette | [src/art/palette.ts](src/art/palette.ts) |
| Two-player keyboard, shared by all games | [src/lib/input.ts](src/lib/input.ts) |
| Netplay client and wire format | [src/net/](src/net/) |
| Relay server | [server/index.mjs](server/index.mjs) |
| Smash panel (lobby, select, arena) | [src/games/smash/SmashPanel.tsx](src/games/smash/SmashPanel.tsx) |
| Fighter simulation | [src/games/smash/engine/engine.ts](src/games/smash/engine/engine.ts) |
| Characters and frame data | [src/games/smash/engine/characters.ts](src/games/smash/engine/characters.ts) |
| Map geometry | [src/games/smash/engine/stage.ts](src/games/smash/engine/stage.ts) |
| Renderer | [src/games/smash/engine/render.ts](src/games/smash/engine/render.ts) |

## The art rules

The look comes from [src/Game_art.png](src/Game_art.png): faceted low-poly
chibi campers, big dark eyes, warm neutral palette, soft ground shadows.

Everything is drawn into a 480x270 buffer and scaled up with
`image-rendering: pixelated`, so the reference style is rendered *as pixel art*.
Two consequences before you add anything:

- **No canvas paths.** `ctx.fill()` anti-aliases and breaks the look. Polygons
  go through `fillPoly` in [src/lib/pixel.ts](src/lib/pixel.ts), which
  scanline-fills whole pixels.
- **No webfont inside the canvas.** In-game text uses the 5x7 bitmap font in
  [src/lib/font.ts](src/lib/font.ts). The DOM around the canvas uses
  Press Start 2P.

A camper is data, not a sprite sheet: skin, hair style, outfit, hat and a
carried item, in [cast.ts](src/art/cast.ts). `drawAvatar` poses that same
description for idle, walking, jumping, swinging or tumbling, at any size - so a
new camper is a dozen colours, and any game gets the whole cast for free.

## Polyland Smash

Damage builds a percentage; knockback scales with it, so a fresh camper barely
budges and one at 130% flies. Leave the blast zone and you lose a stock. Last
camper standing wins.

Each has five moves - neutral, side, up and down attacks, plus a special that
doubles as the recovery. The special throws you upward and leaves you helpless
until you land, so spending it early off-stage is how you die.

- **Basil**, the camp cook: middleweight and quick, with a cast-iron pan that
  ends exchanges if it lands.
- **Juniper**, the long-hauler: slow and heavy, but the walking staff
  out-ranges everything.

Frame data lives in
[characters.ts](src/games/smash/engine/characters.ts) and is meant to be tuned.
`npm run smoke` re-checks that the mechanics still hold after you change
numbers.

**Map: Lakeside Camp** - one grassy bluff with a walled underside, three
drop-through plank platforms, a tent and a fire. Geometry is in
[stage.ts](src/games/smash/engine/stage.ts).

## Adding a game

1. Add an entry to `GAMES` in [src/games/registry.ts](src/games/registry.ts)
   with an `art(ctx, frame)` painter for its 160x90 card.
2. Build a panel under `src/games/<id>/`. Use `Keyboard` from
   [src/lib/input.ts](src/lib/input.ts) for two-players-one-keyboard, and
   `NetClient` from [src/net/client.ts](src/net/client.ts) for host/join.
3. Wire it into the route switch in [src/App.tsx](src/App.tsx).

Routing is a hash router, so `#/game/smash` deep-links straight into a game.

## Tests

`npm run smoke` bundles the DOM-free engine with esbuild and drives it from
Node: movement, jumps, hit detection, knockback scaling with percent and weight,
blast-zone KOs, stocks, recovery and helpless states, platform behaviour, and
the CPU. It then checks that a snapshot round-trips into a guest's engine, and
boots the real relay server to prove that hosting, joining, relaying and host
disconnects all work.
