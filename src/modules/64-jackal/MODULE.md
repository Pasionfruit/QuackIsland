# 64-jackal

## What this is

**Minigame 41, one-vs-all, "Jackal".** The host picks one player to be the
**Sniper**, alone at the top of a tower with a laser-sighted rifle; everybody
else is a **Runner**, spawned at the far end of a lane and rushing the tower
through crates, barrels and trees. The Sniper's aim is a beam traced every
tick, hit or miss, so it is always visible - a runner can see exactly where
the danger is and duck behind cover. The Sniper carries `round(playerCount *
1.5)` bullets before being forced into a reload, and can unscope to move at
full speed at the cost of a wide, imprecise view. Each runner has two lives:
a hit costs one and buys a brief invulnerable window, not a knockback or a
respawn. **The Sniper wins by eliminating every runner; the Runners win the
instant one of them reaches the tower's base** - the round ends in that same
step, no outro to sit through.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in the composition root.

This is the **environment** and **controls** stages done. The assets stage
is not: bodies are the island's avatar, cover is boxes and cones, the tower
is boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| One player is the Sniper, positioned at the top of a tower | `resolveSniper`, `sniperSpawn`, `clampToPlatform` |
| Everyone else rushes toward its base | `runnerSpawn`, `atBase`, `RUNNER.speed` |
| The Sniper's aiming laser is always visible | `laserOf` - traced every tick, hit or miss, off the synced position alone |
| Move quickly between crates, trees, barrels and other cover | `arenaFor`, `Block`, `blocked`/`collide`/`slide` with a height-aware pass-over |
| `number-of-players * 1.5` bullets before a forced reload | `createRound`'s `bullets`, `fire`/`claim`'s auto-reload |
| Unscope to reposition their aim | `toggleScope`, `SNIPER.scopedMoveFrac` |
| Each runner has 2 lives | `LIVES_START`, `applyHit` (private to `rules.ts`) |
| The Sniper wins by eliminating everyone before they reach the tower | `judgeEnd` |
| The other players win if at least one reaches the base | `judgeEnd`, `checkBase` (private) |
| Sniper: Mouse aim, Left click shoot, Right click scope, WASD move | `JackalScreen`'s pointer lock and key handling, `moveSniper` |
| Runner: WASD move, Mouse camera, Space jump/vault | `JackalScreen`, `walkRunner` |

## The lane

Not a square arena like `32-hes-one-shot` - a bounded rectangle, 32 m wide
and 70 m long (`FIELD`), a runner spawn line at the south end (`+Z`,
`SPAWN_Z`) and the tower at the north end (`-Z`, `TOWER_Z`), grown from the
seed the same way: crates, barrels and trees scattered between the two,
kept `FIELD.gap` apart so there is always room to walk between any two
pieces, and clear of both the spawn line and the tower's own foot.

**Three kinds of cover, two heights:**

