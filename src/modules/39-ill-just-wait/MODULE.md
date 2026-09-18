# 39-ill-just-wait

## What this is

Minigame 24, **I'll Just Wait**. Free-for-all, a race through three
clock-reading targets.

A target time goes up at the top in awkward words - *"Quarter till 4:05"* -
and your clock starts at 12:00. **Hold left click** to wind it forward, **hold
right click** to wind it back, **Space** to confirm. Right, and you are on to
the next target with your clock back at 12:00. Wrong, and it goes back to 12:00
and you try the same target again, as often as it takes.

**Everybody's clock is on show.** The targets are the same for everybody, in
the same order, so somebody behind can just wait for somebody ahead to show
them where the hands go - which is the name. It costs time, and the race is to
finish: **the first to get all three wins, and the game ends there.** Otherwise
it ends at two and a half minutes, or once everybody has finished or left.
Places go by targets got, then by how early the last one was got.

## The targets

`wording.ts`. A time is minutes past twelve, 0 to 719. The answer is picked
first and the sentence built backwards from it, so the two cannot disagree.
Each target is said harder than the last:

| # | Shape | Examples |
| --- | --- | --- |
| 1 | Against the hour | *Sixteen minutes before 5*, *Twenty-five to 3*, *Quarter past 9* |
| 2 | An offset from a precise time | *Quarter till 4:21*, *Three quarters of an hour till 9:41* |
| 3 | Two steps, in four shapes | *Three hours and seven minutes before half past 5*, *Two hours and thirty-one minutes ago it was 9:44*, *In an hour and six minutes it will be 1:14*, *Halfway between 11:44 and 3:40* |

Minutes are mostly not multiples of five - about 55%, 70% and 85% for the three
targets. Nothing lands on 12:00, where every clock starts.

**The test reads every sentence back.** `wording.test.ts` has its own reader,
written from English rather than from the generator, and puts 1,200 generated
targets through it; each has to come out at its answer.

## The clock

`rules.ts`, `Hand`. Whole minutes only, so a clock always stops on a mark. A
press is a one-minute nudge at once, however short; hold on for 0.3 s and it
sweeps, from 4 minutes a second up to 100 over 2.5 s. So both the long way
round and the last minute are easy, and both directions are there so the short
way round is always available. The hour hand creeps with the minutes, as on a
real clock - you need it to tell 3:50 from 4:50.

Nothing on screen shows the time as digits. Reading the face is the game.

## The stage

A still camera (`camera.ts`, fitted like Time It's) on a wall with a big clock -
**yours** - and a row of players in front, each with a small clock over their
head rimmed in their colour and three pips that light green per target got.
Every face is one canvas texture: sixty marks and twelve numerals.

## Networking

`useClockNet.ts` and `wire.ts`. The host runs the clock and the stand-ins, and
sends every player's reading and progress ten times a second. A guest sends its
own reading ten times a second along with any answers the host has not shown
yet. A guest checks its own answers - it knows the targets - so a wrong one
resets at once and a right one moves it on at once; the host checks again and
is the only word on who finished first. Stand-ins only when alone: they read
for a while (longer for harder words), wind the short way round at a steady
pace where everybody can see, and confirm on arrival.

## How to review

- Open **I'll Just Wait** from the minigames dashboard and press play.
- The target is at the top; the big clock starts at 12:00. Tap left click - one
  minute forward. Tap right click - one back. Hold either - it sweeps and speeds
  up.
- Press Space on a wrong time: the clock snaps to 12:00, the banner shakes red,
  and the target does not change.
- Press Space on the right time: *Correct!*, a green pip over your small clock,
  a new, harder target, and your clock back at 12:00.
- Watch the stand-ins' small clocks wind towards their answers - and try
  copying one.
- Get all three first: the game ends straight away and you top the podium.
- In a lobby of two browsers: each sees the other's small clock move as it is
  wound, and the first to finish ends it for both.

## Non-goals

- No models: players are the island capsule, the clocks are primitives on a
  painted face.
- No moving camera.
- No sound of its own.
