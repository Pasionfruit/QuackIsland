# 15-minigames

## What this is

The minigames Volcano Island is made of: **forty-one of them**, thirty
free-for-all and eleven one-vs-all, as a catalogue you can browse and a seam
each one plugs into when somebody builds it.

It plays none of them. What it owns is the part that has to be right *before*
forty-one of anything can be built:

- **one list** that is the plan, including the slots nobody has named yet,
- **one place** a finished game registers itself,
- **one screen** that draws whichever game is open,
- **one template** for every game that has not been written, which today is all
  of them.

Building a minigame is `registerMinigame(id, { newGame, Panel })`. Nothing else
in this module changes, and nothing in it ever learns which game it was.

## Forty-one slots, and why the empty ones are in the list

The numbers are the ones the games were written down with, and they do not
move. Somebody says "let us do fourteen next" and fourteen has to still be
*He's One Shot* a month later, so a number is a permanent handle rather than a
position in an array.

That is also why a slot nobody has named is a **reserved entry with a number**
rather than a gap. The catalogue is the plan, the dashboard draws the plan, and
the distance between what is planned and what exists is the single most useful
thing a dashboard of templates can show you. Twenty-six of the forty-one are
named; fifteen are free slots waiting for one.

| | free-for-all | one-vs-all | total |
| --- | --- | --- | --- |
| Named | 23 | 3 | 26 |
| Free slots | 7 | 8 | 15 |
| **Target** | **30** | **11** | **41** |

Twelve of the twenty-six arrived with their controls already written down;
the other fourteen did not, and their templates say so.

**The numbering has a seam in it, and it is deliberate.** Numbers 1–30 are the
ones the games arrived with: 1–25 free-for-all, 26–30 one-vs-all. The targets
are 30 and 11, which needs eleven more slots than that list had, so those are
numbered 31–41 and carry on from where it stopped. The upshot is that neither
kind has a contiguous run of numbers, which is the price of never renumbering a
game somebody has already learned the number of.

## The three stages every game is built in

Every minigame is built the same way, in the same order, and a game can sit
half built without being broken. That is what makes forty-one of them
tractable: none of them is a single lump of work.

| Stage | What it is |
| --- | --- |
| `environment` | The state the game keeps, and the place it happens in. What there is, where it is, and what changes over a round. |
| `controls` | The inputs wired into that state. What a player presses, and what it does to what the first stage built. |
| `assets` | Models, sprites, sound. Last, because a game that is not fun with capsules will not be fun with models. |

**The order is a dependency order, not a preference.** Controls wired to an
environment that does not exist are controls nobody can test, so `nextStep`
returns the first unfinished stage rather than the furthest along - a game that
somehow got its assets first is still owed its environment.

A game with all three done is `playable`; a slot nobody has named is
`reserved` and has no stages to do at all. Every tile on the dashboard carries
three pips, so the whole plan reads as a progress bar without anybody having to
read a word of it.

A test asserts that nothing has started yet. It is meant to fail the day a
stage is finished, and on that day it is the thing to edit.

## Each minigame keeps its own state

`newGame` returns `unknown`, on purpose. Zombie Tag has six zombies and a
shrinking list of survivors; Perfect Game has thirty crabs and the angle of a
coconut; there is no useful type that is both, and inventing one would mean
forty-one games sharing a shape that fits none of them.

So the game that registers a build owns both halves of it - the state and the
panel that draws it - which makes it the one place that can narrow its own
state, and the one place that should. What the module holds in common is the
wrapper, `MinigameRun`: which game it is, whether it is being briefed, played
or over, and the state itself as an opaque value it never looks inside.

There is a test that registers two fake games with completely different state
shapes and checks both come back intact, because that is the property the whole
arrangement exists to have.

## The dashboard

Forty-one tiles in a seven-wide grid, filterable to one kind or the other, with
a count of what is named against what is planned.

**A tile is a number, a name and three pips, and nothing else.** No
description: forty-one paragraphs at once is a wall of text nobody reads, and
the grid is there to pick a game rather than to read about one. What a game
actually is lives behind its own screen.

**It never scrolls**, the same as Garden Goofs next door and for the same
reason: the rows share out whatever height is left under the bar, so filtering
to eleven games makes the tiles taller rather than making the page shorter. It
is a page - opaque, every edge of the window - not a panel floating over the
world.

