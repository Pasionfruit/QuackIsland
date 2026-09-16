# 16-zombie-tag

## What this is

**Minigame 1.** Six zombies, an enclosed arena full of crates, and everybody
spawning in the middle. Outrun them. Get caught and you become one and join the
chase. The last player still running wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it — one line in `src/App.tsx` — and from that
moment the dashboard's Zombie Tag tile leads somewhere real.

This is the **environment** and **controls** stages done. The assets stage is
not: the bodies are the island's capsule avatar painted a colour each, and the
crates are boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Spawn in the middle | `playerSpawns` — a ring of `ARENA.spawnRing`, and a test that the middle is clear of crates |
| Collision enabled | `separate` for bodies, `pushOutOfBox` for crates, `clampToArena` for walls |
| Six zombies | `ARENA.zombies` |
| Enclosed arena, obstacles | `ARENA`, `OBSTACLES` |
| Caught players join the chase | `catchPlayers`, and a test that a turned player immediately hunts |
| Players twice as fast | `ARENA.zombieSpeed` is *derived* from `playerSpeed`, not written beside it |
| Push, 3s cooldown, 1s stun | `shove`, `ARENA.pushCooldown`, `ARENA.pushStun` |
| Last survivor wins | `finish`, `placings` |
| Still camera over the whole map | `frameArena` — fixed, tilted sixty degrees, and framed to fit |

## The camera does not move, and it is not overhead

The whole arena is in frame for the entire round and the camera does not follow
anybody, so no part of the board is information you had to earn by looking the
right way. Six zombies closing from three sides is something you watch happen.

**It sits at sixty degrees**, measured up from the floor — ninety would be
straight down. That is the difference between a map and a room: at sixty
everything has a visible side as well as a top, the crates are things you get
*behind* rather than shapes you go around, and a body is a body rather than a
dot.

`frameArena(aspect)` works out where to stand. It frames against the smallest
sphere containing the arena rather than against its corners, which is
deliberately a little generous: one number then works at every window shape,
and the cost is some sky at the edges rather than somebody being caught out of
frame. The limiting angle is whichever of the vertical and horizontal fields of
view is narrower — get that backwards and the arena spills off the sides of a
narrow window.

There is a test that builds a real `PerspectiveCamera` from those numbers and
asserts every corner of the room, floor and wall-top, is inside its frustum, at
eight window shapes from half-width to ultrawide. That is the failure worth
catching by arithmetic: a corner off the edge of the screen is somewhere a
player can be caught out of sight.

Widening the window past square does not change the distance — a landscape
window is limited by its height — so making the browser wider gives you more
sky at the sides rather than a smaller arena.

## It is lit and dressed like the island

Not a second palette. The sun, the ambient and the hemisphere light are the
daylight preset `00-core` uses for the world, the floor is the terrain's sand
colour, and the background and fog are the island's sky. Making a minigame look
like the rest of the build turns out to be mostly a matter of not inventing new
colours for it.

**The bodies are the island's own avatar** — `createAvatar` from `02-player`,
the same capsule with the same face and the same arms you walk the beach in.
Nothing here is a second implementation of a body. The one thing added for this
game is a colour per body, because the world only ever needed red ones and an
arena needs to say at a glance who is chasing whom: you are blue, the other
runners green, the zombies purple. `createAvatar` now takes an optional colour
and caches a material per colour, so eight blue players cost one material.

A knocked-down body tips onto its back, the same way and the same direction the
world's does when it is stunned, so being down reads the same wherever you are.

**The game renders into its own canvas**, not the world's. The two never appear
at once — the minigame screen is opaque and covers the world — and keeping
them separate means this game owns its camera and its lights outright, with no
arbitration against a player controller that is not running. The cost is a
second WebGL context while a round is up, which is the honest price of the
isolation.

## Speed is a ratio, not two numbers

"Players move twice as fast as zombies" is a rule. Two constants sitting next
to each other are not a rule — they are two numbers that agree today. So
`ARENA.zombieSpeed` is a getter returning `playerSpeed / 2`, and there is a
test that a player covers twice the ground in the same time as well as one that
the numbers divide.

## The reach on a catch

`catchRange` is `radius * 2 + 0.25`, and the 0.25 is load-bearing.

Bodies are solid and are pushed apart to exactly `radius * 2` every frame. A
catch range of exactly `radius * 2` is therefore a range a zombie can never
quite be inside — whether it caught you would come down to which way the last
floating-point division rounded, which is how the first version behaved. Giving
a zombie arms slightly longer than its body is what makes touching somebody
mean catching them.

## The push costs the same whether it lands or not

Three seconds, hit or miss. A push that is free when it misses is a button you
hold down; a push that costs three seconds is a decision.

**Zombies cannot be pushed.** Being able to stun the thing chasing you turns
the chase into a stalemate — the push is there to disrupt the other runners,
which is what makes it interesting that everybody has one.

**A stunned player is still catchable.** Being down is a disadvantage, not a
shield, and that is the entire reason pushing somebody is worth doing.

## The other runners are stand-ins

Zombie Tag is a game for two to eight, and pushing another player and
outlasting them are half the rules. With nobody else in the arena there is
nothing to push and nothing to outlast, so the empty seats are filled by
runners that flee the nearest zombie.

