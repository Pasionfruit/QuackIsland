# 32-hes-one-shot

## What this is

Minigame 14, free-for-all. **First person, everybody against everybody, and one
shot eliminates.** The gun needs a second and a half between shots. Being
eliminated does not take you out: you become a **hunter** - you still walk and
still shoot anybody left standing, but nobody can shoot you. **The game ends
when one player is left standing, and they win.** At a minute and a half,
anybody still standing shares first.

Four things make it what it is now:

- **A hunter hunts for whoever eliminated them.** You start again beside them, and
  your shots pass straight through them, so the one who got you is safe from you
  and everybody else is not.
- **You can jump**, nearly a metre.
- **Shield power-ups** lie about the arena. Walk through one and the next shot
  that hits you breaks the shield instead of eliminating you.
- **The arena is 48 m across**, over twice the area, with 56 pieces of cover.

**Spawn guard.** For the first two seconds (`ROUND.guard`) everybody is hidden
from everybody else and cannot be shot - a shot passes straight through - so
nobody is picked off where they spawned. The HUD shows a `hidden` count while it
lasts, and the stand-ins do not aim at anybody until it is over.

**WASD to move, Space to jump, the mouse to aim, left click to shoot.**

It plugs into `15-minigames` with `registerMinigame('hes-one-shot', ...)` and one
import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The arena

**A 48 m walled square of sand, with up to 56 pieces of cover** - the same crowding
as the 30 m arena had, over a larger floor. Cover is crates (1.2-2.4 m square) and
lengths of wall (3-5.5 m by 0.6 m), square to the world, grown from the seed. Every
piece is **2.8 m tall, above anybody's eyes - even at the top of a jump**: eyes are
1.7 m, a jump takes them under 0.95 m higher, and 2.65 is under 2.8. So nobody
shoots over cover, in the air or on the ground: a shot reaches you or it does not.
The outer wall is 3.6 m.

There is at least 1.8 m between any two pieces, and between cover and the outer
wall, so the arena is always one open space with things in it. Nobody can be
cornered in a dead end.

**Cover is everywhere, not only in the middle.** The first version kept it inside
a ring round the middle. That left an open band where everybody starts, and
everybody could see their neighbours from the first second; see *Tuning*.

Everybody starts on a ring 20 m out, evenly spaced, turned by the seed, facing
the middle. If cover sits on a start, it is nudged along the ring to the nearest
clear spot.

### Shield spots

**Up to ten places** where a shield power-up appears (`arena.pickups`), from a
stream of the seed of their own, so the cover is exactly what it was for a seed
without them. Each is in the open (1.4 m clear of every piece of cover), at least
10 m from every other, and **inside the ring everybody starts on, 4 m in** - so
nobody starts on one, which an early version allowed: a player who spawned on a
spot was shielded from the first frame, and a test noticed. The spots are the same
all game; whether there is a shield on one is `game.pickups`.

Bodies do not collide with each other, only with cover and the wall. A body
walking into a box slides along it, a few centimetres at a time, so nothing can
be walked through at any speed or frame rate.


## The gun

**A shot is instant and straight**: from your eyes, the way you look, until it
meets a body, a box or the floor, up to 60 m. A body is the island's capsule, a
standing cylinder 0.4 m round and 1.8 m tall. Shooting over a head or at the
floor in front of somebody misses.

- **One hit eliminates** - unless the one hit has a shield, which it breaks
  instead (see *Shields*). Your place is fixed by when, to the hundredth.
- **A second and a half between shots.** A click during the cooldown does
  nothing and is not saved up for later. The ring round the crosshair fills as
  the gun gets ready.
- **Shots go through hunters.** A hunter cannot be shot, so a shot passes through
  one to whoever is behind.
- **Hunters shoot as well as anybody**, at anybody but the one they hunt for: a
  shot goes straight through them and on. Nothing else about the gun changes when
  you are out.
- **A body in the air is a body in the air.** A shot at the floor under somebody
  mid-jump passes under them; a shooter mid-jump shoots from higher up, eyes and
  all.
- **Nothing happens in the countdown.** No walking and no shooting for three
  seconds; you can look around.

## Hunters hunt for whoever got them

When somebody is eliminated (`eliminate`) three things happen:

1. **They are moved.** They start hunting again **2.6-5.6 m behind the one who got
   them**, on the way away from where that player looks, at the nearest spot in the
   clear (`respawnSpot`), **looking the way that player looks**, on the floor, with
   nothing in their hands but the gun they had. It is deterministic: the same
   killer in the same place is the same spot, and it is never in cover or outside
   the wall.
