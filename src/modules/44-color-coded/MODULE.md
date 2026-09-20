# 44-color-coded

## What this is

Minigame 34, free-for-all. **Everybody on a grid of colour panels floating over
nothing.** A giant wheel spins and lands on a colour: **two seconds to get onto a
panel of it.** Then **every other panel drops, and anybody on one falls and is
out.** The panels rise back, the colours are dealt again with **fewer of the
wheel's colour every round**, and round it goes. Last one standing wins.

**The panels are ice, and there is no shove.** Nobody stops when they let go or
turns on the spot; **Shift runs**, which is nearly twice as fast and much harder to
steer; and bodies collide, and a collision keeps its speed, so a runner into
somebody standing still sends them off and stops nearly dead.

**WASD to move, Shift to run, the mouse to turn the camera.**

It plugs into `15-minigames` with `registerMinigame('color-coded', ...)` and one
import line in `src/App.tsx`. It took the free slot 34.

## The arena, and the clock it runs on

**Six by six panels, 3 m each, touching** - there is no gap between two panels to
fall through, only the edge and whatever has dropped. Everybody starts round a
ring on the panels, facing the middle.

**A round is nine seconds**, and all of it is arithmetic on the clock (`when`):

| Phase | Seconds | What happens |
| --- | --- | --- |
| spin | 3 | The wheel spins, slowing, and stops on the colour. Walk and shove freely. |
| reveal | 2 | The colour is up. Its panels bob; everything else flickers darker as time runs out. A panel is never drawn any colour but its own. |
| drop | 1.5 | Every other panel drops away. Anybody not on the colour falls. |
| rebuild | 2.5 | The dropped panels rise back in a straight line, **flush exactly as the round ends** - which is when they can be stood on again. |

**What you see is what holds you.** A dropped panel is standable from the instant
the next spin starts and not a moment before, and it is drawn all the way up at
exactly that instant and not a moment before. That used to be untrue: the rise
eased out, which looks finished long before it is - a panel a hundredth of the way
down looks like a panel - and it was still most of a second from being one, so you
would step on what looked rebuilt and fall. Now `panelLift` is a straight line
that arrives at the end of the rebuild, `solid` says yes at that same moment, and a
test walks every panel through every rebuild to check the two never disagree. To
make it readable as well as true, a rising panel is drawn **darkened, and only its
own colour back once it is flush**: dark and low is not safe, its own bright colour
and level is.

**The deal** (`dealFor`): each round's colour is on **exactly 8, then 6, 5, 4, 3,
3, 2, 2, and from the ninth round 1** panel; every other panel is one of the other
five colours. It comes from the seed and the round, so every screen works out
the panels, the colour and the wheel for itself - **none of it is sent.**

## Bodies

**The floor is ice.** A body has a velocity, and the keys do not move it: they
pull it towards where you are pointing, at a rate (`slide`, `SLIDE`):

| | Speed | Rate, per second | What it feels like |
| --- | --- | --- | --- |
| **Walking** | 4.5 m/s | 3.2 | A third of a second to come round to where you point. |
| **Running** (Shift) | 8.5 m/s | 1.6 | Nearly twice as fast, and about twice as slow to turn or stop. A wide arc. |
| **Holding nothing** | - | 0.7 | A long slide to a stop: from a walk, most of six metres. |

Steering *against* your speed brakes far quicker than letting go - about a fifth of
a second to stop from a walk - which is the whole skill: the arena is 18 m across
and a runner who lets go at the far side of a panel keeps going. Nothing goes
faster than 12 m/s, however it got there. **Falling, there is no ice under you**:
what sideways speed you had wears off, so you tumble away below.

**There is no shove. Bodies collide** (`collide`). Two that touch are pushed apart,
half each, and **the speed they were closing at along the line between them is
traded**: 90% of it (`BUMP.bounce`) comes back, so

- a runner into somebody standing still hands them nearly everything and **stops
  nearly dead** (8.5 m/s in: 8 out, 0.4 left);
