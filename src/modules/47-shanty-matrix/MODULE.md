# 47-shanty-matrix

## What this is

Minigame 43, free-for-all. **Everybody on the main deck of a pirate ship, under a
barrage.** Giant cannonballs fly across the deck from every direction at every
speed. **Each one's lane lights up red across the planks the moment it is fired,
a second before it gets there.** Dodge them, and **shove the others into their
way.** Anybody a ball touches is flung overboard and is out. The barrage gets
faster and fiercer the longer it goes. Last one standing wins.

**WASD to move, left click or Space to shove.**

It plugs into `15-minigames` with `registerMinigame('shanty-matrix', ...)` and one
import line in `src/App.tsx`. Like *You're The Bomb* (42), it arrived when every
free-for-all slot was taken, so the free-for-all target went from 31 to 32 and it
took the next number, 43.

## The deck

**The main deck is 14 m by 19 m inside the rails** (`DECK`), bow to the north. The
rails hold everybody on it: walking and shoving stop at them, and **only a
cannonball puts you over the side.** Everybody starts round a ring, facing the
middle.

## The barrage, and the clock it runs on

**Every ball of the round is dealt from the seed before the first one flies**
(`barrageFor`): which way it comes from (any direction), where it crosses the deck
(anywhere from rail to rail), how big it is (0.85-1.45 m radius), how fast it is,
and when it is fired. Where a ball is at any moment (`ballAt`) is arithmetic on
that and the clock, so **every screen works out every ball for itself and none of
it is ever sent.**

A ball:

| Stage | What happens |
| --- | --- |
| fired | Its lane lights up across the deck, as wide as the ball, with an arrow at the end it comes in from. The ball appears out of a puff of smoke over the sea and comes down towards the rail. |
| 1.1 s later | It lands at the rail (`SHOT.warn`, the same for every ball whatever its speed, so the warning is always fair). |
| deck | It rolls across the planks at its own speed. **Anybody within its radius plus most of a body's is hit.** |
| outgoing | It flies off the far side, drops, and splashes into the sea. |

**It gets fiercer over 56 seconds** (`fierceness`):

| | at the start | at 56 s and after |
| --- | --- | --- |
| Gap between volleys | about 1.7 s | about 0.55 s |
| Speed | 7-11 m/s | 12-20 m/s |
| Balls a volley | one | two or three (from 16 s: sometimes two; from 34 s: up to three) |

The barrage stops at **1:15** (`LIMIT`), and whoever is still standing then
shares first.

## Bodies

- **Walking** at 5.2 m/s. WASD is fixed to the deck: W is towards the bow, away
  from the camera. Diagonals are no faster. You face the way you last walked.
  Bodies do not overlap.
- **A shove** (`push`) goes the way you face: everybody standing **within 1.8 m
  and 57° either side** is knocked straight away from you at 11 m/s, wearing off -
  **two to three metres.** You lunge a little into it. **0.8 s between shoves.**
  While you are knocked hard your own feet count for a third, so a well-timed
  shove leaves no time to step back out of a lane.
- **A ball hits you** (`hit`): you are out at that moment, flung up and on the way
  the ball was flying, over the rail, tumbling, into the sea. **If somebody shoved
  you in the 2.5 s before, they get the credit** - "sunk" in the HUD. Balls are
  checked every fortieth of a second, so even the fastest cannot pass through
  anybody between two looks.

## Placings

Whoever is standing at the end first; then the hit, **the last to go first**;
then anybody who left while standing, the last to leave first.

## Controls

- **WASD / arrows** walk, fixed to the deck.
- **Left click or Space shoves** the way you last walked. A faint arc on the deck
  in front of you shows how far a shove reaches.
- Paused, or the game over: the keys are let go of.

## On the screen

- **The ship** rocks gently on a moving sea: a planked deck inside low rails, a
  forecastle with a mast, a sail and a skull-and-bones flag at the bow, a raised
  quarterdeck with the wheel at the stern, cannons out of both sides. Enemy ships
  bob round the horizon. The rocking is only for the eye; the rules know nothing
  of it.
