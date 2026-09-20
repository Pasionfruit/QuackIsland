# 51-perfect-game

## What this is

Minigame 27, one-vs-all: **Perfect Game.** One turn each while everybody else
watches. **A bent column of thirty crabs marches from left to right across the
beach.** The thrower has **ten seconds** to choose where to stand behind the line,
the angle of their coconut throw - and when to let it go. When time runs out it
rolls anyway. The coconut rolls along the chosen path, **hitting as many crabs as
it can: a point a crab.** The most points after everybody's turn wins. Hit all
thirty and that is a perfect game.

**WASD adjusts your position, the mouse aims, left click rolls the coconut.**

It plugs into `15-minigames` with `registerMinigame('perfect-game', ...)` and one
import line in `src/App.tsx`. It fills its own slot, 27, which was in the
catalogue already with its name and without a build; its description and controls
there are now the ones it was built to.

## The beach and the column

The beach is 32 m wide, running 35 m from the throwers down to the sea.

**The column** (`columnFor`): thirty crabs, one behind another from 4 m to 26 m
north of the line, **bent** into one of three shapes - **an arc, an S, or a
hook** - by 1.2 to 3.4 m, either way. **One column for the whole game**: it comes
from the seed alone, so **every thrower faces the same crabs**, in the same places
at the same moments of their turn. (It used to deal a new one each turn, so nobody
could copy the throw before theirs. Now they can, and a stand-in's throw is there
to be learned from.) A new game is a new seed and so a new column.

**It marches** from the left at 2.2 m/s (`columnX`), from the moment a turn's
aiming starts: off the left of the beach at first, right of the middle by the
time the ten seconds are up.

## The throw

- **Where**: anywhere in the box behind the line (`BOX`), 22 m wide.
- **The angle**: the throw points at wherever the mouse is on the sand, up to 69°
  either side of straight at the sea.
- **When**: a click rolls it; otherwise it rolls itself at ten seconds.
- **The coconut rolls** at 13 m/s, in a straight line, **and bounces off a wall down
  each side of the beach** (`WALL`) - the walls stand at the edge of the beach and
  the coconut's middle turns round a coconut's radius short of them - until it
  reaches the sea. A bounce is a mirror: the east-west half of its way turns
  round, the north-south half does not, so it goes on towards the sea the whole
  time and **a bounce costs it no time**. A steep throw crosses the beach three or
  four times.
- **A crab is hit** (`hits`) the first moment the coconut's middle comes within
  0.9 m of its middle - both their sizes. The coconut rolls on through, hitting
  every crab in its way. Because the column keeps marching while it rolls, **when
  you let go matters as much as where you aim.**

Between bounces coconut and crabs each move in a straight line at a steady speed,
so the path is cut into straight legs (`legsOf`) and each crab's hit - whether,
and exactly when, in the first leg that meets it - is solved in closed form leg by
leg rather than stepped:
nothing is ever missed however fast it rolls, and every screen gets the same
crabs from the same throw.

**How good can a throw be?** Searching every spot, angle and moment on a fine
grid: the best throw hits between 19 and 30 crabs depending on the column - **a
perfect game is possible on the gentlest columns**, and rare. A careless throw
hits a handful.

## Turns

**Everybody throws once, in an order shuffled by the seed** (`turnOrder`). A turn
is (`TURN`):

| Phase | How long | What happens |
| --- | --- | --- |
| intro | 3 s | *Next up: …* - not before the first turn, which the screen's own three-two-one counts in. |
| aim | up to 10 s | Move, aim, roll. The column marches. |
| rolling | until the coconut reaches the sea | The coconut rolls; crabs are knocked flying as it hits them; the count goes up. |
| result | 3 s | *N crabs!*, *No crabs!*, or *PERFECT GAME!* |

- **Somebody who has left** has their turn skipped; **a thrower who leaves**
  forfeits it, with nothing.
- **At the end**: the most crabs first, level scores sharing a place, anybody who
  left last.