Reserved slots are drawn faint rather than left out, and they open like any
other tile. The screen behind one is where its name will go.

## It looks like the island, not like the debug panel

The rest of the interface is dark slate and monospace because it is
instrumentation: a frame counter wants to be legible and ignorable. A wall of
party games is the opposite thing, so this is sand, sea and sun - see `ISLAND`
in `look.ts` - in a rounded face, with nothing square on it and no colour that
is not on a beach.

**No web font is shipped.** `ui-rounded` is the real thing on Apple platforms
and the stack falls back through Segoe UI on Windows, which is friendly without
being round. A genuinely rounded face on every machine means shipping a font
file, which is a bigger decision than a colour scheme and one worth taking on
purpose rather than in passing.

## A game's own screen

The title, one panel that flips between **how it plays** and **the controls**,
the three stages underneath, and **play** at the bottom.

Two tabs rather than both at once, because they answer different questions and
you want one at a time: what is this, and what do I press. The panel keeps one
size either way, so flipping between them does not move the play button out
from under the cursor.

Every game gets this screen, built or not, out of its catalogue entry - which
is what makes forty-one briefings a thing that already exists rather than a
thing to generate.

## Three, two, one

Press play and the run goes `briefing` → `counting` → `playing`. The count is
the same three seconds for every game, which is exactly why it lives here
rather than in each of them: a countdown is something the screen does, not
something forty-one games each have to remember to do.

The numbers go **over** the briefing rather than instead of it, so what you
were reading a second ago is still there behind them. Each is rounded up, so
the three is up for a whole second rather than for a frame.

**The game's state is built when the count starts, not when it ends** - a game
that wants to draw its board behind the numbers has a board to draw.

`tickRun` is pure and is the only thing that moves a run from `counting` to
`playing`, so the whole of the countdown is tested by passing it numbers rather
than by waiting three real seconds. The clock that calls it lives in
`MinigameScreen` and stops with the screen; there is a test that it does.

With no build registered, the round that starts is honest about being empty:
the countdown ran, the phase really is `playing`, and what is missing is the
game.

## Browsing is local, starting will not be

Opening the dashboard changes your screen and nobody else's. Browsing a
catalogue is not playing anything, so one player looking through it has no
business moving everybody else's view.

**Play is local too, for now, and that is the one thing here that will have to
change.** A minigame everybody is in has to start for everybody at once, so
when the games are real, `playMinigame` becomes the host's call and rides on
the same `hostChoice` that the game, the weather and the time of day already
do. It is deliberately the single line that would have to move: the store holds
where you are looking, and the run it starts is yours alone until something
syncs it.

## Public contract

| Export | What it is |
| --- | --- |
| `MINIGAMES` | All forty-one entries, in number order. |
| `MINIGAME_TARGET` | How many of each kind there are meant to be. |
| `minigameById`, `minigamesOfKind`, `isMinigameId` | Reading the catalogue. |
| `BUILD_STEPS`, `nextStep`, `stepsDone`, `isPlayable`, `progress` | The three stages, and how far each game and the catalogue as a whole has got. |
| `Minigame`, `MinigameId`, `MinigameKind`, `BuildStep`, `Control` | The shape of an entry. `MinigameId` is derived from the list, so an id that is not in it does not compile. |
| `registerMinigame` | How a built game plugs in. |
| `buildFor`, `isBuilt`, `builtMinigames`, `forgetBuilds` | Reading the registry. `forgetBuilds` is for tests. |
| `freshRun`, `MinigameRun`, `MinigameBuild`, `RunPhase` | A run of one game, at its beginning. |
| `beginRun`, `tickRun`, `countShown`, `COUNT_FROM` | The three-two-one. All pure. |
| `openDashboard`, `openMinigame`, `playMinigame`, `tickMinigame`, `backOut`, `closeMinigames` | Moving the screen about. |
| `useMinigameScreen`, `getMinigameScreen`, `MinigameScreenState` | Where the screen is. |
| `MinigameScreen` | The one component the app mounts. |

## Invariants you may rely on

- **Every id is unique, and so is every number.** Tested.
- **The numbers run 1..41 with no holes.** Tested.
- **Every game has a panel**, built or not - the template is the fallback and
  it covers all forty-one. Tested against the whole catalogue, not a sample.
