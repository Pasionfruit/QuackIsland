# 32-hes-one-shot

## What this is

Minigame 14, free-for-all. **First person, everybody against everybody, and one
shot eliminates.** The gun needs a second and a half between shots. Being
eliminated does not take you out: you become a **hunter** - you still walk and
still shoot anybody left standing, but nobody can shoot you. **The game ends
when one player is left standing, and they win.** At a minute and fifteen,
anybody still standing shares first.

**Spawn guard.** For the first two seconds (`ROUND.guard`) everybody is hidden
from everybody else and cannot be shot - a shot passes straight through - so
nobody is picked off where they spawned. The HUD shows a `hidden` count while it
lasts, and the stand-ins do not aim at anybody until it is over.

**WASD to move, the mouse to aim, left click to shoot.**

It plugs into `15-minigames` with `registerMinigame('hes-one-shot', ...)` and one
import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The arena

**A 30 m walled square of sand, with up to 22 pieces of cover.** Cover is crates
(1.2-2.4 m square) and lengths of wall (3-5.5 m by 0.6 m), square to the world,
grown from the seed. Every piece is **2.4 m tall, above anybody's eyes (1.7 m)**,
so nobody shoots over cover: a shot reaches you or it does not.

There is at least 1.8 m between any two pieces, and between cover and the outer
wall, so the arena is always one open space with things in it. Nobody can be
cornered in a dead end.

**Cover is everywhere, not only in the middle.** The first version kept it inside
a ring round the middle. That left an open band where everybody starts, and
everybody could see their neighbours from the first second; see *Tuning*.

Everybody starts on a ring 12.5 m out, evenly spaced, turned by the seed, facing
the middle. If cover sits on a start, it is nudged along the ring to the nearest
clear spot.

Bodies do not collide with each other, only with cover and the wall. A body
walking into a box slides along it, a few centimetres at a time, so nothing can
be walked through at any speed or frame rate.

## The gun

**A shot is instant and straight**: from your eyes, the way you look, until it
meets a body, a box or the floor, up to 60 m. A body is the island's capsule, a
standing cylinder 0.4 m round and 1.8 m tall. Shooting over a head or at the
floor in front of somebody misses.

- **One hit eliminates.** Your place is fixed by when, to the hundredth.
- **A second and a half between shots.** A click during the cooldown does
  nothing and is not saved up for later. The ring round the crosshair fills as
  the gun gets ready.
- **Shots go through hunters.** A hunter cannot be shot, so a shot passes through
  one to whoever is behind.
- **Hunters shoot as well as anybody.** Nothing about the gun changes when you
  are out.
- **Nothing happens in the countdown.** No walking and no shooting for three
  seconds; you can look around.

## The end

The game ends when **one player or nobody is left standing, at 1:15, or when
there is nobody left who could shoot the last one standing** (everybody else has left). The host
decides.

Placings:

1. Anybody **still standing** at the end shares first.
2. Then the eliminated, **the last to go first**. Players eliminated at the same
   moment share a place.
3. Then anybody who **left** while still standing, the last to leave first.
   Somebody eliminated before they left keeps the place they were eliminated in.

**A crossfire eliminates both.** If you and somebody else shoot each other at
once, the host takes the first shot to arrive and eliminates its target, who is
now a hunter. Hunters shoot, so the second shot counts as well, and both go at
the same moment and share a place. This is not special-cased; it falls out of
the rules. Tested.

## Controls, and the pointer lock

Moving is relative to where you look. W is forward, D is a quarter turn right,
and diagonals are no faster. The movement arithmetic is tested against a real
`PerspectiveCamera` turned the same way, at five yaws and three pitches, per the
lesson in `02-player`'s notes.

**The mouse aims under pointer lock**, the way any first-person game in a browser
does it. The first click on the arena takes the mouse and shoots nothing; escape
gives it back. Mouse movement turns you 0.0024 rad a pixel, and you can look up
or down up to 1.35 rad.

That is a deliberate departure from `02-player`, which avoids pointer lock so a
stray click on the island never turns the camera. On the island that is right;
in a first-person shooter the mouse *is* the aim, and aiming by dragging would
make every shot a click-and-drag.

