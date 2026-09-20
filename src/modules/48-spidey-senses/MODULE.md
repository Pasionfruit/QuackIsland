# 48-spidey-senses

## What this is

Minigame 44, free-for-all. **A game of chicken round a trapdoor with a spider's
nest under it.** Every round everybody starts back on a ring round the trapdoor
and **creeps in**, slowly. **A click stops you** where you stand for the rest of
the round. **Nobody can reach the trapdoor** - there is a railing round it. The
trapdoor gives one to three false-alarm thuds, and **the spider comes out on the
2nd, 3rd or 4th thud**; anybody who has not
clicked within a fraction of a second **gets the spider, with a jump scare, and
is out.** If nobody was too late, the spider takes **the chicken: whoever stopped
furthest back** - and gets the same jump scare, second place in the last round
included. Somebody goes every round. The last one left wins.

**WASD to creep in, back and round; left click to stop - and to react.**

It plugs into `15-minigames` with `registerMinigame('spidey-senses', ...)` and one
import line in `src/App.tsx`. Like 42 and 43, it arrived with every free-for-all
slot taken, so the free-for-all target went from 32 to 33 and it took 44.

## Why the chicken

The brief is "stop before you get too close, react or be eaten, last one left
wins". Taken alone that has no reason to go near the trapdoor at all: stand on
the ring, click at once, and you are safe for ever. **The chicken rule is what
makes it a game of chicken**: stopping early is safe from the spider's jump and
not from being furthest back. Creeping closer means staying unstopped - betting
on your reactions - for longer. It also means somebody goes every round, so the
game always ends.

## The cellar, and the clock it runs on

A stone cellar, a 2 m trapdoor in the middle, chalk rings every two metres.
**Everybody starts each round 9 m out** (`CELLAR.far`) and can creep **no closer
than 2.7 m** (`CELLAR.near`) - a body's width outside the **railing** (`CELLAR.rail`,
2.3 m), which is round the trapdoor on posts and rope so that nobody can ever get
to it - and no further back than the ring.

**A round is all arithmetic on the seed and the clock** (`scheduleFor`, `when`):

| Phase | How long | What happens |
| --- | --- | --- |
| ready | 1.5 s | Everybody still in is back on the ring. Nobody can move or click. |
| creep | 5-15 s, then the window | Creep in or back. The lid **twitches** one to three times - false alarms, each a small lift and a thud, never red, at least 1.3 s apart. At a random moment it **springs**, and that is the **2nd, 3rd or 4th thud** (`TIMING.thuds`): it pops up and chatters, red eyes glint in the gap and a red glow spills across the floor, with a loud thud. From then, **the window** to click: 0.62 s in round one, 0.04 s less each round, down to 0.38 s. Then a quarter of a second of grace for a click still on its way. |
| reveal | 3.5 s | The lid flies open and the spider leaps onto whoever it is taking, webs them up and drags them into the nest. |

Every screen works out when the trapdoor springs and twitches for itself -
**none of it is sent.** Who the spider takes is the host's.

## The rules

- **Creeping** at 0.75 m/s - slowly - in, back, or round the trapdoor. Bodies do
  not overlap, and **a stopped player does not budge** for somebody walking into
  them.
- **A click stops you** for the rest of the round, where you stand. Before the
  spring it is playing safe; after it, it is reacting.
- **The spider** (`victims`) takes **everybody who has not clicked by the end of
  the window** - too slow, or never stopped at all - with a jump scare.
- **If nobody was too late, it takes the chicken**: whoever is furthest from the
  trapdoor. Distances within 5 cm are level (`LEVEL`); level with somebody, the
  one **further from the moment it sprang** goes - who stopped longest before,
  or reacted slowest after. Everybody exactly level to the hundredth of a second:
  nobody goes that round.
- **Twelve rounds at most** (`MAX_ROUNDS`); whoever is left then shares first.

## Placings

