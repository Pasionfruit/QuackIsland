# 44-color-coded

## What this is

Minigame 34, free-for-all. **Everybody on a grid of colour panels floating over
nothing.** A giant wheel spins and lands on a colour: **two seconds to get onto a
panel of it**, shoving anybody in your way. Then **every other panel drops, and
anybody on one falls and is out.** The panels slowly rebuild, the colours are
dealt again with **fewer of the wheel's colour every round**, and round it goes.
Last one standing wins.

**WASD to move, the mouse to turn the camera, left click to shove.**

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
| rebuild | 2.5 | The dropped panels rise slowly back - you still cannot stand on them until the next spin. |

**The deal** (`dealFor`): each round's colour is on **exactly 8, then 6, 5, 4, 3,
3, 2, 2, and from the ninth round 1** panel; every other panel is one of the other
five colours. It comes from the seed and the round, so every screen works out
the panels, the colour and the wheel for itself - **none of it is sent.**

## Bodies

- **Walking** at 5.5 m/s, relative to the camera; diagonals are no faster.
  Bodies do not overlap: two that touch are pushed apart, half each.
- **A shove** (`push`) goes the way you face, which is the way the camera looks:
  everybody standing **within 1.9 m and 57° either side** is knocked straight away
  from you at 10 m/s, wearing off - **about a panel's width.** You lunge a little
  into it. **0.75 s between shoves**; a click in between does nothing. While you
  are knocked hard your own feet count for a third.
- **Nothing under you, and you fall**: off the edge at any time, or on a panel
  that has dropped. A fall is out at that moment. **If somebody shoved you in the
  2.5 s before, they get the credit** - "shoved off" in the HUD.
- The limit is **sixteen rounds** (2:24); whoever is standing then shares first.

## Placings

Whoever is standing at the end first; then the fallen, **the last to fall first**
- everybody who fell in the same drop shares a place; then anybody who left while
standing, the last to leave first.

## Controls

- **WASD / arrows** walk, forward being the way the camera looks.
- **The mouse turns the camera**, round and up and down, under pointer lock: the
  **first click on the arena takes the mouse and shoves nobody** - during the
  three-two-one too, so you can have the camera before the start; escape gives it
  back. A browser that refuses the lock gets drag-to-turn, and every click shoves.
- **Left click shoves.** You always face the way the camera looks, so you shove
  what is in the middle of your screen.
- Paused, or the game over: the mouse and the keys are let go of.

## On the screen

- **The panels** in six bright colours over a sea of cloud a long way down.
- **The giant wheel** stands off the north side, always turned to face you, with a
  pointer at the top. It spins through the spin and stops on the colour. **A small
  copy of it turns beside the call at the top**, so the spin is on the screen
  whichever way you face.
- **You** have a white ring at your feet, and a faint arc in front of you showing
  how far a shove reaches.
- **The call at the top**: *Spinning…*, then the colour in its own colour with
  the seconds left - *RED - get on red! 1.3* - then *Hold on!*, then
  *Rebuilding…*.
- **The HUD:** time left, the round, how many are standing, a pill per player
  (with how many they have shoved off), and a shove bar at the bottom.
- **Falling:** you tumble away below, *You fell!* (and who shoved you), and the
  camera pulls back over the whole arena.
- **Sound:** the wheel whirring through the spin, a two-second sting under the
  reveal, a crash as the panels drop, a bump for a shove, a fall for anybody
  going.
- **The results** are the podium, from `useFinish`.

## One arena across the lobby

**The host runs the bodies.** Shoving is physics between bodies, so one screen has
to own all of it: the host walks everybody - itself, the stand-ins, and each guest
from what the guest says its hands are doing - resolves every shove and every
fall, and sends a snapshot twenty times a second: where everybody is, how far
they have fallen, which way they face, when they fell and who shoved them, how
many they have shoved off, when they last shoved. About 60 bytes a player.

**A guest sends its hands** (`cc-in`): which way it is walking, which way it
faces, and **its clicks as a running count**, so a repeated message never doubles
a shove and a lost one never loses one. Walking and clicks go the moment they
change; turning, at most twenty times a second, because the relay drops anybody
sending more than sixty. A guest the host has not heard from for half a second
stands still.

**So that walking does not wait on the round trip, a guest's own player moves at
once on its own screen** and is eased towards where the host has it (snapped if it
is more than 2.5 m out). A shove that lands on a guest comes from the host, and
wins. Nobody falls until the host says so.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins.

- **While the wheel spins** a stand-in drifts about the middle, well in from the
  edge, at half pace.