- **A browser that refuses the lock** gets drag-to-aim instead, and every click
  shoots.
- **Paused, or the game over:** the lock and the keys are let go of, so the
  pause card and the results can be clicked.
- **Keys are read by `KeyboardEvent.code`**, so WASD sits in the same place on
  any keyboard layout. The arrow keys work too.

## On the screen

- **Your view:** the arena at eye height, and your gun at the bottom right in
  your colour. It kicks and flashes when it fires, and is drawn over everything,
  so it never sinks into a wall you stand against.
- **Everybody standing** is the island's capsule in their colour.
- **A hunter is a see-through grey ghost with a ring of their colour over their
  head.** You can tell at a glance who can still be shot from who is only there
  to shoot you.
- **Every shot** is a streak in the shooter's colour from their gun to wherever
  it stopped, gone in a fifth of a second, with a puff where it landed. When
  somebody goes, a burst in their colour.
- **The HUD:** time left, how many are standing, a pill per player (filled while
  standing, hollow once out, with their hits), the crosshair with its cooldown
  ring, a red X when your shot lands, and a feed of who got whom.
- **Banners:** the countdown, *You got …* when you land one, and *You're a hunter
  now - … got you* when you are shot, with a red flash.
- **The results:** everybody by place, with their hits and when they went, and
  **again** for the host.

## One arena across the lobby

**The host runs the game**: the clock, its own player, the stand-ins, every hit
and the end. It sends a snapshot fifteen times a second with every player's
position, look, when they went and who got them, their hits, whether they left,
and the last half second of shots. The arena is not sent; the seed makes it.
Eight players and a full screen of shots fit well under the relay's 4 KB.

**A guest walks, aims and judges its own shots on its own screen.** Whether you
had somebody in your crosshair is a matter of pixels and milliseconds, and cannot
wait for a round trip. A guest reports where it is and where it looks twenty
times a second. It sends each shot the moment it fires: where from, which way,
and who its own screen saw the shot meet.

**The host checks every claim** (`claim` in `rules.ts`):

- The shot is taken from where the guest says it stood, if that is within 1.5 m
  of where the host has it; otherwise from where the host has it.
- A hit counts if the shot passes within 0.9 m of the victim's body where the
  host has it (a guest sees everybody a moment late), nothing solid is in between, and the
  victim is still standing.
- A shot arriving sooner after the last than the gun allows, less 0.3 s for the
  wire, is not a shot.
- **The host never finds a hit the guest did not see.**

Nobody is eliminated until the host says so. A guest's own shot draws at once;
the host's copy of it is not drawn a second time.

A guest's walk is taken only as far as it could have gone since the host last
heard (1.5 times the walking speed, plus 0.3 m) and never through anything.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody. Alone, it stops the clock.

## Stand-ins

**Only when you are alone**: you and four stand-ins. In a lobby it is the host
and everybody else, up to eight, with no stand-ins.

A stand-in wanders from one open spot to the next, looking where it goes, and
lurks at each for 1-3.5 s, looking about.

- **What it notices:** somebody standing within 16 m, within 0.8 rad either side
  of where it looks, with nothing in between.
- **Turning and shooting:** it turns to them at 4 rad/s. After 0.6-1.2 s with
  them in its sights, it shoots when on target and the gun is ready.
- **Aim:** every shot goes off by up to 0.25-0.4 rad, depending on the stand-in,
  **steadying to 35% of that over three seconds** of keeping the same person in
  its sights. Getting out of its sights matters: whoever comes back out is a
  stranger again.
- **Aiming slows it** to a third of its walk. Eliminated, it hunts exactly the
  same way.

All of it comes from the seed, so the same game plays out the same way. Tested.

## Tuning, and what it found

The first stand-ins sighted at 24 m and aimed within a few degrees. **Five of
them finished a whole game in 4-10 seconds**, with the first elimination at about
half a second. Measured over 40 seeds, the causes were, in order of weight:

