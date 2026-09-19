# 17-messy-maze

## What this is

**Minigame 2.** Everybody starts in a different corner of a maze and races for
the middle. On the way you have to stand on two spinning platforms, and every
time one spins you, your four movement keys are swapped for four different
letters. You place in the order you reach the middle.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx` - and the
dashboard's Messy Maze tile leads somewhere real.

This is the **environment** and **controls** stages done. The assets stage is
not: the racers are the island's capsule avatar and the walls are boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A chaotic maze | `LAYOUTS` - three drawn mazes, loops and crossings between quarters in all of them |
| Each player starts in a different corner | `createRace` - corners dealt opposite first, then the other two |
| Reach the center first | `arrive`, `MAZE.goalRadius`, `GOAL` |
| Must step on two spinning platforms | the walls - `platformsOnRoute` is two from every corner - and `goalOpen` as well |
| Platforms randomly change your bindings to different letters | `rebind` - four letters, none of them the ones you had |
| Adapt quickly | the HUD's keys, the spin card, and `RACE.spinTime` |
| Placement is the order you reach the center | `place`, `placings` |
| WASD / assigned keys to move | `START_BINDING`, `directionFor` |

## Three mazes, drawn out

There are three mazes - **The Long Way**, **Switchbacks** and **Tangle** - and
each race is in one of them. They are drawn as ASCII in `layouts.ts`, 35
characters square: `#` wall, `S` start, `X` middle, `O` spinning platform. The
host deals them round in turn, starting from a random one, so two races in a
row are never the same maze; the HUD names the one you are in.

**Fixed rather than generated each race**, because the property that matters
below is something to check, not something to hope a random maze has. Each
was carved once, looked at, and kept - and `maze.test.ts` holds all three to
every property, so a drawing can be edited by hand as long as the tests still
pass. `parseLayout` refuses a drawing with a gap in the outer wall, a missing
post or a marker out of place, and says where.

| | shortest route | platforms at step | character |
| --- | --- | --- | --- |
| The Long Way | 38 cells | 13 and 31 | one long winding route, platforms far apart |
| Switchbacks | 36 cells | 10 and 26 | corridors that double back, plenty of dead ends |
| Tangle | 30 cells | 14 and 22 | the loopiest, the most ways between quarters |

**Every maze is fair.** Each is one quarter turned four times about the middle,
so every corner looks out on the same maze, rotated, and is the same distance
from the middle. `quarterOf` and `rotate` are the whole of that, and it is
tested.

**Every maze is messy.** A perfect maze - one route between any two points - is
a puzzle rather than a race: once you have found the way there is nothing left
to decide. All three have loops, and doorways from one quarter into the next,
so routes cross and you see other racers on the way.

## You cannot reach the middle without two spins

**The walls make you.** From every corner of every maze, every route to the
middle crosses at least two different spinning platforms - there is no gap
that lets you round one. `platformsOnRoute` works out the fewest a racer can
possibly cross: a shortest-path search where stepping onto a platform costs one
and everything else costs nothing. It is two for all twelve corners, and a
test fails if an edit to a drawing makes it one.

The mazes were made that way: a random maze carved for one quarter and turned,
platforms placed on its one route to the middle, and then every extra loop or
doorway tried and **kept only if it did not open a way round a platform**.

That is only worth anything if walking through a platform's cell always
counts, however the cell is crossed. **You are on a platform when your middle is
in its cell** (`platformUnder`) - not within some distance of its middle. A body
cannot pass through a cell without its middle being in it, so the graph's
guarantee and the game's rule are the same thing, whatever size a racer is and
however tight a corner is cut. The one gap - diagonally through the point where
four cells meet - only skips a platform if the two cells beside that point are
both platforms, and a test holds every maze to never putting two platforms
corner to corner.

It used to be a distance, and a distance went wrong twice: 1.2 could be cut past
on a tight corner, and when the racers were made their proper size, 1.35 could
too. The test that walks every corner of every maze to the middle, cutting
corners as tight as the walls allow, stays.

**The middle checks as well**, as a second line: it will not take anybody with
fewer than two platforms. Grey and still while it will not have you, gold with
a ring breathing round it once it will.