- **The camera** looks down on the whole deck from behind the stern, leaning a
  little towards you. Once you are overboard it pulls back over the middle.
- **The balls:** red lanes flickering while they come and steady as they cross,
  an arrow at the end they come in from, a puff of smoke where they appear, iron
  balls rolling across, splashes where they go into the sea.
- **A red edge round the screen** while a lit lane runs under you and its ball has
  not yet gone past (`inALane`).
- **Close shave!** when a ball rolls past within 0.4 m of hitting you.
- **The HUD:** time left, how fierce it is (*calm seas*, *broadside*, *heavy
  fire*, *all guns!*), how many are aboard, a pill per player (with how many they
  have sunk), and a shove bar at the bottom.
- **Hit:** a flash, *Overboard!* (and who shoved you), and a splash where you
  went in.
- **Sound:** a boom for every volley fired, a bump for a shove, a bonk and a fall
  for anybody going overboard.
- **The results** are the podium, from `useFinish`.

## One deck across the lobby

**The host runs the bodies.** Shoving and being hit are physics between bodies, so
one screen owns all of it: the host walks everybody - itself, the stand-ins, and
each guest from what the guest says its hands are doing - resolves every shove and
every hit, and sends a snapshot twenty times a second: where everybody is, how
high (flung and falling), which way they face, when they were hit and who shoved
them, how many they have sunk, and when they last shoved. About 60 bytes a player.

**The balls are not on the wire.** Every screen draws them from the seed and its
own clock, which is eased towards the host's - so a ball is in the same place on
every screen to within the clock's easing.

**A guest sends its hands** (`sm-in`): which way it walks and **its shoves as a
running count**, so a repeated message never doubles a shove and a lost one never
loses one. Walking and shoves go the moment they change, and are repeated ten
times a second. A guest the host has not heard from for half a second stands
still.

**A guest's own player moves at once on its own screen** and is eased towards
where the host has it (snapped if more than 2 m out), never through the rails. A
shove or a ball that lands on a guest comes from the host, and wins.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins.

- **A stand-in notices a ball 0.15-0.5 s after it is fired** - its own reaction -
  and ignores it until then.
- **A few times a second it weighs twelve ways to walk and standing still**
  (`bestWay`): where each would put it 0.15, 0.35, 0.6 and 0.9 s ahead, against
  where every ball it has noticed will be then (`danger`), with a little cost for
  being pinned against a rail. It takes the clearest.
- **It does not always think it through**: between 5% and 45% of the time,
  depending on the stand-in, it carries on the way it was going.
- **With nothing coming it drifts about the deck**, well in from the rails.
- **It shoves** whoever is closest in front of it and within reach now and then,
  and **far more readily when the shove would put them in a lane.**

All of it from the seed, so the same game plays out the same way. Tested.

### What they play like

