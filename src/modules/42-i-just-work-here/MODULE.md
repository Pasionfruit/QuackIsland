# 42-i-just-work-here

## What this is

Minigame 32, free-for-all. **An office, seen from above, everybody against
everybody.** Four pieces of a bazooka in your colour are lying about the floor.
**Find them and carry them back to your desk one at a time.** Once all four are
on it you are armed, and a right click fires a rocket. **A blast takes anybody
near it, whoever fired it included**: fire at a wall or a desk you are standing
next to and you go with it. **Last one standing wins.**

**WASD to move, the mouse to aim, left click to pick up or place a piece, right
click to fire, space to drop what you are carrying.**

It plugs into `15-minigames` with `registerMinigame('i-just-work-here', ...)`
and one import line in `src/App.tsx`. It took the free slot 32.

## The office

**A 36 m by 25 m open-plan floor with a low wall round it.** Eight desks stand
against the north and south walls, four along each, 9 m apart; everybody gets
one. They are handed out corners first, crossways, so two players are as far
apart as the floor allows, and so are three and four. Which player gets which of
those desks comes from the seed.

The floor between is furniture, grown from the seed on a loose grid: **pods** of
two desks back to back with a partition between, lengths of **partition**,
**meeting tables**, pairs of **filing cabinets**, the **copier**, **plants** and
the **water cooler**, with a few odds and ends along the east and west walls.
Every piece is a rectangle square to the world, and that is all the rules see.

**Furniture comes in groups whose pieces touch; two groups are either touching or
at least 1.7 m apart**, and nothing comes within 2.6 m of the spot in front of a
desk. So the floor is always one open space, and every piece is reachable from
every desk. Tested over five seeds, every piece from a desk by an actual route.

## The pieces

- **Four each**: the tube, the grip, the sight and the rocket, in their owner's
  colour. They are dealt a round at a time - everybody's first, then everybody's
  second - so nobody's all come from the good spots.
- **Tucked in beside the furniture**, at least 9 m from their owner's desk, 2 m
  from each other and 2.2 m from any desk.
- **You can only pick up your own**, within 1.3 m, and **only one at a time**.
  Carrying one slows you from 5.4 m/s to 4.4 m/s.
- **Left click at your desk** (within 1.4 m of it) puts the piece on it. It sits
  there in its own quarter of the desk.
- **Space** puts it down where you stand, loose, to pick up again.
- **Four on the desk and you are armed.** They disappear from the desk and the
  bazooka goes on your shoulder.
- Eliminated, or leaving, with a piece in your arms: it falls where you stood.

**Searching** is the camera: it follows you from above, close enough that you
see about a third of the office at once. Pieces are always drawn; yours have a
pulsing ring round them.

## The bazooka

- **A rocket flies straight** at 15 m/s, at shoulder height, from 0.55 m in front
  of you, and **bursts on the first thing it touches**: furniture, a wall, or
  anybody standing. It never meets the one who fired it. After 34 m it bursts
  in the air.
- **Anything nearer than the muzzle and it bursts in your face**, on the spot.
- **The blast takes everybody standing whose middle is within 2.6 m** of where it
  burst, **with nothing solid in between** - including whoever fired it. There is
  no falloff: inside is out, outside is not.
- **1.2 s between rockets.** A click during the reload does nothing and is not
  saved up.
- Everybody a blast takes goes at the same moment, and they share a place.
  Taking yourself out credits nobody.

**The guide.** Armed, a line runs from you the way you aim to wherever the
rocket would burst, with the blast's reach drawn round that point - **red and
flashing if you would be in it.** The rules give no warning; the guide is only
arithmetic on what the rules already say. It is there because a top-down view
makes it hard to judge 2.6 m by eye. Whether it gives too much away is a design
call; see *Known limitations*.

## The end

The game ends when **one player or nobody is left standing, or at 2:30.** The
host decides.

Placings:

1. Anybody **still standing** at the end comes first. More than one only if
   time ran out: then **more pieces on your desk** comes first, and equal shares.
2. Then the eliminated, **the last to go first**. A blast that takes two takes
   them together, and they share a place - including the last two, if one blast
   takes both: they share first.
3. Then anybody who **left** while standing, the last to leave first.

## Controls

- **WASD / arrows move you in the world**, not relative to your aim: W is north,
  up the screen, because the camera always looks north. Diagonals are no faster.
  Keys by `KeyboardEvent.code`, so they sit in the same place on any layout.
- **The mouse aims**: from you towards the point under the cursor, at the height
  a rocket flies. No pointer lock - seen from above, the cursor is the aim.
- **Left click** picks up your nearest piece in reach, or - carrying - puts it on
  your desk if you are at it. Otherwise it does nothing and says why.
- **Right click** fires. The context menu is switched off over the office.
- **Space** drops. It never scrolls the page or presses a button behind the game.
- **Paused, or the game over:** the keys are let go of.

## On the screen