2. **They hunt for the one who got them.** `crewOf(game, i)` follows who got whom -
   a hunter's master is whoever eliminated them, and if that player has been
   eliminated too, whoever eliminated *them*, on to somebody standing. That is the
   side a hunter is on. `allied(a, b)` is being on the same side.
3. **Their shots go through that side.** A hunter's shot passes straight through
   the one it hunts for, and through anybody else on the same side - hunters that
   player has made, or their master's other hunters. It is the same rule as shots
   going through hunters, and the same in `trace`, in a guest's `claim`, and in the
   stand-ins' eyes.

So **the one who got you is invincible from you**, and so is everybody they have
got. Everybody else is fair game: a hunter kills like anybody, its kills are its
own and count in the feed, and whoever it gets hunts for **its** side in turn - so
all of them are on the first killer's. **When a master is eliminated, everybody
hunting for them goes with them** to whoever got them, with no bookkeeping: the
chain just ends somewhere else.

A hunter with **nobody to hunt for** - the master left, or a mutual elimination, in
which each was the other's - hunts for nobody: everybody standing is a target.

**A crossfire no longer eliminates both.** Two shoot each other at once: the host
takes the first to arrive, and eliminates its target, who is now the shooter's
hunter - so the second shot goes straight through the shooter. One is eliminated
and one is not, and it is whoever the host heard first.

## The end

The game ends when **one player or nobody is left standing, at 1:30, or when
there is nobody left who could shoot the last one standing** (everybody else has left). The host
decides.

Placings:

1. Anybody **still standing** at the end shares first.
2. Then the eliminated, **the last to go first**. Players eliminated at the same
   moment share a place.
3. Then anybody who **left** while still standing, the last to leave first.
   Somebody eliminated before they left keeps the place they were eliminated in.

**A crossfire eliminates one.** See *Hunters hunt for whoever got them*: the one
shot first is a hunter for the one who shot them, and cannot hurt them. This is
not special-cased; it falls out of the rules. Tested.

## Jumping

**Space jumps**, held for another as you land. Up is straight up at 6 m/s under
20 m/s² of gravity: **0.85 m at sixty frames a second** (0.9 in the limit), about
0.6 s in the air, the same whatever the frame rate to within a hand's breadth
(gravity is applied before the move, so a jump never goes higher than the sums say).
You cannot jump again in the air, and you cannot jump before the start or after the
end. **Everybody can jump, hunters too**, and the stand-ins do now and then.

The rest of the world follows the body up:

- **A shooter's eyes go up with them** (`eyeOf`), and the camera does, so you look
  over things a little at the top of a jump - just not over cover, which is taller
  than the eyes of the highest jump.
- **A body is a cylinder from its feet to 1.8 m above them** (`bodyHit`), so a body
  in the air can be shot under.
- **The host takes a guest's height as it says it, up to `JUMP.max`** (0.95 m), and
  no higher: in its move reports, and on its shots, and in the trail the host
  rewinds over - every step of it carries a height, so a hit is checked against
  where the victim's body actually was, not just where it stood.
- A stand-in aims at a chest that may be off the floor, from eyes that may be.

## Shields

**Walk through a shield and you have it** (`collect`): anybody standing without one,
within 1.1 m of a spot that has one, takes it and the spot is empty for 20 s
(`PICKUP`). Two arriving together, the lower player number has it. Hunters get
nothing: a hunter cannot be hurt, and a shield is not for them.

**A shield takes the next hit**, from anybody, and nothing else: the shot meets
you - it stops at your body, the puff is in your colour, it counts as a hit on the
shooter's screen - and your shield breaks and nobody is eliminated, and the shooter
has no kill. There is no timer on it: it is there until it takes a hit. The
shooter's own next shot is 1.5 s away, as ever. It does not move you, since nobody
was eliminated.

You see it as **a pale blue bubble round a player**, a glow round the edge of your
own screen, a *SHIELD* tag under the crosshair and 🛡 by your name in the pills; and
it pops with *Your shield broke!* Spots show as **a floating pale blue bubble with a
bright core over a ring on the sand**, gone while the shield is - the ring stays,
dim, so you know where to look.

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
  any keyboard layout. The arrow keys work too, and **Space jumps** - and does not
  scroll the page or press a focused button.
- **Being eliminated turns you.** You are moved beside whoever got you, looking the
  way they look, and the mouse is what turns you - so the screen sets your look to
  the way you now face, the moment it happens, on the host and on a guest. (The
  frame it happens in, your own look from before is not applied over it.)