- **Crates and barrels** (`FIELD.crateHeight`, `FIELD.barrelHeight`) sit
  under a jump's apex (`JUMP.max`, about 1.44 m) - Space vaults them, nothing
  more is needed. `blocked`/`collide`/`slide` take the body's own height off
  the ground and simply drop a block from the collision test once that
  height clears the block's own - the same call that decides whether a shot
  is blocked (`rayHit`, which never looks at a body's height) decides nothing
  about vaulting; they are deliberately two different questions.
- **Trees** (`FIELD.treeHeight`, 3.4 m) are tall enough that nothing jumps
  them, and so they always block a shot too.

**The tower** is a block like any other (`kind: 'tower'`), tall enough that
a shot from the ground can't reach across it, with a small bounded platform
on top (`FIELD.platformHalf`) the Sniper is clamped to - `clampToPlatform` -
so the Sniper never falls or walks off it, only runs out of ammo. **The
base** is a zone at the tower's foot (`FIELD.baseRadius`, `atBase`): stepping
inside it sets a runner's `reachedBase`, which ends the round for everyone
the same step.

## The Sniper

WASD moves round the platform, relative to where the Sniper looks
(`moveSniper`), the mouse aims (pointer lock, the same pattern
`32-hes-one-shot` uses). **Right click toggles scope** (`toggleScope`):
scoped narrows the field of view sharply on the screen and cuts movement to
`SNIPER.scopedMoveFrac` (12%) of the unscoped speed - unscoping to reposition
is a real trade-off, not a free look-around.

**The laser is traced every tick, whether or not the trigger is pulled**
(`laserOf`): from the Sniper's eyes, the way they look, to whatever it meets
first - cover, a runner, or nothing, out to `GUN.range`. It is a pure
function of the Sniper's own already-synced position and look against the
shared, seeded lane, so **every screen draws the identical segment without a
wire message of its own** - there is nothing about the beam to disagree
about, ever.

**Left click shoots** (`fire`), gated by `canShoot`: a cooldown between shots
(`GUN.cooldown`), and blocked outright while reloading or out of ammo. **A
bullet is spent on a miss just as on a hit** - there is no saving ammo by
firing wide - and the instant the last one is gone, a reload starts on its
own (`GUN.reload`, 2.4 s); there is no manual reload key, matching the
brief's control list exactly.

## The Runners

WASD moves relative to where the camera looks, the mouse is the camera
(third person, behind and above the body - the same rig `58-breaking-the-ice`
uses for its own runners), and **Space jumps** (`walkRunner`): a jump that
clears a crate or a barrel and never a tree, purely by comparing the body's
own height off the ground against whatever is in its way - there is no
separate vault action or key.

**Getting hit costs a life and buys `INVULN.window` (1.5 s) of safety** -
not a knockback, not a respawn: the runner keeps going from exactly where
they stood. At zero lives they are eliminated. **Reaching the base**
(`atBase`) sets `reachedBase`, checked every time a runner's position is
touched - moving or standing still - so it can never be missed by a frame
that happened not to move them.

## The end

`judgeEnd` decides, host-only, in this order: any runner's `reachedBase` is
an instant win for the Runners; every runner down (eliminated, or left the
lobby) is a win for the Sniper; a safety-net clock (`ROUND.limit`, 150 s)
also hands it to the Sniper - the tower's defence holds if nobody gets
through in time. **Winner and `over` are set in the same step the condition
is met** - the same "no outro" lesson just applied to `61-op-finder`, and a
deliberate departure from the older decide-then-wait pattern in
`20-punch-buggy`/`58-breaking-the-ice`.

Results are not the standard N-way podium: `15-minigames`' `rankStandings`
only models individual placings, and Jackal is a binary team result. Instead
`summarize` orders the Sniper first and the results card
(`JackalScreen`'s `Over`) reads directly off `round.winner` - "The tower
holds!" or "A runner reached the base!" - plus a per-player role and
alive/eliminated/reached-base line, bypassing `useFinish`'s placings
entirely (though still using `useFinish` itself, for the shared two-second
hold before the card shows).

## Bots

**A bot only ever plays a Runner** (`ai.ts`): the Sniper is always a human,
resolved once at deal time (see *Networking and trust*). A stand-in heads
for a goal some way closer to the tower than it already is
(`advancePoint`), angling across the lane rather than charging straight down
the middle, and jumps whatever short cover is a step ahead and still in its
way at its own height. **When the Sniper's beam passes close enough to
worry about**, it nudges its goal to whichever side is further from the
line the laser is actually drawing right now - a flinch, not a plan, the
same idea as a person ducking away from where the danger visibly is.
Its own randomness comes from the seed (`createRng(hashSeed(seed,
'jackal:bot:' + id))`), so a solo game plays out the same way for the same
seed.

## Networking and trust

**Movement, both roles, is guest-reported and host-clamped**
(`report`): a guest walks and aims on its own screen - runner or Sniper -
and tells the host where it ended up, how high, and which way it looks,
`report` taking the position only as far as it could have walked since the
host last heard, and the height only as high as a jump goes, the same
shape as `32-hes-one-shot`'s own `report`.

**A Sniper's shot is claim-and-verify, never client-trusted** (`claim`),
because the Sniper is not always the host - the party tab lets the host
name *any* lobby member the 1, guest included. The shooting browser sends
its own position, yaw, pitch and which runner (if any) its own screen saw
the shot meet; **the host re-runs its own trace against its own authoritative
lane and player positions** before ever debiting a life. A claim the host's
own ray says was blocked by cover, or where the named victim was not
actually near that ray, is refused outright - the host never finds a hit
the guest did not claim, and never grants one it cannot itself verify.

**Who is the Sniper is decided once, at deal time** (`resolveSniper`): the
host's pick from the party tab (`getTheOne`, `15-minigames`), or - if nobody
has picked, or the pick has since left the lobby - the roster's own first
entry, the same host-default the Briefing screen's own party tab already
falls back to. **The snapshot carries `sniperId` itself**, and a guest reads
its role straight off that field rather than trusting its own `theOne`
sync to have landed in time - `useTheOneSync` (mounted in
`15-minigames/internal/state.ts`'s `useMinigameSync`) is what makes the
sync happen at all, but the round's own wire is the source of truth for
who is playing which role.

The same lessons as every other synced minigame: a guest keeps listening
after the round ends; somebody who leaves the lobby is out (`leave`); a
pause stops the round for everybody, the host's own simulation included.
Alone, the clock stops.

## On the screen

`JackalScreen` branches hard on role. The **Sniper's HUD** is a crosshair
that narrows into a scope reticle while scoped, bullets remaining, a
`RELOADING…` tag in its place once empty, and a runners-still-standing
count. A **Runner's HUD** is two hearts for lives and a nearest-cover hint
("cover 6m ahead-left"), read off the lane's own blocks and the runner's own
position and heading - no separate "you're being aimed at" indicator, since
the beam already is one.

`JackalScene` draws the lane, the tower and its platform, the beam (traced
fresh every frame straight off the live round, never off a wire field of its
own), and everybody else's body - the Sniper's marked with a small ring over
the head, the same idea `32-hes-one-shot` uses for its hunters. **The
camera is first person for the Sniper** (`SniperCamera`, scoping in narrows
the field of view) **and third person for a runner** (`RunnerCamera`,
behind and above, pulling back to watch the whole lane once you are down or
the round has decided) - the same rig `58-breaking-the-ice` uses for its own
runners, since every runner is somewhere different on an open lane, not a
shared static shot.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `FIELD`, `SPAWN_Z`, `TOWER_Z`, `arenaFor`, `Arena`, `Block`, `CoverKind`, `Point`, `Vec3` | The lane for a seed. Cached; the same seed, the same lane. |
| `blocked`, `collide`, `slide` | A body against the lane, height-aware: over a short block's own height, it is no longer in the way. All pure. |
| `rayHit`, `lineClear`, `slab` | A ray against the lane and the floor - never height-aware; a tree blocks a shot from anywhere. All pure. |
| `runnerSpawn`, `sniperSpawn`, `clampToPlatform`, `atBase`, `openPoint`, `advancePoint` | Where everybody starts, the tower's platform bound, the base zone, and somewhere for a stand-in to head for. |
| `BODY`, `RUNNER`, `SNIPER`, `JUMP`, `GUN`, `LIVES_START`, `INVULN`, `ROUND`, `PITCH_LIMIT`, `CLAIM`, `COLOURS` | Body size; each role's move speed; a jump; the gun; lives and the invulnerable window; the clock; how far you can look; what the host gives a claim; eight colours. |
| `createRound`, `resolveSniper`, `Round`, `Player`, `Role`, `Entrant` | A round at its start, and who the Sniper is. All pure. |
| `look`, `walkRunner`, `moveSniper`, `toggleScope`, `aimDirection`, `eyeOf`, `wrapAngle` | Moving and looking, per role. All pure. |
| `laserOf`, `trace`, `bodyHit` | The beam, and what it meets. All pure. |
| `fire`, `claim`, `cooldownLeft`, `canShoot`, `reloading` | The gun, and a guest Sniper's shot checked by the host. All pure. |
| `report`, `tick`, `judgeEnd`, `stepRound`, `canAct`, `isStanding`, `leave`, `sniperOf`, `runnersOf`, `summarize` | A guest's walk checked by the host; the clock; the end; who placed how. |
| `BOT`, `botSteer` | The stand-ins. |
| `MAX_PLAYERS`, `ME`, `SOLO_PLAYERS`, `gameRoster`, `myId`, `newRound`, `nextSeed`, `waitingRound`, `RoundSetup` | Putting a round together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeMove`, `decodeMove`, `encodeShot`, `decodeShot`, `SNAPSHOT_TAG`, `MOVE_TAG`, `SHOT_TAG`, `Snapshot`, `WirePlayer`, `MoveOut` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `JackalScene`, `PALETTE`, `PITCH`, `LookRef`, `HIT_FLASH` | The 3D view. |
| `JackalScreen`, `SENSITIVITY` | The panel `15-minigames` draws, and the mouse's radians a pixel. |

## Invariants you may rely on

- **The same seed makes the same lane**, cover kept `FIELD.gap` apart and
  clear of the spawn line and the tower's foot. Tested over four seeds.
- **A crate or a barrel is under a jump's apex; a tree is well over it.**
  Tested.
- **A body above a block's own height is no longer blocked by it; a ray
  never is.** Tested for both short cover (passable once high enough) and
  tall cover (never passable).
- **Every runner starts clear of cover, spread along the spawn line, facing
  the tower.** Tested over three seeds and player counts 1-7.
- **The Sniper is clamped to the tower's platform and never leaves it,
  however long WASD is held.** Tested.
- **Scoping in cuts the Sniper's own move speed to a small fraction of
  unscoped.** Tested.
- **Bullets are `round(playerCount * 1.5)` off the actual roster size**, in
  a lobby and alone. Tested.
- **A bullet is spent on a miss as well as a hit; the last one forces a
  reload; nothing fires again until it is over.** Tested.
- **A hit through clear line of sight costs a life; the same shot through
  cover costs nothing.** Tested, `fire` and `claim` both.
- **A second hit inside the invulnerable window costs nothing; the window
  over, the next one does.** Tested.
- **Reaching the base sets `reachedBase` and ends the round for the Runners
  the same step it happens**, moving or standing still. Tested.
- **Every runner down ends it for the Sniper the same step**, and the
  safety-net clock holds it for the Sniper too. Tested.
- **A guest's claimed hit is refused when the host's own trace disagrees** -
  blocked by cover, or the named victim nowhere near the ray - **and never
  invents a hit the guest did not claim.** Tested.
- **A guest's walk is taken only as far as the elapsed time allows.** Tested.
- **Eight players end the same on every screen** - lives, alive, reached
  base, the winner - with snapshots and reports lost over a simulated lossy
  relay, and a guest playing the Sniper. Tested.
- **Who is the Sniper falls back to the roster's first entry** when nobody
  has been chosen, or the choice has since left the lobby. Tested.

## Deliberate non-goals

- No models: bodies are the island's avatar, cover is boxes and cones, the
  tower is boxes.
- No manual reload key, no crouching, no leaning, no other power-ups.
- No knockback and no respawn: a hit is a life and a window, nothing moves
  the runner.
- No standard N-way podium: a custom results card off `round.winner`.
- No team scores beyond the one binary result.
- No sound but the shared cues. No score kept between rounds.
- No lag compensation beyond `CLAIM`'s own slack on a Sniper's claim; the
  host does not rewind a runner's trail the way `32-hes-one-shot` does.

## Known limitations

- **A runner's own reported height is trusted up to a jump's apex**, the
  same trust `32-hes-one-shot` extends a guest's jump - a modified client
  could hold itself at the top of a jump, which is a narrower target but
  never one that sees over a tree.
- **A claimed shot is judged against where the host has the victim right
  now**, not a rewound trail: a runner who steps behind cover on the host's
  own screen just as a guest's screen still shows them in the open is not
  hit. `32-hes-one-shot` solves this with a short trail; Jackal does not,
  since a Sniper's targets move far slower across the lane than a shooter
  in that arena's own crossfire.
- **The nearest-cover hint only looks at distance**, not whether that cover
  is actually between the runner and the beam - it can point at a crate the
  Sniper cannot presently see anyway, or past one that already is.
- **Pointer lock cannot be tested headless.** The run-localrot skill stands
  in for the lock itself; everything after it is the real code path.
- **The Sniper's own reticle changes shape when scoped, but nothing narrows
  the mouse's own sensitivity** - scoping in is a movement and field-of-view
  trade-off only, not a finer aim.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**Jackal**. It opens on the **party** tab - the host clicks who the 1 is (or
rolls the dice) - then **play**.

**Solo, as the Sniper** (the default alone):

- **The beam should be visible at once**, from the tower down the lane,
  bending to meet the first bot, crate or tree in its way - move the mouse
  and it should follow immediately, every frame, whether or not you fire.
- **Right click should scope in**: the view narrows and WASD should barely
  move you. Right click again to come back out.
- **Shoot a bot in the open.** One life gone (its own HUD is not visible to
  you, but the runner count and, eventually, its elimination are). Cover
  between you and it should stop the shot outright.
- **Empty the magazine.** The HUD should read `RELOADING…` and left click
  should do nothing until it clears, a couple of seconds later.
- **Watch a bot vault a crate or a barrel** as it closes the distance, and
  never a tree.
- **Eliminate every bot.** The round should end at once - "The tower
  holds!" - with no wait.

**Solo, swap to a Runner** by clicking a bot's name on the party tab before
pressing play (or roll the dice until a bot lands as the Sniper if the
build gives you no other way in solo - two browsers is the real test of
this, below):

- **WASD should move you relative to the camera**, the mouse turns the
  camera, and Space should clear a crate or barrel and never a tree.
- **Get hit.** A life gone, a brief white glow round the screen, and you
  should keep moving from right where you stood.
- **Reach the base.** The round should end at once for everybody -
  "A runner reached the base!"

### With two browsers

- **Swap who is the Sniper on the party tab** - click the other browser's
  name - and confirm both screens agree who it is before pressing play.
  This is the check that `useTheOneSync` actually delivers the host's pick
  to a guest: without it, a guest never learns who the 1 is at all.
- **The Sniper's beam should be visible on every screen**, including the
  Sniper's own, tracking their mouse in real time on all of them.
- **A hit the Sniper lands should cost a life on every screen** within
  about a snapshot's wait, and the same for a runner reaching base or the
  last one going down.
- **Either win condition should end the round for both browsers at the same
  moment** - no browser sees "still playing" after the other has moved on
  to results.
- **Host: again** deals everybody into a fresh lane, and the party tab's
  pick of the 1 carries over unless the host changes it.

`run-localrot` covers the solo checks with `solo.mjs --game jackal --steer`,
and the two-browser checks with `lobby.mjs --games jackal`.

## Gate record

Not yet gated.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- Two instanced meshes for the lane's walls, the tower shaft and all the
  cover, plus its canopies.
- One flat platform mesh and a ground-ring for the base zone.
- Two thin cylinders for the beam (a soft outer glow, a bright core).
- Two calls a body per other player (the island's avatar), plus a ring over
  the Sniper's own head and a hit-flash sphere.
- One shadow-casting directional light, an ambient and a hemisphere light.
