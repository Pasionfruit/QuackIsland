# 31-helping-dad

## What this is

Minigame 18, free-for-all. **A maze in the dark, and a torch in your own colour
on the mouse.** After a three, two, one you put the mouse on your torch to pick
it up, and it follows the mouse - no faster than a careful walk. Touch a wall
and Dad yells: you drop the torch and stand there stunned for a second and a
half, then you have to pick it up again where it fell. Reach the green finish
to place, in the order you get there. At two minutes anybody still inside is
placed by how far they had left to go.

Three things make it a maze worth being in the dark for:

- **The corridors are narrow.** A torch in the middle of one has less room
  either side of it than the torch is wide.
- **The whole maze turns**, slowly, one way, from the whistle. A mouse left
  where it was is a torch walking into a wall: you have to go round with it.
- **Dad's junk slides up and down the corridors.** A piece is wider than the
  room beside it, so a corridor with one in it is shut until it has gone past.
  Go into one and it is a bump like any other; one sliding onto a torch that is
  holding still is not.

It plugs into `15-minigames` with `registerMinigame('helping-dad', ...)` and
one import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The maze

**8 cells across, 8 down, 0.95 m a cell, walls 0.2 m thick and 0.25 m high.**
A perfect maze - exactly one way between any two cells - carved by a seeded
depth-first walk, so every browser with the seed has the same maze and the maze
itself never goes on the wire. The start is the bottom-left cell, the finish
the top-right. **Square**, because a maze that turns sweeps a circle, and a long
thin one would spend most of the frame being somewhere the maze is not.

Walls are boxes on the cell edges, each one a wall's thickness longer than its
edge so the corners are filled. `mazeFor(seed)` also works out, by a walk back
from the finish, how many cells every cell is from it: that is what places
anybody who did not get out, what the stand-ins follow, and what the tests walk.

### The turn

`mazeAngle(seed, t)` is how far round it has gone: a seeded direction, and a
rate eased in over four seconds and flat out at 0.085 rad/s after - a turn and a
half in a round. It is the integral of a rate that ramps and then holds, so both
the angle and the speed are smooth and it never jumps or goes back on itself.
Nothing about it goes on the wire; every screen works it out from the clock.

**Everything in the rules is in the maze's own frame.** The turn is two lines:
the scene puts the maze, the pads, the junk and every torch in one group and
sets its heading, and the screen reads the mouse back the other way with
`intoMaze` before the rules see it. So a torch's position means the same thing
on every screen however far round the maze has gone, and the wire did not change
at all.

### Dad's junk

**Five pieces**, each on its own straight run of corridor, all from the seed.
Every opening is pushed on as far as its corridor runs straight, up to four
cells, and **the longest runs are taken first**: a piece on a one-cell run is in
that corridor the whole time, which is a closed door rather than an obstacle, and
on a three-cell run it is away from either end for seconds at a stretch, which is
the window you go through. No run touches the start or the finish, and no two
runs share a cell.

A piece is a circle of 0.15 m sliding end to end and back for ever at its own
pace, 0.7 to 1.1 m/s, from its own place in the run - `junkAt(piece, t)`, a pure
function of the clock. **It cannot be squeezed past**: a corridor leaves a
torch's middle 0.175 m either side of its line, and a piece on that line keeps a
torch's middle 0.35 m away.

**It is a wall that moves.** Going into one is a wall touched - the same yell,
the same drop, the same stun. One sliding *onto* a torch that is standing still
is not, because the rule is the wall's rule: you touch things, things do not
touch you. And a piece that has rolled onto a still torch lets that torch out
again rather than pinning it where it stands, which is the difference between an
obstacle and a trap.

## The torch

A torch is a circle of 0.2 m. **It moves, it does not jump.** However fast the
mouse goes, the torch goes towards it at most 3.5 m/s, checked four centimetres
at a time, so it can never pass through a wall or through a piece of junk: a wall
in the way is a wall touched, and the torch stops just short of it.

Between the wall middles there is 0.375 m either side of a cell's centre, which
leaves a careful torch **0.175 m** of room - less than the torch is wide. Tested:
a torch in the middle of any cell touches nothing, and there is less room beside
it than there is torch.

