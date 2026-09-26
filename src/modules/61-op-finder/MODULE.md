# 61-op-finder

## What this is

**Catalogue slot 3, "OP Finder".** Everybody races through the same ten
CAPTCHA-style challenges, back to back, in the same order - which challenge
is which, and what its correct answer is, comes from the round's seed and
which stage you're on, the same for every browser, so nothing about a
challenge is ever sent over the wire. The tasks cycle through six kinds:
match the image, type the warped text, spot the odd one out, pick what
comes next, tick the right boxes, count the icons. Get one wrong and there's
a short lockout before your next try counts. First to clear all ten wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in the composition root.

This is the **environment** and **controls** stages done. The assets stage
is not: the racers are the island's capsule and every "image" is a Unicode
glyph.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Ten CAPTCHA-style challenges, cycling between tasks | `STAGE_COUNT`, `KINDS`, `challengeFor` |
| Selecting matching images | `MatchChallenge`, `genMatch` |
| Typing distorted text | `TextChallenge`, `genText` |
| Identifying objects | `IdentifyChallenge`, `genIdentify` |
| Solving simple patterns | `PatternChallenge`, `genPattern` |
| Checking boxes | `CheckboxesChallenge`, `genCheckboxes` |
| Completing quick visual puzzles | `CountChallenge`, `genCount` |
| Race everyone else, first to finish wins | `answer`, `stepRound`'s decided-at-first-finish check |
| Mouse to navigate/click; keyboard to type | the screen |

## The challenge pool

A challenge is one of six **kinds** (`match`/`text`/`identify`/`pattern`/
`checkboxes`/`count`), and the round's ten stages are a seeded sequence
drawn from that pool - never the same kind twice running, the same idea
`33-keyboard-warrior` uses so its letters never repeat. Every stage's actual
content - which icon, which distractors, which warped string - is also
seeded off `(round.seed, stage)` (`challengeFor`), so **every browser derives
the identical stage 0 through 9 independently**; the wire never carries a
challenge's content, only how far somebody has got.

The six kinds all draw from one hand-written, category-tagged table of
plain Unicode glyphs (`THINGS` - animals, fruit, vehicles, shapes), zero
asset cost, the same "no asset pipeline" approach every other minigame's
procedural primitives take:

- **`match`** - one target icon shown large; a grid of six, one of them it.
- **`text`** - six letters and digits (no `O`/`0`/`I`/`1`/`l`, too easy to
  mix up), each character independently rotated and offset with an inline
  CSS transform for the classic warped look.
- **`identify`** - seven icons from one category and exactly one from
  another - the odd one out.
- **`pattern`** - a short repeating cycle of icons with the next slot
  blank, plus a few options.
