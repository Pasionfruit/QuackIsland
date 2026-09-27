# 67-mama-tank

## What this is

**Minigame 43, one-vs-all, "Mama Tank".** The host picks one player to drive
**Mama Tank**, a giant tank that starts on a hill at the middle of an open
field; everybody else drives a **mini tank**, attacking from below. **Both
roles share exactly the same controls** - WASD to move, the mouse aims and is
your camera, left click fires - the one genuinely new shape this game has
relative to the two other one-vs-all games already built: Jackal's Sniper is
the only one who ever fires, and Big Backs' Hunter never fires at all. Mama
Tank's cannon one-shots a mini tank, or eliminates one outright by driving
straight over it; a mini tank's own cannon is quicker but lighter, chipping
away at Mama Tank one hit at a time. **The mini tanks win as a team the
instant their combined hits on Mama Tank reach twice the player count;
otherwise - every mini tank eliminated, or the clock running out first - Mama
Tank wins.** The round ends in that same step, no outro to sit through.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in the composition root.

This is the **environment** and **controls** stages done. The assets stage
is not: bodies are procedural tank geometry, cover is procedural rock
geometry, the hill is a procedural mound.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| One player drives Mama Tank, starting on a hill | `resolveMama`, `mamaSpawn`, the cosmetic `Hill` in `MamaScene.tsx` |
| Everyone else attacks from below in a mini tank | `miniSpawn` (a ring near the outer edge) |
| Both roles share the same controls | One `MamaScreen`, not role-branched - see *On the screen* |
| Mama Tank's cannon one-shots a mini tank | `fire`/`claim` → `applyHit`, single-hit elimination for the `mini` role |
| Mama Tank eliminates a mini tank by driving over it | `runOver`/`runsOver`, host-only, every tick |
| Mini tanks chip away at Mama Tank | `applyHit`'s `mama` branch: `hitsOnMama` and the shooter's own `hits` |
| Mini tanks win once combined hits reach twice the player count | `hitsNeeded = round(playerCount * 2)`, `judgeEnd` |
| Otherwise Mama Tank wins (elimination or the clock) | `judgeEnd`'s last two branches |

## The field

Modelled closely on `32-hes-one-shot`'s own arena - open, roughly square (90 m
across, `FIELD.half = 45`), scattered rock cover round the middle rather than
a lane or a maze, kept `FIELD.gap` apart so there is always room to walk
between any two. **Cover is one uniform height** (`FIELD.coverHeight`, 2.4 m),
tall enough to block a shot from either role's own eye height - Mama Tank's
is the taller of the two (`MAMA.eye`, 1.6 m) - so nobody ever shoots over it,
either way; a role-dependent cover height (Mama Tank shooting over short
cover) was a real option and deliberately left out as scope creep beyond the
brief.

**The hill is a visual set piece only** (`FIELD.hillRadius`/`hillHeight`,
drawn by `Hill` in `MamaScene.tsx`): a raised, non-collidable mound at the
middle, Mama Tank's own spawn sitting at its top. Movement and collision stay
flat 2D for both roles across the whole field, including the hill's own
footprint - the same simplification `65-big-backs-are-near` already made for
its corn maze. No jump, no y/vy for either role.

Cover is kept clear of the middle (`FIELD.centreClear`) - Mama Tank's own
spawn and the hill's footprint - the same way `32-hes-one-shot` keeps its own
cover clear of its spawn ring. **Mama Tank spawns fixed at the middle**
(`mamaSpawn`); **mini tanks spread round a spawn ring near the outer edge**
(`miniSpawn`, `FIELD.spawnRing`), evenly spaced and nudged clear of cover -
reusing `32-hes-one-shot`'s own `spawnPoint` shape almost directly, since
"attacking from below, from every side" maps onto a ring far better than a
single spawn line does.

## The two cannons

Both roles fire the same way - `fire`/`claim`, gated by `canShoot` - but at
different paces, one place (`MAMA`/`MINI` in `rules.ts`) holding each role's
own size, speed, cooldown and range:

- **Mama Tank**: a bigger body (`MAMA.radius`, `MAMA.height`), a slower pace
  (`MAMA.speed`, 3.8 m/s) than a mini tank's own (`MINI.speed`, 5.2 m/s) -
  bulk traded for firepower, the same "the 1 trades power for a disadvantage"
  shape every one-vs-all game here already has - and a slow, heavy cannon
  (`MAMA.cooldown`, 3.5 s) with a longer reach (`MAMA.range`).
- **A mini tank**: smaller, quicker, and a light cannon that reloads fast
  enough to actually punish an opening (`MINI.cooldown`, 1 s) at a shorter
  range (`MINI.range`) - closing the distance is the whole job.

