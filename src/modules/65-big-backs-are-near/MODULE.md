# 65-big-backs-are-near

## What this is

**Minigame 41, one-vs-all, "Big Backs are Near".** The host picks one player
to be the **Hunter**, dropped at the middle of a large procedural corn maze;
everybody else is a **Hider**, scattered from a pen near one edge. The
Hunter can't see far and can't hear a Hider who is standing still - only a
Hider who is actually moving gives themselves away, and only within a
hearing radius wider than the Hunter can see. Hiders are much slower than
the Hunter on foot, so the maze itself, not speed, is what keeps them alive.
**The Hunter wins the instant every Hider is caught or gone; the Hiders win
as a team the instant the clock runs out with at least one of them still
free** - the round ends in that same step, no outro to sit through.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in the composition root.

This is the **environment** and **controls** stages done. The assets stage
is not: bodies are the island's avatar, corn rows are boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| One player becomes the near-sighted Hunter | `resolveHunter`, `hunterSpawn` |
| Everyone else is a Hider, scattered to hide | `hiderSpawn`, `hiderPen` |
| The Hunter can't see far, relies on footsteps and nearby movement | `HUNTER.sightRadius`, camera fog + `far` cutoff in `NearScene.tsx`; `HUNTER.hearing`, `hearFootsteps` |
| Hiders are much slower | `HIDER.speed` vs `HUNTER.moveSpeed`/`sprintSpeed` |
| The Hunter wins by catching everyone before the clock runs out | `judgeEnd`, `catches`/`catchHiders` |
| The other players win if the clock runs out with anyone still free | `judgeEnd`, `ROUND.limit` |
| Hunter: WASD move, Mouse camera, Left Shift sprint | `NearScreen`'s pointer lock and key handling, `walkHunter` |
| Hider: WASD move, Mouse camera | `NearScreen`, `walkHider` |

## The maze

**Generated, not hand-authored** (`maze.ts`) - unlike `17-messy-maze`'s three
fixed, offline-carved layouts, this one is grown fresh from the seed every
round: a seeded recursive backtracker (`createRng(hashSeed(seed,
'bbn:maze'))`) over a 21x21 grid of 4.2 m cells, about 88 m across - genuinely
large enough that memorising it is not an option. It produces the same
`openEast[y][x]`/`openSouth[y][x]` boolean-grid shape Messy Maze's own `Maze`
interface uses - the *data structure* is reused, the *generator* is new,
since Messy Maze's own carving was done by hand offline and there is no
generation algorithm there to lift.

**A corn row is a block, not a height-aware obstacle** (`Block { x0, z0, x1,
z1, height }`, no `kind`): there is no jump or vault anywhere in this game,
so a wall (`height = 2.4` m, well above eye height `1.7` m) always blocks a
line of sight regardless of role - `rayHit`/`lineClear` are full 3D slab
math at a fixed eye height, used both by the Hunter's own sight cutoff and
by a catch's line-of-sight check, and they never look at who is asking.

**Collision, though, is not the same for both roles.** A Hider slides round
whatever corn row is in the way (`blocked`/`collide`/`slide`, flat 2D, no
different from any other wall-bound game here). **The Hunter runs straight
through every one** (`slideThroughWalls`/`clampToField`): only the maze's
own outer bounds still stop them, the same clamp `collide` already applied
to keep anybody from wandering off the map. This makes the Hunter's own
movement the one place in the sim that is deliberately not maze-shaped - a
Hider's own knowledge of the one true route between two cells is never
enough to out-corner them, the same way a horror-movie killer's pace never
seems to match how they still catch up. It changes nothing about vision or
catching: a corn row still blocks a line of sight and a catch's own check
the same as ever (see below) - this is a movement rule only.