- two runners head on **bounce** off each other at nearly full speed;
- a nudge - walking into somebody, or two bodies steered onto the same spot - is
  a nudge.

**A hard enough hit is a knock.** If the bodies were closing at 2.5 m/s or more
(`BUMP.hard`), whoever was going faster *into* the other is credited, and if the
one hit falls in the next 2.5 s (`BUMP.credit`) it is a knock-off - *knocked you
off* in the HUD, and a point for them. A nudge is never credited. Bodies are
resolved in index order in steps of a sixtieth of a second, so a runner never
passes through anybody and it comes out the same everywhere.

- **Nothing under you, and you fall**: off the edge at any time, or on a panel
  that has dropped. A fall is out at that moment.
- The limit is **sixteen rounds** (2:24); whoever is standing then shares first.

## Placings

Whoever is standing at the end first; then the fallen, **the last to fall first**
- everybody who fell in the same drop shares a place; then anybody who left while
standing, the last to leave first.

## Controls

- **WASD / arrows** steer, forward being the way the camera looks. It is ice: you
  are steering a slide, not walking.
- **Shift (either)** runs while held.
- **The mouse turns the camera**, round and up and down, under pointer lock: a
  **click on the arena takes the mouse** - during the three-two-one too, so you can
  have the camera before the start; escape gives it back. A browser that refuses
  the lock gets drag-to-turn. **Nothing else uses the mouse buttons.**
- You always face the way the camera looks; it has no effect on where you go.
- Paused, or the game over: the mouse and the keys are let go of.

## On the screen

- **The panels** in six bright colours over a sea of cloud a long way down.
- **The giant wheel** stands off the north side, always turned to face you, with a
  pointer at the top. It spins through the spin and stops on the colour. **A small
  copy of it turns beside the call at the top**, so the spin is on the screen
  whichever way you face.
- **You** have a white ring at your feet. **Everybody leans into the way they are
  sliding**, more the faster they go, so a runner is a body at a tilt.
- **The call at the top**: *Spinning…*, then the colour in its own colour with
  the seconds left - *RED - get on red! 1.3* - then *Hold on!*, then
  *Rebuilding…*.
- **The HUD:** time left, the round, how many are standing, a pill per player
  (with how many they have knocked off), and **a speed bar at the bottom** - how
  fast you are going, gold and labelled *running* while you hold Shift.
- **Falling:** you tumble away below, *You fell!* (and who knocked you off), and
  the camera pulls back over the whole arena.
- **Sound:** the wheel whirring through the spin, a two-second sting under the
  reveal, a crash as the panels drop, **a bump when your speed changes by more than
  the keys can change it in a frame - that is a collision** - and a fall for anybody
  going.
- **The results** are the podium, from `useFinish`.

## One arena across the lobby

**The host runs the bodies.** Collisions are physics between bodies, so one screen
has to own all of it: the host slides everybody - itself, the stand-ins, and each
guest from what the guest says its hands are doing - resolves every collision and
every fall, and sends a snapshot twenty times a second: where everybody is, how far
they have fallen, **how fast they are going**, which way they face, when they fell
and who knocked them, how many they have knocked off, and whether they are running
or have left. About 70 bytes a player.

**A guest sends its hands** (`cc-in`): which way it is going, which way it faces,
and whether it is holding run. That is a state and not an event, so a repeated
message changes nothing and a lost one is made good by the next; there is no count
to keep in step. Walking and running go the moment they change; turning, at most
twenty times a second, because the relay drops anybody sending more than sixty. A
guest the host has not heard from for half a second lets go, and slides to a stop.

**So that sliding does not wait on the round trip, a guest's own player moves at
once on its own screen, by the same `slide` the host uses,** and is eased towards
where the host has it (snapped if it is more than 2.5 m out). **Its speed is the
host's, every snapshot**, so a collision the host saw - which the guest cannot -
sends the guest's body off at the speed it was hit, rather than leaving it
sliding on regardless. Nobody falls until the host says so.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins.

