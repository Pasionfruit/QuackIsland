# LocalRot

A browser 3D world, built in gated modules.

## Running it

```
npm install
npm run dev
```

**WASD** to move, **shift** to run, **space** to jump. Movement is relative to
the camera and the body turns to face wherever it is going. **V** swaps between
first and third person, or use the buttons in the panel's VIEW section. Walk into the sea and you swim - the body tips flat and turns to
face where it is going. Stop and it stands upright, treading water; walk back
out and it stands up on the sand.

**Hold left and drag** to look. **Hold right and drag** to slide the view off
the player. **Wheel** to pull back and see the whole island. **F** or the button
in the panel snaps back. A plain click, either button, never moves the camera.

Music plays in the background from `public/assets/music/`. The panel above the
day controls skips, rewinds, pauses and sets the volume; **back** restarts the
track first and goes to the previous one if pressed again straight away. To add
a song, drop it in that folder and run `npm run music:scan`. It stops the
moment either game starts and picks back up where it left off when the game
ends — unless you had paused it yourself, in which case it stays paused.

Pick the **weather** in the same panel: sunny, cloudy, rainy or snowing. It
takes a couple of seconds to come over rather than cutting, and it dims the sun
and thickens the fog as well as filling the sky — the weather lives in
`00-core` next to the tide, so the sky and the ground can never disagree about
what it is doing. Every panel section folds away.

Every panel section starts folded and remembers whether you opened it.

The panel on the right runs the day: an hour a full cycle, fifteen minutes each
in dawn, daylight, dusk and night. The **tide** runs off the same clock — two
high waters a day, of unequal height — so scrubbing the slider walks the
waterline several metres up and down the beach. Scrub the slider, jump to a named time, or
pause it. **Speed it up to 60x or 600x** if you want to watch a whole day
rather than sit through one. It also toggles modules on and off - turn the
player off to get the free orbit camera back for inspecting terrain.

## Playing together

Two browsers, **two terminals**. `npm run dev` does not start the relay, and
without it there is nothing to join:

```
npm run relay      # terminal 1 - the lobby relay on :8791
npm run dev        # terminal 2 - the game on :5173
```

Two browsers on one machine is fine - so are two windows of the same browser,
or one normal window and one private. If the relay is not running the lobby
says so, and says the command.

Open `http://localhost:5173` in two different browsers and press **LOBBY** in
the top left corner of each. One presses **create** under its own code; the
other types that code into the **or join someone** field and presses **join**.
Both players walk about the same island.

Making a lobby and joining one are two different things and have two different
spots in the popup, so nobody has to clear their own code out of the way to
type a friend's. The join field keeps working once you are in a lobby too —
type another code and you move.

Everyone in a lobby shares the host's time of day and weather, hears each
other's footsteps nearby, and leaves prints in the same sand. The host is
whoever joined first, and it hands over on its own when they leave.

The same popup picks **which game** the party is playing, and everyone in a
lobby plays the same one. The host chooses:

- **Volcano Island** — a 120-tile spiral race up a 150 m volcano on a second
  island across the water, out-of-round, with a horseshoe crater and the track
  winding three times up to the treasure at the top. It is also where the
  **minigames** live: forty-one of them planned, thirty free-for-all and
  eleven one-vs-all, twenty-six named so far and none playable yet. The **host** presses
  **minigames** in the party panel to see the lot on one screen — sand and sea
  rather than the dark HUD, a tile each, no descriptions to wade through.
  Opening one gives its own page: what it is, what you press, and a **play**
  button that counts three, two, one into the round. **Everybody in the lobby
  goes along** — guests get the same briefing and start when the host does,
  rather than picking their own. **Escape** pauses a round where it stands and
  offers to resume or leave. **Zombie Tag** is the
  first one built — six zombies chase everybody around a walled arena of
  crates, all of you spawn in the middle, and getting caught turns you into one
  of them. You move twice as fast as a zombie; **space** shoves another runner
  over for a second, on a three second cooldown. The camera never moves and sits at
  sixty degrees, so you see across the room rather than down at a map — lit
  with the island's own sun and sand, and everybody is the same capsule you
  walk the beach in, painted a colour each. Last one running wins.
- **Garden Goofs** — a flat **2D** lane defence on an eight-by-twelve lawn.
  Starting it loads a page of its own, opaque and full screen, not a dialog
  over the world — a house on the left edge marks what you are defending. The
  party picks its loadout **together** from a 7x7 shelf of forty-nine cards —
  each one an icon, a name and a price in the corner, everything else a hover
  away — seeds land on the grass and have to be clicked before they go, and
  anybody can drag an animal into any square out of the shared pot. A
  **trowel**, top right, drags onto a planted square to dig it back up — seeds
  are **not** refunded. Bottom right, a **wave count** climbs as the round
  goes on. The roster is **forty-nine defenders** — shooters, guards, growers
  and eaters, from the Pea Shooter to the Garden Gnome — against
  **twenty-five pests**, from a Mite to the Garden Gremlin. The pests do not
  walk yet, and nothing is sent on a wave when it turns. Choose **Endless**,
  **Co-op** or **Versus**, and press **escape** any time to pause and leave.

The popup runs top to bottom in the order you do things: **your name**, then
**ready up** once you are in a party, then the **code** that got you there,
then the **game**, then **start the party** — which only the host has, and only
once everybody has readied up.