**A shot is judged against one named victim, not everyone** - the
`fire()`/`claim()` shape from `32-hes-one-shot`, generalised: `trace` tests
only the shooter's own legal targets (`isLegalTarget` - a mini tank's only
target is Mama Tank, Mama Tank's only targets are standing mini tanks, a
two-line role check replacing that game's crew/`allied()` predicate), and a
guest's claimed shot (`claim`) re-derives the shooter's position within
`CLAIM.reach`, re-runs the host's own ray, and checks the named victim
specifically - still standing, still a legal target - before ever attempting
the geometry test, with `applyHit` re-checking `isStanding` again so a stale
claim racing an intervening elimination can never apply twice. **No
position-rewind for a claim**: judged against the victim's current position
only, the same call Jackal already made for its own Sniper - a tank is not a
fast-dodging target either.

**A hit's effect is decided in one place** (`applyHit`), branching only on
the victim's role: a mini tank is eliminated outright, no lives; Mama Tank's
own `hitsOnMama` climbs and the shooter's own `hits` tally with it. **No
friendly fire either direction** - a mini tank's shot is never a threat to
another mini tank, and Mama Tank is never her own target.

## Running a mini tank down

**Has no claim or wire message at all.** Unlike a shot, a tank's position is
already continuously host-trusted the same way every module here reports
movement, so `runOver` is a plain host-computed proximity check every tick -
structurally identical to Big Backs' own `catchHiders()`. **Needs both the
radius and a clear line** (`RUNOVER.radius`, both bodies' own radii plus a
small reach, and `lineClear` through the field): two rocks apart, a
mama-tank-sized and mini-tank-sized body's combined radius can exceed a
rock's own thickness, so proximity alone could wrongly count a run-over
through cover.

## The end

`judgeEnd` decides, host-only, in an order that is never ambiguous:

1. **Mama Tank has left** - nobody left to stop the mini tanks - they win
   outright. Checked first and on its own, the same unambiguous ruling Big
   Backs already applies to its own Hunter-leaves case, not Jackal's
   original, more confusing one.
2. **`hitsOnMama` has reached `hitsNeeded`** - the mini tanks win as a team,
   the instant it happens.
3. **No mini tank is still standing** - Mama Tank wins.
4. **The clock has run out** (`ROUND.limit`, 150 s) - Mama Tank wins too: the
   brief's own "otherwise Mama Tank wins," one of the two ways this round
   actually ends, not a fallback tie-breaker.

Winner and `over` are set in the same step the condition is met - no outro to
sit through.

Results are not the standard N-way podium: `summarize` orders Mama Tank first
and the results card (`MamaScreen`'s `Over`) reads directly off
`round.winner` - "Mama Tank wins!" / "The mini tanks win!" - the final
`hitsOnMama`/`hitsNeeded`, and a per-player role and alive/eliminated/hits-
contributed line.

## Bots

**Mini tanks only** (`ai.ts`): Mama Tank is always a human, resolved once at
deal time. Without a bot that actually fires, a bot-filled lobby could never
reach `hitsNeeded` at all except from the one human mini tank, so a stand-in
here is a real shooter, not just a mover: it heads for an attack position
within firing range of Mama Tank's last known spot, biased towards a spot
with cover nearby rather than open ground (`attackGoal`), and once there -
with a clear line of sight and its own cooldown ready - it fires, calling the
same `fire()` the host's own body uses. A basic reactive dodge nudges its
goal away from wherever Mama Tank's current aim happens to be pointing - a
flinch, not a plan, the same shape Jackal's own stand-ins duck away from the
Sniper's beam with, aimed at Mama Tank's live aim direction rather than a
persistent laser (there is no real laser sight here - the dodge line is an
internal-only projection of the current aim, never rendered as a beam).

## Networking and trust

**Movement is identical for both roles** (`report`) - unlike Jackal's
role-branched version, both roam the whole field, so one shared `report`
clamps a claimed move to `since * speed * slack + grace` and re-collides it
against the field, exactly like Big Backs' own. **One `SHOT_TAG` message**
(`Claim { x, z, yaw, pitch, victim }`), sent by whichever role fired - the
host's own body uses `fire()` directly; every other shot goes through
`claim()`. This is the one wire surface genuinely bigger than Big Backs' own
(which needed none at all) and smaller than Jackal's own (no ammo/reload
state to sync, just `shotAt`/`hits`/`alive`/`hitsOnMama`). **Run-over needs
no wire message at all** - see above.

`hitsNeeded` is not sent: it is `round(playerCount * 2)`, a pure function of
how many players a snapshot already lists, recomputed the same way Jackal's
own `magazineSize` is rather than carried as a field of its own.