1. **The open ring everybody started on.** Neighbours start 14.7 m apart at 54°
   to one side; everybody had a target from the first frame. Spreading cover
   over the whole arena, and narrowing a stand-in's field to what a screen
   shows, fixed most of it.
2. **Aim.** The first stand-ins hit about 60% of their shots even at 8-10 m. They
   now hit about 30%.
3. **Hunters.** More than half of all hits are made by hunters, who cannot be
   shot back, so the last few standing are swarmed. **That is the rules as
   given**, not a bug, and no stand-in setting changes it much.

Five stand-ins now play a game of about **20 seconds** (median over 40 seeds,
the middle half 15-31), and an average one of them is out at about 10. The 1:15
limit is a cap that a game with five in it will seldom reach. **Whether that is
the game you want is a design question**; see *Known limitations*.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `ARENA`, `arenaFor`, `Arena`, `Block`, `Point`, `Vec3` | The arena for a seed. Cached; the same seed, the same arena. |
| `blocked`, `collide`, `slide` | A body against the arena: overlapping, pushed out, walked. All pure. |
| `rayHit`, `lineClear`, `slab` | A ray against the arena and the floor. All pure. |
| `spawnPoint`, `SPAWN_ROOM`, `openPoint` | Where everybody starts, and somewhere open for a stand-in to head for. |
| `BODY`, `GUN`, `ROUND`, `CLAIM`, `PITCH_LIMIT`, `SHOT_LIFE`, `COLOURS` | Body size and speed; the gun; the clock; what the host gives a guest's shot; how far you can look; eight colours. |
| `createGame`, `Game`, `Player`, `Shot`, `Entrant` | A game at its start. |
| `walk`, `look`, `aimDirection`, `eyeOf`, `wrapAngle` | Moving and looking. All pure. |
| `fire`, `trace`, `bodyHit`, `canShoot`, `cooldownLeft`, `eliminate` | The gun. All pure. |
| `claim`, `Claim`, `report` | A guest's shot and a guest's walk, checked by the host. All pure. |
| `tick`, `judgeEnd`, `stepGame`, `clock`, `canAct`, `isStanding`, `isHunter`, `leave`, `placings` | The clock, the end, leaving, and who placed where. |
| `botSteer`, `sightedBy`, `yawTowards`, `BOT` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeMove`, `decodeMove`, `encodeShot`, `decodeShot`, `SNAPSHOT_TAG`, `MOVE_TAG`, `SHOT_TAG`, `Snapshot`, `WirePlayer`, `WireShot` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `HesOneShotScene`, `PALETTE`, `GUN_AT`, `GUN_SCALE`, `LookRef` | The 3D view. |
| `HesOneShotScreen`, `SENSITIVITY` | The panel `15-minigames` draws, and the mouse's radians a pixel. |

## Invariants you may rely on

- **The same seed makes the same arena**, with room to walk between everything.
  Tested over four seeds.
- **Everybody starts clear of everything**, more than 4 m apart, facing the
  middle, for 1 to 8 players. Tested over three seeds.
- **Nobody ever walks into anything**, however long they walk into it. Tested,
  including every frame of every stand-in game and of the eight-player lobby
  simulation.
- **Walking goes where a camera turned the same way looks**, right goes to its
  right, and diagonals are no faster. Tested against a real `PerspectiveCamera`.
- **One shot eliminates, cover stops it, and it passes through hunters.** Tested.
- **No shot sooner than the cooldown**, from anybody, however it arrives.
  Tested.
- **A guest's claim counts only if it could be true**, and never where the guest
  saw a miss. Tested: a lagged hit counts, and a hit that is too far off, through
  cover, at a hunter, or too soon does not.
- **A crossfire eliminates both, sharing a place.** Tested.
- **Standing at the end shares first; then the last to go.** Tested, both at the
  limit and when nobody is left.
- **Eight players end with every screen agreeing** on who is out, by whom, and
  the kills, with a fifth of the snapshots and a quarter of the reports lost, and
  every elimination one the shooter's own screen saw. Tested in Node, and with
  eight real browsers.
- **The stand-ins play the same way every time.** Tested.

## Deliberate non-goals

- No models: players are the island's capsule, cover is boxes, the gun is five
  more.
- No health, ammo, reloading, jumping, crouching, running or aiming down sights.
- No sound. No score kept between games.
- No lag compensation beyond the 0.9 m of slack on a claim. The host does not
  rewind.

## Known limitations

- **Games with stand-ins are short, about 20 seconds.** One shot to eliminate,
  plus hunters who cannot be shot and keep shooting, snowballs. The 1:15 limit
  will seldom be reached with five players; with people it depends how well they
  aim. Longer games need a rules change, not stand-in tuning. Options that would
  work: a longer cooldown, a short grace period after the start, or hunters
  waiting a moment before they can shoot. See *Tuning*.
- **A guest is trusted with what its screen saw.** The host refuses shots that
  could not be true, but a modified client could claim every shot that passes
  within 0.9 m of somebody's body.
- **A victim who steps behind cover on the host's screen, just as a guest shoots
  them on theirs, is not hit.** The host checks the line to where it has them,
  and does not rewind to where the guest saw them.
- **Your own tracer starts at your gun, not your eyes**, so a shot past the
  corner of a crate can look as if it went through the corner.
- **Pointer lock cannot be tested headless.** The run-localrot skill stands in
  for the lock itself; everything after it is the real code path. The escape
  key, the lock prompt and the drag fallback have only been read, not driven.
- **Every hunter is the same grey**; only the ring over the head tells one
  hunter from another.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **He's One
Shot** and press play.

- **During the three, two, one**, you should be on the edge of the arena looking
  in, with crates and walls about, stand-ins in their colours, and your gun at
  the bottom right in your colour. WASD should do nothing yet.
- **Click the arena.** The cursor should vanish and *Click to take aim* should
  go. Nothing should fire. Move the mouse: the view should turn, up and down as
  well, and stop short of straight up or down.
- **Walk with WASD.** W should go the way you look and D to your right; turning
  while walking should steer, and a diagonal should not be faster. Walk into a
  crate: you should slide along it, never into it.
- **Shoot a stand-in.** One shot: a streak from your gun, a red X on the
  crosshair, a burst in their colour, *You got …*, and they should turn into a
  grey ghost with a ring of their colour over them. Your pill should count the
  hit, and the feed should say who got whom.
- **Click twice quickly.** The second click should do nothing. The ring round the
  crosshair should fill over a second and a half.
- **Shoot a ghost.** The shot should go straight through them.
- **Hide behind a crate.** Stand-ins should not shoot through it.
- **Get shot.** A red flash, *You're a hunter now*, the ghost's name in the feed,
  and *HUNTER* under the crosshair. You should still walk, and your shots should
  still eliminate anybody standing.
- **The results** should put anybody standing first, then the last to go. Then
  hits and when each went, and **again** for a new arena.
- **Press escape mid-game.** The mouse should come back. The browser uses that
  first escape to release the mouse and may not pass it on, so the pause card
  may need a second escape - untested, because headless Chrome has no real lock.
  Alone, the game should stop while the card is up.
- **Resize the window**, tall and wide. The crosshair should stay in the middle,
  and the gun at the bottom right.

### With two or more browsers

- **Everybody should have the same arena**, starting at the same places.
- **A guest walking and turning** should move and turn on the host's screen, a
  moment behind.
- **A guest shooting somebody** should eliminate them on every screen, within
  about a tenth of a second.
- **Two players shooting each other at once** should both go, sharing a place.
- **A guest closing their browser** should be out. If they were standing, they
  are placed last.
- **As a guest, the results** should say *waiting for the host*. The host's
  **again** should start everybody in a new arena.

`run-localrot` covers the first three of those with eight real browsers,
`lobby.mjs --games hes-one-shot`, and the controls one at a time with
`solo.mjs --game hes-one-shot --steer`.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- One instanced mesh for the wall and all the cover, and two floors.
- Two calls a body per player (the island's avatar), plus a ring and a burst.
- Up to twelve streaks and twelve puffs, only while shots are in the air.
- Five meshes for the gun.
- One shadow-casting directional light and a hemisphere light.