Whoever is left at the end first; then the rest, **the later the round they went
in, the better** - those taken in the same round share; then anybody who left the
lobby while in. Everybody left taken in the same round: they share first.

## Controls

- **W / up** creeps in towards the trapdoor, **S / down** backs off, **A and D**
  edge round it - relative to the camera, which always looks at the trapdoor.
- **Left click** stops you, for the round. It is also how you react when the
  trapdoor springs.
- Paused, or the game over: the keys are let go of.

## On the screen

- **Over your shoulder**, the camera looking at the trapdoor - **rising as you
  creep in**, so it always sees the lid over your head.
- **The lid** twitching, and springing: popped open, chattering, red eyes, red
  glow.
- **You** have a ring at your feet, white while you can creep and amber once you
  have stopped. **Everybody who has stopped has an amber dot over their head**, and
  a ✋ in the HUD.
- **The jump scare**: taken by the spider - too late, or the chicken, so second
  place gets it too - and the screen goes black and **a spider charges
  down a dark corridor straight at you** (`Spider_Jumpscare_gif.gif`) until it
  fills the screen, shaking as it lunges, under a shriek
  (`Spider_Jumpscare_Audio.mp3`). The film runs 1.1 s and is taken off the screen
  before it can loop; black holds to the end of the shriek, a second and a half,
  then *Too slow!* The film is fetched once when the screen
  opens, and every scare plays it from its first frame. If it has not loaded, a
  drawn spider lunges instead.
- **The reveal**: the spider leaping out onto its victim, and *The spider got
  …* or *… was the chicken*; for you, *Chicken!*
- **The HUD**: the round, how many are left, **how far you are from the
  trapdoor**, and a pill per player with ✋ when stopped, 🕷 when eaten and 🐔 when
  taken as the chicken.
- **Sound**: a thud for a twitch, a louder one for the spring, a crash as the
  spider comes out, the jump scare's shriek for your own, a buzz for being the
  chicken, a fall for anybody taken, a step as you stop.
- **The results** are the podium, from `useFinish`.

## One cellar across the lobby

**The host runs the bodies and the judging**: it walks everybody - itself, the
stand-ins, and each guest from what the guest says it is doing - takes every
stop, lets the spider out and starts each round, and sends a snapshot twenty
times a second: where everybody is, when they stopped this round, the round they
were taken in and how.

