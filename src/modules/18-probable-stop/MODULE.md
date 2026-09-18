# 18-probable-stop

## What this is

**Minigame 3.** Six rounds. Each round there are three rope-and-plank bridges
slung across a misty valley between two peaks, and a countdown. Stand on one -
change your mind as often as you like - and when time runs out everybody walks
out across their bridge: the ones that hold, you cross; the ones that do not
snap in the middle and drop into the mist with everybody on them. Two of the three hold in
the first four rounds, only one in the last two. Survive all six.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule avatar, and the peaks, bridges and
cloud are built from code rather than models.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Six rounds | `GAME.rounds` |
| Three paths each round | `GAME.paths`, `PLACE.lanes` |
| Choose or change freely until the countdown ends | `choose`, `step`, `GAME.chooseTime` |
| Then all paths are revealed | `stepGame` → `reveal`, `decideSafe` |
| Players on the successful path advance | `reveal` - everybody else is `alive: false`, `outIn` the round |
| First four rounds 2/3, last two 1/3 | `GAME.safePaths` - `[2, 2, 2, 2, 1, 1]` |
| Survive all six | `placings`, `roundsSurvived` |
| WASD - move between choices | A/W and D/S, and the arrow keys, one path at a time |
| Mouse - select or change path | click a bridge or its card |
| Space - confirm | `confirm`; clicking your own path again confirms too |

## "Two in three" is two paths, not a coin per path

In the first four rounds exactly two of the three paths hold; in the last two,
exactly one. A chance per path would sometimes make all three safe and
sometimes none, and a round where everybody falls no matter what they chose is
not a choice. `decideSafe` shuffles the three paths and takes the first two, or
the first one. There is a test that every path is safe as often as the odds say,
over three thousand games.

That makes surviving all six a `(2/3)⁴ × (1/3)² ≈ 2%` chance for any one
player. With eight people, most games end with nobody making it all the way,
and the winners are whoever fell last. That is the game.

## Nobody can know early

**Which paths hold is decided at the moment the countdown ends, not before.**
Until then the answer does not exist - not in the host's memory, not on the
wire - so there is nothing for anybody to look at.

It is decided from a seed, so a game is reproducible and testable, and the seed
is the one thing that must never leave the host:

- **Snapshots never carry it.** Tested, over a whole game.
- **The game `id` is not derived from it.** An id worked out from the seed can be
  worked back to the seed - `hashSeed` is reversible - so the two are drawn
  separately.
- **Neither is built from anything guessable.** The other minigames build seeds
  from the world seed, the lobby and the time, which is fine for letters and
  mazes. Here a guest could brute-force that and know the answers, so the seed
  and the id come from `crypto.getRandomValues` (`secret`). This is the one
  place in the build that is deliberately not reproducible from the world seed,
  and why.

Stand-ins are seeded apart from the paths, so they know no more than you.

## Choosing: three ways, one choice

- **A / D** (and W / S, and the arrows) move you one path at a time.
- **The mouse** picks a path outright: click a bridge, or its card under the
  view. Clicking the path you are already on confirms it, so a mouse player
  never has to reach for the keyboard.
- **Space** confirms.

**What counts is where you stand when the clock runs out, confirmed or not.**
Confirming does not lock you in - moving clears it - so "change freely until the
countdown ends" stays true. What confirming is for: **once everybody still in has
confirmed, the countdown drops to 1.5 s**. A lobby that has made up its mind
does not sit watching a clock, and the second and a half is enough to see that
everybody is in, and for somebody who confirmed by mistake to move.

Everybody starts each round on the middle path. You can see who is standing
where - on the ledge, and counted on the cards - and follow the crowd or not.
Paths are independent chance, so the crowd knows nothing either.

## A bridge's condition is only its looks

Every round deals the three bridges three different conditions - **sturdy**,
**weathered**, **patched** or **rickety** (`bridgeCondition`) - shown on the
bridge (plank colour, planks askew, split or missing, slack hand ropes) and
named on its card. **It has nothing to do with whether the bridge holds.** Which
paths hold comes from the game's secret seed at the reveal; the condition comes
from the game's public `id` and the round, drawn apart from the seed. A rickety
bridge is exactly as likely to hold as a sturdy one. Tested over three thousand
games: every condition holds as often as any other, within 2%.

