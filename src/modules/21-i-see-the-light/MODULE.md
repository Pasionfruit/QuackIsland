# 21-i-see-the-light

## What this is

**Minigame 17.** Red light, green light. A lane each down a running track to a
finish line, and a traffic light over the line. On green, every press of space
is a step. On red, nobody moves, a circle appears over the view and wanders, and
the pointer has to stay inside it until the light goes green. Press space on
red, or let the pointer slip out of the circle, and you are out. First to the
line wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the racers are the island's capsule and the lamps are two discs.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Race toward the finish line | `LIGHT.steps` (70) presses from start to line; `stepRace` places arrivals |
| Rapidly press space on green to move | `pressSpace` - a step a press; held-key repeats count for nothing |
| On red, movement stops | `pressSpace` on red is out, not a step |
| A floating circle appears | `circleAt` - drawn over the view by the screen |
| Keep the cursor inside the moving circle | `checkPointer`, `insideCircle` |
| Outside the circle, or space on red, eliminates you | `Self.out`, `Why` = `space` / `pointer` |
| The first player to reach the line wins | `placings` |
| Space - move; mouse - keep the cursor in the circle | the screen |

## The light

`schedule(seed)`: green first, then red, alternating. A green is 3 to 6 seconds, a
red 3 to 5. It is a function of the seed alone, so **every browser shows the
same light at the same moment** from the seed and the shared clock, and nothing
about it goes over the wire but the seed.

**A red is counted in: 3, 2, 1** (`countdownAt`, `LIGHT.countdown`) over the
last three seconds of every green, as a big number over the view and in the
HUD's light pill. A green is never shorter than three seconds, so every red gets
the whole count.

Two allowances, so the game is about attention rather than reaction time:

- **Space in the first quarter second of a red is ignored** (`LIGHT.pressGrace`).
  A press that left your finger as the light changed is not a press on red.
- **The circle appears in the middle and holds still for 0.8 s**
  (`LIGHT.pointerGrace`), and the pointer does not count until then. That is the
  time to get into it.

## The circle