## Controls

- **WASD / arrows** walk you round the box, on your turn, while aiming.
- **The mouse** aims: the throw points at the spot on the sand under it. The
  cursor is a crosshair.
- **Left click** rolls.
- Not your turn: nothing does anything - you watch.

## On the screen

- **From high behind the line**, the whole beach in view, leaning a little
  towards the thrower.
- **The crabs**: little red crabs with claws and eyes on stalks, facing the
  throwers and **scuttling sideways** as the column marches.
- **The thrower** stands at their spot facing their aim with the coconut; **a
  dotted line shows everybody where they are aiming**, running on to the edge of
  the beach. Everybody else watches from the ends of the line.
- **The roll**: the coconut trundles off, turning; every crab it hits is flung up
  and away, spinning, and gone; a big running count bottom right.
- **The HUD**: the turn, the ten seconds, and everybody in turn order with their
  score - 🥥 for the thrower, … for those still to go.
- **Sound**: a throw, a bonk for every crab - rising as they mount up - and a
  cheer for fifteen or more, a buzz for none.
- **The results** are the podium, from `useFinish`.

## One beach across the lobby

**Only the throw goes on the wire.** The host runs the clock and the turns and
sends a snapshot twenty times a second (`pg`): whose turn, when its aiming began,
the thrower's aim, when they rolled, and the scores. The column is the seed's and
the turn's and the hits follow from the throw, so every screen works them out.

**On a guest's own turn, its aim is its own**: it walks and aims on its own screen
at once, rolls the moment it clicks, and sends its aim and **when it rolled, by
its own clock** (`pg-in`). The host takes the roll time if it is no more than half
a second old (`ROLL_SLACK`) and not in the future - a throw is judged by the
moment the thrower let go, not by their ping. Everybody else sees the aim as the
host passes it on.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and **two** stand-ins - every turn is watched, so
three turns (about a minute) is plenty.

- **A stand-in finds the best throw there is** (`bestThrow`): it tries every spot
  along the line, every angle and every moment from three seconds in - time to walk
  anywhere - with the same exact arithmetic as the rules, walls included. The
  column is the game's, so the best throw is too: it is worked out once and every
  stand-in's every turn starts from it.
- **Then its hand shakes**: it lets go off its angle by up to 0.015-0.09 rad and
  off its moment by up to 0.35 s, how much depending on the stand-in. It rarely
  gets the throw it planned.
- It **walks to its spot and swings its aim round** in plain sight, and rolls at
  the moment it chose.

All from the seed: the same game plays out the same way.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `BEACH`, `BOX`, `COLUMN`, `COCONUT`, `WALL` | The numbers. |
| `columnFor`, `Column`, `Shape`, `bendAt`, `columnX`, `crabAt` | The game's column, from the seed, and where it is when. |
| `heading`, `headingAt`, `travel`, `coconutAt`, `pathAt`, `foldX`, `legsOf`, `Leg`, `hits`, `clampThrow`, `Throw` | The coconut - straight and off the walls - and which crabs a throw hits. |
| `TURN`, `HOME`, `ROLL_SLACK`, `COLOURS` | The turn's timings, where a thrower starts, how old a guest's roll may be. |
| `createGame`, `Game`, `Player`, `Entrant`, `Phase`, `turnOrder` | A game at its start. |
| `thrower`, `tau`, `phaseOf`, `aimTo`, `roll`, `throwOf`, `turnHits` | A turn. |
| `tick`, `stepGame`, `advanceTurn`, `judgeEnd`, `leave`, `placings` | The clock, the turns, the end, and who placed where. |
| `BOT`, `botAim`, `bestThrow` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `BeachScene`, `PALETTE`, `PointerRef` | The 3D view. |
| `BeachScreen`, `WALK` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **Thirty crabs from near end to far, bent, the same for the same seed; all three
  shapes, bent both ways, from one seed to another. One column for the whole game:
  there is no turn to ask it for.** Tested.