**The rules cannot tell them apart from a keyboard.** `stepRound` takes a
roster and a map of intents; whether an intent came from `ai.ts`, from WASD, or
one day from another browser is not something it knows. That is exactly how a
real player gets dropped in later, and it is why `newRound` is the only thing
that will have to change.

They are opponents, not a benchmark. A runner flees the *nearest* zombie, which
means it can and does back itself into corners. A runner that balanced every
threat would thread the middle of the arena forever and nobody would ever
outlast one.

## Public contract

Everything below is exported because it is worth testing, not because anything
else needs it. Nothing outside this module should be reaching for it.

| Export | What it is |
| --- | --- |
| `ARENA`, `OBSTACLES`, `HALF_W`, `HALF_H` | The place, as numbers. |
| `pushOutOfBox`, `clampToArena`, `settle`, `inObstacle` | The one collision routine, and what it is made of. |
| `playerSpawns`, `zombieSpawns` | Where everybody starts. |
| `createRound`, `createBody`, `stepRound` | The round, and one step of it. All pure. |
| `shove`, `speedOf`, `survivors`, `zombies` | The rules, individually. |
| `placings`, `survivedFor` | The scoreboard. |
| `zombieIntent`, `runnerIntent`, `crowdIntents` | What the bodies nobody drives decide. |
| `newRound`, `ME`, `DEFAULT_RUNNERS` | Putting a round together. |
| `frameArena`, `headingToYaw`, `TILT`, `FOV`, `FLOOR` | Where the camera stands, and which way a body faces. Pure. |
| `ZombieTagScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Nothing leaves the arena and nothing ends up inside a crate**, in any
  direction, at any speed. Tested by walking a body across the whole board
  eight ways and checking every frame.
- **A player moves at exactly twice a zombie.** Tested as a ratio and as
  distance covered.
- **A diagonal is not faster than a straight line.**
- **A push costs three seconds whether or not it connects**, and cannot be
  thrown by a zombie or by somebody on the floor.
- **The round ends at one survivor**, not zero — a last player with nobody left
  to outlast has already won.
- **The six the round started with never appear on the scoreboard.** They were
  never running, and an uncaught body sorts as having lasted forever.
- **A huge frame delta is clamped**, so a backgrounded tab cannot make a zombie
  step over somebody instead of catching them.
- **The whole room is in frame at any window shape.** Tested against a real
  camera frustum, corners and wall-tops, at eight aspect ratios.
- **The camera is at sixty degrees and over the middle.** Tested.

## Deliberate non-goals

- No models. Capsules and boxes, lit properly.
- No multiplayer round. The other runners are stand-ins, not peers.
- No moving camera, ever. The still tilted view is the game.
- No pathfinding — zombies go at you and turn aside when a crate is in the way.
- No sound, no score kept between rounds, no ranking across a party.

## Known limitations

- **A round is yours alone.** `15-minigames` starts a run locally, so this is
  you and some stand-ins rather than a lobby. Block 16.7.
- **The avoidance is shallow.** A body in a dead end will scrape along a wall
  rather than back out of it. It never gets stuck permanently, because whatever
  it is fleeing eventually moves, but it does not look clever.
- **Six zombies at half speed cannot reliably catch a good runner** in an arena
  this size. The pressure comes from the arena filling up with caught players,
  which means a two-player round can run long. Worth tuning once people have
  actually played it.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames** in the
party panel, and open **1 · Zombie Tag**. Read it, then press **play**.

- **Watch the countdown finish.** Three, two, one, and then an arena rather
  than a page saying nothing is built.
- **Look at the angle.** You should be looking *across* the room from high up
  and in front, not straight down at it — the crates should have visible sides
  and cast shadows across the sand, and the far wall should be behind the
  arena rather than around it.
- **Look at the whole board.** Every wall and every crate at once, and it
  should not move, ever — not when you run to the edge, not when you resize the
  window. Drag the window narrow and tall: the camera should back off so it all
  still fits, and nothing should ever leave the frame.
- **Find yourself.** The blue capsule with the ring under it. It should be the
  same pill you walk the island in, with the same face and arms, and it should
  turn to face the way it is running.
- **Look at the light.** Same sun, same sand, same sky blue as the beach you
  came from. If it looks like a different game's art, the palette drifted.
- **Walk into a crate, and into a wall.** You should stop, not pass through and
  not stick.
- **Walk into a zombie.** It should be solid.
- **Run from one.** You should pull away easily — you are twice its pace. One
  zombie alone should never catch a runner who is paying attention.
- **Let one catch you.** You turn purple, join the chase, and the round carries
  on without you until one runner is left.
- **Press space next to a green runner.** They should tip over onto their back
  for a second with a yellow ring under them, and your push pill should count
  back up from three.
- **Press space with nobody near you.** It should still cost the three seconds.
- **Push somebody into a zombie's path.** They should get caught while down —
  being stunned is not protection.
- **Let the round finish.** A card should list everybody who was ever a player,
  longest survival first, with the six zombies nowhere on it. **Again** should
  start a fresh round.
- **Press escape mid-round.** Back to the grid, and opening the game again
  should give a fresh briefing rather than the round you walked out of.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. A round is roughly thirty draw calls — two per body, fourteen
for the room — with one shadow-casting light over a 1024 map. The simulation is
a few hundred distance checks a frame.

The honest cost is the **second WebGL context**: the world's canvas is still
alive behind the opaque minigame screen while a round is up. Worth revisiting
if it shows up on a slow machine.
