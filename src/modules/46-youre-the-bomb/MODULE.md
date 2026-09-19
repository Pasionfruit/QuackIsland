# 46-youre-the-bomb

## What this is

Minigame 42, free-for-all. **A long room with bombs hidden in the floor and a
hole at the far end.** Everybody starts at the south end. **Space scans**, showing
you - and only you - every bomb near where you stand, for a few seconds. Pick
your way through, **shove anybody in your way** (onto a bomb, if you like), and
drop through the hole **before the giant rolling pin comes through the room at
45 seconds** and flattens everybody still in it. First out wins.

**WASD to move, Space to scan for nearby bombs, left click to push.**

It plugs into `15-minigames` with `registerMinigame('youre-the-bomb', ...)` and
one import line in `src/App.tsx`. Every free-for-all slot was taken, so it is a
new **slot 42**: the free-for-all target went from 30 to 31 (see `15-minigames`'
notes).

## The room

**12 m wide and 60 m long**, low walls, the south end open onto the rolling pin
outside, and **the hole** - 1.5 m round, ringed in yellow - in the floor near the
north wall.

**The bombs** are on a grid of 1.5 m squares, the floor's tiles - one at most to a
square, anywhere in it but its very edge - on about a quarter of the squares,
from the seed. **First a safe way is laid**: from a random square on the start
row, north a row at a time, drifting a square or two sideways as it goes, and
steering for the hole over the last rows. No bomb goes on it, and walking the
middle of every square on it sets nothing off, so **the room can always be
crossed**. Nobody is told where it is. The three rows at the start and the two by
the hole are clear. Tested over six seeds.

## The rules

- **A bomb goes off** when anybody's middle comes within 0.6 m of it. They are
  out, and **everybody within 2.2 m is knocked away** from it, hardest nearest. It
  is a scorch mark from then on, and can be walked over.
- **Scanning** shows every bomb within **4 m** of where you stood, on your own
  screen, for **4 seconds**, fading over the last one. **2 seconds between scans.**
  A scan is never on the wire and never shown to anybody else.
- **A shove** goes **the way you last walked**: everybody within 1.7 m in front of
  you is knocked straight away from you, a little over a metre and a half, and you
  lunge into it. 0.8 s between shoves. **If a shove puts somebody on a bomb in the
  2.5 s after it, the shover gets the credit.**
- **The hole:** over it and you have escaped - you drop through, and are placed by
  when.
- **The rolling pin** sits outside the south end, 26 m off, and rolls closer for
  **45 seconds**. Then it comes in and rolls the length of the room at 22 m/s, and
  **flattens anybody it reaches** - in about three seconds.
- **The end:** nobody left in the room, or the pin through the whole of it.

**Placings:** the escaped first, **the first out first**; then the dead, **the last
to die first** - the pin reaches those nearer the hole later, so they place higher;
then anybody who left while in the room.

## Controls

- **WASD / arrows** walk you about the room: W towards the hole, up the screen.
  You face the way you walk.
- **Space** scans. Held down, it scans once.
- **Left click** anywhere on the room shoves, the way you face.

## On the screen

- **The room** from above and behind you, the hole ahead, the rolling pin (a
  great wooden pin with a dark stripe so you see it roll) out past the open end
  behind you. Once you are out, the camera rises over whoever is furthest along.
- **A scan** is a ring sweeping out from you and a faint disc over what it covers;
  **each bomb inside shows as the ring reaches it**, a dark ball with a blinking red
  light, and fades out after four seconds.
- **A blast** is a ball of fire, then a scorch mark on the floor - for everybody.
- **You** have a white ring at your feet and a faint arc ahead as far as a shove
  reaches.
- **The HUD:** *pin in 0:32*, turning red in the last ten seconds; how many are in
  the room and how many are out; a pill per player (out ✓, 💥 or flat); a scan bar
  and a shove bar at the bottom.
- **Banners:** *Space to scan for bombs* at the start; *The rolling pin comes in 8*
  over the last ten; *BOOM!* (and who shoved you), *Flattened!*, *You got out!
  2nd*.
- **Sound:** a whoosh for your scan, a crash for every bomb, a rumble as the pin
  comes in, a pop for anybody through the hole, a fall for anybody dying.
- **The results** are the podium, from `useFinish`.

## One room across the lobby