A player leaving raises a note in the corner saying who left; you can dismiss
it or leave it to fade. When the host **ends the party** it is disbanded: every
player leaves the lobby and is put back on the spawn island, with a note saying
why. And anybody joining a lobby is told what the host has chosen — your own
selection is replaced by theirs the moment you arrive.

Starting Garden Goofs opens the shelf, where the party chooses its eight
animals between them — anybody can add one or take one out — and the round
waits until everybody says they are done. Then the lawn.

Starting either game hides the spawn island — its shore and rocks with it —
the instant it starts, so the game you are looking at is the only thing on
screen; it comes back the moment the party disbands. Garden Goofs takes **the
whole window** rather than sitting in a panel in the middle of it: the shelf
and the lawn size themselves to whatever room the window has, so there is
never anything to scroll, and the page is locked against pinch and double-tap
zoom so nothing shifts underneath you mid-round.

Neither game is written yet. The volcano's track and the lawn's grid are built,
the rules that go on top of them are not: nothing is planted, nothing walks in,
nothing is scored. Hold **Tab** for everyone in the lobby, their
ping and whether they are ready.

The party island is always there whatever is selected — it is a place and not
a game, so you can swim to it without joining anything. Garden Goofs is not: it
is 2D and is drawn over the world, so there is nothing of it to walk to. The
**party** dashboard under the perf panel says what is running while you play,
and gives the host a way to end it.

**[DEPLOY.md](DEPLOY.md)** has the rest: running it as one process, and putting
it on a free host.

## How this project is built

Work is divided into **phases → modules → blocks → gates**.

- A **module** is the unit of work, of review, and of freeze. One directory
  under `src/modules/`, one public contract (`index.ts`), one `MODULE.md`.
- A **gate** is a two-key lock: `npm run gate <module>` must exit 0, **and** a
  person must write PASS. Green scripts mean *ready to look at*, not *done*.
- Once a module passes it is **frozen**. Its file hashes are recorded and any
  later edit fails `npm run check:frozen`. Later modules extend it; they do not
  change it.
- A different agent builds each module, with no memory of the last one. The
  repo is the handoff: `pipeline.json` says what to do, `AGENTS.md` says how to
  work, and each module's `MODULE.md` is the interface to everyone downstream.

`pipeline.json` is the source of truth for status. Read it first.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run gate <module>` | Everything a machine can check, then prints the human checklist |
| `npm run gate:pass <module> -- "note"` | **Human only.** Passes and freezes a module |
| `npm run gate:fail <module> -- "reason"` | Sends it back with a reason the next agent will read |
| `npm run unfreeze <module> -- "reason"` | **Human only.** Reopens a frozen module and lists what must be re-verified |
| `npm run check` | Boundaries, freeze hashes, contract drift, budgets |
| `npm run test` | Vitest over every module's own tests |

## Conventions

Decided once, in `pipeline.json`, and not renegotiable inside a module:

**Metres. +Y is up. Right-handed. -Z is north. Sea level is exactly `y = 0`.**
No `Math.random` — everything derives from the seeded RNG in `00-core`, so the
world is reproducible and testable.

## Modules

| Module | What it owns |
| --- | --- |
| `00-core` | The canvas, render loop, lights, day cycle, tide, frame ordering, seeded RNG, perf HUD |
| `01-terrain` | The sandy island: height function, chunked LOD mesh, sand shading |
| `02-player` | Third-person body: walks, runs, jumps, swims, mouse-aimed camera |
| `03-footprints` | Webbed duck prints in the sand, fading, in one draw call |
| `04-water` | The sea at `y = 0`: an ocean swell, lit per fragment, one draw call |
| `05-music` | Background playlist, with a panel to skip, rewind, pause and set the volume |
| `06-sky` | Sky dome with sun, stars and cloud, and the rain and snow falling out of it |
| `07-shore` | Shells and coloured pebbles along the water line, in three draw calls |
| `08-audio` | Footsteps, jumps, landings and swim strokes |
| `09-net` | Lobbies by code, and everyone else’s body |
| `10-party` | Party island: a 120-tile spiral race to a volcano with treasure |
| `11-currency` | Fish, shells and grapes: the wallet and the readout |
| `12-rocks` | Rocks of every size, solid enough to bump into and stand on |
| `13-modes` | Which game the party is playing, and the lobby popup that chooses it |
| `14-garden` | Garden Goofs: the 2D 8x12 lawn, a shared loadout, seeds and planting |
| `15-minigames` | Volcano Island's forty-one minigames: the catalogue, the dashboard, and the seam each one plugs into |
| `16-zombie-tag` | Minigame 1: six zombies, an arena of crates, and the last one running |

Next up: a sky dome driving the day cycle that `00-core` already exposes, then
the Meshy asset pipeline and vegetation placed against the terrain's height
contract.

Sea level is owned by `01-terrain`, not by `04-water` — the water module draws
a surface at that level rather than defining it. That is why the player still
swims with the sea switched off in the panel, and it is the shape every
seam here is meant to have.

## Where Meshy fits

Nothing so far needs it: terrain is procedural geometry from a pure function,
so there is no asset and no credit spend. Meshy enters when vegetation does,
behind a cached, scripted asset pipeline with its own validation gates — never
called ad hoc, because an uncached generation is money spent with nothing to
show for it.