**Picking it up means the mouse is on it:** within 0.35 m - inside the room a
narrow corridor leaves, so a mouse within reach is in the corridor and not in the
wall beside it - and with no wall in between. The second half is there for the
most natural thing a player does after touching a wall, which is to leave the mouse where it was - in the wall.
Without it the torch would be picked straight back up the moment the stun wore
off and walked into the same wall again, stunning you over and over for not
moving. Tested.

It cannot be picked up during the countdown, and a stunned torch does not move
or get picked up at all.

## The end

The game ends when **three have finished, everybody still in the lobby has, or at two
minutes**, whichever comes first. The host decides.

Placings: finishers by time, to the hundredth, as it goes on the wire, so every
screen places from the same numbers. Then anybody still in the maze, by the
walking distance they had left. Then anybody who left. Torches level with each
other share a place.

## The camera and the dark

A still camera at 70° from the ground, fitted like the other minigames': slid
along its line of sight until the maze and Dad touch the edge of the frame at
any window shape, and aimed so the space above and below is even. **What has to
be in frame is not the maze's four corners but the circle they sweep** - `SWEEP`
- so the camera sits a little further back than a still maze of this size would
need. The camera itself still never moves.

**The torch is carried at the height of the wall tops**, and the mouse is cast
onto that height rather than the floor, so what you see a ring touch is what it
touches. The camera is steep enough that a wall's top overhangs the floor
beside it by under 10 cm. Tested at eight window shapes, and the mouse maps back
to the point it is over to four decimal places.

**Only your own torch lights the maze**: a point light over your ring and a
pool of your colour on the floor. Everybody else's torch is a ring and a small
glow you can see, and lights nothing. Your ring is drawn over theirs - you all
start in one cell and often take the same way. While you hold it, a small white
ring shows where the mouse is. Dropped, your ring blinks; stunned, it flickers
red and white and the screen edges go red.

**Dad stands at the top edge** under his own lamp - the island's capsule body in
a flat cap, leaning back so the camera sees his face. When your torch touches a
wall he jumps, and the banner at the bottom shouts one of five lines at you.

## One maze across the lobby

**The host runs the game** - the clock, their own torch, the stand-ins, the end -
and sends a snapshot ten times a second: every torch's position, whether it is
held, stun, walls touched, finish time and whether its player has left. Eight
torches fit well under the relay's 4 KB.

**A guest moves its own torch on its own screen.** How close you steer to a wall
is a matter of pixels and milliseconds and cannot wait for a round trip, so a
guest judges its own wall touches and reports its position and wall count
twenty times a second. The host takes that position only as far as the torch
could have gone since it last heard (1.5x the torch's speed, plus 25 cm of
slack) and never through the middle of a wall. More walls than the host knew of
is a stun on the host too. The finish time is the host's.

A guest's copy keeps its own torch where its own screen has it and takes the
rest from the host; once the game is over, the host's word is everything. A
guest's clock eases towards the host's, jumping if it is more than 0.4 s off.

Somebody who leaves the lobby is out, and placed last. a pause stops the round for everybody; alone, it stops the clock.

## Stand-ins

**Only when you are alone**: you and three stand-ins. In a lobby it is the host
and everybody else, up to eight, with no stand-ins.

A stand-in is in the dark too. It follows the way out cell middle to cell middle,
so it never cuts a corner, at its own pace of 1.6-2.3 m/s. At a turning, a fifth
of the time, it tries a wrong branch first - up to three cells in, then back.
Each second there is a 4% chance it is careless and touches a wall, and it is
stunned like anybody else. **Dad's junk it sees**: rather than walk into a piece
in front of it, it stands still and waits for it to slide past - which is the
same rule everybody plays by. Only what is in front counts, or a piece that had
just gone by would keep it standing there for ever.

