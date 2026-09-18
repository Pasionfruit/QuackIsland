# 16-zombie-tag

## What this is

**Minigame 1.** Six zombies, an enclosed arena full of graves, and everybody
spawning in the middle. Outrun them. Get caught and you become one and join the
chase. The last player still running wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
In a lobby, everybody who was brought into the game by the host is in **one
round** - the same arena, the same zombies, chasing the same people.
Importing the module registers it — one line in `src/App.tsx` — and from that
moment the dashboard's Zombie Tag tile leads somewhere real.

This is the **environment** and **controls** stages done. The assets stage is
not: the bodies are the island's capsule avatar painted a colour each, and the
graves are boxes and cylinders.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Spawn in the middle | `playerSpawns` — a ring of `ARENA.spawnRing`, and a test that the middle is clear of crates |
| Collision enabled | `separate` for bodies, `pushOutOfBox` for crates, `clampToArena` for walls |
| Six zombies | `ARENA.zombies` |
| Enclosed arena, obstacles | `ARENA`, `OBSTACLES` |
| Caught players join the chase | `catchPlayers`, and a test that a turned player immediately hunts |
| Turning: a 0.1s beat, then a spin | `ARENA.turnDelay`, `ARENA.turnSpin`, `turnPose` in the scene |
| The last catch plays out before the end | `finish`, and a test that everything else freezes meanwhile |
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

`frameArena(aspect)` works out where to stand, and **the room fills the
window.** It fits the room as drawn - slab, walls and wall tops - exactly into
the frame, leaving only the sliver `FILL` keeps back, rather than framing a
generous sphere round it. That sphere left a wide border of sky on every
landscape window; fitting the box brings the camera in by about 1.7x at 16:10.

**It aims a little nearer than the middle.** At sixty degrees the near half of
the room comes out bigger than the far half, so aiming at the centre leaves
more sky above the far wall than below the near one. The aim slides along the
depth until the two are even, which is also what keeps the room centred on a
narrow window where the width, not the height, decides the distance.

There is a test that builds a real `PerspectiveCamera` from those numbers and
asserts every corner of the room, slab to wall-top, is inside its frustum, at
eight window shapes from half-width to ultrawide - and another that the room
actually reaches the edge of the frame at each of them, so the fit cannot
quietly go back to leaving a border. That is the failure worth catching by
arithmetic: a corner off the edge of the screen is somewhere a player can be
caught out of sight.

Widening the window comes closer until the height is what limits it, and from
there more width gives you more sky at the sides rather than a bigger room.

## It is a graveyard, at night

The arena is a walled cemetery after dark. Cool moonlight comes from over the
camera's shoulder and is the only light that casts shadows, so the shadow
budget matches the old daylight. Six lamp posts stand on the wall, one at each
corner and one halfway along each long side, and pool warm light on the grass
with no shadows of their own. The barriers are **grave plots**: a low stone
kerb over exactly the footprint the rules collide with, with a row of
headstones along its back edge, or an obelisk on the two square ones. The kerb
keeps the drawing honest: the gaps between headstones look walkable, and they
are not. The stones lean a little, each its own way, and the lean is worked out
from their position rather than from a random number, so every browser draws
the same graveyard.

The body colours are the daytime ones, unchanged. They are how you tell who
is chasing whom, so the rest of the scene stays dark and cool around them.

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

## Being caught is a turn you can see

A caught body stands still for `turnDelay` (0.1s), then spins twice with a hop
over `turnSpin` (0.6s). It keeps the colour it was caught in until halfway
through the spin and comes out purple. For all of that time it cannot move
and cannot catch. The spin is timed by each browser's own frame clock from
when the turn starts, not by `turning` off the wire: a guest hears that twenty
times a second, which is too coarse to animate from.

**The round does not end on the last catch.** When one player is left, the
winner is decided on that frame. Then everything freezes except the turn,
including the clock, so the winner's time is the moment they were left alone.
The second-to-last player turns in full, and only then is the round `over` and
Finish comes up. A winner with `over` still false means that moment, and it
goes over the wire like any other snapshot.

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

## One round, and it is the host's