## On the screen

- **Your view:** the arena at eye height, and your gun at the bottom right in
  your colour. It kicks and flashes when it fires, and is drawn over everything,
  so it never sinks into a wall you stand against.
- **Everybody standing** is the island's capsule in their colour, off the floor when
  they are in a jump.
- **A hunter is a see-through grey ghost with a ring of their colour over their
  head, and a smaller ring inside it in the colour of whoever they hunt for.** You
  can tell at a glance who can still be shot from who is only there to shoot you,
  and whose side each hunter is on.
- **The sun follows you**, so the shadows stay sharp over the whole of a 48 m arena
  rather than one coarse shadow map stretched over all of it.
- **Every shot** is a streak in the shooter's colour from their gun to wherever
  it stopped, gone in a fifth of a second, with a puff where it landed. When
  somebody goes, a burst in their colour.
- **The HUD:** time left, how many are standing, a pill per player (filled while
  standing, hollow once out, with their hits), the crosshair with its cooldown
  ring, a red X when your shot lands, and a feed of who got whom.
- **Banners:** the countdown, *You got … - … hunts for you now* when you land one,
  *You're a hunter now - … got you - you hunt for …, and cannot hurt them* when you
  are shot (with a red flash, and naming the side you are actually on, if whoever
  got you has been got since), *Shield!* when you take one and *Your shield broke!*
  when one takes a hit. Under the crosshair, *HUNTER FOR …* once you are a hunter
  and *SHIELD* while you have one.
- **The results:** everybody by place, with their hits and when they went, and
  **again** for the host.

## One arena across the lobby

**The host runs the game**: the clock, its own player, the stand-ins, every hit,
every shield and the end. It sends a snapshot fifteen times a second with every
player's position and height, look, when they went and who got them, their hits,
whether they have a shield or have left, **which shield spots have a shield on
them** (one bit each) and the last half second of shots. The arena is not sent; the
seed makes it - the shield spots included - and **so is who hunts for whom**, which
is only who got whom and is already in there. Eight players and a full screen of
shots fit well under the relay's 4 KB.

**A guest walks, jumps, aims and judges its own shots on its own screen.** Whether
you had somebody in your crosshair is a matter of pixels and milliseconds, and
cannot wait for a round trip. A guest reports where it is, how high, and where it
looks twenty times a second. It sends each shot the moment it fires: where from and
how high, which way, and who its own screen saw the shot meet.

**Nobody's shield is taken or broken, and nobody is moved, until the host says so.**
A guest picks a shield up when the host has seen it walk through one - a snapshot
later - and its own screen learns which spots are empty from the host's bits. And a
guest that is eliminated **takes the host's word for where it now is, once**, at the
moment it is told (`respawns` goes up on its copy, which is how the screen knows to
turn it): until then it owns its own position, as ever. A guest whose shield merely
broke is not moved.

**The host checks every claim** (`claim` in `rules.ts`):

- The shot is taken from where the guest says it stood, if that is within 1.5 m
  of where the host has it; otherwise from where the host has it.
- A hit counts if the shot passes within 0.9 m of the victim's body **where the
  shooter could have seen it** - where the host has it now, or anywhere it stood
  in the last 0.45 s - nothing solid is in between, and the victim is still
  standing.
- A shot arriving sooner after the last than the gun allows, less 0.3 s for the
  wire, is not a shot.
- **The host never finds a hit the guest did not see.**

Nobody is eliminated until the host says so. A guest's own shot draws at once;
the host's copy of it is not drawn a second time.

A guest's walk is taken only as far as it could have gone since the host last
heard (1.5 times the walking speed, plus 0.3 m) and never through anything.

### The host rewinds before it judges a shot

You aim at what your screen shows you, and your screen shows you where everybody
was when the last snapshot left the host - a snapshot's wait, plus your own ping,
plus the trip your shot takes back. On a bad connection that is a third of a
second, and a player crossing the room covers a couple of metres in it. Checking
the shot against where the host has them **now** meant a shot lined up on
somebody's chest missing behind them: aim at the man, hit where he was standing.

So the host keeps a **trail** for everybody - where they were, every 0.03 s,
going back `REWIND` (0.45 s, `remember` in `rules.ts`) - and a claim is checked
against every step of it as well as against the present, taking the closest. The
window is a little longer than the worst round trip the game is playable on, and
nothing older than that is kept, so a shot cannot be paid off against a position
from another era.