It is quicker and steadier than it was because the maze is square now and the way
out is long, and because waiting for junk costs it time: a stand-in at the old
pace would still be in the maze at two minutes. All of it is worked out from the
seed, so the same game plays out the same way. Tested over forty seeds: they
always get out inside the limit - the slowest in eighty seconds - some touch a
wall, and none ever passes through one.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `GRID`, `HALF` | The maze's size: cells, cell width, wall thickness and height, and the half extents. |
| `mazeFor`, `Maze`, `Cell`, `Box`, `Point` | The maze for a seed. Cached; the same seed, the same maze. |
| `cellAt`, `cellCentre`, `isOpen`, `touchesWall` | Reading it. All pure. |
| `stepsToFinish`, `nextCell`, `routeTarget`, `ON_LINE`, `distanceToFinish` | The way out, and how far there is to go. All pure. |
| `ROTATE`, `mazeAngle`, `intoMaze`, `intoWorld`, `angleOf` | The turn, and the two ways between the maze's frame and the world. All pure. |
| `JUNK`, `Junk`, `junkAt`, `touchesJunk`, `inJunk` | Dad's junk: where each piece is at a moment, and what it is touching. All pure. |
| `TORCH`, `ROUND`, `COLOURS` | Radius, pick-up reach, speed, stun, finish reach; countdown and time limit; eight torch colours. |
| `createGame`, `Game`, `Torch`, `Entrant` | A game at its start. |
| `steer`, `SteerResult` | The mouse at a point **in the maze's frame** for a frame: pick up, move, touch a wall or a piece of junk, finish. Pure. |
| `report` | A guest's position and wall count, taken as far as it could be true. Pure. |
| `tick`, `judgeEnd`, `stepGame`, `clock`, `canMove`, `hit`, `arrive`, `leave` | The clock, stuns, the end and leaving. All pure. |
| `placings`, `remaining`, `startPoint`, `finishPoint` | Who placed where, and the two ends of the maze. |
| `botSteer`, `botWalk`, `BOT_PACE`, `BOT_REACTION`, `BOT_CARELESS`, `BOT_WANDER` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_TORCHES`, `MAX_TORCHES`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG`, `Snapshot`, `WireTorch` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `cameraFor`, `frameScene`, `aimAt`, `DAD`, `HOLD`, `POINTS`, `SWEEP`, `TILT`, `FOV`, `FILL`, `Shot` | The fixed camera, fitted to the circle the turning maze sweeps, and the mouse on the ground. |
| `HelpingDadScreen`, `YELLS` | The panel `15-minigames` draws, and what Dad shouts. |

## Invariants you may rely on

- **The same seed makes the same maze**, and there is exactly one way to every
  cell. Tested over four seeds.
- **A torch never passes through a wall**, however fast the mouse goes. Tested.
- **A torch in the middle of any cell touches nothing** - but there is less room
  beside it than the torch is wide, and the pick-up reach fits inside that room.
  Tested.
- **The turn is one way round, eased in from a standstill, more than a whole turn
  in a round, and the same numbers on every screen.** Tested.
- **A point on the board reads back to the point in the maze it is over**, at
  every angle. Tested.
- **Every piece of junk stays on a straight run of corridor, never in a wall,
  never in the start or the finish, and never on another piece.** Tested over
  four seeds, a whole round at a time.
- **A piece cannot be squeezed past**: its radius plus a torch's is more than the
  room a corridor leaves a torch's middle. Tested.
- **Going into a piece is a bump like a wall; one that slid onto a torch holding
  still is not, and lets it out again.** Tested.
- **A torch goes no faster than `TORCH.speed`.** Tested.
- **A wall touched is one hit, a 1.5 s stun and a dropped torch**; a stunned
  torch does not move or get picked up, and afterwards it stays down until the
  mouse is back on it. Tested, in Node and in the browser.
- **A mouse left in a wall does not pick the torch back up.** Tested.
- **A guest's report never takes a torch through a wall or further than it
  could have gone.** Tested.
- **Finishers place by time, then the rest by distance left, then leavers**,
  with ties sharing a place. Tested, both at the finish and at the time limit.
- **Stand-ins always get out, never through a wall, the same way every time**,
  and they wait for junk rather than walking into it. Tested over four seeds, and
  over forty for the time limit.
- **Eight torches in one maze end the same on every screen**, with a fifth of
  the snapshots and a quarter of the reports lost. Tested in Node, and with eight
  real browsers.
- **The maze and Dad are in frame at every window shape, at every angle the maze
  turns to**, and the mouse maps to the exact point in the maze it is over.
  Tested.

## Deliberate non-goals

- No models: torches are rings and glows, Dad is the island's capsule, walls are
  boxes and his junk is a tin.
- No moving camera - the maze turns, not the camera.
- No torch lighting the maze but your own.
- No sound - Dad's yell is a banner. No score kept between games.

## Known limitations