- **The HUD:** time left, how many are standing, your four parts (filled once on
  your desk, white while in your arms, faint while still out there), and a pill
  per player with their pieces on the desk (`2/4`, then `armed`) and how many
  they have taken out. Eliminated players are struck through.
- **Carrying:** an arrow at your feet points home, and a beam in your colour
  stands over your desk.
- **Banners** say what to do next: find your pieces, pick it up, take it back to
  your desk, *Bazooka ready!*, *You got …*, *You blew yourself up*, *… got you*.
  A left click that does nothing says why.
- **Everybody** is the island's capsule in their colour, with the bazooka on the
  shoulder once armed. It kicks when it fires.
- **Rockets** are a little dark body with a nose in the shooter's colour and a
  flame. **A blast** is a ball of fire and a ring on the floor as wide as the
  blast reaches.
- **Once you are out** the camera rises to watch the whole office.
- **The feed** says who got whom, and *self* for somebody who blew themselves up.
- **The results** are the podium, from `useFinish`.

## One office across the lobby

**The host runs the game**: the clock, its own player, the stand-ins, every piece,
every rocket, every blast and the end. It sends a snapshot fifteen times a
second: every player (where, aim, what they carry, when they went and by whom,
kills, left, desk), every piece (where, and loose, carried or placed), every
rocket in the air, and the last second of blasts with who they took. The office
is not sent; the seed makes it. Eight players and 32 pieces is about 1.5 KB.

**A guest walks, aims, picks up, places, drops and fires on its own screen**, so
none of it waits for a round trip. It reports where it is twenty times a second,
and each thing it does the moment it does it, with where it stood.

**The host checks every claim** (`claimAct`, `claimFire`):

- A guest's walk is taken only as far as it could have gone since the host last
  heard (1.5 times the walking speed, plus 0.3 m), never through anything.
- Picking up, placing and dropping are judged from where the guest says it
  stood, if that is within 1.5 m of where the host has it, with 1.5 m of slack on
  the reach. Never somebody else's piece, and never two at once.
- A rocket is fired from where the guest says it stood (same 1.5 m), only if
  armed, and not sooner than the reload less 0.3 s for the wire.

**For 0.8 s after a guest does something with a piece, its own pieces stay as its
screen has them**; after that the host's word wins. A guest's own rocket is drawn
the moment it fires and let go of when the host's arrives. Rockets coast on a
guest's screen between snapshots and stop where they touch something, to wait
for the host's blast. **Nobody is eliminated until the host says so.**

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and four stand-ins.

- **They search.** A stand-in only knows where one of its pieces is once it has
  seen it - within 9 m, nothing in the way. Until then it wanders from one open
  spot to the next.
- **They carry.** The nearest piece it knows of, home, onto the desk, one at a
  time, finding a way round the furniture (a half-metre grid, straightened into
  a few corners).
- **Armed, they hunt.** The nearest person standing, within 18 m, down a line
  clear enough for a rocket. They turn at 5 rad/s and fire after 0.5-1.1 s on
  target, 0.05-0.16 rad off. **They will not fire if the rocket would burst within
  the blast of themselves**, and they back off from anybody nearer than 3.8 m -
  but a rocket that goes wide can still clip a corner.
- Holding still to fire, and nothing coming of it for 2.5 s, they close in.

All of it comes from the seed, so the same game plays out the same way. Tested.

### What they play like

Five stand-ins over 60 seeds and 2-8 players: **a game lasts about 50 s** (the
longest 78 s), the first bazooka is together at 25-60 s, and **9 of the 60 games
had somebody blow themselves up.** Every game ended with somebody standing or
all out before the limit. A first version froze two armed stand-ins in place for
the rest of the game, each with the other in sight but a desk corner in the way
of the rocket; sighting now needs a rocket-wide line, and a stand-in that has
waited too long closes in.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `OFFICE`, `DESKS`, `officeFor`, `deskSlots`, `Office`, `Block`, `Desk`, `Kind`, `Point` | The office for a seed, cached; the eight desks and who gets which. |
| `blocked`, `collide`, `slide`, `cast`, `lineClear`, `walkClear`, `gapBetween`, `distanceTo` | A body or a ball against the office. All pure. |
| `navFor`, `route`, `openPoint`, `Nav` | Finding a way round it. |
| `BODY`, `REACH`, `ROCKET`, `BLAST`, `ROUND`, `CLAIM`, `BLAST_LIFE`, `PIECES_EACH`, `PARTS`, `COLOURS`, `LOOSE`, `CARRIED`, `PLACED` | The numbers. |
| `createGame`, `scatter`, `Game`, `Player`, `Piece`, `Rocket`, `Blast`, `Entrant`, `PieceState` | A game at its start. |
| `walk`, `aim`, `aimDirection`, `yawTowards`, `wrapAngle` | Moving and aiming. |
| `pickUp`, `place`, `drop`, `act`, `pieceInReach`, `atDesk`, `deskOf`, `deskSpot`, `piecesOf`, `placedCount`, `isArmed` | The pieces. |
| `fire`, `canFire`, `cooldownLeft`, `rocketTouch`, `flyRockets`, `coastRockets`, `explode`, `eliminate` | The bazooka. |
| `claimAct`, `claimFire`, `report`, `FireClaim` | A guest, checked by the host. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `canAct`, `isStanding`, `leave`, `placings` | The clock, the end, leaving, and who placed where. |
| `BOT`, `botSteer`, `sightedBy`, `wouldHitSelf` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeMove`, `decodeMove`, `encodeAct`, `decodeAct`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `OfficeScene`, `PALETTE`, `ROCKET_Y`, `CAMERA_OVER`, `AimRef` | The 3D view. |
| `OfficeScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **The same seed makes the same office and deals the same pieces.** Tested.
- **Furniture is one piece or leaves room to pass**, and **every piece and every
  desk can be walked to from a desk.** Tested over five seeds with eight players.