Over 30 seeds and two to eight stand-ins: **a game lasts about 38 seconds**, from
4 s (two stand-ins, one shoved into the first ball) to nearly 59 s. **Alone on the
deck, a stand-in lasts far longer than somebody standing still** - more than
three times as long. Tested. **Most of their falls follow a shove**: they dodge
well on their own, so shoving is what decides it. A human dodges worse, and will
lose more to the balls alone.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `DECK`, `SHOT`, `LIMIT` | The numbers. |
| `barrageFor`, `Shot`, `volleySize`, `fierceness`, `crossing` | The barrage, from the seed. |
| `ballAt`, `Ball`, `activeShots`, `lifetime`, `offLine`, `alongLine` | Where a ball is when, and which are in the air. |
| `spawnPoint` | Where everybody starts. |
| `BODY`, `PUSH`, `ROUND`, `COLOURS`, `hitRange` | Bodies, the shove, being hit, the clock. |
| `createGame`, `Game`, `Player`, `Entrant` | A game at its start. |
| `steer`, `face`, `push`, `move`, `cooldownLeft`, `yawTowards`, `wrapAngle` | Walking, shoving, being hit. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `canAct`, `isStanding`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer`, `bestWay`, `danger` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `DeckScene`, `PALETTE`, `SEA_Y` | The 3D view. |
| `DeckScreen`, `inALane` | The panel `15-minigames` draws, and what the red edge means. |

## Invariants you may rely on

- **The same seed deals the same barrage, and another seed another.** Tested.
- **Balls come from every direction, cross the deck, and are giant.** Tested.
- **It gets fiercer: more balls a second, quicker, more at once.** Tested.
- **Every ball reaches the rail exactly `SHOT.warn` after it is fired**, rolls
  across at its own height, and drops into the sea. Tested.
- **A ball is among those active exactly while it is in the air.** Tested.
- **Nobody walks or is shoved through a rail.** Tested.
- **A ball hits anybody in its lane as it reaches them, misses anybody clear of
  it, and flings them overboard the way it was flying.** Tested.
- **Shoved into a lane is credited to whoever shoved.** Tested.
- **The stand-ins dodge, play down to one, and play the same way every time.**
  Tested.

## Deliberate non-goals

- No models: the ship and the balls are primitives, players are the island's
  capsule.
- No going overboard but by a cannonball: the rails hold.
- No music of its own: the round is silent under the cues until an entry goes
  into `ROUND_MUSIC` in `15-minigames`. A sea shanty is the obvious one.

## Known limitations

- **A guest sees its own shove land a round trip late**, and is hit on its own
  screen a round trip late - so on a laggy connection a ball can visibly pass
  through a guest a moment before they go over. Walking is predicted; hits are
  the host's.
- **A guest can see *Close shave!* just before the host's word that the ball hit
  them after all** arrives, for the same reason.
- **The balls pass through the rails and the stern** on their way in and out;
  nothing breaks.
- **Not played with two browsers yet.** The wire is tested in Node only, and a
  lobby run of `lobby.mjs` does not know this game.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Shanty Matrix**
(43) and press play. `node .claude/skills/run-localrot/scripts/solo.mjs --game
shanty-matrix --steer` plays a round with real keys and screenshots it.

- **During the three, two, one**, the whole deck should be in view: you with a
  white ring, five stand-ins round a ring, the mast and flag at the far end, the
  wheel near you, sea all round.
- **Walk with WASD.** W should go up the screen, towards the bow. Walk into a
  rail: you should stop at it.
- **Watch the first balls.** A red lane should light up across the deck with an
  arrow, a puff of smoke out over the sea, and a second later the ball should land
  at the rail, roll across and splash into the sea on the far side.
- **Stand in a lane.** The screen edge should go red. Step out before the ball
  arrives: *Close shave!* if it was near. Stay in: you should be flung tumbling
  over the rail into the sea, *Overboard!*, and the camera pull back.
- **Shove a stand-in** (click or Space) walking towards them: they should go back
  two or three metres. Shove one into a lane just before its ball: the HUD should
  say you sunk them.
- **Watch it get fiercer**: the pill should go *calm seas*, *broadside*, *heavy
  fire*, *all guns!*, the balls quicker and two or three at once.
- **The results** should be the podium, the last to go overboard highest.
- **Press escape mid-game.** The balls should stop dead with the card up.

### With two or more browsers

- **Everybody should see the same lanes and the same balls at the same moment.**
- **A guest walking** should move at once on their screen and a moment later on
  the host's. **A guest shoving the host** into a lane should sink the host.
- **The same people should go overboard at the same moment** on every screen.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the
ship (hull, deck, about fifty rail posts and the rails, forecastle, mast, sail, flag,
quarterdeck, wheel, eight cannons), six enemy ships, the sea, a pool of eighteen
balls each with a lane, an arrow, a puff and a splash (only those in use are
drawn), and the island's avatar per player.