- **A build takes over from the template the moment it registers**, and takes
  over nothing else. Tested.
- **Each run gets its own fresh state**, never one shared between runs.
- **`nextStep` is the first unfinished stage**, never the furthest along.
  Tested, including against a game that skipped ahead.
- **Nothing claims to be playable without a build behind it.** Tested - and
  tested against a game that does claim it, so the rule is not passing just
  because the catalogue is empty.
- **Every game has a briefing**, with both tabs and a play button. Tested
  against the whole catalogue, not a sample.
- **The countdown always reaches `playing`**, in big steps or small, and never
  counts past zero or backwards. Tested, for every game in the catalogue.
- **Pressing play twice is not a restart.** Tested.
- **Nothing on the screen scrolls.** Tested.

## Deliberate non-goals

- No minigame beyond the first. Zombie Tag plays; the other forty do not.
- No rules, scoring, rounds or win conditions - each arrives with its build.
- No turn order for the one-vs-all games. The kind is recorded; the rotation
  that goes with it is not.
- No host authority over what is open. See above.
- No 3D, no art, no sound.

## Known limitations

- **One game of forty-one is built.** Zombie Tag has its environment and its
  controls; everything else is a briefing with nothing behind it.
- **The controls are half written.** Games 1–12 arrived with theirs and they
  are in the catalogue; 13 onwards have none, and their controls tab says so.
- **Play starts a round for you and nobody else.** See above - the countdown
  and the phase are real, the sync is not.
- **The rules are nowhere.** The descriptions the games were specified with
  have not been written into the catalogue - `pitch` is one line rather than a
  summary of them. Those belong with each game's `environment` stage, which is
  where its rules stop being prose and become state.
- **`done` is hand-maintained.** Nothing derives it from the registry, so the
  plan and the code can drift. The direction that matters is guarded - a game
  cannot claim to be playable with no build behind it - but a game part way
  through a stage is whatever somebody last wrote down.

## How to review

Open a lobby, leave the game on Volcano Island, and press **minigames** in the
party panel, bottom left.

- **Count the tiles.** Forty-one, seven across, six rows, all of them on the
  screen at once with nothing to scroll.
- **Resize the window**, both ways, and drag it small. The tiles should get
  taller and shorter with it; no scrollbar should ever appear.
- **Read the dim ones.** Fifteen tiles should be visibly fainter and say *free
  slot*. Those are the numbers nobody has named yet, and they should look
  unfinished on purpose.
- **Filter to one vs all.** Eleven tiles, and the grid should re-flow to fill
  the same page rather than leaving the bottom half empty.
- **Open a game with controls** - anything from 1 to 12. It should open on
  *how it plays*; the **controls** tab should list them, and flipping back and
  forth should not move the play button.
- **Open one without** - 13 upwards. The controls tab should say they are not
  written down yet rather than showing an empty box.
- **Press play.** A big three, then two, then one, over the top of the briefing
  you were just reading - each for about a second - and then the round starts
  and says it is empty, because nothing is built.
- **Press play and then escape.** You should come back to the grid, and opening
  the game again should give a fresh briefing rather than the round you left.
- **Open a free slot.** It should open like any other tile and say a number is
  waiting for a game.
- **Look at the pips on any named tile.** Three of them, all hollow, because
  nothing has been built. A free slot has none at all.
- **Check no tile carries a description.** Number, name, pips. Nothing else.
- **Read the stages on a game's screen.** Environment, controls, assets, in
  that order, with an arrow against *environment* - the one owed next.
- **Look at the whole thing.** Sand, sea and sun, round corners, nothing
  monospace. If it looks like the debug panel, the palette did not take.
- **Check the footer.** It should count each stage against the number of named
  games, and all three should read 0 of 26 today.
- **Press escape twice.** The first takes you back to the grid, the second
  back to the world. The back button, top left, does the same thing.
- **Check the world is still there behind it.** Closing the dashboard should
  put you back exactly where you were standing - this screen does not move
  anybody.

## Gate record

Not yet gated.

## Measured

Nothing to measure: no draw calls, no triangles, no frame cost. The screen is
DOM and only exists while it is open.