**Each platform spins each racer once.** Once it has spun you it is spent for
you: it stops turning and goes pale in your browser, and walking back onto it
does nothing - no spin, no new letters, and no second tick towards the middle.
It is still live for everybody else. A platform you have not used still spins
you after you have your two.

## Spinning, and the letters

A binding is four letters in a fixed order - up, left, down, right - so WASD is
the string `"WASD"`. That is what goes on the wire, what the HUD draws, and what
a test compares.

A spin holds you for `RACE.spinTime` (you whirl on the spot) and deals four new
letters: **four different letters, none of which were in your last binding.**
Getting W back for up would be a spin that did nothing. Worse, W moving from up
to left means the key you are already holding keeps you moving, the wrong way.
With nothing carried over, everything you were pressing stops doing anything at
all, which is the moment the game is about. Any of the 26 letters can come up;
there is a test that they all do.

**Letters, not directions, are what a player sends.** The keyboard reports "W
and D are down", and the host reads that through the racer's binding *at that
moment*. A spin on the host therefore changes what a guest's keys do on the
very next frame, and there is nothing to keep in step. Letters are read from
`KeyboardEvent.key`, so the letter on the HUD is the one printed on the key
whatever the keyboard layout. Arrow keys do nothing.

After a spin a card comes up over the maze with the four new keys large, and
the keys in the HUD pulse. The card lets clicks and keys through: it is there to
be read while you play, not dismissed.

## The walls are where they are drawn

**A racer bumps into a wall exactly where its pill touches it.** The racer's
size to the rules is the island pill's own radius (`PLAYER.radius`), not a
number of its own. It was 0.55 against a pill drawn 0.4 across, so every racer
stopped a hand's width short of every wall and caught on corners it had plainly
cleared: invisible walls. Every doorway in all three mazes is also checked to be
walkable, and a racer walked into a wall is checked to stop a pill's width from
its face.

## Racers pass through each other

Corridors are one cell wide. Solid racers could stand in a doorway and plug it,
and a race you can win by standing still is not a race. Walls are solid; people
are not.

## The end of a race

Placed in the order you reach the middle. Once somebody is in, the others get
`RACE.lastCall` (30 s), so one lost or absent racer does not keep a lobby
waiting. Whatever happens, the race ends at `RACE.timeLimit`.

Anybody still out at the end ranks below everybody who made it - by platforms
first, then by how far they still had to walk. "Nearly made it" counts for
something, but never as much as making it.

## One race, and it is the host's

The same arrangement as Zombie Tag, with the lessons already learned from it:

- **The host runs the race.** Guests send held letters (`mm-in`); the host sends
  the race (`mm`) twenty times a second. Nobody disagrees about who got in first
  or which keys anybody has.
- **The maze goes as its number.** A guest builds the same walls from the same
  drawing (`mazeFor`), so a snapshot is who is where, never what the maze is.
  The race's seed goes too, for the letters its spins deal.
- **Held letters are repeated four times a second** and forgotten after a second
  of silence. Leaving a race sends "nothing held".
- **A guest keeps listening after the race ends**, so it sees the results and
  the next race when the host presses **again**. A new seed is a new race.
- **A pause is shared.** It stops the race for everybody, and only whoever
  stopped it can start it again. Before that change it stopped only
  your hands.

**The roster is the lobby**, host first, read when the race is dealt. Alone -
including a lobby with only you in it - the other three corners get stand-in
racers. With two or more people there are no stand-ins.

## The stand-ins

Walk downhill on a distance field to the nearest platform they still need, then
to the middle, lining up with a corridor before turning into it so they do not
catch the corner. **They cannot be confused**, because their controls are not
letters, so they pay in other ways: they run at `RACE.botPace` (80%) and stand
still for `RACE.botDaze` after each spin. A clean run to the middle is 13 to 16
seconds, depending on the maze; stand-ins come in a few seconds behind.

## The camera does not move

