# Standing brief for every agent working on this project

You have no memory of previous sessions. This repo is the memory. Read this
file, then `pipeline.json`, before anything else.

## How this project is built

Work is divided into **phases → modules → blocks → gates**.

- A **phase** is a human sequencing label. It has no directory and no rules.
- A **module** is the unit of work, of freeze, and of review. One directory
  under `src/modules/`, one public contract (`index.ts`), one `MODULE.md`,
  one gate. You will be assigned exactly one.
- A **block** is a step inside your module. It has no contract and no gate.
  Its only job is to leave a legible marker in `pipeline.json` if your
  session dies halfway.
- A **gate** is a two-key lock. Key one is `npm run gate <module>` exiting 0.
  Key two is the human writing PASS. **Neither key alone opens it.**

The rule that separates a module from a block: a module is something *later
agents depend on*; a block is something *only you depend on*.

## Your job, in order

1. Read `pipeline.json`. Find the module whose status is `in_progress`, or
   the first one that is `planned`. That module is your entire job.
2. Read your module's `MODULE.md` if it exists, and the `MODULE.md` of every
   module listed in your `dependsOn`. **Do not open any other module's files.**
   If you need something that is not in a dependency's public contract, that
   is a finding to report, not a thing to reach in and take.
3. Work through your blocks, updating their status in `pipeline.json` as you
   go. Keep everything inside your own module directory.
4. Run `npm run gate <module>`. Fix what it reports.
5. Write your `MODULE.md`. Stop, and hand over to the human.

## The rules that are actually enforced

- **Never edit a module whose status is `passed`.** It is frozen. Its file
  hashes are recorded and `npm run check:frozen` will catch you. If you
  believe a frozen module is wrong, **stop** and write the problem into your
  module's `blockers` in `pipeline.json`. Do not work around it, do not copy
  its code, do not shim over it. The human decides whether to unfreeze it.
- **Never import into another module's `internal/`.** Only `index.ts` is
  public. `npm run check:boundaries` enforces this.
- **Declare your dependencies.** Any module you import from must be listed in
  your `dependsOn`. The boundary check compares imports against that list, so
  an undeclared dependency fails the gate.
- **Never run `npm run gate:pass`.** You do not have the authority to pass
  your own work. The script will refuse you anyway.

## What you may touch outside your module

Append-only, and only what you actually need:

- `package.json` - add dependencies and your own scripts.
- `pipeline.json` - your own module's entry only.
- `src/app/scene.ts` - append one registry line for your module's component.
- `AGENTS.md`, `scripts/` - only if you are explicitly asked to.

Nothing else. In particular, `src/app/` is the composition root and is
deliberately never frozen, but it is not a dumping ground: one line per module.

## Green tests do not mean you are done

`npm run gate` proves your module is **ready for a human to look at**. It
proves no regression in frozen work and no broken contract. It does not prove
the thing looks right, feels right, or is what was asked for. Only the human
decides that. Do not describe a module as complete, finished, or passing
because the scripts are green.

## Conventions that are already decided

From `pipeline.json`, and not up for renegotiation inside a module:

- **Metres. +Y is up. Right-handed. -Z is north.**
- **Sea level is exactly y = 0.** Terrain goes negative below it.
- One world seed, in `conventions.worldSeed`. **No `Math.random` in module
  code** - use the seeded RNG from `00-core` so everything is reproducible.
- `useFrame` priorities come from `conventions.useFramePriorities` via the
  `PRIORITY` export in `00-core`. Do not invent your own numbers.
- Assets resolve through `assetUrl()` from `00-core`, never a hardcoded path.

## Asset generation (Meshy)

Only the module that owns the asset pipeline may call Meshy, and only through
the scripted, cached path. Never call the Meshy MCP server or API ad hoc: it
consumes credits, and an uncached result is money spent with nothing to show
for it. `npm run assets:plan` prints what would be generated and what it would
cost, and makes no network calls.