**A guest is judged on its own reactions, not its ping.** It sends which way it
is creeping and, once it clicks, **when it clicked by its own clock** (eased to the
host's), with the round. The host takes that reading as the moment it stopped -
if it is no more than half a second old (`STOP_SLACK`) and not in the future. The
quarter second of grace before the spider comes out is so a click still on the
wire arrives in time to count.

**A guest's own player creeps at once on its own screen and stops dead the moment
it clicks**, without waiting to hear back; it is eased onto where the host has it.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins. Every round each makes up its
mind afresh:

- **Its nerve**: how far out from the trapdoor's edge it is happy to stop, up to
  4.5 m - more often near than far.
- **Its reaction**: 0.2-0.6 s from the spring to its click - so later in the game,
  with the window shrinking, the slow ones get eaten.
- **Safe or waiting**: three in ten click the moment they reach their spot; the
  rest stand there unstopped, waiting to react.
- **Fooled**: one twitch in five fools it into clicking.

All of it from the seed. Over twenty seeds and two to eight stand-ins a game lasts
about a minute, and about a third of those taken are too slow and two thirds the
chicken.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `CELLAR`, `TIMING`, `MAX_ROUNDS`, `windowFor` | The numbers. |
| `scheduleFor`, `Round`, `when`, `When`, `Phase`, `sprung`, `rattle`, `spawnPoint` | The rounds and the lid, from the seed and the clock. |
| `BODY`, `LEVEL`, `STOP_SLACK`, `COLOURS` | Bodies, what counts as level, how old a guest's click may be. |
| `createGame`, `Game`, `Player`, `Entrant`, `How` | A game at its start. |
| `steer`, `creep`, `move`, `stop`, `canCreep`, `distance` | Creeping and stopping. |
| `victims`, `inTime`, `offMoment`, `judge`, `startRound`, `advanceRounds`, `roundNow` | The spider and the rounds. |
| `tick`, `stepGame`, `judgeEnd`, `isStanding`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `NestScene`, `PALETTE`, `LEAP`, `DRAG` | The 3D view, and the spider's timing. |
| `NestScreen`, `JumpScare`, `SCARE`, `SCARE_GIF` | The panel `15-minigames` draws, and the jump scare. |

## Invariants you may rely on

- **The same seed, the same rounds; ready, creep, reveal, each round starting
  where the last ended.** Tested.
- **It springs at a random moment in range, differently every round; there are
  always one to three twitches before it, so the spider comes out on the 2nd, 3rd
  or 4th thud, in order and apart; the spring rattles to the reveal.** Tested.
- **Nobody can get to the trapdoor, from any side or edging round, and nor can the
  stand-ins.** Tested.
- **Everybody the spider takes - too late or the chicken - gets the jump scare, and
  nobody it did not take does.** Tested.
- **The window shrinks round by round, to a floor.** Tested.
- **Nobody moves in the ready; creeping stops at the railing and at the
  ring; a stopped player stays put and does not budge.** Tested.
- **A guest's click is believed from its own clock, but never from the future or
  more than half a second back.** Tested.
- **The spider takes everybody too late and nobody in time; with nobody late, the
  chicken - level broken by the moment; nobody when all are exactly level.**
  Tested.
- **A round is judged once, and the game only ends after the reveal.** Tested.
- **The stand-ins creep to different spots, play down to one, some too slow and
  some the chicken, the same way every time.** Tested.

## Deliberate non-goals

- No models: the cellar, the trapdoor and the spider are primitives, players are
  the island's capsule.
- No shoving: nobody can push anybody towards the trapdoor.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest's clock is trusted.** A doctored client could claim it clicked in time.
  It is a party game among friends; the half-second limit bounds it.
- **The lantern can hang between your camera and a player across the ring.**
- **Not played with two browsers yet.** The wire is tested in Node only, and
  `lobby.mjs` does not know this game.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Spidey Senses**
(44) and press play. `node .claude/skills/run-localrot/scripts/solo.mjs --game
spidey-senses --steer` creeps in and reacts in round one, then stands still and
never clicks in round two to get eaten, screenshotting the spring, the reveal and
the jump scare.

- **During the three, two, one**, you should be behind yourself on the ring, the
  trapdoor ahead under a lantern, the others round the ring.
- **Hold W.** You should creep in - slowly - the camera rising so the lid stays in
  view over your head. The HUD distance should count down; you should stop at the
  railing and go no further. **S** backs you off, **A** and **D** edge you round.
- **Watch for twitches**: a little lift and a thud, no red. Don't click. There are
  one to three, then the spring: the spider comes out on the 2nd, 3rd or 4th thud.
- **When it springs** - popped lid, red eyes, red glow, loud thud - **click.** Your
  ring should go amber, *Stopped at …*, and you should be safe.
- **Next round, don't click.** A spider should lunge out of the dark at you,
  shaking, then *Too slow!*, and you should see yourself webbed and dragged into
  the pit.
- **Click early, far back**: you should be *Chicken!* if you were the furthest -
  with the same jump scare.
- **The results** should be the podium, the later out the higher.

### With two or more browsers

- **Everybody should see the lid twitch and spring at the same moment.**
- **A guest's click in time should keep them in** even with a slow connection.
- **The same people should be taken on every screen.**

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the
floor, four walls, five chalk rings, four cobwebs, the lantern and its light (with
shadows), the trapdoor (pit, frame, lid, bands, ring, eyes and their light), the
spider (about twenty meshes), and per player the island's avatar, a ring, a dot
and a web.