- **A guest is trusted on its bumps and near-trusted on its position.** The host
  refuses a way through the middle of a wall and a position further than the
  torch could have gone, but a guest judges its own walls and its own junk - the
  host does not check junk at all, since where a piece is depends on a clock the
  two of them only agree on to a tenth of a second. So a modified client could
  report no bumps and shave corners by up to the torch's radius. For a party game
  among friends that is the right trade for steering that does not lag.
- **Other torches glow.** They light nothing, but the glow round them does show
  where they are in the dark, and so roughly where the corridors are.
- **A piece of junk has a band round it you can see unlit**, from anywhere, the
  way another torch's ring is visible. It is there so a shut corridor is
  something you see coming rather than something you find with your face, but it
  does give away where five corridors are.
- **You can walk out through a piece that rolled onto you** - and, against its
  direction, through it. Timing that is a real bit of skill and it gains almost
  nothing, since a piece that has passed you has already cleared the way ahead.
- **A stand-in is never bumped by junk**, only held up by it - it stops short and
  waits - the way it never really brushes a wall either.
- **Dad jumps only for your own bumps**, not for anybody else's.
- **A stand-in's careless moment is a roll, not a real touch.** It never actually
  brushes a wall; it is simply stunned where it stands.
- **The maze is the same size for two players as for eight.**

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Helping Dad**
and press play.

- **During the three, two, one**, the maze should be dark but for a pool of light
  in the bottom-left corner, with your ring on top of the stack, Dad at the top
  edge and a green finish glowing top right. Moving the mouse onto the torch
  should not pick it up until the count is done.
- **Put the mouse on your torch.** The hint banner should say the maze is
  turning, the cursor should hide, and a small white ring should show where the
  mouse is.
- **Hold the mouse still.** The maze should walk out from under it, and within a
  couple of seconds the torch should be into the wall beside it. That is the game.
- **Lead it slowly** round a corner, going round with the maze as it turns. The
  light should go with it, lighting only the walls near you. Everybody else's
  torch should be a small glow that lights nothing.
- **Find a piece of Dad's junk** - a tin with a faint band round it, sliding up
  and down a corridor. Going into it should be a bump like a wall. Waiting in
  front of it should not: it should slide over your ring and let you out the
  other side, and there should be no way past it while it is beside you.
- **Fling the mouse across a wall.** The torch should stop short of the wall,
  not come out the other side. Dad should jump, the banner should shout, the
  screen edges should go red, the ring should flicker, and it should count down
  1.5 s.
- **Leave the mouse where it is** once the stun ends. The torch should stay put
  and the banner should say to pick it up. Move the mouse onto it, and it goes.
- **Reach the finish.** Your torch should go, and the banner should say which
  place you came in while the others carry on.
- **Alone**, the three stand-ins should wander - some taking a wrong turning and
  coming back, some being stunned - and all get out in under two minutes.
- **The results** should be quickest out first, with walls touched and times,
  anybody who did not get out showing metres to go, and **again** for a new maze.
- **Resize the window**, tall and wide, and leave it a minute. The whole maze and
  Dad should stay in frame at every angle the maze turns to, and the mouse should
  stay exactly over the torch.
- **Press escape mid-game.** Alone, the clock should stop.

### With two or more browsers

- **Everybody should have the same maze**, with their own torch in their own
  colour lighting it, and nobody else's lighting anything.
- **A guest leading its torch** should show it moving on the host's screen, a
  little behind but along the same way.
- **A guest touching a wall** should show a stunned ring on the host and every
  other guest, once.
- **A guest closing their browser** should be out and placed last, and the game
  should end without waiting for them.
- **As a guest, the results** should say *waiting for the host*; the host's
  **again** should start everybody on a new maze.

`run-localrot` covers the first three of those with eight real browsers:
`lobby.mjs --games helping-dad` and `solo.mjs --game helping-dad --steer`. Both
lead their torches with `torchDrive`, which runs on the page's own frames - a
maze that turns makes a pointer left where it was a target sliding backwards,
so a driver updating two or three times a second loses ground it cannot get back.

## Gate record

Not yet gated by a human.

## Measured

Not measured. The budgets in `pipeline.json` are unset. Drawn per frame: one
instanced mesh for the walls, the floor, the start and finish pads, Dad, two
small meshes for each of the five pieces of junk, and four or five small meshes a
torch; one point light for your torch and one for Dad. The turn costs one group's
heading a frame.