**The host runs the bodies**: its own hands, the stand-ins', and each guest's from
what the guest says its hands are doing - every step, shove, bomb, escape and
flattening - and sends a snapshot twenty times a second: where everybody is and
faces, when they escaped or died and how, who shoved them, how many they have
shoved to their end, when they last shoved; and every bomb gone off, when and
under whom. The room and its bombs are not sent: the seed makes them.

**A guest sends its hands** (`ytb-in`): which way it walks, and its clicks as a
running count, so a repeated message never doubles a shove. Its own player moves
at once on its own screen and is eased towards where the host has it. **Scans
never go on the wire** - a scan is the screen's own.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and four stand-ins.

A stand-in **knows only what its own scans have shown it**, and only for as long
as a scan would stay on your screen. It finds its way to the hole square by
square: squares with a bomb it has seen are walls, squares it has seen clear are
cheap, squares it has not seen cost five times as much. When the next square is
one it has not seen, it scans - or, if its scan is not ready, waits for it; one
time in fifty to one in eight (it varies by stand-in) it walks on without looking.

It **shoves** whoever is close in front of it, a couple of times a second at most,
and **much more readily when a bomb it knows is just past them.**

Over twenty games of two to eight stand-ins: **about half get out**, at 31-40
seconds - close to the pin. Most of the rest are shoved onto bombs, many in the
crowd at the start. Tested: they finish, some get out and some do not, and they
play the same way every time.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `ROOM`, `ROWS`, `COLS`, `roomFor`, `Room`, `Bomb`, `Point` | The room for a seed, cached: its bombs and the safe way. |
| `cellAt`, `cellMiddle`, `scan`, `inHole`, `spawnPoint` | The floor. |
| `BODY`, `SCAN`, `BOMB`, `PUSH`, `PIN`, `ROUND`, `COLOURS` | The numbers. |
| `createGame`, `Game`, `Player`, `How`, `Entrant` | A game at its start. |
| `steer`, `push`, `move`, `cooldownLeft`, `pinZ`, `live`, `yawTowards`, `wrapAngle` | Walking, shoving, the bombs, the pin. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `canAct`, `inRoom`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer`, `nextSquare` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `RoomScene`, `PALETTE`, `ScanRef` | The 3D view, and the scans the screen hands it. |
| `RoomScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **The same seed, the same room, and always a safe way through**, every square of
  it clear, start row to the hole. Tested over six seeds.
- **The start and the hole are clear of bombs.** Tested.
- **A bomb takes whoever sets it off, knocks everybody near, and goes off once.**
  Tested.
- **A shove onto a bomb is credited to the shover.** Tested.
- **The hole is escape; the pin waits 45 seconds, then flattens whoever it reaches,
  nearer the hole later.** Tested.
- **First out first, then the last to die.** Tested.
- **Scans never go on the wire.** Tested.
- **The stand-ins finish, some get out, and they play the same way every time.**
  Tested.

## Deliberate non-goals

- No models: the room, the bombs and the pin are primitives, players are the
  island's capsule.
- Nobody sees a bomb they have not scanned, and a scan is never shared.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **The bombs are in every screen's copy of the seed.** A modified client could
  draw them all. Hiding them would mean the host sending each player only what
  they scanned.
- **The start is a scrum.** Five or more players shoving at the south end put
  people on bombs in the first seconds. That may be the fun, or may be too much.
- **A guest's shove lands a round trip late**, and so does a shove on a guest.
- **Not played with two browsers yet.** The wire is tested in Node only.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **You're The
Bomb** (42) and press play.

- **During the three, two, one**, you should be at the south end of a long room
  with the others, the hole far ahead, the rolling pin behind you outside.
- **Press Space.** A ring should sweep out, and bombs within four metres show,
  then fade after four seconds. Press it again at once: nothing, until the scan
  bar fills.
- **Walk into a bomb you have seen**: BOOM, you are out, and the camera rises.
- **Walk to the hole** (scanning as you go): you should drop through, *You got
  out! 1st*.
- **Shove a stand-in** onto a bomb you have scanned: they should blow up, and
  their pill say 💥.
- **Wait out the clock**: the pin should roll in at 45 seconds and flatten anybody
  still in the room, the ones furthest back first.
- **The results** should be the podium: the first out first.

### With two or more browsers

- **Everybody should have the same room, the same scorch marks, and see the same
  people drop through the hole.**
- **A guest's scan should show on their screen only.**
- **A guest shoving the host onto a bomb** should blow the host up on every screen.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the
floor, four walls, the hole, the pin (five meshes), the island's avatar per
player, and only the bombs a scan is showing - up to two meshes each - plus a
scorch mark per bomb gone off.
