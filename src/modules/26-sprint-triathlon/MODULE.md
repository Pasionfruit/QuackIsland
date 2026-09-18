# 26-sprint-triathlon

## What this is

**Minigame 7.** Three legs, back to back, lane by lane:

- **Swim:** every left click is a stroke.
- **Bike:** every press of space is a turn of the pedals.
- **Run:** type the sentence on the screen. Every right key is a stride, and a
  wrong one trips you up for a moment.

Your time over all three is your race time. Fastest wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the racers are the island's capsule and the bikes are primitives.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Swim, bike and run | `legOf`: `swim` → `bike` → `run` → `done` |
| Mash the left mouse button to swim | `click` - `COURSE.strokes` (60) |
| Spam Space to pedal | `pedal` - `COURSE.pedals` (80) |
| Type the displayed sentence correctly to run | `type`, `sentenceFor`, `SENTENCES` |
| Performance in each event makes the race time | `report` times `swimAt`, `bikeAt`, `finishAt` |
| Beat the other players | `placings` |

## The legs

- **Swim, 60 clicks.** About eight seconds for somebody clicking fast.
- **Bike, 80 presses of space.** About ten seconds.
- **Run, one sentence.**
  - **The sentence:** one of four, the same for everybody in the race, from the
    race's seed. The first is the one this game was planned with: "Duck walked
    up to a lemonade stand, and he said to the man running the stand, hey! Got
    any grapes?"
  - **Typing:** exact, capitals and punctuation included.
  - **A wrong key** is a mistake, and trips you up: keys do nothing for
    0.4 s (`COURSE.stumble`). Mashing the keyboard is slower than typing.
- **Starting:** a 3, 2, 1 before the gun. Nothing counts before it.
- **Held keys:** repeats count for nothing, on the bike or the run. A press is a
  press.
- **The time limit:** 150 s from the gun. Anybody not finished by then is ranked
  by how far they got.

## Who counts

**Your own screen counts your own race.** A click is a stroke the moment you
make it, not a network round trip later, so your lane and your sentence move as
fast as your hands.

A browser reports `{strokes, pedals, typed, mistakes}`. The host takes it
(`report`):

- **Only forward.** Counts never go back.
- **Held to fast hands.** Each count is capped at what 16 presses a second could
  have done since that leg began (15 characters a second on the run), so a
  browser cannot claim a finish it could not have made.
- **Timed on the host's clock.** Each split is taken when the host hears the leg
  finished; places go in the order the host hears finishers.

This is the same trust as I See The Light. A doctored browser can claim fast
hands, but not faster than fast hands.

## The end

When everybody has finished or left, or at the time limit. Finishers rank first,
by time. Then anybody still out on the course, by how far they got. Then anybody
who left the lobby.

## One race, and it is the host's

- **The host runs the clock**, takes everybody's account of their race - its own,
  the stand-ins', the guests' - times every leg, and sends the race (`tri`) twelve
  times a second.
- **A guest sends its account** (`tri-in`) four times a second and on every
  change. Its clock runs on between snapshots, eased towards the host's, and its
  own race shows on its own screen at once.
- **An account is for one race.** Its counts start at zero each race, and one
  meant for the last race is ignored.
- **Somebody who leaves the lobby is not waited for.**
- **a pause stops the round for everybody.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight - eight colours, eight lanes.
Alone, three stand-ins fill in. A stand-in's race is a function of the seed and
the clock: 6 to 7.5 clicks and presses a second, 3.2 to 4.8 characters a second,
and up to four mistakes. They finish in 40 to 50 seconds - a race for somebody
quick, not a walkover.

## Seeing what happened

- **The course** runs left to right: water with lane ropes, road with dashed
  lines, a running track, an arch at the start and at each change of leg, and a
  finish arch in black. Your lane is tinted your colour.
- **The racers:** low in the water and bobbing, up on a bicycle with its wheels
  turning, then running with a hop to every right key. A finisher jumps past the
  line.
- **The bicycle points the way the racer rides.** Built in the racer's own
  frame, where +Z is forward: rear wheel behind, front wheel ahead, both
  standing in the plane of travel, with a frame, saddle and bars between them,
  and spokes so the turning shows. It used to be laid out across the rider, so
  the two wheels sat side by side at right angles to the road, like a unicycle
  ridden sideways.
