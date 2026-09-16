# 16-zombie-tag

## What this is

**Minigame 1.** Six zombies, an enclosed arena full of crates, and everybody
spawning in the middle. Outrun them. Get caught and you become one and join the
chase. The last player still running wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it — one line in `src/App.tsx` — and from that
moment the dashboard's Zombie Tag tile leads somewhere real.

This is the **environment** and **controls** stages done. The assets stage is
not: every body is a coloured circle and every crate a brown rectangle.

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
| Still camera over the whole map | An SVG `viewBox`. There is no camera code at all |

## The camera does not move, and that is the game

The whole arena is drawn at once, from above, and it stays exactly where it is
for the entire round. Six zombies closing from three sides is something you
watch happen rather than something that surprises you, and no part of the board
is information you had to earn by looking the right way.

It is an SVG with a fixed `viewBox` and `preserveAspectRatio="xMidYMid meet"`,
which means the browser fits the arena into whatever room the window has —
centred, undistorted, never scrolling — and **there is no camera code in this
module at all**. That is not a shortcut; it is the cheapest possible way to
have exactly the camera the game wants and no way to accidentally acquire a
different one.

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

## Deliberate non-goals

- No assets. Coloured circles and brown rectangles.
- No multiplayer round. The other runners are stand-ins, not peers.
- No moving camera, ever. The still overhead view is the game.
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
- **Look at the whole board.** You should see every wall and every crate at
  once, and it should not move, ever — not when you walk to the edge, not when
  you resize the window. Resize it: the arena should stay centred and keep its
  shape, with no scrollbar.
- **Find yourself.** The blue circle with the dark outline. The pale dot on it
  is the way you are facing.
- **Walk into a crate, and into a wall.** You should stop, not pass through and
  not stick.
- **Walk into a zombie.** It should be solid.
- **Run from one.** You should pull away easily — you are twice its pace. One
  zombie alone should never catch a runner who is paying attention.
- **Let one catch you.** You turn purple, join the chase, and the round carries
  on without you until one runner is left.
- **Press space next to a green runner.** They should go down for a second with
  a yellow ring, and your push pill should count back up from three.
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

Nothing to measure: no draw calls, no triangles. The game is an SVG and only
exists while it is open. Fourteen bodies against ten crates is a few hundred
distance checks a frame.