**The host runs the game; everybody else sends their keys and watches.** There
is exactly one simulation in a lobby, in the host's browser. A guest sends what
it is pressing (`zt-in`); the host sends where everything ended up (`zt`),
twenty times a second. Two browsers cannot disagree about who was caught,
because only one of them is deciding. The pure half is `wire.ts`; the half that
touches a socket is `useRoundNet.ts`.

**The rules cannot tell a guest from a keyboard.** `stepRound` takes a roster
and a map of intents; whether an intent came from `ai.ts`, from WASD, or from
another browser is not something it knows. That is why syncing a round changed
who fills the map and nothing in the rules.

**The roster is the lobby, read when the round is dealt.** Host first, then
everybody else in id order. Somebody arriving mid-round waits for the next one.
Anybody in the lobby who walked out of the game still has a body, and a stand-in
runs it for them.

The parts that are easy to get wrong, and what is done about each:

- **A guest keeps listening after the round ends.** The screen calls `advance`
  every frame, over or not, and the host keeps sending. Otherwise a guest never
  sees the round end, and never sees **again** deal the next one.
- **A guest's keys are repeated four times a second**, and forgotten by the host
  after a second of silence. A missed message is a hiccup, not a body that never
  moves, and a guest who drops out stops rather than running into a wall.
- **Leaving a round sends "nothing pressed"** on the way out, for the same
  reason.
- **A push survives two messages landing in one frame.** `hearIntent` keeps it
  until it is thrown. Tested.
- **Push cooldown is on the wire**, so a guest's push meter counts down.
- **A guest is eased towards the host**, and snapped when the gap is too big to
  have walked, such as a fresh round.

**A pause is shared, the same as `15-minigames` says.** Anybody can stop the
round and it stops for everybody - the host's simulation included - and only
whoever stopped it can start it again. Alone, that is just you. Before that
change it stopped only your hands: your body stood still and the
round carries on, host or guest, because the round is everybody's.

**Only the host can press again.** A guest's card says it is waiting for them.

## Empty seats are filled, alone

Zombie Tag is a game for two to eight, and pushing another player and
outlasting them are half the rules. Alone there is nothing to push and nothing
to outlast, so the empty seats are filled by runners that flee the nearest
zombie. **A lobby with only you in it counts as alone.** A roster of one would
end on its first frame, because one survivor has already won. With two or more
people, nobody is added: real people are better opponents than these.

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
| `newRound`, `emptyRound`, `lobbyRoster`, `myId`, `ME`, `SOLO_RUNNERS` | Putting a round together, from the lobby or alone. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `hearIntent`, `easeTowards`, `SNAP_DISTANCE`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. All pure. |
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
  to outlast has already won. It is won on the catch and over when that
  catch has finished turning, and nothing can move or be caught in between.
- **The six the round started with never appear on the scoreboard.** They were
  never running, and an uncaught body sorts as having lasted forever.
- **A huge frame delta is clamped**, so a backgrounded tab cannot make a zombie
  step over somebody instead of catching them.
- **The whole room is in frame at any window shape, and fills it.** Tested
  against a real camera frustum, corners and wall-tops, at eight aspect ratios:
  every corner inside, one side reaching the edge, and the sky even top and
  bottom.
- **The camera is at sixty degrees and over the middle.** Tested.
- **A snapshot comes back as the round that went out**, carries the end of a
  round and the next one, moves a guest's bodies rather than rebuilding them,
  and is refused whole if any part of it is wrong. Tested.
- **A full arena fits in one relay message.** Tested.
- **A lobby of one is not a finished round.** Tested.

## Eight at once

Eight is the most this is built for, and there is a test that plays a round
out between a host and seven guests, every message through JSON the way the
relay hands it over: all eight dealt in, every guest shown the same round with
their own body in it, each guest's keys moving them and nobody else, a snapshot
of all eight inside the relay's 4 KB, and the host's messages a second - duck,
round, clock, and a pong for each of seven others' pings - inside its limit of
sixty. See `lobby8.test.ts`.

Running it for real, eight tabs in one lobby, found something no two-browser
test would: **a guest who takes over as host before any snapshot has reached
them holds an empty round**, and an empty round stepped is over on its first
frame. Sent, it ended the game for everybody. So a host never runs or sends a
round nobody was dealt into, and a guest refuses a snapshot with nobody in it.
The takeover itself was `09-net` dropping a peer that was still there, fixed
there.

