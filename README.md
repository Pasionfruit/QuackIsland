# LocalRot

A browser 3D world, built in gated modules.

## Running it

```
npm install
npm run dev
```

Drag to orbit, scroll to zoom, right-drag to pan. The perf readout is top left.

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
| `00-core` | The canvas, render loop, lights, frame ordering, seeded RNG, perf HUD |
| `01-terrain` | The sandy island: height function, chunked LOD mesh, sand shading |

Next up: water at `y = 0`, then sky, then the Meshy asset pipeline and
vegetation placed against the terrain's height contract.

## Where Meshy fits

Nothing so far needs it: terrain is procedural geometry from a pure function,
so there is no asset and no credit spend. Meshy enters when vegetation does,
behind a cached, scripted asset pipeline with its own validation gates — never
called ad hoc, because an uncached generation is money spent with nothing to
show for it.
