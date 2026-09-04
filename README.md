# Polyland

A little world of games, played in a desktop browser with a keyboard. One cast of
low-poly animals with jobs and opinions, one palette, and a shelf of games that
all share them.

The first game is **Polyland Smash** - a platform fighter in the shape of Smash
Ultimate / Brawlhalla: percent-based knockback, stocks, blast zones,
drop-through platforms, and five fighters who play very differently.

Eighteen more games are on the shelf as concept panels: art, pitch and planned
mechanics, no implementation yet. They all live in
[src/games/registry.ts](src/games/registry.ts) and share one panel template.

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
fighter. Online players each use the *left-hand* keys on their own keyboard.

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
| Character rig and cast | [src/art/avatar.ts](src/art/avatar.ts), [src/art/cast.ts](src/art/cast.ts) |
| Background animal rigs | [src/art/critter.ts](src/art/critter.ts) |
| Backdrops and set dressing | [src/art/scenes.ts](src/art/scenes.ts) |
| Drawing primitives and facet shading | [src/lib/draw.ts](src/lib/draw.ts) |
| Panel template for unbuilt games | [src/games/TemplatePanel.tsx](src/games/TemplatePanel.tsx) |
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

The look comes from [src/Initial_Characters.png](src/Initial_Characters.png):
upright low-poly animals, big dark eyes, warm neutral palette, soft ground
shadows. [src/Game_art.png](src/Game_art.png) is the earlier reference for the
world around them.

Everything is a **flat-shaded polygon**. There are no sprites, no textures and
no gradients on characters - each shape is filled in a base tone, then split
into a lit facet and a shadow facet along a fixed light direction. That split
is what `facet()` in [src/lib/draw.ts](src/lib/draw.ts) does, and it is the
whole style in one function.

Three rules keep it looking right:

- **Draw in world units, render at device resolution.** Scenes are authored in
  a 480x270 coordinate space, but the canvas backing store is sized to its real
  displayed size in device pixels by `fitScene()`. If the two do not match, the
  browser resamples the canvas and the flat shading turns to mush - that is the
  single biggest thing to get wrong here.
- **Shade in world space, not local space.** Characters are authored facing
  right and then flipped, but the shading happens after placement, so the light
  stays in the same corner of the screen no matter which way somebody faces or
  how far they are tumbling.
- **Colours are derived, not listed.** `shade(colour, amount)` warms toward
  cream or cools toward brown, so a character needs one colour per material rather
  than a palette of hand-picked tints.

A character is data, not a sprite sheet: a species, a coat, a muzzle, a tail, an
outfit and a carried item, in [cast.ts](src/art/cast.ts). One rig draws all of
them - a raccoon and a penguin differ by a head shape, a pair of ears and a
tail, not by a separate drawing routine - and `drawAvatar` poses that same
description for idle, walking, jumping, swinging or tumbling, at any size.
Background animals stay on four legs (or wings) via
[critter.ts](src/art/critter.ts). A new character is a dozen colours, and every
game gets the whole cast for free.

Backdrops and set dressing live in [scenes.ts](src/art/scenes.ts) and
[props.ts](src/art/props.ts) - skies, water, treelines, rooms, tents, fires,
tanks, ghosts - so a new game's card art is usually fifteen lines.

## Polyland Smash

Damage builds a percentage; knockback scales with it, so a fresh fighter barely
budges and one at 130% flies. Leave the blast zone and you lose a stock. Last
fighter standing wins.

Each has five moves - neutral, side, up and down attacks, plus a special that
doubles as the recovery. The special throws you upward and leaves you helpless
until you land, so spending it early off-stage is how you die.

Five fighters, no two alike:

| Fighter | Who they are | How they play |
| --- | --- | --- |
| **ContrlZee** | Raccoon programmer | Sets up two moves early, then runs it. Slow, heavy hits |
| **NinjaPenguin** | Penguin ninja | Belly-slides in, flurries you down, gone before the dust settles |
| **teninchtoenail** | Lion salesman | Slowest on the roster; the briefcase closes every conversation |
| **diva** | Frog fashionista | Floaty, three jumps, longest reach, unkillable off-stage |
| **MrPasionfruit** | Athletic black cat | Fastest thing here. Tiny hits, endless combos |

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