The shiver, the snap and the fall are the same for every condition.

## The reveal

Six seconds, in beats (`BEATS`):

- **walk** - everybody sets off across their bridge together, following its sag
  (`deckHeight`), with a step in their stride. Nobody knows yet: the cards and
  the banner wait for the snap.
- **shiver** - the bridges that will not hold start to shake.
- **drop** - they snap in the middle. Each half swings down against its own
  cliff and settles; planks near the break, and some others, come away and
  tumble. Everybody on it stops where they were and falls head over heels into
  the mist (`fallTime`). The bridges that held glow green, and everybody on them
  walks on to the far peak.

A banner says what happened to you. The fallen reappear on a cloud off to the
left and watch the rest of the game from there.

Where everybody stands at any moment is `spotFor(game, player)` - pure, from the
game alone - so every browser draws the same moment, and a test can check that
nobody stands on thin air who has not fallen, and that nobody stands on anybody.
The snapped bridge halves and falling planks are likewise worked out from the
reveal's clock, not from anything a browser remembers.

## A wish is for one round

What a player wants is an `Intent`: which path, confirmed or not, **for which
round**. The round is part of it on purpose. A guest's "confirmed" from the
round before, still being repeated when the next round starts, must not confirm
them into a round they have not looked at yet. `applyIntent` ignores a wish for
any other round. Tested, in a simulated lobby of eight.

## One game, and it is the host's

The same arrangement as the other minigames:

- **The host runs the game.** Guests send wishes (`ps-in`), repeated four times a
  second; the host sends the game (`ps`) ten times a second - there is nothing
  here that moves fast.
- **A guest sees its own choice straight away.** Choosing is the whole game, and a
  path that lights up a round trip after the key press feels broken. The guest's
  copy runs ahead of the host on its own pick and confirm, and on nothing else.
- **A guest keeps listening after the game ends**, so it sees the results and the
  next game when the host presses **again**. A new `id` is a new game.
- **A pause is shared.** It stops the round for everybody, and only whoever
  stopped it can start it again. Before that change it stopped only
  your hands, and the countdown runs on.
- **The roster is the lobby**, host first. Alone - including a lobby with only
  you in it - three stand-ins fill in.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `GAME`, `safeCount` | The rules as numbers. |
