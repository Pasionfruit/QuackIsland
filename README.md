# Polyland

A little world of games, played in a desktop browser with a keyboard. One cast of
low-poly animals with jobs and opinions, one palette, and a shelf of games that
all share them.

The first game is **Polyland Smash** - an arena fighter played looking down on
a floating disc. Percent-based knockback, stocks, and no railings: hit someone
hard enough and they go over the rim. Six fighters who play very differently.

The second is **Duck szn** - a fixed-perspective shooting gallery in the shape
of Wii Play's range: five stages, up to eight people with a mouse each, and one
combo multiplier that everybody shares.

Seventeen more games are on the shelf as concept panels: art, pitch and planned
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
| Move (any direction) | `W` `A` `S` `D` | Arrow keys |
| Attack | `F` | `.` |
| Special | `G` | `/` |
| Aimed move | direction + `F` / `G` | direction + `.` / `/` |

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
| Duck szn panel (lobby, range) | [src/games/duck/DuckPanel.tsx](src/games/duck/DuckPanel.tsx) |
| Duck szn stages and scoring | [src/games/duck/engine/engine.ts](src/games/duck/engine/engine.ts) |
| Synthesised sound effects | [src/games/duck/audio.ts](src/games/duck/audio.ts) |
| Fighter simulation | [src/games/smash/engine/engine.ts](src/games/smash/engine/engine.ts) |
| Characters and frame data | [src/games/smash/engine/characters.ts](src/games/smash/engine/characters.ts) |
| Arena geometry | [src/games/smash/engine/stage.ts](src/games/smash/engine/stage.ts) |
| Renderer | [src/games/smash/engine/render.ts](src/games/smash/engine/render.ts) |

## The art rules

The look comes from [src/Initial_Characters.png](src/Initial_Characters.png):
upright low-poly animals, big dark eyes, warm neutral palette, soft ground
shadows. [src/Game_art.png](src/Game_art.png) is the earlier reference for the
world around them.

Everything is a **flat-shaded polygon**. There are no sprites, no textures and
no gradients on characters - each shape is meshed into a little low-poly shell
and every triangle is filled with one tone, picked by treating the shape as a
dome lit from a fixed direction and snapping the result to a tone step. Corners
are cut before any of that, because nothing in the reference art has a razor
edge. That is what `facet()` in [src/lib/draw.ts](src/lib/draw.ts) does, and it
is the whole style in one function.

Four rules keep it looking right:

- **Draw in world units, render at device resolution.** Scenes are authored in
  a 480x270 coordinate space, but the canvas backing store is sized to its real
  displayed size in device pixels by `fitScene()`. If the two do not match, the
  browser resamples the canvas and the flat shading turns to mush - that is the
  single biggest thing to get wrong here.
- **Let the facets earn their keep.** `facet()` picks how many triangles to
  spend from how big the shape lands on screen, so a head gets a moulded shell
  and a shirt button gets two tones. Dark colours get their contrast from the
  lit side rather than the shadow side, since a near-black hoodie has nowhere
  left to go in shadow.
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
description for idle, walking, swinging or taking a hit, from the side, the
front or behind, at any size.
Background animals stay on four legs (or wings) via
[critter.ts](src/art/critter.ts). A new character is a dozen colours, and every
game gets the whole cast for free.

Backdrops and set dressing live in [scenes.ts](src/art/scenes.ts) and
[props.ts](src/art/props.ts) - skies, water, treelines, rooms, tents, fires,
tanks, ghosts - so a new game's card art is usually fifteen lines.

## Polyland Smash

Damage builds a percentage; knockback scales with it, so a fresh fighter barely
budges and one at 130% skates halfway across the floor. Go over the rim and you
lose a stock. Last fighter standing wins.

Each fighter has **eight moves**: a quick poke, a committed lunge, a launcher
and a ground slam, in an attack flavour and a special flavour. Pressing a
direction with the button picks which one - the slam and the shockwave hit all
round you, everything else fires along the way you are pointed.

There is no gravity and nothing to jump onto. You slide around the floor, and a
hit sends the other player skating toward the rim - the higher their percent,
the further they go. Everything else follows from that: **weight** is how little
you slide, **deceleration** is how fast that slide bleeds off, and the whole
fight is a contest over who is standing nearer the middle.

Six fighters, no two alike:

| Fighter | Who they are | How they play |
| --- | --- | --- |
| **ContrlZee** | Raccoon programmer | Reads the floor early and is already standing where you were going |
| **NinjaPenguin** | Penguin ninja | Slides in on the diagonal, flurries you toward the rim, and is gone |
| **teninchtoenail** | Lion salesman | Heaviest thing out there; slow to cross the floor, murder to shift off it |
| **diva** | Frog fashionista | Lightest on the roster and the longest reach - she skids to a stop where others sail off |
| **MrPasionfruit** | Athletic black cat | Fastest thing here. Tiny hits, endless pressure |
| **NightShift** | Leopard night guard | Locked. One committed pounce, biggest single hit, nothing to fall back on |

`locked: true` on a `CharDef` keeps a fighter on the select screen but out of
play; `playableId()` is the guard that stops a locked id reaching a match from a
stale pick or a remote peer. Flip the flag to let NightShift in.

Frame data lives in
[characters.ts](src/games/smash/engine/characters.ts) and is meant to be tuned.
`npm run smoke` re-checks that the mechanics still hold after you change
numbers.

### Tuning the roster