- **When the colour comes up** it takes 0.25-0.7 s to see it, then heads for the
  panel of that colour that is nearest and least crowded, aiming near its middle.
  It never steps onto a panel that has dropped.
- **It shoves** whoever is closest in front of it and within reach, a few times a
  second at most, more readily once the colour is up and **much more readily when
  there is a way down behind them.**

All of it from the seed, so the same game plays out the same way. Tested.

### What they play like

Over 30 seeds and two to eight stand-ins: **a game lasts about 40 seconds** - four
or five rounds - from 5 s (two stand-ins, one shoved off in the first round) to
70 s. Most falls are shoves.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `GRID`, `HALF`, `PANEL_COLOURS`, `PANEL_NAMES`, `PHASES`, `ROUND_LENGTH`, `VIABLE`, `viable` | The numbers. |
| `when`, `When`, `Phase` | The schedule: which round and phase, from the clock. |
| `dealFor`, `Deal`, `wheelAngle` | The colours and the wheel, from the seed and the round. |
| `panelAt`, `panelCentre`, `solid`, `panelLift`, `panelColour`, `spawnPoint` | The floor. |
| `BODY`, `PUSH`, `ROUND`, `COLOURS` | Bodies, the shove, the clock. |
| `createGame`, `Game`, `Player`, `Entrant` | A game at its start. |
| `steer`, `push`, `move`, `supported`, `cooldownLeft`, `facing`, `yawTowards`, `wrapAngle`, `edgeRoom` | Walking, shoving, falling. |
| `tick`, `stepGame`, `judgeEnd`, `clock`, `roundOf`, `canAct`, `isStanding`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer`, `bestPanel` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `ColorScene`, `PALETTE`, `PITCH`, `CAMERA_BACK`, `WHEEL_AT`, `LookRef` | The 3D view. |
| `ColorScreen`, `SENSITIVITY`, `walkFor` | The panel `15-minigames` draws, and how keys become a walk. |

## Invariants you may rely on

- **Spin, reveal (two seconds), drop, rebuild, again.** Tested.
- **The colour is on exactly the round's count of panels, fewer every round, down
  to one; the same seed and round deal the same.** Tested.
- **Every panel is solid through the spin and the reveal, and only the colour
  through the drop and the rebuild.** Tested.
- **The wheel stops on the round's colour, and spins on from where it stopped.**
  Tested.
- **A shove knocks whoever is in front and in reach about a panel, nobody behind,
  and not twice inside the cooldown.** Tested.
- **Off the colour at the drop, or off the edge, is a fall; a shove in the moment
  before is credited.** Tested.
- **The stand-ins are nearly all on the colour at the drop, play down to one, and
  play the same way every time.** Tested.

## Deliberate non-goals

- No models: the panels and the wheel are flat colour, players are the island's
  capsule.
- No jumping, and no catching the edge.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest sees its own shove land a round trip late**, and is shoved on its own
  screen a round trip late. Walking is predicted; shoves are not.
- **Colour blindness.** Six colours, with names on the call at the top, but the
  panels themselves carry nothing but colour. Red and green side by side will be
  hard for some people.
- **Pointer lock cannot be tested headless**, the same as He's One Shot. The
  escape key, the lock prompt and the drag fallback have only been read.
- **Not played with two browsers yet.** The wire is tested in Node only.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Color Coded**
(34) and press play.

- **During the three, two, one**, you should be on a panel, the camera behind
  you, a grid of colours round you and the wheel off to one side.
- **Click the arena.** The cursor should go and nothing should shove. Move the
  mouse: the camera should swing round you and up and down.
- **Walk with WASD.** W should go the way the camera looks. Walk off the edge:
  you should fall, *You fell!*, and the camera pull back.
- **Watch the wheel** spin and stop, and the call at the top turn into the colour
  with two seconds counting down. Get on it: the other panels should flicker, drop
  away, and you should stay up. Stand on a wrong one: you should fall.
- **Shove a stand-in** in front of you: they should go back about a panel.
  Clicking twice quickly should shove once. Shove one off: the HUD should say you
  shoved them off.
- **Watch the rounds go by**: fewer panels of the colour each time, down to one.
- **The results** should be the podium, the last to fall first.
- **Press escape mid-game.** Alone, the game should stop while the card is up.

### With two or more browsers

- **Everybody should see the same panels, the same wheel and the same colour.**
- **A guest walking** should move at once on their screen and a moment later on
  the host's. **A guest shoving the host** should knock the host back.
- **The same people should fall at the same drop** on every screen.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: one
instanced mesh for the 36 panels, the wheel (six segments, rim, hub, pointer,
post), the cloud, the island's avatar per player, your ring and the shove arc.