| `createGame`, `stepGame`, `choose`, `step`, `confirm`, `applyIntent`, `decideSafe`, `stillIn`, `placings`, `roundsSurvived` | The game. All pure. |
| `Game`, `Player`, `Phase`, `Intent`, `Entrant` | Its shapes. |
| `botIntent`, `botIntents` | The stand-ins. |
| `newGame`, `gameRoster`, `secret`, `waitingGame`, `myId`, `ME`, `SOLO_PLAYERS` | Dealing a game from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared game on the wire. All pure. |
| `PLACE`, `BOUNDS`, `BEATS`, `spotFor`, `bridgeDrop`, `fallTime`, `deckHeight`, `revealProgress`, `onGround` | Where everything is, at any moment. Pure. |
| `CONDITIONS`, `Condition`, `bridgeCondition` | What each bridge looks like this round. Pure, and never tied to whether it holds. |
| `frameScene`, `TILT`, `FOV`, `FILL` | Where the camera stands. Pure. |
| `ProbableStopScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Six rounds; exactly two safe paths in the first four and one in the last two**,
  every round of every game, all different. Tested over 300 games.
- **Every path is safe as often as the odds say.** Tested over 3000.
- **Nothing about which paths hold exists before the countdown ends**, and no
  snapshot ever carries the seed. Tested.
- **Where you stand when time runs out is what counts**, confirmed or not. Tested.
- **Moving clears a confirm; standing still does not.** Tested.
- **Everybody confirmed cuts the countdown to 1.5 s**, and nobody still deciding
  does. Tested.
- **Nobody can change anything during a reveal, and the fallen never come back.**
  Tested.
- **A wish only counts for its own round.** Tested, including a guest still
  repeating last round's confirm.
- **The game ends after six rounds, or as soon as nobody is left.** Tested.
- **Survivors share first; everybody else ranks by how late they fell, sharing a
  place with whoever fell in the same round.** Tested.
- **Nobody stands on thin air who has not fallen, nobody stands on anybody, and
  there is room on the ledge and the cloud for a whole lobby.** Tested.
- **When the bridges go, everybody is out on their bridge's deck, and the fallen
  drop straight down from there.** Nobody walks through anybody on the way
  across. Tested.
- **Three different bridge conditions every round, from the game id alone, and
  no condition holds more often than another.** Tested.
- **The whole place is in frame and fills it, at any window shape.** Tested.
- **Eight people in one game agree, round by round, on who fell and when.** Tested.

## Eight at once

`lobby8.test.ts` plays a game between a host and seven guests through JSON: all
eight dealt in, each guest's wish moving them and nobody else, the countdown
cutting short when all eight confirm, a stale confirm not leaking into the next
round, and every guest agreeing on the result.

## Deliberate non-goals

- No models. Capsules, and bridges, peaks and a cloud built in code.
- No skill in which path holds. It is chance, decided at the reveal.
- No second chances and no respawns.
- No sound, no score kept between games.

## Known limitations

- **Most games have no winner who survived all six** - about a 2% chance each.
  That is the brief's odds. If it feels too punishing, the lever is
  `GAME.safePaths`.
- **A guest's wish arriving in the last few milliseconds** may land after the
  countdown ends on the host, and not count. The countdown is five seconds.
- **Much of the plumbing is the other minigames' again** - the fixed camera fit,
  the host/guest hook shape, the results card. This is the third copy, which is
  the point Messy Maze's notes said it should move into `15-minigames`. Not done
  here, so as not to change two passed-for-review games while building a third.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames** in the party
panel, and open **3 · Probable Stop**. Read it, then press **play**.

- **Look at the place.** The grassy top of a peak, three rope bridges out over a
  misty valley to a second peak, mountains beyond, a cloud on the left, all in
  view and still. Each bridge looks different - sturdy, weathered, patched or
  rickety - and its card says which. New looks every round.
- **Find yourself.** The blue capsule with a ring, on the middle path, with three
  green stand-ins.
- **Press A and D.** You walk from path to path; your bridge glows and your card
  is outlined. You cannot go past either end.
- **Point at a bridge, then click it.** It lights under the pointer and you walk
  to it. Click it again: the ring under you goes gold and the HUD says you are
  locked in. Click a card: the same.
- **Press Space, then move.** Confirm, then A: the lock clears.
- **Confirm and wait.** Once the stand-ins have confirmed too, the countdown jumps
  to 1 and says everybody's in.
- **Watch the reveal.** Everybody walks out onto their bridge. The ones that did
  not hold shiver, snap in the middle, and drop into the mist with everybody on
  them; the others glow green and their players walk on across. Only then does a
  banner say whether yours held, and the cards say *held* or *dropped*.
- **Watch the conditions over a game.** Rickety bridges hold about as often as
  sturdy ones.
- **Fall.** You reappear grey on the cloud, and the HUD says which round you
  fell in. Your keys do nothing now.
- **Reach round five.** The HUD turns red: only one of three paths holds.
- **Let it end.** Survivors first, then everybody by the round they fell in,
  shared places for people who fell together. **Again** starts a new game.
- **Press escape mid-round, alone.** The countdown stops.

### With two browsers

- **Both pick different paths.** Each should see the other walk there, and the
  cards count them.
- **Guest: press D.** The guest moves at once in its own browser and a moment
  later in the host's.
- **Both confirm.** The countdown drops to 1 in both.
- **The reveal.** Both browsers show the same bridges dropping and agree on who
  fell.
- **Host: press again when it is over.** Both are dealt into the new game.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. About sixty draw calls for the place - two peaks, their tops, one
merged mesh for the range, the valley floor, five sheets of mist, the cloud's
puffs as one instanced mesh, and per bridge three instanced plank meshes, two
merged rope meshes, four posts and their trim - plus two per player, with one shadow-casting light over
a 1024 map. The simulation is a handful of comparisons a frame.

Like the other minigames, a **second WebGL context** while a game is up.