After the grace it eases out of the middle into a loop of two sines at different
speeds - so it does not repeat within a red and cannot be learned - kept well
inside the view, never moving more than a hundredth of the view in a sixtieth of
a second. Each red has its own loop and a slightly smaller circle (11% of the
view's shorter side, down to 6.5%).

**It breathes while it wanders**, swelling and shrinking by up to 26% of its
radius on a rhythm of its own (`LIGHT.breath`, `LIGHT.breathPace`) - its own per
red, like its path. A circle that only moves is followed once and then left
alone; a circle that is also closing in has to be watched, because the pointer
that sat comfortably inside it a moment ago is on the edge of a smaller one now.
The middle is the only place that is always safe, which is the whole point.

The breath rides the same ramp as the wander, so the circle you are given 0.8 s
to find is exactly the size it looks, and it only starts closing in once it
starts to move.

**It does not go at one pace: it dawdles and darts** (`LIGHT.surge`, `LIGHT.flutter`).
The circle has a clock of its own that runs fast and slow - a slow swell of 35-55%
of its usual speed, coming and going every three to twelve seconds, and a quicker
flutter of 15-30% on top - so at its slowest it is about a seventh of its usual
pace and at its quickest nearly twice. The two together stay under one, so it
never stops and never turns back, and it is still a smooth path with no jumps.
Its own per red, worked out from the seed like the rest, so every screen sees the
same dawdles and darts at the same moment.
The pointer is judged against **the board** - the view under the HUD - in its own
pixels. A pointer that has left the window, or a window that has lost focus, is
outside the circle. So is a pointer that has never moved: the page cannot know
where it is.

## Who judges

**Your own screen judges your own race.** A press of space is a step or out
against the light that screen shows when you press it; the pointer is inside the
circle that screen draws, or not. Judging it on the host would put a round trip
between you and the light, and a press made on green would land on red.

A browser reports `{steps, out}` for its race; the host takes it (`report`) only
ever forward - steps never go back, out is for good - and holds steps to what
could honestly have been pressed in the green so far (16 presses a second). It is
the same trust as Duck Hunt's hits: a doctored browser can refuse to put itself
out, but cannot get to the line faster than a fast finger.

**Arrival order at the line is the host's.** Places are dealt in the order the
host hears racers reach 70 steps.

## The end

When nobody is left racing - everybody over the line or out - or at two minutes.
Over the line ranks first in arrival order, then anybody still going when the
clock ran out by how far they got, then everybody out by how far they got; level
on steps shares a place.

## One race, and it is the host's

The same arrangement as the other minigames:

- **The host runs the clock** - which is the light and the circle - takes
  everybody's account of their race, places arrivals, and sends the race (`sl`)
  twelve times a second. Guests send their account (`sl-in`) four times a second
  and on every change.
- **A guest's clock runs on between snapshots**, eased towards the host's, as in
  Duck Hunt, and snaps if it is half a second out. Its own steps and its own out
  show on its screen at once, before the host has heard.
- **An account is for one race.** A guest still repeating last race's steps as
  the next starts is ignored.
- **Walking out of a race is out of it** (`left`), whether by closing the panel or
  leaving the lobby, rather than a lane left standing until the clock runs out.
- **a pause stops the round for everybody**: while paused your presses and your
  pointer are not judged, and the light keeps going. Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight - eight colours, eight lanes.
Alone, three stand-ins fill in. A stand-in's race is a function of the seed and
the clock (`botSelf`): 5.5 to 7.5 presses a second on green, and a one-in-ten
chance each red of slipping - space or pointer - somewhere in it.

## Seeing what happened

- Everybody is the island pill in their colour, in their lane, facing the light.
  Your lane is tinted your colour.
- A hop for each step. Somebody out topples over backwards where they stood;
  somebody over the line jumps.
- The traffic light over the line, red lamp over green, unlit and not tone
  mapped so a red is red.
- On red, a red wash round the edge of the view and the circle - white with you
  in it, red with you out of it, "in here!" while it holds still.
- The HUD has the light in words, how many are still racing, the clock, and your
  progress bar and steps. A banner says why you are out, or your place at the line.

## The camera does not move

Behind the start, raised 26 degrees, looking down the track the way everybody
runs, with all eight lanes from the start line to the light's top in view the
whole race. Fitted to the track's corners and the light's top rather than a box
(or it would leave room for a light's height over the start line), centred up
and down, and tested against a real camera at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `LIGHT`, `COLOURS`, `WHYS`, `FRESH` | The rules and the look, as numbers. |
| `schedule`, `scheduleFor`, `lightAt`, `countdownAt`, `greenBefore`, `circleAt`, `insideCircle` | The light and the circle. Pure. |
| `pressSpace`, `checkPointer` | Judging one player's own race. Pure. |
| `createRace`, `report`, `stepRace`, `racing`, `placings` | The race. Pure. |
| `Race`, `Racer`, `Self`, `Why`, `Phase`, `Colour`, `Circle`, `Pointer`, `Entrant` | Its shapes. |
| `botSelf`, `BOT_RATE`, `BOT_SLIP` | The stand-ins. |
| `newRace`, `raceRoster`, `nextSeed`, `waitingRace`, `myId`, `ME`, `SOLO_RACERS`, `MAX_RACERS` | Dealing a race. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared race on the wire. Pure. |
| `frameScene`, `TRACK`, `POINTS`, `laneX`, `trackZ`, `TILT`, `FOV`, `FILL` | The track and where the camera stands. Pure. |
| `ISeeTheLightScreen` | The panel the registry draws. |

## Invariants you may rely on

- **The light starts green, alternates, and every green and red is within its
  range; the same seed is the same pattern.** Tested.
- **Every red is counted in 3, 2, 1 over the last three seconds of the green.**
  Tested.
- **Space is a step on green, out on red after the reaction grace, and nothing for
  somebody out or over the line.** Tested.
- **The pointer only counts on red after the pointer grace; off the view is
  out.** Tested.
- **The circle stays on the view and never jumps; somebody following it is never
  out, and somebody holding still in the middle nearly always is.** Tested.
- **It swells and shrinks as it wanders**, both ways, never past the breath, never
  in a jump, and never while it is still holding still. Tested, and the rhythm is
  its own per red.
- **It goes at a varying pace**: in nearly every red the quickest it goes is at least
  twice the slowest, the pace is different from red to red, it never jumps or leaves
  its range, and it is the same on every screen. Tested.
- **Accounts only go forward, and nobody is believed past what the green so far
  allows.** Tested.
- **Places are in arrival order; the race ends when three are over the line, nobody is racing, or at two
  minutes; the line ranks first, then the still-going, then the out.** Tested.
- **Stand-ins never step on red, and finish in a person's time most races.** Tested.
- **Eight racers judging themselves against their own clocks, with a lossy
  network, agree with the host on steps, outs and places.** Tested.
- **The whole track and the light are in frame, fill it, and are centred, at any
  window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No countdown before the first green: the minigame briefing is the countdown.

## Known limitations

- **A browser judges itself**, so a doctored one can refuse to go out. Steps are
  bounded; outs are on trust.
- **Arrival order is the order the host hears it**, so two racers reaching the
  line within a ping of each other are placed by network luck.
- **Pausing on red in a lobby skips being judged** for as long as you are paused.
  Hands stopping is the rule for pause everywhere; here it is a small loophole.
- **The shared plumbing is copied a seventh time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**17 · I See The Light**, and press **play**.

- **Look at the track.** Four lanes, four pills at the start line facing a
  traffic light over a chequered finish, your lane tinted.
- **Press space on green.** A hop forward each press; the bar and count go up.
  Hold space down: one step, not a run.
- **Watch the end of a green.** A red 3, 2, 1 counts down over the view and in
  the HUD, and the light turns red as it ends.
- **Watch the circle on a red.** As well as wandering it should be swelling and
  shrinking, smoothly and by an obvious amount - and sitting near its edge should
  start to feel like a bad idea. **It should also speed up and slow down**: creeping,
  then darting, then creeping again, never standing still and never jerking.
- **Wait for red.** The lamp goes red, the edge of the view goes red, a circle
  appears in the middle saying "in here!". Put the pointer in it and follow it.
  Stay in until green: still racing.
- **On a red, let the circle get away.** Out, toppled, and the banner says you
  slipped.
- **On a red, press space a moment in.** Out for space. Press it exactly as the
  light changes: not out.
- **Move the pointer off the window on a red.** Out.
- **Watch the stand-ins.** They run on green, stop on red, reach the line in
  about twenty seconds, and sometimes topple.
- **Reach the line.** A jump, your place in the banner; the results when the rest
  are done. **Again** starts a new race.

### With two browsers

- **Both see the light change at the same moment**, and the circle in the same
  place.
- **Both run.** Each sees the other hop forward.
- **One slips on red.** Both see them topple, and why in the results.
- **Close the panel mid-race in one.** The other sees them out, "left".

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The track is a few dozen flat meshes (the finish's chequers are
most of them) and the light seven; eight racers are the pill each. One
shadow-casting light.

Like the other minigames, a **second WebGL context** while a race is up.