- **Everybody starts at their own desk, their pieces at least 9 m away.** Tested.
- **Only your own pieces, only in reach, one at a time; only your own desk.**
  Tested.
- **Four on the desk arms you, and nothing else does.** Tested.
- **A blast takes everybody within reach with nothing in between, the one who
  fired it included, and they go together.** Tested, including firing at your
  own desk from a metre away, and point blank.
- **Nobody ever walks into anything.** Tested, including every frame of twelve
  stand-in games.
- **A guest's claim counts only if it could be true.** Tested: armed, not too
  soon, from where it really is; never somebody else's piece.
- **Four players collect every piece through a relay that loses one snapshot in
  five, and every screen ends up agreeing on every desk.** Tested in Node.
- **The stand-ins play the same way every time.** Tested.

## Deliberate non-goals

- No models: the office is boxes, the pieces and the bazooka are primitives,
  players are the island's capsule.
- No health, ammo, splash falloff or knockback.
- No taking, hiding or knocking about anybody else's pieces.
- No music of its own: the round is silent under the cues until an entry goes
  into `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **The guide may make self-blasts too easy to avoid.** The brief says *be
  careful*; the red line means you only blow yourself up if you fire anyway, or
  if somebody walks into your line. Taking it out is one component in
  `OfficeScene` (`Guide`), and leaving the arrow home in is independent of it.
- **Pieces are always visible** when they are on screen; the search is only the
  camera's reach. A fog of war would make it more of a search.
- **Once somebody is armed, whoever is still collecting has nothing to fight
  back with.** That is the brief. Dropping a piece to run faster is the only
  defence.
- **The guest fires from its own position, not the host's**, within 1.5 m. A
  modified client could shift its shots by that much.
- **Sounds are borrowed**: a launch whoosh for a rocket, a balloon pop for a
  blast, a bump for picking up, a step for placing, a balloon inflating for being
  armed.
- **Only checked in Node and by reading.** It has not yet been played in a
  browser by a person, nor with two or more browsers.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **I Just Work
Here** (32) and press play.

- **During the three, two, one**, you should be at your desk against the north or
  south wall, seen from above, with furniture about and four stand-ins at their
  own desks in their colours.
- **Walk with WASD.** W should go up the screen. Walk into furniture: you should
  slide along it, never into it. Move the mouse: your capsule should turn to face
  it.
- **Find a piece in your colour** (a pulsing ring). *Left click to pick it up*
  should come up next to it. Click: it should go over your head, you should slow
  a little, an arrow should point home, and a beam should stand over your desk.
- **Left click away from your desk**: *Take it back to your desk first*.
  **Space**: it should drop at your feet. Pick it up again.
- **Take it home** and left click: it should sit on your desk and the HUD part
  should fill in. Try picking up a stand-in's piece: nothing.
- **Four on the desk**: *Bazooka ready!*, a bazooka on your shoulder, a line from
  you to where the rocket would burst with a ring round it.
- **Aim at a desk next to you**: the line and ring should turn red. **Fire
  anyway**: you should go, with *You blew yourself up*, and the camera should rise
  over the whole office.
- **Fire at a stand-in from further off**: a rocket, a blast, *You got …*, and
  the feed. Firing twice quickly should fire once.
- **The results** should be the podium: the last standing first, then the last to
  go.
- **Press escape mid-game.** Alone, the game should stop while the card is up.

### With two or more browsers

- **Everybody should have the same office**, each at a different desk, with the
  same pieces in the same places.
- **A guest picking up and placing** should show on the host's screen a moment
  later, and never flicker back.
- **A guest's rocket** should fly on every screen and its blast take the same
  people on every screen.
- **A guest closing their browser** should be out, their piece falling where they
  stood.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- Three instanced meshes for the office (every rectangle, the monitors, the
  plants' leaves), and two floors.
- Per player in play: a chair and a nameplate, the island's avatar, a bazooka of
  about twelve meshes (hidden until armed); a beam over your own desk.
- Per piece: two to three meshes and a ring - up to 32 pieces with eight players.
- Up to 24 rockets and 16 blasts from pools, only while in the air.
- One shadow-casting directional light and a hemisphere light.