**Weight is close to decisive.** In a ring-out game it sets how far a hit moves
you toward the edge, so the weight spread has to be far tighter than it would be
in a platform fighter - and a fighter who is genuinely light needs paying back
somewhere else. Diva keeps the lightest weight on the roster because she also
has the fastest deceleration: she gets launched dramatically and then skids to a
stop, where the same hit would carry someone else over the rim.

Two other things dominate, both learned the hard way on the platform version and
still true here:

- **Startup frames on the committed poke.** The CPU used to swing on a fixed
  cooldown, so whichever fighter's hitbox appeared first won every exchange -
  one frame of startup was worth about fifty points of win rate. The cooldown is
  jittered now, and the roster sits in a narrow startup band.
- **The active window.** Four active frames connect about 22% of the time
  against a moving target, five about 53%. It is a cliff, not a slope.

Balance is measured, not eyeballed: a CPU-vs-CPU round robin over every ordered
pair, which currently reads 42-58% win rate across the six. The same harness
with six identical fighters lands inside 2.5 points, so a spread wider than that
is real signal rather than noise.

### Character art

Smash fighters are drawn from sprite sheets. One sheet per character, laid out
like [src/Sprites.png](src/Sprites.png): four banded rows - movement, attacks,
specials, then recover and take-hit - with evenly spaced cells and a caption
under each. Generate a new character to that template and cut it with:

```
node scripts/slice-sprites.mjs src/YourSheet.png <character-id>
```

That writes `src/games/smash/sprites/<character-id>/` - sixteen WebP frames
plus a manifest - and Vite picks the folder up automatically. There is no
registry to edit. About 200KB per character.

The slicer does two things worth knowing about. Backgrounds are removed by
flooding in from the border rather than by keying a colour, because the sheet's
dark brown is almost exactly the colour of the character's own shadows - a
colour key eats the black half of a penguin. And it records an anchor per
frame, because cells are cropped around their effects: an attack frame is wider
on the side the slash comes out of, so drawing from the crop would make the
character slide as it swung. Anchors are found by learning the character's
palette from the effect-free movement cells, then ignoring any colour an effect
introduced.

A character with no sheet yet falls back to the procedural rig in
[avatar.ts](src/art/avatar.ts), so the cast can be converted one at a time.

### Tuning the roster

Two things dominate this engine, and neither is damage:

- **Startup frames on the committed poke.** The CPU used to swing on a fixed
  14-frame cooldown, so whichever fighter's hitbox appeared first won every
  exchange - one frame of startup was worth about fifty points of win rate, and
  it flattened every other difference between the cast. The cooldown is
  jittered now, and the roster sits in an 8-10 frame band.
- **The active window.** Four active frames connect about 22% of the time
  against a moving target, five about 53%. It is a cliff, not a slope, so every
  main poke gets the same window and the differences live in startup, end lag,
  damage and reach.

Balance was measured, not eyeballed: a CPU-vs-CPU round robin over every
ordered pair, which reads 45-55% win rate across the six. The same harness with
six identical fighters lands inside 2.5 points, so a spread wider than that is
real signal rather than noise.

**Arena: Lakeside Bluff** - one grassy disc floating in the haze, ringed with
pines and rocks and nothing else. Because the floor is an ellipse seen at an
angle, every distance is measured in normalised arena space where the rim sits
at radius 1, which keeps the ring-out check independent of the shape. Geometry
is in [stage.ts](src/games/smash/engine/stage.ts).

## Duck szn

A shooting gallery seen from one fixed camera. Point with the mouse, click to
fire. Five stages run back to back, and the multiplier belongs to the room
rather than to any one player: every hit anybody lands raises it, and any miss
by anybody puts it back to zero. With eight people on the range that turns
into a real decision about whether to take a shot at all.

| Stage | What is out there |
| --- | --- |
| 1. Balloons | Float up from the reeds at mixed speeds. One point each |
| 2. Range Targets | Pop up and drop away again. Plain is 1, gold is 3, and the painted faces cost you points *and* the combo |
| 3. Clay Pigeons | Launched from the bottom corners, shrinking as they sail off. Hit them near the glass for up to six times the points |
| 4. Tin Cans | Tossed up under gravity. Every hit punts one back into the air, dents it, and pays more than the last; the fifth bursts it. Let one land and it is simply gone |
| 5. Abduction | Saucers come down for the campers. Shoot one that is carrying somebody and you drop them safely for a large rescue bonus - let it climb off the top of the screen and they are gone |

From stage two on, the dog barks at random and a duck crosses the sky. That one
is a flat ten points, multiplier or no multiplier.

**Depth is one number.** A clay pigeon carries a `z` from 1 at the glass down to
the horizon, and it scales the drawn size and the hit radius together - so the
picture and the hit test can never disagree about how hard something is to hit.

**Eight lanes.** The host runs the gallery and broadcasts snapshots; everyone
else sends where they are pointing and when they pulled the trigger, and the
host decides what was hit. Spawns and the shared combo stay authoritative in
one place, which is what stops eight clients disagreeing about whose miss broke
the run. Wire format is in [protocol.ts](src/net/protocol.ts); the relay already
allowed eight to a room.

**The noises are synthesised**, not shipped - the project has no audio assets,
and a gallery needs feedback on every trigger pull. Oscillators and a noise
buffer in [audio.ts](src/games/duck/audio.ts), built lazily because browsers
will not start an AudioContext until the page has been clicked.

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