The same lessons as every other synced minigame: a guest keeps listening
after the round ends; somebody who leaves the lobby is out (`leave`, never
spliced - `round.players` never shrinks); a pause stops the round for
everybody, the host's own simulation included. Alone, the clock stops.

## On the screen

**One `MamaScreen`, not role-branched into two different control schemes**
the way Jackal's is - both roles share the same third-person chase camera
(`TankCamera` in `MamaScene.tsx`, Jackal's own `RunnerCamera` is the direct
template, sized up per role's own body), the same pointer-lock lifecycle, and
the same fire-on-click. What differs is only the HUD: Mama Tank sees how many
mini tanks are still standing in addition to the shared `hitsOnMama`/
`hitsNeeded` pill everybody sees (it is a team effort, visible to everyone); a
mini tank sees its own eliminated state as a "watching the rest of the round"
banner once it is out.

**Nobody is first person here**, unlike Jackal (first person for its Sniper)
or Big Backs (first person for both) - so every player's own body renders
from the start (`TankView`), with no `p.mine` skip at all. This is the one
lesson carried over from a bug found and fixed this session in Jackal's own
`JackalScene` (a runner's own body was skipped unconditionally, which broke
its own third-person view) - Mama Tank has no equivalent case to repeat,
since there is no first-person role to skip a body for in the first place.

## Tests

- `arena.test.ts`: same seed makes the same field; cover is kept clear of the
  middle and Mama Tank's own spawn point; a line straight through a rock is
  blocked, one through the open is clear; the spawn ring spreads mini tanks
  evenly, clear of cover, and facing the middle.
- `rules.test.ts`: Mama Tank resolution and roster-first fallback;
  `hitsNeeded = round(playerCount * 2)`; Mama Tank's cooldown is meaningfully
  longer than a mini tank's, her pace a little slower; a hit on a mini tank
  eliminates it outright, a hit on Mama Tank increments `hitsOnMama` and the
  shooter's own `hits`; no friendly fire either direction; a claim naming an
  already-eliminated victim, or the wrong role's target, is refused; running
  a mini tank down needs both the radius and a clear line; all four win
  conditions, decided the same step.
- `wire.test.ts`: a claimed shot the host's own trace disputes - aimed off to
  one side, or blocked by a rock - is refused, for a claim from either role;
  hits and being alive are always the host's word, even for your own player;
  a lossy-network six-player convergence run over a real generated field
  agreeing on `hitsOnMama`, who is down, and the winner.
- `roster.test.ts`: solo fills mini-tank bot stand-ins, Mama Tank is always
  the human; joined lobby uses real peers; the player cap; `hitsNeeded`
  matches the actual roster size; whoever the host picks drives Mama Tank,
  falling back to the roster's first entry.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `FIELD`, `SPAWN_ROOM`, `arenaFor`, `Arena`, `Block`, `Point`, `Vec3` | The field for a seed. Cached; the same seed, the same field. |
| `blocked`, `collide`, `slide`, `rayHit`, `lineClear`, `slab` | A body, or a ray, against the field. All pure. |
| `mamaSpawn`, `miniSpawn`, `openPoint` | Where everybody starts, and somewhere for a stand-in to head for. |
| `MAMA`, `MINI`, `RUNOVER`, `ROUND`, `PITCH_LIMIT`, `CLAIM`, `COLOURS` | Each role's own size, pace, gun and reach; the run-over radius; the clock; how far you can look; what the host gives a claim; eight colours. |
| `createRound`, `resolveMama`, `Round`, `Player`, `Role`, `Entrant` | A round at its start, and who drives Mama Tank. All pure. |
| `look`, `walk`, `report`, `aimDirection`, `eyeOf`, `wrapAngle`, `Intent` | Moving and looking, shared by both roles. All pure. |
| `trace`, `bodyHit`, `isLegalTarget` | A shot, and who it can legally meet. All pure. |
| `fire`, `claim`, `cooldownLeft`, `canShoot`, `Shot`, `Claim` | The two cannons, and a guest's shot checked by the host. |
| `runOver`, `runsOver` | Mama Tank driving a mini tank down. Host-only; no claim. |
| `tick`, `judgeEnd`, `stepRound`, `canAct`, `isStanding`, `leave`, `mamaOf`, `minisOf`, `summarize` | The clock; the end; who placed how. |
| `BOT`, `botSteer` | The stand-ins. |
| `MAX_PLAYERS`, `ME`, `SOLO_PLAYERS`, `gameRoster`, `myId`, `newRound`, `nextSeed`, `waitingRound`, `RoundSetup` | Putting a round together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeMove`, `decodeMove`, `encodeShot`, `decodeShot`, `SNAPSHOT_TAG`, `MOVE_TAG`, `SHOT_TAG`, `Snapshot`, `WirePlayer`, `MoveOut` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `MamaScene`, `PALETTE`, `PITCH`, `LookRef` | The 3D view. |
| `MamaScreen`, `SENSITIVITY` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **The same seed makes the same field**, cover kept `FIELD.gap` apart and
  clear of the middle. Tested over four seeds.
- **Every mini tank starts clear of cover, spread evenly round the spawn
  ring, facing the middle.** Tested.
- **`hitsNeeded` is `round(playerCount * 2)`** off the actual roster size, in
  a lobby and alone. Tested.
- **Mama Tank's own cooldown is meaningfully longer than a mini tank's; her
  own pace is a little slower.** Tested.
- **A hit on a mini tank eliminates it outright; a hit on Mama Tank never
  eliminates her, only adds to `hitsOnMama` and the shooter's own tally.**
  Tested, `fire` and `claim` both.
- **Neither role can ever hit its own side.** Tested.
- **A claim naming an already-eliminated victim, or the wrong role's
  target, never counts** - even when the geometry would otherwise agree.
  Tested.
- **Running a mini tank down needs both the proximity radius and a clear
  line** - through a rock is never a run-over. Tested.
- **All four win conditions are decided in the same step the condition is
  met**, in a fixed, unambiguous order. Tested.
- **Six players end the same on every screen** - `hitsOnMama`, who is down,
  the winner - with snapshots and reports lost over a simulated lossy relay,
  and shots claimed from both roles. Tested.
- **Who drives Mama Tank falls back to the roster's first entry** when
  nobody has been chosen, or the choice has since left the lobby. Tested.

## Deliberate non-goals

- No models: bodies are procedural tank geometry (a hull, a turret, a
  barrel), cover is procedural rock boxes, the hill is a procedural mound.
- No jump, no vault, no y/vy for either role - flat 2D movement and
  collision throughout, including across the hill's own footprint.
- No real terrain/slope collision: the hill is a cosmetic set piece only.
- No role-dependent cover height: cover is one uniform height, tall enough
  to block both roles' shots the same way.
- No position-rewind/trail for a claimed shot: judged against the victim's
  current position only.
- No standard N-way podium: a custom results card off `round.winner`.
- No team scores beyond the one binary result. No sound but the shared
  cues. No score kept between rounds.
- No visible tracer or laser sight for either cannon - a shot is a muzzle
  flash and a sound, not a beam; the bots' own "dodge Mama Tank's aim"
  projection is internal-only and never rendered.

## Known limitations

- **A claimed shot is judged against where the host has the victim right
  now**, not a rewound trail - the same call Jackal already made for its own
  Sniper, for the same reason: a tank is not a fast-dodging target.
- **A mini tank's own low profile means a shot fired level at close range can
  sail over it** - Mama Tank's own eye height is well above a mini tank's
  full height, so hitting one up close genuinely needs some downward pitch,
  same as it would in reality; this is deliberate, not a bug (see the tests'
  own `pitchTo` helper), but it does mean a Mama Tank player firing from the
  hip without looking down can whiff an otherwise "obvious" close-range shot.
- **The bots' own "dodge Mama Tank's aim" check is a straight-line
  projection of her current yaw/pitch**, not a real traced shot - it can
  nudge a bot away from a direction that is itself blocked by cover anyway,
  or fail to react to a shot Mama Tank could not actually take yet because
  her own cooldown has not come up.
- **Pointer lock cannot be tested headless.** The run-localrot skill stands
  in for the lock itself; everything after it is the real code path.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**Mama Tank**. It opens on the **party** tab - the host clicks who the 1 is
(or rolls the dice) - then **play**.

**Solo, as Mama Tank** (the default alone):

- Bots should advance from the spawn ring towards you and shoot back once
  they have a clear line and their own cooldown is up.
- The shared `hitsOnMama`/`hitsNeeded` pill should climb as a bot's shot
  lands - and a bot's own cannon should visibly flash when it fires.
- A bot you hit with your own cannon should be eliminated instantly.
- Driving straight into a bot should eliminate it by run-over.
- A rock should block a shot in both directions - from you at a bot behind
  one, and from a bot at you from behind one.

**Two browsers**: the host picks the *other* browser as Mama Tank on the
party tab, confirms both screens agree who it is (`theOne`/`useTheOneSync`
delivering the pick to the guest, the same check Jackal's own review notes
ask for), that `hitsOnMama` climbs the same way on every screen as shots land
from either side, and that both win conditions end the round for everybody
at the same moment.

## Gate record

Not yet gated by a human. `node scripts/gate.mjs 67-mama-tank` is green.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- Two instanced meshes for the field's walls and every rock.
- One hill mesh (a tapered cylinder).
- A hull, a turret, a barrel and a muzzle-flash sphere per player.
- One shadow-casting directional light, an ambient and a hemisphere light.