- **While the wheel spins** a stand-in drifts about the middle, well in from the
  edge, at half pace.
- **When the colour comes up** it takes 0.25-0.7 s to see it, then heads for the
  panel of that colour that is nearest and least crowded, aiming near its middle.
  It never steps onto a panel that has dropped.
- **It runs when it has a long way to go, and walks the last of it**, because a
  runner cannot stop on ice. The speed it asks for is proportional to how far it
  has to go, so it eases in and stops on the spot instead of sliding through; if
  where it would slide to - looked at all the way along, not just at the end, so it
  cannot slip between two right panels that only touch at a corner - is over
  nothing, it asks for the opposite of the speed it has and stops.
- **From the drop on it stays put** if the panel it is on is one of the ones left,
  rather than setting off for another across the gap.
- **It charges.** There is no shove to give, so a stand-in with a rival close by
  and a way down behind them may run at them for 0.7 s - more readily once the
  colour is up, **much more readily when there is a way down behind them**, and by
  a rougher stand-in - **but only once it is settled**: within 2 m of its panel,
  because a charge costs the time to make it, and a stand-in that spent the two
  seconds charging would fall itself.

All of it from the seed, so the same game plays out the same way. Tested.

### What they play like

Over 30 seeds and two to eight stand-ins: **a game lasts about 40 seconds** - four
or five rounds - from 5 s to about 90 s. **88% of them are on the colour when the
first round drops.** A fifth of falls are credited knock-offs; most of the rest
are the drop, and a few in each game are stand-ins that slid off a panel edge on
their own, which is the ice.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `GRID`, `HALF`, `PANEL_COLOURS`, `PANEL_NAMES`, `PHASES`, `ROUND_LENGTH`, `VIABLE`, `viable` | The numbers. |
| `when`, `When`, `Phase` | The schedule: which round and phase, from the clock. |
| `dealFor`, `Deal`, `wheelAngle` | The colours and the wheel, from the seed and the round. |
| `panelAt`, `panelCentre`, `solid`, `panelLift`, `panelColour`, `spawnPoint` | The floor. |
| `BODY`, `SLIDE`, `BUMP`, `ROUND`, `COLOURS` | Bodies, the ice, collisions, the clock. |
| `createGame`, `Game`, `Player`, `Entrant` | A game at its start. |
| `steer`, `slide`, `speedOf`, `move`, `supported`, `facing`, `yawTowards`, `wrapAngle`, `edgeRoom` | Steering a slide, and falling. `slide` is pure and is what a guest runs for its own body. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `roundOf`, `canAct`, `isStanding`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer`, `bestPanel` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `ColorScene`, `PALETTE`, `PITCH`, `CAMERA_BACK`, `WHEEL_AT`, `LookRef` | The 3D view. |
| `ColorScreen`, `SENSITIVITY`, `walkFor` | The panel `15-minigames` draws, and how keys become a direction. |

## Invariants you may rely on

- **Spin, reveal (two seconds), drop, rebuild, again.** Tested.
- **The colour is on exactly the round's count of panels, fewer every round, down
  to one; the same seed and round deal the same.** Tested.
- **Every panel is solid through the spin and the reveal, and only the colour
  through the drop and the rebuild.** Tested.
- **A dropped panel rises in a straight line and is flush exactly when it becomes
  solid - never solid while drawn low, never drawn flush while not solid.** Tested
  over every panel of three rounds, a hundredth of a second at a time.
- **The wheel stops on the round's colour, and spins on from where it stopped.**
  Tested.
- **Velocity closes on where you point at a rate: a walk is 4.5 m/s and a run 8.5,
  a runner comes round about half as fast, and letting go is a long slide.**
  Tested.
- **A collision hands over 90% of the speed the bodies were closing at and no
  more; a runner into somebody standing still gives them nearly all of it and
  keeps nearly none; two runners bounce.** Tested.
- **A hit closing at 2.5 m/s or more is credited to whoever was going faster into
  it; a nudge never is; and a fall a long time after is not.** Tested.
- **Bodies never overlap, and a collision comes out the same every time.** Tested.
- **Off the colour at the drop, or off the edge, is a fall; a hard knock in the
  2.5 s before is credited.** Tested.
- **The stand-ins are nearly all on the colour at the drop and not sliding past it,
  run, play down to one, and play the same way every time.** Tested.
- **A velocity on the wire is within the speed limit, and a message that is not is
  refused whole.** Tested.

## Deliberate non-goals

- No models: the panels and the wheel are flat colour, players are the island's
  capsule.
- No jumping, and no catching the edge.
- No shove, and no other action: the mouse buttons do nothing but take the camera.
- No stamina on running. Its cost is that it is hard to steer, which on ice is
  cost enough.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest feels a collision a round trip late.** Its own sliding is predicted
  with the host's `slide` and its speed is the host's every snapshot, but a body
  the guest runs into is where the host's last snapshot had it, so a hit that the
  host lands is felt when the next snapshot arrives - up to 50 ms plus the trip.
- **A rebuilt panel is solid by the host's clock.** A guest's clock is eased
  towards the host's, so on a guest the moment a panel is drawn flush can be a tenth
  of a second either side of the moment it holds. The aim is that it is right on
  every screen to about that.
- **A stand-in that runs into somebody on the edge goes with them** now and then,
  since a collision does not spare the runner from the edge it is next to.
- **Colour blindness.** Six colours, with names on the call at the top, but the
  panels themselves carry nothing but colour. Red and green side by side will be
  hard for some people.
- **Pointer lock cannot be tested headless**, the same as He's One Shot. The
  escape key, the lock prompt and the drag fallback have only been read.
- **Two browsers is one guest walking.** A guest running, and colliding across the
  wire, has been read and tested in Node but not watched with real browsers.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Color Coded**
(34) and press play.

- **During the three, two, one**, you should be on a panel, the camera behind
  you, a grid of colours round you and the wheel off to one side.
- **Click the arena.** The cursor should go and nothing should happen. Click
  again: still nothing. Move the mouse: the camera should swing round you and up
  and down.
- **Walk with WASD.** W should go the way the camera looks, and you should pick up
  speed over about a third of a second rather than at once. **Let go**: you should
  keep sliding a long way. **Press the opposite way**: you should stop far quicker.
- **Hold Shift** and walk: you should go nearly twice as fast, lean forward, and
  the bar at the bottom go gold and say *running*. Turn while running: a wide arc,
  much slower to come round than walking.
- **Run off the edge**: you should fall, *You fell!*, and the camera pull back.
- **Watch the wheel** spin and stop, and the call at the top turn into the colour
  with two seconds counting down. Get on it: the other panels should flicker, drop
  away, and you should stay up. Stand on a wrong one: you should fall.
- **Run into a stand-in** that is standing still: they should shoot away and you
  should nearly stop dead, with a bump. Run into one off the edge of a panel that
  is about to drop: the HUD should say you knocked them off.
- **Watch the rebuild.** The dropped panels should climb back dark, in a steady
  line, and turn their own colour as they arrive - **flush exactly when the next
  spin starts**. Step onto one while it is still visibly rising: you should fall.
  Step onto one that has just arrived: you should be held. There should be no
  panel that looks finished and is not.
- **Watch the rounds go by**: fewer panels of the colour each time, down to one.
- **The results** should be the podium, the last to fall first.
- **Press escape mid-game.** Alone, the game should stop while the card is up.

### With two or more browsers

- **Everybody should see the same panels, the same wheel and the same colour.**
- **A guest walking and running** should move at once on their screen and a moment
  later on the host's, sliding the same way on both.
- **A guest running into the host** should send the host off, and stop the guest
  nearly dead on both screens.
- **The same people should fall at the same drop** on every screen.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: one
instanced mesh for the 36 panels, the wheel (six segments, rim, hub, pointer,
post), the cloud, the island's avatar per player and your ring.
