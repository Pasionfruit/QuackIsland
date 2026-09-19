# 43-highest-in-the-room

## What this is

Minigame 33, free-for-all. **Everybody on a tower of their own, racing upward by
typing arrows.** An arrow is on the screen: press it. **Right, and another block
goes in under you. Wrong, and you are knocked down four.** The camera follows
whoever is highest, and **ten blocks behind them you are out.** The last one left
wins.

**↑ ↓ ← → - press the arrow on the screen.**

It plugs into `15-minigames` with `registerMinigame('highest-in-the-room', ...)`
and one import line in `src/App.tsx`. It took the free slot 33.

## The rules

- **The arrows** come from the seed: one sequence, **the same for everybody**, in
  the same order. Which one you are on is how many you have got right, so a wrong
  key leaves the same arrow up until you get it. Never the same arrow three times
  running.
- **A right key** puts a block under you: one higher.
- **A wrong key** knocks you down four blocks, never below the floor.
- **Ten or more blocks below the highest player still in, and you are out.** It is
  checked every frame, so a slip that puts you ten behind is out at once.
  Everybody that far behind at the same moment goes together and shares a place.
  Somebody who leaves the lobby stops counting as the highest.
- **The end:** one left (or nobody), or **1:30**. At the time limit whoever is
  left is placed by height; equal heights share.
- **Placings:** whoever is left first, then the knocked out, the last to go first,
  then anybody who left while still in.

## Controls

- **The four arrow keys**, by `KeyboardEvent.code`. Each press counts once:
  **holding a key down does not repeat it.** The arrow keys never scroll the page.
- Keys during the three-two-one, on a pause, once you are out or once it is over
  do nothing.

## On the screen

- **The towers**, side on, in a row across a tall room: blocks in each player's
  colour, two shades turn about so they can be counted, with the player's capsule
  on top. A right key hops you up; a wrong one shakes you and the tower sinks
  four. A tower that is out goes grey, and its capsule goes.
- **The camera follows whoever is highest**, far enough back to see every tower
  and the ten blocks below the top.
- **The red band** is ten blocks below the leader and rises with them: a tower
  whose top is in it is out.
- **Stripes on the back wall** every five blocks, so you can see the speed.
- **Your arrow** is big, on the right of the screen, beside the towers. **Only the
  one arrow is ever shown** - never the ones after it, so there is no reading
  ahead. Its border flashes red, and the edge of the screen too, on a wrong key.
- **The HUD:** time left, how many are climbing, and a pill per player with their
  height and how far behind the leader they are.
- **Banners:** *Press the arrow* at the start, *Wrong - down 4*, *3 from out!*
  when you are within three of the band, *Knocked out*.
- **The results** are the podium, from `useFinish`.

## One room across the lobby

**The host runs the game**: the clock, its own keys, the stand-ins, every guest's
keys as they arrive, who is out, and the end. It sends a snapshot fifteen times a
second: each player's height, which arrow they are on, how many keys they have
pressed and missed, their best, when they went and whether they have left. The
arrows are not sent: the seed deals them. Eight players is about 400 bytes.

**A guest judges its own keys on its own screen**, so a tower grows the instant
the key goes down, and sends each key the moment it presses it, numbered. The
relay keeps one sender's messages in order, so **the host presses the same key on
the same arrow and gets the same answer.** A number the host has already had is
not pressed twice.

**A guest's own tower stays as its screen has it until the host has heard every
key it pressed**; then the host's word, which is the same. A second after its
last key, the host's word whatever it says, so a key the host never took cannot
leave a guest out of step for good. **Nobody is out until the host says so.**

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and four stand-ins.

A stand-in reads the arrow and presses a key at its own pace, **between about
3.5 and 6 keys a second**, each press 30% quicker or slower than the last at
random. It presses the wrong one **3-8% of the time**, and the press after a slip
takes nearly twice as long. All from the seed, so the same game plays out the
same way. Tested.

### What it plays like

