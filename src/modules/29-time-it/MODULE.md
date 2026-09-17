# 29-time-it

## What this is

**Minigame 9.** A target time, and a big stopwatch. After a 3, 2, 1 the stopwatch
starts, and everybody can watch it run - the hand sweeping, the digits ticking -
for two and a half seconds. Then a cover swings down over its face and you count
in your head. Click to stop your own timer. The round ends once everybody has
stopped, or thirty seconds after the start. Closest to the target wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule and the stopwatch is primitives.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Stop a stopwatch as close as possible to a target time | `targetFor`, `stop`, `offBy`, `placings` |
| Everyone sees it running for the first 2.5 seconds | `WATCH.visible`, `showing` |
| Then it disappears and you rely on your sense of time | the cover in the scene; the readout turns to `?.??` |
| Click to stop your timer | the screen; `stop` |
| Ends once everyone has stopped or 30 seconds have passed | `stepGame`, `WATCH.limit` |
| The player closest to the target wins | `placings` |

## The round

- **The target** comes from the round's seed: at least 6.5 seconds and at most 15,
  to the hundredth. It is shown to everybody from the start.
- **The countdown** is three seconds. A click during it does nothing.
- **The stopwatch** starts from nought. Its hand makes a full turn every ten
  seconds and its digits run for 2.5 seconds; then the digits read `?.??` and the
  cover comes down.
- **A stop** counts once, any time after the start and up to thirty seconds.
- **The end:** when everybody still here has stopped, or at thirty seconds.
  Nobody is waited for past that, and anybody who left the lobby is not waited
  for at all.
- **Ranking:** by how far off, either side - over by a tenth and under by a tenth
  share a place. Anybody who never stopped comes last.

## Your stop is timed on your own screen

You are counting along with the stopwatch you watched, so the stopwatch that
counts is the one on your screen - not the host's, a network round trip away.

- **Reading the click:** the stop is the reading at the moment you clicked - the
  stopwatch as the last frame left it plus the time since - not the reading on
  the frame after. A frame late, or a guest's clock nudged towards the host's in
  between, would be time you did not spend. Tested live to within about a
  hundredth of a second with eight browsers.
- **What the host allows:** a guest's stop may be up to half a second past the
  host's own stopwatch, for a clock that runs a little ahead, and never before the
  start or after thirty seconds.

## Nobody sees anybody else stop

A snapshot says who has stopped, but not when, until the round is over. Knowing
somebody stopped at nine seconds would tell you a great deal about where nine
seconds is. Your own button goes down when you stop; everybody else's, and
everybody's times, come out at the end.

## One round, and it is the host's

- **The host runs the clock** - which is the stopwatch - takes everybody's stop
  (its own, the stand-ins', the guests' as they arrive), and sends who has stopped
  (`ti`) ten times a second.
- **A guest sends its stop** (`ti-in`): round and reading. It is said again until
  the round is over, and counted once.
- **A guest's clock runs on between snapshots**, eased towards the host's.
- **Somebody who leaves the lobby is not waited for.**
- **Pausing in a lobby stops only your hands.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in stops within a tenth of the target either way, closer more often
than not - the longer the target, the further off it can be, as for anybody
counting.

## Seeing what happened

- **The stage:** a curtain behind, a big stopwatch standing at the back, and
  everybody in a row at the front, each behind a button in their colour.
- **Running:** the hand sweeps and the readout above counts, "Watch it run".
- **Covered:** a dark cover with a big question mark swings down over the face; the
  readout says `?.??` and "Count in your head - click to stop".
- **Stopped:** your button goes down, and the HUD ticks you. "Stopped - waiting for
  the others".
- **The end:** the cover lifts. A green hand points at the target, and a mark in
  every player's colour sits round the dial where they stopped. The results card
  gives each time and how far off, green within half a second.

## The camera does not move

Out front and a little raised (16 degrees), square on to the stopwatch's face,
with the whole stopwatch and a row of eight in view. Fitted to those points and
tested at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `WATCH`, `COLOURS` | The rules and the look, as numbers. |
| `targetFor`, `stopwatch`, `showing` | The target and the stopwatch. Pure. |
| `createGame`, `stop`, `leave`, `stepGame`, `offBy`, `placings` | The round. Pure. |
| `Game`, `Timer`, `Entrant` | Its shapes. |
| `botStops`, `botStopAt`, `BOT_DRIFT` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_TIMERS`, `MAX_TIMERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `HIDDEN`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `frameScene`, `STAGE`, `standX`, `POINTS`, `TILT`, `FOV`, `FILL` | The stage and the camera. Pure. |
| `TimeItScreen` | The panel the registry draws. |

## Invariants you may rely on

- **The target is never under 6.5 or over 15 seconds, to the hundredth, and the
  same for the same seed.** Tested.
- **The stopwatch starts after the countdown and shows for 2.5 seconds.** Tested.
- **A stop counts once, only after the start, and no later than the stopwatch -
  plus the allowance for a guest.** Tested.
- **The round ends once everybody has stopped or left, or at thirty seconds.** Tested.
- **Ranked by how close either side, level sharing a place, no stop last.** Tested.
- **Stand-ins stop within a tenth of the target, closer more often than not.** Tested.
- **Snapshots say who has stopped but not when until the round is over; a guest's
  own stop is kept.** Tested.
- **Eight players with a lossy network agree on every stop once the round is
  over, each exactly what that player meant.** Tested.
- **The stopwatch and everybody are in frame at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No authority over a player's own stop time.
- No second go: one stop a round.

## Known limitations

- **A browser times itself**, so a doctored one could claim the target exactly.
  It can only claim a time the stopwatch has already passed.
- **A player whose screen was paused or starved of frames** stops against the
  clock they saw, which may have jumped to catch up.
- **The shared plumbing is copied a fifteenth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**9 · Time It**, and press **play**.

- **The target** is in the HUD, at least 6.5 s.
- **The countdown** runs 3, 2, 1. Click: nothing.
- **Watch it run.** The hand sweeps and the digits count - for two and a half
  seconds. Then the cover swings down with a question mark, and the digits read
  `?.??`.
- **Count, and click.** Your button goes down, the HUD ticks you, "Stopped -
  waiting for the others". Click again: nothing.
- **The end.** The cover lifts, a green hand points at the target, and coloured
  marks show where everybody stopped. The results give each time and how far off.
- **Wait out thirty seconds without clicking.** The round ends, "You never
  stopped", and you are last.

### With two browsers

- **Both see the same target**, and the stopwatch start together.
- **Stop in one.** The other does not see it.
- **At the end,** both show the same times.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The stopwatch is about sixty meshes (its ticks, mostly), a player
the pill and a two-part button. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