- **`checkboxes`** - a grid of icons and a stated rule ("check all the
  fruits") - check exactly the matching ones and confirm; the wrong set
  is a miss, not a clear.
- **`count`** - a cluttered field with a target icon repeated a few times
  among decoys - pick the right count from a few numbers.

## Answering

**Correctness is checked in whichever browser made the guess** (`answer`),
the same trust model Sprint Triathlon uses for its keystrokes: the host has
no way to check a guess's content anyway, since it never sees it. A right
guess past your own lockout raises your `stage`; reaching `STAGE_COUNT` sets
`finishAt`. A wrong guess raises `mistakes` and starts a short local lockout
(`ANSWER.lockout`, 0.4s) before your next attempt is even judged - the
brief's "rapid-fire" framing wants guessing fast not to be the same as
guessing right.

What crosses the wire is only your own running `stage` and `mistakes`
(`Intent`) - never the guess itself. The host folds every report in
(`stepRound`) clamped to **at most one stage every `ANSWER.minStageTime`
(0.5s)** since your last accepted advance, so a report claiming to have
cleared several challenges in one network tick is not believed all at once -
the direct generalization of Sprint Triathlon's `report()` max-plausible-
rate clamp, simplified to one flat floor rather than a per-leg one, since a
CAPTCHA answer is already a much coarser, rarer action than a keystroke.

## The end

**Decided the instant the first player finishes** (the brief: "First player
to finish wins," not a podium) - `decidedAt` set there, a short outro
(`ROUND.outro`, 2s) so everyone sees the win, then `over`. A safety-net
`ROUND.limit` (180s) covers a stall with nobody finishing. `placings()`
ranks any finisher by finish time, then everybody else by how many stages
they cleared - ties share a place.

## One round, and it is the host's

- **The host runs the round** - its own progress, the stand-ins', every
  guest's as they report it - and sends where everybody has got to (`opf`)
  ten times a second.
- **A guest answers locally at once.** The moment you make a guess, your own
  copy of your own player advances (or locks out) right there - not a
  network round trip later - and only afterwards reports its new running
  `stage`/`mistakes` (`opf-in`), four times a second and on every change.
  Applying the host's snapshot never rolls your own progress backward, only
  ever forward, once the clamp agrees - see "Known limitations" below.
- **A report is a running count, for one round.** The count starts again at
  zero each round; one meant for the last round is ignored.
- **A pause stops the round for everybody**, the host's own simulation
  included.
- **The canvas is rendered once**, and the scene redraws itself from a ref
  each frame - see Duck Hunt's notes for the error a per-frame `<Canvas>`
  caused.

**The roster is the lobby**, host first, up to eight - eight colours. Alone,
three stand-ins fill in: they attempt nothing for the first four seconds
(`BOT_OPENING`) - long enough to read what the game is even asking, the
first time - then each "solves" its current stage after a seeded pause
(3.5 to 10 seconds), sometimes getting its first attempt wrong first and
paying the same lockout a person would - seeded per bot per stage, so
the same round plays out the same way every time it is replayed with the
same seed.

## Seeing what happened

- A line of racers, each the island's capsule in their own colour, each
  with a progress bar of their own floating over their head.
- The challenge itself is a card in the middle of the screen: the HUD has
  the clock (red for the last twenty seconds) and your own `stage/10`.
- A wrong guess flashes the card's border red with a short "not quite" hint
  until the lockout passes.
- Finishing early shows a "you're through - waiting for the others" card
  instead of a challenge.

## The camera does not move

A fixed, low, front-on shot of the line of racers - nobody moves in world
space in this one, so there is nothing to follow. Unlike Breaking the Ice's
follow rig, this is the simple fixed-camera pattern every other minigame
uses, just with no frame-fitting maths needed since the racer line's extent
is already known.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `STAGE_COUNT`, `KINDS`, `THINGS`, `CATEGORIES`, `ANSWER`, `ROUND`, `COLOURS` | The rules and the look, as numbers. |
| `challengeFor`, `checkGuess` | The challenge pool. Pure. |
| `createRound`, `answer`, `stepRound`, `timeLeft`, `placings` | The round. Pure. |
| `Round`, `Player`, `Intent`, `Entrant`, `Challenge`, `Guess`, `Kind`, `Thing`, and one interface per challenge kind | Its shapes. |
| `botIntent`, `botIntents`, `BOT_SOLVE`, `BOT_MISTAKE_CHANCE` | The stand-ins. |
| `newRound`, `roundRoster`, `nextSeed`, `waitingRound`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `OpFinderScreen` | The panel the registry draws. |

## Invariants you may rely on

- **A stage's challenge is deterministic for a given seed and stage, and
  never the same kind as the one before it.** Tested.
- **Every challenge, whichever kind, has exactly one right answer among its
  options.** Tested.
- **No challenge content is ever sent; only stage and mistake counts are.**
  Tested by construction - the wire types carry nothing else.
- **A right guess raises your stage; a wrong one locks out the next
  attempt briefly and does not.** Tested.
- **A reported stage cannot rise faster than the anti-cheat floor allows,
  however it is reported.** Tested.
- **The round is decided at the first finish, ends after the outro, or at
  the safety-net limit; finishers rank by time, the rest by stage reached.**
  Tested.
- **Eight players with a lossy network agree on who finished and how far
  everyone else got.** Tested.

## Deliberate non-goals

- No models, no sound beyond the shared cues other minigames already use.
- No host-side verification of a guess's actual content - only its
  reported outcome and its rate, the same trust model Sprint Triathlon's
  keystrokes get.
- No moving camera.
- No score kept between rounds.

## Known limitations

- **A guest's own browser is the only judge of its own guesses.** A
  doctored one could always report a correct answer it never made - the
  anti-cheat floor limits how *fast* that helps, not whether it happened,
  the same limitation Sprint Triathlon's own MODULE.md names for its
  keystrokes.
- **No smoothing between a guest's optimistic local stage and the host's
  clamped one** - Sprint Triathlon keeps a separate `Self` record for
  exactly this; this module skips it, since a CAPTCHA answer is rare enough
  (roughly one every couple of seconds, not sixty times a second) that a
  brief one-round-trip correction is not expected to be visible in honest
  play. If it ever is, that's the first thing to revisit.
- **Grid sizes and timings are a starting point**, not a tuned final
  balance - the brief asks for the shape of the game.
- **The shared plumbing is copied again** - host/guest hook, results card,
  roster rules. Moving it into `15-minigames` is overdue, the same note
  every minigame here leaves.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**OP Finder**, and press **play**.

- **Look at the line of racers.** Four players in four colours, a thin
  progress bar over each head.
- **Solve the first challenge.** Whichever kind it is, click or type the
  right answer - your progress bar and your `stage/10` in the HUD both
  advance, and a fresh challenge, a different kind, appears at once.
- **Get one wrong on purpose.** The card's border flashes red with a
  "not quite" hint; clicking again does nothing until it clears.
- **Play through all six kinds.** `match`, `text`, `identify`, `pattern`,
  `checkboxes` and `count` should each turn up somewhere across the ten.
- **Finish all ten before the stand-ins.** A "you're through" card while
  the others keep going; the round ends the moment anybody clears all ten.
  **Again** starts a new round, a different seed.

### With two browsers

- **Both see the same ten challenges**, in the same order - open the same
  stage on both and compare what's shown.
- **One answers, the other watches.** The answering browser's progress bar
  and stage advance immediately; the other sees it within the next
  snapshot.
- **Host: again.** Both are dealt into a fresh round.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. A handful of meshes per racer (the pill plus two flat progress
bars) - well under forty draw calls with eight players. One shadow-casting
light.

Like the other minigames, a **second WebGL context** while a round is up.