**It cannot be used to shoot through walls.** Each step of the trail is a
separate ray check with the same cover test: a victim who spent the whole window
behind a crate has no step that is in the open, and the shot still misses. And
the host still never finds a hit the guest did not see - the rewind can only
confirm a claim, never invent one.

The host writes the trail once a frame before it reads any guest's shots, so a
shot that arrives this frame is judged against the trail as it stood when the
shot was actually taken.

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
  same way - **for whoever got it**, so it never sees, and never aims at, anybody on
  that side.
- **It jumps** now and then: about every two and a half seconds walking, and less
  when it has somebody in its sights.
- **It goes for shields.** When it picks somewhere new to head, nearly half the
  time - if it has no shield and there is one lying about - that is the nearest
  shield.

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

Five stand-ins in the 30 m arena played a game of about **20 seconds** (median
over 40 seeds, the middle half 15-31). **In the 48 m arena, with shields, jumping
and hunters who cannot turn on their killers, the same measurement is about 40
seconds** (median over 40 seeds; the middle half 28-65 s, from 14 s to the limit),
the first elimination at about 7 s, and **five games in forty reach the limit**,
which was set to 1:30 for it. The bigger floor is most of it: it takes real time to
find anybody, and a stand-in has to walk to a shield to have one.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `ARENA`, `arenaFor`, `Arena`, `Block`, `Point`, `Vec3` | The arena for a seed, shield spots included. Cached; the same seed, the same arena. |
| `blocked`, `collide`, `slide` | A body against the arena: overlapping, pushed out, walked. All pure. |
| `rayHit`, `lineClear`, `slab` | A ray against the arena and the floor. All pure. |
| `spawnPoint`, `SPAWN_ROOM`, `openPoint`, `respawnSpot` | Where everybody starts, somewhere open for a stand-in to head for, and where somebody eliminated starts hunting again. |
| `BODY`, `GUN`, `JUMP`, `PICKUP`, `ROUND`, `CLAIM`, `PITCH_LIMIT`, `SHOT_LIFE`, `COLOURS` | Body size and speed; the gun; a jump; a shield spot; the clock; what the host gives a guest's shot; how far you can look; eight colours. |
| `createGame`, `Game`, `Player`, `Shot`, `Entrant` | A game at its start. |
| `walk`, `look`, `aimDirection`, `eyeOf`, `wrapAngle` | Moving - jumping included - and looking. All pure. |
| `crewOf`, `allied` | Whose side a player is on, and whether two are on the same one. All pure. |
| `collect`, `pickupReady` | Shields walked through, and whether a spot has one. |
| `fire`, `trace`, `bodyHit`, `canShoot`, `cooldownLeft`, `eliminate` | The gun, and what a hit does: eliminate, or break a shield; move the eliminated to their master. All pure. |
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
- **A shield takes exactly one hit and no more, eliminates nobody, and gives the
  shooter no kill; the next hit eliminates.** Tested, for `fire` and for `claim`.
- **Shields are picked up by walking within 1.1 m, one to a player, none by a
  hunter, first player wins a tie, and come back after 20 s, not before.** Tested.
- **Shield spots are in the open, 10 m apart, inside the ring everybody starts on,
  and the same for a seed.** Tested over four seeds.
- **Somebody eliminated starts again 2.6-5.6 m behind whoever got them, in the
  clear, facing their way, on the floor.** Tested over four seeds and against cover.
- **A hunter cannot hurt who it hunts for, or anybody on that side; it can hurt
  everybody else; whoever it gets is on the same side; and when a master is
  eliminated everybody hunting for them goes to whoever got them.** Tested, for
  `fire`, for `claim` and for the stand-ins.
- **A jump goes up 0.8-0.95 m in about 0.6 s, does not chain in the air, does not
  depend on the frame rate, and never puts anybody's eyes over the cover.** Tested.
- **A shot under a body in the air misses and one at it hits; a shot from the top of
  a jump still meets the crate in front of it; a guest cannot say it is higher than a
  jump goes.** Tested.
- **No shot sooner than the cooldown**, from anybody, however it arrives.
  Tested.
- **A guest's claim counts only if it could be true**, and never where the guest
  saw a miss. Tested: a lagged hit counts, and a hit that is too far off, through
  cover, at a hunter, or too soon does not.
- **A shot counts on where the victim was while the shooter's screen was behind**,
  up to 0.45 s back, and no further. Tested, including that no amount of rewind
  shoots anybody through cover and that the trail never grows past the window.