The whole maze is in view for the whole race: seeing who is about to reach a
platform, and who took the wrong turn, is half of what makes it a race. It is
**steeper than Zombie Tag's** (66°), because a maze is corridors and a shallow
view hides the corridor behind each wall, and the walls are **lower than a body**
(`WALL_HEIGHT`), so nobody is ever behind one. It is fitted exactly: every
corner of the maze, slab to head height, is in frame, the maze reaches the edge
of the window, and the sky is even above and below. Tested against a real
camera frustum at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `MAZE`, `HALF`, `MIDDLE` | The maze, as numbers. |
| `LAYOUTS`, `Layout`, `parseLayout`, `MAZES` | The three mazes as drawn, and as read. |
| `mazeFor`, `platformsOnRoute` | A maze by number, and the fewest platforms anybody can cross between two cells. |
| `rotate`, `quarterOf` | The quarter turn, and the quarters it makes. |
| `isOpen`, `exits`, `stepsTo`, `stepsFrom`, `routeBetween`, `cellAt`, `cellCentre` | Walking the maze. |
| `settle`, `pushOutOfBox`, `inWall` | The walls. |
| `START_BINDING`, `LETTERS`, `ARROWS`, `directionFor`, `heldLetters`, `isBinding`, `rebind` | Keys and spins. All pure. |
| `RACE`, `GOAL`, `createRace`, `stepRace`, `goalOpen`, `platformsTouched`, `stillRacing`, `placings` | The race. All pure. |
| `botDirection`, `botDirections` | The stand-ins. |
| `newRace`, `raceRoster`, `nextSeed`, `nextLayout`, `waitingRace`, `myId`, `ME`, `SOLO_RACERS` | Dealing a race from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeKeys`, `decodeKeys`, `SNAPSHOT_TAG`, `KEYS_TAG` | A shared race on the wire. All pure. |
| `frameMaze`, `headingToYaw`, `TILT`, `FOV`, `FILL`, `WALL_HEIGHT` | Where the camera stands. Pure. |
| `MessyMazeScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Every route from every corner of every maze crosses two different
  platforms.** Tested, and tested that the check can fail. Tested again by
  walking a racer to the middle from every corner, cutting corners as tight as
  the walls allow: it is spun twice every time.
- **Each maze is the same from every corner, turned**, and every corner is the
  same number of steps from the middle. Tested for all three.
- **Two races in a row are never the same maze**, and all three come round.
  Tested.
- **A drawing with a hole in it is refused, saying where.** Tested.
- **Every cell is reachable**, there is more than one way through, and routes
  cross between quarters. Tested.
- **Eight platforms, two per quarter, the same distance along every corner's
  route**, never on a corner or the middle. Tested.
- **Nobody walks through a wall or out of the maze, and a wall stops you where
  your pill touches it - no sooner.** Tested.
- **You are on a platform when you are in its cell**, and no two platforms are
  corner to corner. Tested.
- **A spin deals four different letters, none from the last binding**, the same
  deal for the same race, racer and spin, reaching all 26 letters. Tested.
- **A platform spins each racer once**, then is spent for them and not for
  anybody else; stepping on and off one never opens the middle. Tested.
- **The middle refuses anybody with fewer than two platforms**, and takes
  anybody with any two. Tested.
- **Places are the order of arrival**; the third in, or the last call, ends the race; anybody not
  in ranks below everybody who is. Tested.
- **Stand-ins finish in every maze from every corner**, through two platforms. Tested.
- **A snapshot comes back as the race that went out**, bindings included, moves
  a guest's racers rather than rebuilding them, deals a new race on a new seed,
  and is refused whole if any of it is wrong. Tested.
- **Held letters are read through the host's binding, not the guest's.** Tested.
- **A lobby of one gets stand-ins; a lobby of two or more does not.** Tested.
- **The whole maze is in frame and fills it, at any window shape.** Tested.

## Eight at once

Eight is the most this is built for, and there is a test that plays a race
out between a host and seven guests, every message through JSON the way the
relay hands it over: all eight dealt in, every guest shown the same race with
their own body in it, each guest's keys moving them and nobody else, a snapshot
of all eight inside the relay's 4 KB, and the host's messages a second - duck,
race, clock, and a pong for each of seven others' pings - inside its limit of
sixty. See `lobby8.test.ts`.