- **The column marches left to right from off the left of the beach.** Tested.
- **The coconut rolls straight the way it is aimed until it reaches a wall, and
  bounces off it - never past it, never with a jump, the east-west way turned round
  and the north-south way kept - until it reaches the sea; the thrower stays in the
  box and the angle in range.** Tested.
- **The legs of its path join up end to end, and a crab is hit once however many
  legs pass it.** Tested.
- **The hits are exactly the crabs the coconut comes within reach of** - checked
  against stepping it through finely, straight and after a bounce - **in the order
  it meets them, never before the roll.** Tested.
- **A perfect game is possible, and nothing more.** Tested.
- **Everybody throws once, in an order from the seed; the first turn aims at once,
  every other has its "next up"; a turn rolls itself at ten seconds; only the
  thrower aims and rolls; a leaver's turn is skipped or forfeit.** Tested.
- **A guest's roll is believed from its own clock, but never the future or more
  than half a second back.** Tested.
- **Every screen hits the same crabs from the same snapshot**, and a guest's own
  aim is left alone on its own turn. Tested.
- **The stand-ins find a good throw, rarely make it, and play the same way every
  time.** Tested.

## Deliberate non-goals

- No models: the beach, the crabs and the coconut are primitives, players are the
  island's capsule.
- No spin on the throw: the coconut rolls dead straight between walls.
- No ceiling on the bounces and no loss of speed at a wall: it goes on at full
  speed until it reaches the sea.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest's clock is trusted** for its roll, within half a second.
- **The column marches through the walls.** It starts off the left of the beach and
  ends off the right, and the walls stand across its way; the crabs sink out of
  sight below the sand as they cross one, and come up out of it, rather than
  scuttling through solid wall. A crab beyond a wall cannot be hit, since the
  coconut's middle cannot get past it.
- **Everybody throws at the same column.** A thrower who watches the ones before
  them can copy a throw that worked, and a stand-in's throw is the best there is,
  shaken. That is what was asked for; it makes going last an advantage.
- **The mouse aims only over the sand**: pointed at the sea or the sky, the aim
  holds where it was.
- **Not played with two browsers yet.** The wire is tested in Node only, and
  `lobby.mjs` does not know this game.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Perfect Game**
(27) and press play. `node .claude/skills/run-localrot/scripts/solo.mjs --game
perfect-game --steer` watches the stand-ins, then on your turn checks D moves you
and the mouse swings the aim both ways through real pointer events, rolls with a
click, and waits for the podium.

- **Watch a stand-in's turn**: it should walk to its spot, swing its dotted aim
  round, and roll; crabs it hits fly off and the count goes up.
- **On your turn**: WASD should walk you round the box behind the rope; the dotted
  line should follow the mouse over the sand.
- **Let the ten seconds run out**: it should roll by itself.
- **Next time, click early** with the column still coming: time it so the column
  walks into the coconut's path. The result should say how many crabs.
- **Look at the column across turns**: it should be **the same crabs in the same
  shape every turn**, an arc, an S or a hook, bent one way or the other, and only
  a new game should change it.
- **Look at the sides of the beach**: a low wooden wall down each. The dotted aim
  line should **bend off them**, running on across the beach the way the coconut
  will go. Aim hard to one side: the dots should reach the wall and come back.
- **Roll one at a wall**: the coconut should bounce off it, roll on the other way
  and keep hitting crabs, spinning the right way after the bounce. The result
  should count crabs hit after the bounce.
- **At the end** the podium, the most crabs highest.

### With two or more browsers

- **Everybody should see the same column, the thrower's aim moving live, and the
  same crabs knocked flying.**
- **A guest's roll should hit what it looked like it would on its own screen.**

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the sand,
the sea and surf, the rope and posts, the box, eight palms, thirty crabs of about a
dozen meshes each, the coconut, one instanced mesh of sixty aim dots, and per
player the island's avatar.
