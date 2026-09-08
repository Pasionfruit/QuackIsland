# LocalRot

A browser 3D world, built in gated modules.

## Running it

```
npm install
npm run dev
```

**WASD** to move, **shift** to run, **space** to jump. Movement is relative to
the camera and the duck turns to face wherever it is going. **V** swaps between
first and third person, or use the buttons in the panel's VIEW section. Walk into the sea and you swim - the body tips flat and turns to
face where it is going. Stop and it stands upright, treading water; walk back
out and it stands up on the sand.

**Hold left and drag** to look. **Hold right and drag** to slide the view off
the player. **Wheel** to pull back and see the whole island. **F** or the button
in the panel snaps back. A plain click, either button, never moves the camera.

Music plays in the background from `public/assets/music/`. The panel above the
day controls skips, rewinds, pauses and sets the volume; **back** restarts the
track first and goes to the previous one if pressed again straight away. To add
a song, drop it in that folder and run `npm run music:scan`.

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

Two browsers, two terminals:

```
npm run relay      # the lobby relay on :8791
npm run dev        # the game on :5173
```

Open `http://localhost:5173` in two different browsers, press **new** for a
code in one, type it into the other, and press **join** in both. Both ducks
walk about the same island.

Everyone in a lobby shares the host's time of day and weather, hears each
other's footsteps nearby, and leaves prints in the same sand. The host is
whoever joined first, and it hands over on its own when they leave.

The **party** dashboard is under the perf panel, top left. The host opens a
board game, everybody presses ready, and the host starts it — which puts
everyone on a shared island in the sky. Hold **Tab** for everyone in the lobby,
their ping and whether they are ready.

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
| `02-player` | Third-person duck: walks, runs, jumps, swims, mouse-aimed camera |
| `03-footprints` | Webbed duck prints in the sand, fading, in one draw call |
| `04-water` | The sea at `y = 0`: an ocean swell, lit per fragment, one draw call |
| `05-music` | Background playlist, with a panel to skip, rewind, pause and set the volume |
| `06-sky` | Sky dome with sun, stars and cloud, and the rain and snow falling out of it |
| `07-shore` | Shells and coloured pebbles along the water line, in three draw calls |
| `08-audio` | Footsteps, jumps, landings and swim strokes |
| `09-net` | Lobbies by code, and everyone else’s duck |
| `10-party` | Host a board game, everyone readies, all move to an island in the sky |
| `11-currency` | Fish, shells and grapes: the wallet and the readout |

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