- **A crossfire eliminates one: the one shot first hunts for the shooter and cannot
  hurt them.** Tested.
- **Standing at the end shares first; then the last to go.** Tested, both at the
  limit and when nobody is left.
- **Eight players end with every screen agreeing** on who is out, by whom, and
  the kills, with a fifth of the snapshots and a quarter of the reports lost, and
  every elimination one the shooter's own screen saw. Tested in Node, and with
  real browsers.
- **A guest is moved once, when it is eliminated, and its shield and how high
  anybody is come from the host.** Tested.
- **The stand-ins play the same way every time.** Tested.

## Deliberate non-goals

- No models: players are the island's capsule, cover is boxes, the gun is five
  more.
- No health, ammo, reloading, crouching, running or aiming down sights.
- No other power-ups, though `collect` and the spots are ready for more: shields
  are the one.
- No air control to speak of and no double jump: a jump is a hop.
- No team scores: a hunter's kills are its own, and a side is not ranked, only the
  players in it.
- No sound but the cues. No score kept between games.
- No lag compensation beyond the 0.9 m of slack on a claim. The host does not
  rewind.

## Known limitations

- **Games with stand-ins are about 40 seconds now, and snowball still.** One shot to
  eliminate, plus hunters who cannot be shot and keep shooting, though not at the
  one they hunt for. The 1:30 limit is reached in about one game in eight with five
  players; with people it depends how well they aim. See *Tuning*.
- **Going after somebody's killer is the whole game for a hunter, and it is
  entirely up to them.** Nothing tells a hunter who the killer's enemies are, so
  what a hunter does is shoot whoever it sees.
- **A shield is a coin toss you can see.** Everybody knows who has one - the bubble
  is visible from across the arena - and so who to shoot second. That is deliberate
  enough to leave, but it does make a shielded player a target for nobody until
  the second shot.
- **A guest that is eliminated is moved by the host a snapshot after it happened on
  its own screen**: for a moment - a tenth of a second and the trip - it is a hunter
  still where it died, and then it is not. Its own look is turned the moment it
  hears.
- **A guest is trusted with how high it says it is**, up to 0.95 m, and that is the
  height its shots come from and the height it is shot at. A modified client could
  hold itself at the top of a jump all the time, which makes it a harder target and
  a taller shooter, though not one that can shoot over cover.
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
- **Every hunter is the same grey**; only the rings over the head tell one hunter
  from another, and whose side they are on.
- **Shields are drawn as a bubble, but a shot at somebody's feet passes under a
  bubble that is a metre and a half across** - it is the body's cylinder that is
  shot at, not the bubble.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **He's One
Shot** and press play.

- **During the three, two, one**, you should be on the edge of the arena looking
  in, with crates and walls about, stand-ins in their colours, and your gun at
  the bottom right in your colour. WASD should do nothing yet.
- **Click the arena.** The cursor should vanish and *Click to take aim* should
  go. Nothing should fire. Move the mouse: the view should turn, up and down as
  well, and stop short of straight up or down.
- **Jump with Space.** Your view should go up a little and come back in about half
  a second, and holding it should bounce you along. Try it next to a crate: you
  should not be able to see over the top. Watch a stand-in: it should hop now and
  then, and a shot at its feet as it does should pass under it.
- **Find a shield**: a pale blue bubble over a ring on the sand, somewhere inside
  the middle of the arena. Walk through it: it should vanish, the ring dim, a pale
  blue glow come up round the screen, *Shield!*, a *SHIELD* tag under the crosshair
  and a 🛡 by your pill. It should be back after twenty seconds.
- **Get shot with a shield on**: *Your shield broke!*, and you should still be
  standing. Get shot again and you are out.
- **Get eliminated.** You should be moved to a few metres behind whoever got you,
  turned to look the way they look, with *You're a hunter now* and *HUNTER FOR …*
  under the crosshair. Their shots' streaks should go straight through them when you
  shoot at them: they should not go out.
- **Have a hunter hunt for you**: get somebody, and the banner should say they
  hunt for you now. They should stand near you, and never hurt you.
- **Walk with WASD.** W should go the way you look and D to your right; turning
  while walking should steer, and a diagonal should not be faster. Walk into a
  crate: you should slide along it, never into it.
- **Shoot a stand-in.** One shot: a streak from your gun, a red X on the
  crosshair, a burst in their colour, *You got …*, and they should turn into a
  grey ghost with a ring of their colour over them and a smaller one in yours -
  and appear beside you. Your pill should count the
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
