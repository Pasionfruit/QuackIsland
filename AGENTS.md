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

1. Run `npm run brief`. It prints the conventions, the module you are on, its
   blocks, and the public contract of everything it depends on. That module is
   your entire job. **Do not read `pipeline.json` to find your work.** It is
   139KB, and 94KB of that is 52 other modules' blocks and nonGoals that you are
   forbidden to act on - reading it whole costs ~34k tokens to learn ~2k worth of
   things. Open it only to *write* your own entry.
2. Read your own module's `MODULE.md` if it exists. For each module in your
   `dependsOn`, read its `index.ts` - that file *is* the public contract, and it
   runs four to twelve times smaller than the same module's `MODULE.md`. Open a
   dependency's `MODULE.md` only when the contract alone leaves you guessing.
   **Do not open any other module's files.**
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

## Geometry is built in code

There is no asset pipeline and there is not going to be one. Every shape in this
project is procedural - 400-odd three.js primitives across the modules, and no
model-loading code anywhere. Build what you need out of geometry and keep it
inside `assetTrianglesDefault` and `assetTextureMaxPx`.

Do not reach for AI asset generation: not Meshy, not a local model, not an MCP
server that offers one. Those budgets are low-poly, which is exactly where
generated meshes are worst and procedural code is best - you would pay to make a
dense mesh and then pay again in effort to throw most of it away.

If a shape is genuinely beyond primitives - a character, say - the answer is a
CC0 asset pack, not a generator. That is the human's call, so report it as a
finding rather than adding a dependency.

## Keep the session cheap

Everything you open stays in context and is re-sent on every later turn, so a
session that starts by reading widely pays for that for the rest of its life.
Read narrowly, and read once.

- **Never read `pipeline.json` whole.** `npm run brief` is the session opener.
- **Prefer a dependency's `index.ts` to its `MODULE.md`.** Smaller, and it is
  the contract that actually binds you.
- **Do not print a whole large file to find one symbol.** Several modules run
  25-46KB - `15-minigames/internal/catalogue.ts` alone is 46KB. Grep for the
  symbol, then read the range around it.
- **Do not re-read a file you just wrote.** The edit applied or it errored.
- **Do not spawn a subagent for something one grep answers.** A subagent builds
  its context from nothing and pays full price for it.

If answering one question looks like it needs more than a couple of files, say
what you are hunting for and ask before opening them.