- **The task panel** at the bottom is the leg you are on:
  - **Swim and bike:** a meter and a count ("hammer Space!").
  - **Run:** the sentence, what you have typed in green, the next character
    highlighted - red while you are tripped - and your mistakes.
  - **Done:** your time and place.
- **The HUD** has your race clock, and everybody with an icon for the leg they
  are on.
- **The results** give everybody's time for each leg and overall.

## The camera does not move

In front of the course, raised 50 degrees, with the whole course, start to
finish, every lane, and the arches in view. Fitted to the course's corners and
tested at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `COURSE`, `SENTENCES`, `COLOURS`, `FRESH` | The rules and the look, as numbers. |
| `click`, `pedal`, `type`, `legOf`, `progressOf`, `sentenceFor` | Counting one player's own race. Pure. |
| `createRace`, `report`, `leave`, `stepRace`, `raceClock`, `timeOf`, `placings` | The race. Pure. |
| `Race`, `Racer`, `Self`, `Leg`, `Entrant` | Its shapes. |
| `botSelf`, `BOT_MASH`, `BOT_TYPE`, `BOT_MISTAKES` | The stand-ins. |
| `newRace`, `raceRoster`, `nextSeed`, `waitingRace`, `myId`, `ME`, `SOLO_RACERS`, `MAX_RACERS` | Dealing a race. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared race on the wire. Pure. |
| `frameScene`, `TRACK`, `START_X`, `FINISH_X`, `courseX`, `laneZ`, `POINTS`, `TILT`, `FOV`, `FILL` | The course and the camera. Pure. |
| `TriathlonScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Every race's sentence is one of the four, the same for the same seed.** Tested.
- **The legs go swim, bike, run, done; each is a third of the course.** Tested.
- **A click only swims, a press of space only bikes, and a key only runs - and
  only after the gun.** Tested.
- **On the run, the right key is a stride; a wrong one is a mistake and trips you
  up; case matters; keys that are not characters do nothing.** Tested.
- **Each leg is timed when it is finished, and a report can finish one leg and
  start the next.** Tested.
- **Nobody is believed faster than fast hands, and counts only go forward.** Tested.
- **Finishers are placed in the order they finish; the race ends when everybody
  has finished or left, or at the time limit.** Tested.
- **Ranked by time, then by how far they got, then anybody who left.** Tested.
- **Stand-ins swim, bike and run in order, and finish in 30 to 60 seconds.** Tested.
- **Eight racers counting their own races, with a lossy network, agree with the
  host on every split and place.** Tested.
- **The whole course is in frame at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No authority over a player's own clicks, presses and keys.
- No autocorrect, no backspace: a mistake is not typed, so there is nothing to
  delete.

## Known limitations

- **A browser counts itself.** A doctored one can claim fast hands, though not
  faster than fast hands.
- **Splits are when the host hears them**, a ping after you finished the leg -
  the same ping for everybody on the same connection.
- **Four sentences** repeat over a long evening.
- **The shared plumbing is copied a twelfth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**7 · Sprint Triathlon**, and press **play**.

- **The countdown.** 3, 2, 1 over the course. Clicking during it does nothing.
- **Swim.** Click as fast as you can. Your pill swims across the water; the meter
  fills to 60.
- **Bike.** At the first arch the panel changes: hammer space. You ride the road on
  a bicycle; holding space down is one press.
- **Run.** At the second arch, the sentence. Type it: green as you go, the next
  character highlighted. Type a wrong key: the highlight goes red, keys do
  nothing for a moment, and the mistake counts.
- **Finish.** Your time and place in the panel; you jump past the finish arch.
- **The results.** Everybody's swim, bike and run times, and totals. **Again**
  starts a new race, maybe with a different sentence.

### With two browsers

- **Both see the same sentence** and the same countdown.
- **Guest: race.** Your own lane moves at once; the host sees you a moment later.
- **Both finish.** Both agree on the splits and places.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The course is about eighty meshes (lane markings mostly), four
arches; a racer is the pill and a four-mesh bicycle. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a race is up.