## Deliberate non-goals

- No models. Capsules, and graves built from boxes and cylinders, lit properly.
- No authority. The host is trusted with the round, the same way the island
  trusts the host with the clock.
- No moving camera, ever. The still tilted view is the game.
- No pathfinding — zombies go at you and turn aside when a crate is in the way.
- No sound, no score kept between rounds, no ranking across a party.

## Known limitations

- **A guest is a round trip behind their own keys.** Their body moves when the
  host says it moved: about 50 ms plus ping. That is fine for a chase and would
  not be for anything twitchier. There is no prediction.
- **A body is not handed to a new host.** If the host leaves, `15-minigames`
  takes everybody out, so there is no round to carry on.
- **Names are lobby names or ids.** The scoreboard uses the name somebody
  joined with, and the id if there isn't one.
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
  and in front, not straight down at it — the headstones should have visible sides
  and cast shadows across the grass, and the far wall should be behind the
  arena rather than around it.
- **Look at the whole board.** Every wall and every grave at once, filling the
  window edge to edge on one side with only a sliver of sky, and it should not
  move, ever — not when you run to the edge, not when you resize the
  window. Drag the window narrow and tall: the camera should back off so it all
  still fits, and nothing should ever leave the frame.
- **Find yourself.** The blue capsule with the ring under it. It should be the
  same pill you walk the island in, with the same face and arms, and it should
  turn to face the way it is running.
- **Look at the light.** Night: dark grass, moonlit headstones, warm pools
  under the six lamps on the wall. The bodies should still be easy to pick out
  from each other.
- **Look at the graves.** Each row of headstones stands on a kerb. Walking
  into the kerb should stop you in the same place as it looks like it should.
- **Walk into a grave, and into a wall.** You should stop, not pass through and
  not stick.
- **Walk into a zombie.** It should be solid.
- **Run from one.** You should pull away easily — you are twice its pace. One
  zombie alone should never catch a runner who is paying attention.
- **Let one catch you.** You stand still for a beat, spin, come out purple,
  join the chase, and the round carries on without you until one runner is
  left.
- **Watch the last catch.** Everything should freeze, the timer too, while the
  second-to-last runner spins into a zombie. Finish comes up after that, not
  on the catch.
- **Press space next to a green runner.** They should tip over onto their back
  for a second with a yellow ring under them, and your push pill should count
  back up from three.
- **Press space with nobody near you.** It should still cost the three seconds.
- **Push somebody into a zombie's path.** They should get caught while down —
  being stunned is not protection.
- **Let the round finish.** A card should list everybody who was ever a player,
  longest survival first, with the six zombies nowhere on it. **Again** should
  start a fresh round.
- **Press escape mid-round, alone.** The round should stop dead — nobody
  moving, no timer climbing — with a card offering resume. Resume and it
  carries on from exactly there.

### With two browsers

Make a lobby in one, join it from the other, and have the host open Zombie Tag
and press play.

- **Look for each other.** Each browser should show itself in blue and the
  other person in green, **in the same place in both**, and no stand-in
  runners. Six zombies in both, in the same places.
- **Move in each.** The other browser should see you move, smoothly rather
  than in steps. The guest's own body should respond within a blink.
- **Guest: push the host.** The host should tip over in *both* browsers, and
  the guest's push pill should count down from three.
- **Get one of you caught.** They should turn purple in both, at the same
  moment.
- **Let the round finish.** Both should get the card with the same winner and
  the same order, with names. The guest's card should say it is waiting for the
  host. **Host: press again.** Both should go into the same new round.
- **Guest: hold a direction and press escape.** Their body should stop in both
  browsers, and the round should carry on. Resume, and it moves again.
- **Host: press escape.** The round should carry on for the guest, and the
  host's body should just stand there.
- **Guest: leave the round** from the pause card. Their body should stop, not
  run into a wall.
- **Make a lobby, then play before anybody joins.** It should be a normal solo
  round with stand-ins, not a card saying you won.

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