**Spawns**: the Hunter starts at the maze's own middle cell (`hunterSpawn`).
The Hiders start together in a pen near one edge (`hiderPen`, a clutch of
cells reached by the maze's own corridors from an anchor near one corner,
not raw geometric distance), giving them the same few seconds to scatter
every minigame's shared pre-round pause already provides - no bespoke
countdown (`ROUND.countdown: 0`, the same convention/comment as Jackal's).

## The Hunter

WASD moves relative to where the Hunter looks (`walkHunter`), the mouse
aims (pointer lock, first person, the same idiom as Jackal's
`SniperCamera`). **Left Shift sprints** (`HUNTER.sprintSpeed`, faster than
the plain walk) - and, as covered below, costs hearing entirely while held.

**Sight** is `HUNTER.sightRadius` (9 m): tighter than hearing, because the
whole point of "near-sighted" is hearing farther than you see. It is
rendering, not a rule the sim enforces - a tight `<fog>` on the Hunter's own
camera plus a matching `camera.far` cutoff (`NearScene.tsx`'s
`HunterCamera`), so nothing looms out of the murk from just past the fog's
own edge.

**Hearing** is `HUNTER.hearing` (13 m), and needs **no line of sight** -
sound carries round a corn row. It fires only off a Hider's fresh footstep
(`hearFootsteps`, reading `steppedAt` within a short freshness window,
`HEAR_WINDOW`) and drives a directional HUD ping (bearing plus a
falloff-by-distance) and a plain, non-positional sound cue
(`CUES.stepDown`/`playCue`, the same convention Jackal's own
`useJackalSounds` already uses - a diff-based "did this change" effect, not
a new audio subsystem).

**Sprinting mutes hearing entirely** (`hearingRadius`: `sprinting ? 0 :
HUNTER.hearing`). **This is the one deliberate mechanic beyond a literal
reading of the brief.** Read as written, Sprint has no downside at all -
strictly more speed for free - which makes it a dominant, always-on toggle
rather than a choice. Muting hearing while it is held is what turns Sprint
into a real trade-off: cover ground fast, or stop and listen, never both at
once. Flagged here plainly, not buried: this is an addition, not something
the brief asked for outright.

## The Hiders

WASD moves relative to the camera, the mouse is the camera - third person,
behind and above the body, the same rig as Jackal's `RunnerCamera`/
Breaking the Ice's own camera. No jump, no special ability, no handicap -
the brief gives Hiders nothing beyond WASD and a camera.

**A footstep is `STRIDE` (1.2 m) of actually covered ground**
(`walkHider`/`report`'s shared `registerStep`), never the requested
distance - a slide stopped dead by a corn row logs nothing. Crossing that
threshold resets the accumulator and stamps `steppedAt`. **Standing
perfectly still fires no footstep at all - stillness is how you actually
hide,** and it is the whole reason a Hunter closing in is a real threat
worth freezing for rather than a countdown you can out-walk regardless.

## The end

`judgeEnd` decides, host-only, in an order chosen to be unambiguous about
who left and who won (a deliberate improvement on a rough edge flagged in
Jackal's own retro, where the equivalent "sniper.left" case reads as
declaring the departed player the winner):

1. **The Hunter has left** - nobody left to catch anyone - the Hiders win
   outright, checked first and on its own.
2. **Every Hider is caught or gone** - the Hunter wins. A departed Hider
   counts exactly the same as a caught one here, so there is no separate
   branch for "all Hiders left" - it falls out of the same condition.
3. **The clock has run out** (`ROUND.limit`, 75 s - the brief's own 1.25
   minutes, one of the two ways the round actually ends, not a
   fallback tie-breaker) **with at least one Hider still free** - the
   Hiders win as a team.

Winner and `over` are set in the same step the condition is met - no outro.

**A catch** (`catches`) is `CATCH.radius` (1.3 m) **and** a clear line
through the maze (`lineClear`) - unlike Zombie Tag's open arena, a maze puts
a Hider one corn row over well within a flat radius check, and that must
never count. Host-computed every tick for every live Hider
(`catchHiders`), off positions the host already clamps and trusts -
**there is no claim to verify, and no extra wire message for it at all.**

## Bots

**A bot only ever plays a Hider** (`ai.ts`) - the Hunter is always human,
resolved once at deal time the same way Jackal resolves the Sniper, and
alone, the roster-first fallback makes the solo human the Hunter by
construction.

A stand-in picks a hiding cell biased toward dead ends and far from wherever
it currently is (`pickHidingCell`, reusing Messy Maze's genuinely
applicable BFS distance-field approach - `stepsTo`/greedy-descent, the same
shape as `17-messy-maze/internal/ai.ts`'s `botDirection`, adapted to a goal
that changes rather than a fixed finish). **It holds still once it arrives**
- silent, genuinely hidden - rather than always advancing toward a new goal
the way Jackal's runners or Messy Maze's own racers do. If the Hunter closes
to within the bot's own hearing-equivalent radius (`BOT.threat`) while it is
settled, it gives up its spot and flees to a farther cell, accepting the
footstep noise that entails.

Its own randomness comes from the seed (`createRng(hashSeed(seed,
'bbn:bot:' + id))`), so a solo game plays out the same way for the same
seed. Only ever runs on the host.

## Networking and trust

**Host-authoritative movement, both roles, exactly like Jackal's**
(`report`): a guest walks and looks on its own screen and tells the host
where it ended up; the host takes that only as far as it could have walked
since it last heard, and re-collides it against its own maze. A guest
Hider's footstep bookkeeping runs inside `report` too, off the
host-allowed distance rather than the claimed one, so a networked Hider's
footstep is exactly as host-derivable as a bot's or the host's own body.

**There is no claim-and-verify message at all** - the whole wire surface is
one snapshot tag and one move tag, smaller than Jackal's three. A catch
needs no client claim because it is a continuous, host-derivable predicate
off positions already trusted, unlike a Sniper's pixel-precise shot.

**Who is the Hunter is decided once, at deal time** (`resolveHunter`): the
host's pick from the party tab (`getTheOne`, `15-minigames`), or - if
nobody has picked, or the pick has since left - the roster's own first
entry, the same fallback the Briefing screen itself uses. The snapshot
carries `hunterId` itself, and a guest reads its role straight off that
field rather than trusting its own `theOne` sync to have landed in time.

**A guest's own `sprinting` bit stays locally authoritative** while playing,
the same way its own position does (`applySnapshot`): only `left`/`alive`
are ever taken from the snapshot for "mine". This is what stops a footstep
taken mid-sprint from surfacing late just because the echo of "sprint
released" beat the snapshot carrying the step - see *Known limitations*
for the one narrow case this does not fully close.

The same lessons as every other synced minigame: a guest keeps listening
after the round ends; somebody who leaves the lobby is out (`leave`); a
pause stops the round for everybody, the host's own simulation included.
Alone, the clock stops.

## On the screen

`NearScreen` branches hard on role. The **Hunter's HUD** is a crosshair
ringed by a ping for every fresh, in-range footstep (bearing and a
falloff-by-distance opacity), a free-Hiders count, and an always-visible
"sprinting — can't hear" tag while Shift is held. A **Hider's HUD** is
nothing at all until caught, when a quiet "watching" tag appears - the same
spectator idea as Jackal's `RunnerCamera` for an eliminated Runner.

`NearScene` draws the maze (one instanced mesh over hundreds of corn-row
blocks), the ground, and everybody else's body - the Hunter's marked with a
small ring over the head, the same idea Jackal uses for its Sniper. **The
camera is first person for the Hunter** (`HunterCamera`, a tight fog and a
matching `camera.far`) **and third person for a Hider** (`HiderCamera`,
behind and above, pulling back to a wide "watching" shot once caught or the
round has decided). **No sensitivity slider for either role** - both share
one `SENSITIVITY` constant; nothing here asks for Jackal's scoped-aim
precision.

## Results

A custom card off `round.winner` (`NearScreen`'s `Over`), not the shared
N-way podium - the same reasoning as Jackal: a binary team result does not
fit `podium.ts`'s placings. Lists each player's role and outcome (caught, or
stayed free to the buzzer).

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `MAZE`, `MIDDLE`, `mazeFor`, `Maze`, `Block`, `Cell`, `Point`, `Vec3` | The maze for a seed. Cached; the same seed, the same maze. |
| `blocked`, `collide`, `slide` | A Hider (or anybody else's ordinary collision) against the maze - flat, no height parameter; nothing here ever jumps. All pure. |
| `clampToField`, `slideThroughWalls` | The Hunter's own movement: kept inside the maze's own outer bounds, every corn row ignored. All pure. |
| `rayHit`, `lineClear`, `isOpen`, `exits` | A ray, or a straight line, against the maze and its own corridor graph. All pure. |
| `stepsTo`, `stepsFrom`, `deadEnds`, `nearestCells` | The BFS distance-field machinery bots steer by, and dead-end/nearby-cell lookups for hiding cells and the pen. |
| `hunterSpawn`, `hiderPen`, `hiderSpawn`, `cellAt`, `cellCentre` | Where everybody starts, and the maze's own grid/world conversions. |
| `BODY`, `HIDER`, `HUNTER`, `CATCH`, `STRIDE`, `HEAR_WINDOW`, `ROUND`, `PITCH_LIMIT`, `COLOURS` | Body size; each role's speeds; the catch radius; the footstep stride; the hearing freshness window; the clock; how far you can look; eight colours. |
| `createRound`, `resolveHunter`, `Round`, `Player`, `Role`, `Entrant` | A round at its start, and who the Hunter is. All pure. |
| `look`, `walkHunter`, `walkHider`, `aimDirection`, `eyeOf`, `wrapAngle` | Moving and looking, per role. All pure. |
| `hearingRadius`, `hearFootsteps`, `Ping` | What the Hunter can hear right now, and the HUD ping it drives. All pure. |
| `catches`, `catchHiders` | A catch: radius and a clear line. All pure. |
| `report`, `tick`, `judgeEnd`, `stepRound`, `canAct`, `isStanding`, `leave`, `hunterOf`, `hidersOf`, `summarize` | A guest's walk checked by the host; the clock; the end; who did what. |
| `BOT`, `botSteer` | The stand-ins. |
| `MAX_PLAYERS`, `ME`, `SOLO_PLAYERS`, `gameRoster`, `myId`, `newRound`, `nextSeed`, `waitingRound`, `RoundSetup` | Putting a round together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeMove`, `decodeMove`, `SNAPSHOT_TAG`, `MOVE_TAG`, `Snapshot`, `WirePlayer`, `MoveOut` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `NearScene`, `PALETTE`, `PITCH`, `LookRef` | The 3D view. |
| `NearScreen`, `SENSITIVITY` | The panel `15-minigames` draws, and the one radians-a-pixel constant both roles share. |

## Invariants you may rely on

- **The same seed makes the same maze**, and every cell is reachable from
  every other - a real perfect maze, no isolated pockets. Tested over four
  seeds.
- **A corn row always blocks a line of sight**, straight down a closed
  corridor and diagonally past a closed corner - no pinhole at a
  wall-to-wall junction. Tested.
- **The Hunter's own movement ignores every corn row**, stopped only by the
  maze's own outer bounds; a Hider's own movement is still stopped by one,
  the same as ever - and this holds for a guest's claimed move too, not just
  the host's own body. Tested, locally and through `report`.
- **A Hider is meaningfully slower than even the Hunter's own walk**, and
  the Hunter's sprint is faster still. Tested.
- **A footstep fires only while actually moving**, resets the accumulator,
  and a Hunter never accumulates one of their own. Tested.
- **A footstep is heard only within the hearing radius and only while
  fresh** - past `HEAR_WINDOW` it is gone even though `steppedAt` itself
  never changes again. Tested.
- **Sprinting mutes hearing to zero**, so a step within radius produces no
  ping while it is held. Tested.
- **A catch needs both the radius and a clear line** - either alone catches
  nobody. Tested.
- **A guest's claimed jump is taken only as far as the elapsed time
  allows**, and a guest Hider's footstep is registered off that allowed
  distance, not the claim. Tested.
- **All four ways the round can end are unambiguous and decided in the same
  step**: every Hider caught or gone, the buzzer with a survivor, the
  Hunter leaving, all Hiders leaving (folded into the same check as "every
  Hider caught or gone"). Tested.
- **A five-player lobby agrees on alive, left and the winner** over a real
  generated maze, with messages lost over a simulated lossy relay. Tested.
- **A bot never plays the Hunter**, in a solo lobby or a joined one. Tested.
- **The Hunter falls back to the roster's first entry** when nobody has
  been chosen, or the choice has since left the lobby. Tested.

## Deliberate non-goals

- No models: bodies are the island's avatar, corn rows are boxes.
- No jump, no vault, no crouching, no leaning, no other power-ups - the
  brief lists no such control for either role.
- No claim-and-verify wire message: a catch is fully host-derivable from
  positions the host already trusts.
- No standard N-way podium: a custom results card off `round.winner`.
- No team scores beyond the one binary result. No score kept between
  rounds.
- No sound but the shared cues.
- No hearing-of-the-Hunter mechanic for Hiders, and no handicap for them
  either - the brief gives them nothing beyond WASD and a camera.
- No respawn for a caught Hider: `alive = false`, a spectator "watching"
  camera, the same convention every prior module uses for an eliminated
  player.

## Known limitations

- **Near-sightedness is client-side rendering and a genuinely limited
  sensory channel (a hearing radius, moving-only), not network-level
  information hiding.** `09-net`'s `sendToRoom` is a true broadcast
  (`client.ts`), and the relay is a dumb fanout with no game awareness - a
  redacted, per-peer view of who is where is not achievable without a much
  larger infrastructure change. Nothing stops a player from reading
  `gameState()` via devtools and seeing every Hider's true position, exactly
  as nothing stops this in any other minigame in this codebase either. This
  is **not** an anti-cheat guarantee, and should never be read as one: the
  fog, the sight radius and the hearing radius are what an honest client
  chooses to render and to listen for, not a wall around what the host
  actually sends.
- **A footstep taken the instant Sprint is released can, in a narrow
  window, surface as audible even though it was muted at the moment it
  happened** - `hearFootsteps` reads the Hunter's *current* `sprinting` bit
  against a short freshness window (`HEAR_WINDOW`) rather than the bit as it
  stood at the exact tick the step fired. Keeping "mine"'s `sprinting` bit
  locally authoritative (see *Networking and trust*) closes the case where a
  delayed snapshot echo would cause this on a guest Hunter's own screen; the
  narrow remaining case is Shift released and a step landing inside the same
  `HEAR_WINDOW`, on the order of a few tenths of a second - the same class of
  small, honestly-documented edge Jackal's own claim window and rewind-free
  hit judging accept rather than over-engineer away.
- **The nearest-cover-style reasoning does not apply here** - there is no
  cover hint for a Hider, since the maze itself is the only cover there is
  and its shape is already visible on screen.
- **Pointer lock cannot be tested headless.** The run-localrot skill stands
  in for the lock itself; everything after it is the real code path.
- **A bot's hiding-cell choice does not account for the Hunter actually
  standing between it and a dead end** - it can occasionally settle
  somewhere that turns out to be a short, low-traffic corridor rather than
  a true dead end, since dead ends are picked once up front and not
  re-validated against the Hunter's live position beyond the flee check.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**Big Backs are Near**. It opens on the **party** tab - the host clicks who
the 1 is (or rolls the dice) - then **play**.

**Solo, as the Hunter** (the default alone):

- **The view should be visibly foggy and short-range** compared to a
  Hider's own camera - a corn row a few metres off should already be fading,
  and nothing should loom out of the murk from just past that.
- **Move near a bot and stop**: while it is moving, the crosshair should
  ring with a directional ping and a footstep sound should play; the moment
  it is standing still, both should stop dead, however close you are.
- **Hold Shift.** The "sprinting — can't hear" tag should appear at once,
  and a bot moving nearby should produce no ping at all while it is held.
- **Catch a bot in the open.** One fewer "free" on the HUD. **Confirm a bot
  close by on the other side of a corn row is not caught** - proximity
  alone is not enough.
- **Walk straight at a corn row.** You should pass clean through it rather
  than sliding along it - the maze's outer edge should still stop you, but
  nothing in between does.
- **Catch every bot.** The round should end at once - no wait.

**Solo, swap to a Hider** by clicking a bot's name on the party tab before
pressing play (or two browsers, below, is the real test of this):

- **WASD should move you relative to the camera**, the mouse turns the
  camera. Standing still should never trigger anything on your own end -
  there is nothing to see from a Hider's own screen either way.
- **Walk into a corn row.** Unlike the Hunter, you should be stopped by it,
  same as any other wall-bound game here.
- **Get caught.** A quiet "watching" tag should appear and the camera should
  pull back to a wide shot.

### With two browsers

- **Swap who is the Hunter on the party tab** - click the other browser's
  name - and confirm both screens agree who it is before pressing play.
  This is the check that `useTheOneSync` actually delivers the host's pick
  to a guest.
- **A catch the Hunter lands should drop the free-Hiders count on every
  screen** within about a snapshot's wait.
- **Either win condition should end the round for both browsers at the same
  moment** - no browser sees "still playing" after the other has moved on
  to results.
- **Host: again** deals everybody into a fresh maze, and the party tab's
  pick of the 1 carries over unless the host changes it.

`run-localrot` covers the solo checks with `nearPlay`'s Hunter-steering
helper in `cdp.mjs`, and the two-browser checks by hand through the
Briefing's party tab.

## Gate record

Not yet gated (`npm run test` currently fails for an unrelated, pre-existing
reason - see the session's report; typecheck, build, boundaries, frozen and
contracts all pass for this module).

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- One instanced mesh for every corn-row block in the maze (typically several
  hundred).
- Two ground planes.
- One call a body per other player (the island's avatar), plus a ring over
  the Hunter's own head.
- One shadow-casting directional light, an ambient and a hemisphere light.