Running it for real, eight tabs in one lobby, found something no two-browser
test would: **a guest who takes over as host before any snapshot has reached
them holds an empty race**, and an empty race stepped is over on its first
frame. Sent, it ended the game for everybody. So a host never runs or sends a
race nobody was dealt into, and a guest refuses a snapshot with nobody in it.
The takeover itself was `09-net` dropping a peer that was still there, fixed
there.

## Deliberate non-goals

- No models. Capsules, boxes, discs.
- No moving camera.
- No collisions between racers - see above.
- No pushing, items or power-ups.
- No sound, no score kept between races.
- No authority. The host is trusted with the race.

## Known limitations

- **A guest is a round trip behind their own keys**, about 50 ms plus ping, with
  no prediction. Fine for a maze; worth knowing.
- **More than four racers share corners.** A fifth starts where the first did.
  Fair - they are the same distance - but crowded.
- **Three mazes can be learned.** People who play a lot will know them; the
  spins deal different letters every race, which is the part meant not to be
  learnable. A fourth is a new drawing in `layouts.ts` and nothing else.
- **Stand-in pacing is a guess.** 80% pace and a 1.1 s daze per spin are worth
  tuning once people have played it.
- **Much of the plumbing is Zombie Tag's again**: the fixed-camera fit, the
  host/guest hook, the results card. Two games is not yet enough to know what
  the shared version should look like; a third will be. The candidate home is
  `15-minigames`.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames** in the
party panel, and open **2 · Messy Maze**. Read it, then press **play**.

- **Look at the whole maze.** All of it in view, filling the window top to
  bottom with an even strip of sky, and it never moves.
- **Find yourself.** The blue capsule with a ring under it, in a corner. Three
  green stand-ins in the other three.
- **Look at the corners.** Turn your head: the maze from each corner should be
  the same maze, rotated. The HUD names which maze it is.
- **Press again twice.** A different maze each time, and all three come round.
- **Walk with WASD.** Arrow keys should do nothing. Walls should stop you
  without sticking.
- **Try to reach the middle without a platform.** You cannot: every way in
  crosses one, and then another. Look for a way round one on the map - there
  should not be one.
- **Step on an orange spinning platform.** You whirl for a moment, a card shows
  four new letters, the HUD keys pulse and change, and WASD stops working. The
  new letters should move you the way their arrows say. The platform stops
  turning and goes pale for you.
- **Stand still on it, then step off and back on.** Nothing: it stopped
  turning when it spun you, your letters stay the same, and the HUD still says
  *1 of 2*.
- **Get a second platform.** The HUD says *go to the middle!* and the middle
  turns gold with a pulsing ring. Walk in: a banner says what place you got.
- **Watch the stand-ins.** They should find their platforms and the middle,
  pausing after each spin, and not get stuck on corners.
- **Let the race finish.** Once somebody is in, a red *last call* counts down
  from 30; the race ends at once when a third racer gets in. The card lists everybody in finishing order, times for those who got
  in and platform counts for those who did not. **Again** deals a new maze.
- **Press escape mid-race, alone.** Everything stops, with resume on the card.
- **Resize the window.** The maze should refit, all of it always in view.

### With two browsers

Make a lobby in one, join it from the other, and have the host open Messy Maze
and press play.

- **Look for each other.** Opposite corners, the same maze in both browsers, no
  stand-ins. Each is blue in their own browser and green in the other's.
- **Guest: move.** WASD should work, and the host should see it.
- **Guest: step on a platform.** The guest's card and HUD should show the new
  letters, and those letters - not WASD - should move them, in both browsers.
- **Reach the middle in turn.** Both browsers should agree on the places.
- **Host: press again when it is over.** Both browsers should be dealt the same
  new maze. The guest's card should say it is waiting for the host until then.
- **Guest: hold a key and press escape.** Their racer should stop in both
  browsers, and the race should carry on.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The walls are one instanced draw call however many there are;
the rest is roughly thirty draw calls - a floor, eight platforms of three
meshes, a goal, two per racer - with one shadow-casting light over a 2048 map.
The simulation is a few hundred box checks per racer per frame and one cached
distance field per stand-in.

Like Zombie Tag, it costs a **second WebGL context** while a race is up.
