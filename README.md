# Polyland

A little world of games, played in a desktop browser with a keyboard. One cast of
low-poly animals with jobs and opinions, one palette, and a shelf of games that
all share them.

The first game is **Polyland Smash** - a platform fighter on the classic
three-platform stage, seen from the side. Percent-based knockback, stocks,
jumping, shielding and dodging: hit someone hard enough and they fly off the
stage. Nine fighters who play very differently.

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
Polyland Smash adds a jump (a tap of `W` / the up arrow), a shield (`R` for
player 1, `,` for player 2) and dodges cancelled out of it - see
[Polyland Smash](#polyland-smash) below.

Every one of these is rebindable. Smash, Hide & Seek and Tank Trouble each
have a **Controls** panel in-game: click an action, press the key you want it
on. A rebind is saved to `localStorage` under a `game.action` key (see
[lib/controls.ts](src/lib/controls.ts)) and read through wherever that game
already checked `KeyboardEvent.code`, so nothing about a game's own input
handling had to change beyond that one lookup. `ControlsSettings` in
[src/components/ControlsSettings.tsx](src/components/ControlsSettings.tsx) is
the shared remap UI every game's panel renders - a new game just needs to
list its own actions and defaults, not build its own rebinding screen.

**Online.** On the same Wi-Fi, `npm run dev:all` prints a LAN address for
everyone to open. Over the open internet, deploy it (see below) and hand out
the one public URL instead. Either way it works the same: whoever is hosting
opens the game, clicks **Host game**, and reads out the four-letter code.
Everyone else opens the address, enters the code, and picks a fighter. Online
players each use the *left-hand* keys on their own keyboard.

How it works: the host's browser runs the match and broadcasts the state sixty
times a second; guests send only their key state back. The server in
[server/](server/index.mjs) never simulates anything - it hands out room codes
and forwards payloads - so a new Polyland game can use it unchanged.

```
guest keys ──▶ relay ──▶ host browser (the simulation)
                          │
     guest screen ◀── relay ◀── snapshot, 60x a second
```

In dev, the relay listens on `8787` as plain `ws://`, separate from Vite's
port. A deployed instance serves the built site and the relay together from
one port (`npm start`), over `wss://` once the host gives you TLS. There is
still no auth on a room - anyone with the four-letter code can join it, which
is the point, but it does mean codes are the only thing standing between a
room and a stranger.

## Deploying it for real

`npm start` (after `npm run build`) runs [server/index.mjs](server/index.mjs)
as a single Node process that serves the built site *and* the WebSocket relay
on whatever port the host gives it via `$PORT` - which is the shape every free
Node host expects. [Render](https://render.com)'s free web-service tier is a
good fit: it keeps a process running (not just serverless functions, which
can't hold the relay's open sockets) and speaks WebSocket out of the box.

1. Push this repo to GitHub.
2. On Render: **New > Web Service**, point it at the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Leave the port alone - Render sets `$PORT` itself and `server/index.mjs`
   already reads it (`process.env.PORT`).

Render gives you a `https://your-app.onrender.com` URL; the client picks up
`wss://` automatically from the page's own origin (see `defaultServerUrl()` in
[src/net/client.ts](src/net/client.ts)), so there is nothing to configure by
hand. The same recipe works on any host that runs a persistent Node process
and lets you set a start command (Railway, Fly.io, a VPS, etc.) - Vercel and
Netlify will not work here since their free tiers are serverless and cannot
hold a long-lived WebSocket connection.

The free tier sleeps after inactivity, so the first person to open the link
after a quiet spell waits 30-60 seconds for it to wake up - normal, not a
bug. Once it is deployed, testing with real friends (or two browsers on your
own machine) is just opening that one URL twice.

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
| Case Closed panel (lobby, board, notepad) | [src/games/caseclosed/CaseClosedPanel.tsx](src/games/caseclosed/CaseClosedPanel.tsx) |
| Case Closed board graph and rooms | [src/games/caseclosed/engine/board.ts](src/games/caseclosed/engine/board.ts) |
| Case Closed match rules | [src/games/caseclosed/engine/engine.ts](src/games/caseclosed/engine/engine.ts) |
| Build & Betray panel (lobby, build, run, results) | [src/games/buildbetray/BuildBetrayPanel.tsx](src/games/buildbetray/BuildBetrayPanel.tsx) |
| Build & Betray piece pool | [src/games/buildbetray/engine/pieces.ts](src/games/buildbetray/engine/pieces.ts) |
| Build & Betray course, placement rules and validator | [src/games/buildbetray/engine/level.ts](src/games/buildbetray/engine/level.ts) |
| Build & Betray round state machine, physics and scoring | [src/games/buildbetray/engine/engine.ts](src/games/buildbetray/engine/engine.ts) |

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
budges and one at 130% flies off the stage. Cross any of the four blast zone
edges - off either side, off the top, or down through the gap under the stage -
and you lose a stock. Last fighter standing wins.

Each fighter has **eight moves**: a quick poke, a committed lunge, a launcher
and a ground slam, in an attack flavour and a special flavour. Pressing a
direction with the button picks which one - the slam and the shockwave hit all
round the fighter, an up move always hits straight up and a down move straight
down regardless of which way you are facing, and everything else fires along
the way you are pointed. Every move works the same in the air as on the ground -
there is no separate set of aerials.

The stage is the classic three-platform layout: one solid ground and two
smaller floating platforms above it, symmetric left and right. Gravity pulls
everyone down onto whichever platform is under them. A tap of up is a jump -
there is nothing to walk "up" to on flat ground, so the same key doubles as
the jump button - and a second jump is available before you land again. A tap
of down on one of the two floating platforms drops you through it.

A tap of shield raises it - block a hit and you take no damage, but you are
locked in place for a beat afterward. Land the block in the first few frames
of raising the shield instead and it is a **parry**: no damage, no lock, and
the attacker is the one left exposed. While shielding, a direction cancels
into a roll and down cancels into a spot dodge, both fully invulnerable for
their duration; pressing shield with nothing under you is an air dodge instead,
since there is no shield in the air. **Weight** is how little a hit launches
you and **deceleration** is how fast that launch bleeds off - the fight is a
contest over who controls the middle platform and who is stuck recovering from
the edges.

Nine fighters, no two alike:

| Fighter | Who they are | How they play |
| --- | --- | --- |
| **ContrlZee** | Raccoon programmer | Reads the floor early and is already standing where you were going |
| **NinjaPenguin** | Penguin ninja | Slides in on the diagonal, flurries you toward the rim, and is gone |
| **teninchtoenail** | Lion salesman | Heaviest thing out there; slow to cross the floor, murder to shift off it |
| **diva** | Frog fashionista | Long reach and a fast skid to a stop where others sail off |
| **MrPasionfruit** | Athletic black cat | Tiny hits, endless pressure |
| **Wandering Honeybee** | Backpacker | Middle of the road on every stat - the roster's baseline |
| **Frolicking Cheetah** | Sprinter | Fastest and lightest on the roster; a hit sends her flying just as fast |
| **Tuxedo Cat** | Romantic | Heaviest and slowest of the new arrivals, but her reach and damage make you come to her |
| **NightShift** | Leopard gym rat | One committed pounce, biggest single hit, nothing to fall back on |

`locked: true` on a `CharDef` keeps a fighter on the select screen but out of
play, and `playableId()` is the guard that stops a locked id reaching a match
from a stale pick or a remote peer - useful if a future fighter needs to ship
before its art or balance is ready. Nobody on the roster is locked right now.

Seven of the nine draw from real sprite sheets rather than the procedural rig
(see [Character art](#character-art) below); ContrlZee and MrPasionfruit are
still procedural - MrPasionfruit's reference sheet is dark-on-dark enough that
automated background removal cannot separate the two, not that the art was
never made. See the note there before assuming it just hasn't been done yet.

Frame data lives in
[characters.ts](src/games/smash/engine/characters.ts) and is meant to be tuned.
`npm run smoke` re-checks that the mechanics still hold after you change
numbers.

### Tuning the roster

**Weight is close to decisive.** It sets how far a hit launches you toward a
blast zone, so the spread across the roster has to stay tight - a fighter who
is genuinely light needs paying back somewhere else. Diva keeps the lightest
weight of the original six because she also has the fastest deceleration: she
gets launched dramatically and then skids to a stop, where the same hit would
carry someone else off the stage. Cheetah goes further still - lighter than
diva, and faster too - which is exactly the kind of combination this roster
otherwise avoids on purpose; she earns it back with the least power on the
whole roster.

Two other things dominate, both learned the hard way on the platform version and
still true here:

- **Startup frames on the committed poke.** The CPU used to swing on a fixed
  cooldown, so whichever fighter's hitbox appeared first won every exchange -
  one frame of startup was worth about fifty points of win rate. The cooldown is
  jittered now, and the roster sits in a narrow startup band.
- **The active window.** Four active frames connect about 22% of the time
  against a moving target, five about 53%. It is a cliff, not a slope.

Balance is measured, not eyeballed: `npm run balance` plays a CPU-vs-CPU round
robin over every ordered pair (see [scripts/balance.mjs](scripts/balance.mjs)),
which currently reads roughly 40-58% win rate across the nine - a wider band
than the original six-fighter cast alone, since folding three new fighters in
naturally perturbs everyone else's overall record even where individual
matchups stay reasonable.

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

A reference sheet that tiles several characters' full movesets into one image
- a grid of panels, each laid out like the template above but compressed under
its own title - goes through `scripts/slice-sprite-panels.mjs` instead, given a
small JSON config naming each panel's pixel rectangle and output id (see
`scripts/sprite-configs/*.json` for real examples). It shares its cropping core
with `slice-sprites.mjs` via `scripts/lib/sprite-cut.mjs`.

**A hard limit worth knowing about:** background removal works by colour
distance, which assumes a character's own colours are different enough from
the background to tell apart. A character whose clothing or fur is nearly the
same near-black as the sheet's own vignette - MrPasionfruit's reference sheet,
in this cast - has no edge for that to find: the flood leaks straight through
with nothing to stop it, eroding holes clean through solid fabric rather than
leaving anything fixable with a tolerance tweak. `cut()`'s `protectMargin`
option papers over a *mild* case of this (trust the ink-tightened box's own
geometry for the interior, only let the colour key touch a rim around it -
see NightShift, whose sheet has the same problem to a lesser degree and ends
up a little boxier in a few dynamic poses for it) but does not rescue a sheet
where even the box-finding itself collapses. Regenerating the art against a
lighter background is the real fix.

Portraits - the still, painted card each fighter shows on the select screen -
are a separate, simpler thing: just a rectangular crop with its background
left in (see `src/games/smash/portraits.ts` and the `portraits/` folder),
since a portrait is never composited over the arena floor the way an in-match
sprite is.

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

Balance was measured, not eyeballed: `npm run balance` plays a CPU-vs-CPU round
robin over every ordered pair, which currently reads roughly 40-58% win rate
across the nine fighters - see [Character art](#character-art) above for the
`npm run balance` tool itself and why the band widened once three more
fighters joined the original six.

**Arena: Lakeside Bluff** - a wide grassy ground with two smaller platforms
floating above it, symmetric left and right, pines and rocks tucked along the
ground's edges. Geometry - the three platforms and the four blast zone edges -
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

## Case Closed

Basically Clue, with the camp cast standing in for the mansion guests. Nine
rooms on a 3x3 grid, connected by hallways and four secret passages between
opposite corners, for 3-6 investigators.

**The relay is not dumb here, on purpose.** Every other game in this project
treats the server as a pipe: it never looks at message contents, so a host's
browser can safely run the whole match. Clue cannot work that way - the host
is also a player, and if the host's own client shuffled the deck or graded
accusations, the host could simply read its own memory to cheat. So the
server itself deals: it holds the solution, shuffles the rest of the deck,
and mails each seat its hand as a `relay` message targeted at just that one
socket (`to: [slot]` in [protocol.ts](src/net/protocol.ts), handled in
[server/index.mjs](server/index.mjs)). It is also the only party that ever
sees the solution before the match ends, so it is the only party that can
grade an accusation. Turn order, positions and the public suggestion log stay
host-authoritative and broadcast as normal - the server's involvement is
narrowly scoped to the two things a peer cannot be trusted with.

**Movement is a graph, not a pixel grid.** Rooms and hallway cells are nodes
in an adjacency map; `reachableNodes()` in
[engine/board.ts](src/games/caseclosed/engine/board.ts) walks it for a given
die roll, a hallway cell holds at most one token and blocks pass-through when
occupied, and entering a room always ends the move even with steps to spare,
matching the real board game.

**Disproving a suggestion needs no round trip through the host.** The
clockwise order of who checks next is public data, so every client computes
the same sequence and pointer independently from the synced engine state
(`suggest()`/`reportCheck()` in
[engine/engine.ts](src/games/caseclosed/engine/engine.ts)) - whoever the
pointer names checks their own hand locally and broadcasts only yes or no,
which is what advances the pointer for everyone else. If the answer is yes,
the actual card goes straight from the checker to the suggester over a
targeted relay message that nobody else in the room ever receives.

The notepad each investigator sees is local-only React state, cycling a cell
between blank, yes and no on click - it is never sent anywhere, on the theory
that your notes are exactly the one piece of information a browser's
devtools was never going to expose anyway.

## Build & Betray

Everyone builds onto one shared course at once, then everyone has to cross
it. Fifteen pieces across platforms, hazards, movement and traps, a small
hand dealt to each player every round; two to eight players, host-authoritative
like everything else here even though a good half of the fun is players
sabotaging each other in real time.

**There is always a boring, safe way across, before anyone builds anything.**
A plain bridge already spans the gap between the spawn ledge and the goal
ledge (`BASE_BRIDGE` in [engine/level.ts](src/games/buildbetray/engine/level.ts)),
so a course can never actually become impossible - the real validator
(`reachable()`, a loose BFS over jump-reach distance) exists as a safety net
for the rare case somebody walls off that bridge entirely, not as the thing
that makes a course interesting. What players build is what makes a round
worth playing: faster routes, shortcuts only the builder knows are safe, and
hazards placed just past the landing they know everyone else will take.

**Most of a course's danger is a pure function of the match frame, not stored
state.** A saw's spin, a moving platform's position, a fire hazard's on/off
flare - none of it is simulated or ticked; it is computed straight from the
shared `frame` counter every time it is read (`movingOffset()`/`fireFlared()`
in [engine/engine.ts](src/games/buildbetray/engine/engine.ts)). Only the
handful of pieces with real memory - a breakable or fake platform that has
been stepped on once, a triggered trap winding up to pop - carry any mutable
state at all, and that is exactly the state that rides in the snapshot.

**The camera never moves.** The whole course fits inside one fixed 480x270
view, the same "shared bounds" idea Smash's arena uses - with up to eight
players on screen at once, panning or zooming to follow the action would cost
more in readability than it would buy in spectacle.

A guest sends movement input and placement/ready/vote requests and renders
whatever snapshot last arrived - there is no client-side prediction for a
guest's own character yet, the same trade-off Hide & Seek and Duck szn already
make at up to eight players. It reads fine for a casual platformer; smoother
guest movement, more maps, a real Chaos-mode content pass, and actual audio
are the natural next steps, not blockers for a first playable version.

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
disconnects all work. It also bundles the Case Closed board and match engine
and checks reachability, secret passages, turn order, suggestion/disprove
resolution, wrong and winning accusations, and snapshot round-tripping. And it
bundles Build & Betray's pieces, course and match engine, checking placement
rules and the anti-grief hazard cap, the build/preview/run/results/next-round
state machine, gravity/jumping/landing, hazard kills with betrayal credit,
the goal and its scoring, Classic and Quick Play win conditions, and snapshot
round-tripping.