Against the four stand-ins, over 30 seeds each, a person typing:

| Keys a second, mistakes | How long a game lasts (middle) | Wins |
| --- | --- | --- |
| 3, 3% | 14 s | 1 in 30 |
| 4, 3% | 16 s | 11 in 30 |
| 5, 5% | 12 s | 16 in 30 |
| 6, 2% | 7 s | 30 in 30 |

**Games are short, and that is the rules.** Ten blocks of slack is ten more keys
than somebody else, and two players a key a second apart are that far apart in
ten seconds. The first stand-ins were slower (3-4.5 keys a second), and anybody
at five a second won almost every time.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `ARROWS`, `CLIMB`, `ROUND`, `COLOURS`, `Arrow` | The numbers. |
| `arrowAt`, `arrowFor` | The arrows for a seed. |
| `createGame`, `Game`, `Player`, `Entrant` | A game at its start. |
| `press`, `canPress` | A key. |
| `knockOut`, `behind`, `leader`, `leaderHeight`, `isIn` | Falling behind. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `leave`, `placings` | The clock, the end, leaving, and who placed where. |
| `BOT`, `botSteer` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodePress`, `decodePress`, `SNAPSHOT_TAG`, `PRESS_TAG`, `Snapshot`, `WirePlayer` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `TowerScene`, `PALETTE`, `BLOCK`, `SPACING`, `towerX` | The 3D view. |
| `TowerScreen`, `KEYS`, `GLYPHS` | The panel `15-minigames` draws, the keys and how the arrows are drawn. |

## Invariants you may rely on

- **The same seed deals the same arrows**, however they are asked for, never three
  alike running. Tested.
- **A right key is one block and the next arrow; a wrong key is four down, never
  below the floor, and the same arrow.** Tested.
- **Out at ten behind the highest still in, not at nine**, together if together.
  Tested, including out from a slip.
- **The last one left wins; at the limit, by height.** Tested.
- **Four players typing through a relay that loses a snapshot in four end with
  every screen agreeing** on every height, every key and who is out. Tested in
  Node.
- **The stand-ins play the same way every time.** Tested.

## Deliberate non-goals

- No models: the towers are boxes and the players are the island's capsule.
- Nothing to type but the four arrows.
- No music of its own: the round is silent under the cues until an entry goes
  into `ROUND_MUSIC` in `15-minigames`. A right key is a soft bump, a wrong one
  the collapse, and anybody going out a fall.

## Known limitations

- **Games are short** - about 10-20 seconds with stand-ins; see *What it plays
  like*. Longer games need a rules change: more slack than ten, or a knock-down
  smaller than four.
- **A guest is trusted with its own keys.** The host presses what it is sent, so a
  modified client could send nothing but right arrows. The host does check the
  numbering and that the player is still in.
- **Only a person can say whether the pace feels right.** The sound on every right
  key might be too much at six a second.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Highest In
The Room** (33) and press play.

- **During the three, two, one**, five towers should stand at the floor, side on,
  with one big arrow on the right, and nothing after it. Arrow keys should do
  nothing yet.
- **Press the arrow shown.** Your capsule should hop up a block, the next arrow
  should come up, and your pill's height should go up.
- **Press a wrong one.** Your tower should sink four, the screen edge flash red,
  *Wrong - down 4*, and the same arrow stay up.
- **Hold a key down.** It should count once.
- **Watch the camera** follow whoever is highest - you or a stand-in - and the red
  band ten below them. Fall into it: *Knocked out*, your tower grey.
- **The results** should be the podium: the last left first.
- **Press escape mid-game.** Alone, the game should stop while the card is up.

### With two or more browsers

- **Everybody should see the same arrows** in the same order.
- **A guest's keys** should grow their tower at once on their screen and a moment
  later on the host's, and never flicker back.
- **A guest ten behind** should go out on every screen at once.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: one
instanced mesh for every block in view (up to 17 a tower), one for the stripes,
the wall, the floor, the red band, and the island's avatar per player.
