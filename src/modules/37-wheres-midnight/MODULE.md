# 37-wheres-midnight

## What this is

Minigame 15. **A junkyard at night, and an all-black cat called Midnight hidden
somewhere in it.** Everybody stands in the same spot, looking at the same yard,
each holding their own camera.

- **Drag to turn** - whatever was under the pointer when you pressed stays under
  it as you move.
- **Wheel to zoom**, towards the pointer rather than the middle.
- **Click her** and you have found her, timed at that moment.
- **Click anything else** - junk, ground, sky - and you wait **1.5 seconds**
  before you can click again, so clicking everything is slower than looking.

Ninety seconds. **You place in the order everybody finds her**; whoever never
does shares last place.

**Left drag, wheel, left click.**

It plugs into `15-minigames` with `registerMinigame('wheres-midnight', ...)` and
one import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The junkyard

`layYard(seed)` is pure, and every browser lays the same one - it has to, because
every browser draws it and a click is decided from it.

Eleven kinds of junk - car wrecks, stacks of crushed cars, tyre piles, single
tyres, oil drums, crates, fridges, bin bags, scrap mounds, pipes and dead
televisions - scattered in a **60° fan** in front of the camera, between **7 m**
and **34 m** out, big things no nearer than **11 m** so the foreground is not a
wall. Scattered **evenly over area rather than over distance**, so the far rows
are as full as the near ones. It aims for a hundred pieces and gets most of them;
the rest are refused for overlapping something already placed.

**Every piece is two things**: the parts that are drawn, and a few boxes that
stand in for it when working out what is in the way. The boxes are the drawn
shapes exactly where the junk is boxes, and a little inside them where it is
round - so a click never lands on something that looked like a miss. Thin
decoration (scrap sticking out of a mound, a fridge handle, a wrecked car's dark
windows) is drawn and not in the way, on purpose.

Three lamps stand in the fan and are the only real light there is.

## Midnight

`hideMidnight` shuffles the pieces, then the spots on each piece - **a piece
first and then a spot on it**, so a pile of four bin bags is no likelier a hiding
place than one car - and walks them until one passes:

- **Between 11 m and 30 m away**: far enough that finding her wants the zoom. At
  that range she is well under a degree across, a couple of pixels at the widest
  view.
- **Her head must be in sight.** If her head is behind something there is nothing
  to find.
- **Between 30% and 80% of her in sight**, measured on seven sample points -
  head, ears, shoulder, body, two flanks and a paw. Never all of her, never a
  glimpse.
- **Not inside anything.**
- Bin bags are skipped half the time they come up, because a low black bag hides
  exactly the right amount of a black cat and she would otherwise always be by
  one.

She faces roughly the camera, give or take **1.1 rad**, and sits or loafs.

If no spot anywhere passes - which the tests say does not happen in a hundred
seeds - she goes out in the open in the middle of the fan rather than nowhere.

**She is drawn from exactly the three spheres a click is tested against.** The
ears, tail and paws hang off the same local frame and sit well inside her click
padding, so nothing that looks like her is un-clickable.

Her padding is `1.45×` on the head and `1.3×` on the body: a cat is a small thing
to click, and a click has to be forgiving without being a barn door. The tests
check both ends of that.

## The camera you hold

Everybody stands at `EYE` - **(0, 5.5, 3)**, up on a stack of crushed cars at the
near edge - and **never walks**. Turning is limited to **±64°** of yaw (the yard
is a 60° fan; there is nothing behind you but fence) and **-55° to +10°** of
pitch. The field of view runs **60° to 6°**, which is **1× to about 10×**.

`pin` is the whole of both controls: it turns the view until a given world
direction sits under a given point on the screen, by iterating rather than
solving, and clamps as it goes. A drag pins whatever you grabbed; a zoom pins
whatever was under the pointer before the field of view changed. There is a test
for each, at four window shapes and three zooms.

**A press that does not move by 5 pixels is a click**, settled on release - a
drag that starts on a bin bag must not also be a guess at it.

## The night

Three sodium lamps, a low moon and very little else. **It is dark on purpose**:
an all-black cat is only hard to find because most of the yard is dark enough to
hide her, and lighting it evenly would make the game trivial. Her eyes are the
one part of her that is not black, and they are two centimetres across - a pixel
at the widest zoom, and the reward for zooming in.

The junk is **instanced**: every part is a box, a cylinder, a tyre or a blob, so
each is one `InstancedMesh` with a colour per instance, built once per seed. A
yard is about **250 parts** and they cost **five draw calls** - four shapes plus
one for the handful of glowing parts (reflectors, a television's standby light),
which are unlit and instanced the same way.

## One yard across the lobby

The **host** runs the clock and settles every click - its own, the stand-ins' and
the guests' - working out for itself what each one landed on, and sends the
search out **12 times a second**: the seed, the clock, and each seeker's find
time, misses, cooldown, last click taken and last miss.

**The seed is sent on purpose here**, unlike Musical Mayhem's: where she is
*follows* from the seed and every browser has to draw her, so it is not a secret
and there is nothing to protect.

A **guest** sends a click - which round, a number that goes up every click, the
direction from its camera, and when by its own clock - and says it again every
150 ms until the host has taken it. The host counts it once however many times it
arrives.

- **A find is timed on the finder's own screen**, held to no earlier than a
  second ago and no later than now. Otherwise the host wins every close one.
- **A guest works out what its click landed on the same way the host will**, from
  the same seed: a miss starts its cooldown at once, and a find shows as
  *checking…* until the host confirms it.
- A guest's clock and cooldowns run on between snapshots, easing towards the
  host's and jumping if they are more than **0.5 s** apart.
- A click made a hair before the cooldown ended still counts (**0.15 s** of
  grace), so a guest is not punished for its ping.

## Stand-ins

Only when there is nobody else in the lobby: alone it is you and **three**.

Each has a plan from the seed: a couple of wrong clicks on junk, then a find
somewhere between **18 s** and **85 s** - and **one in five never finds her at
all**. Every click goes through `select` like anybody's, aimed at a real piece of
junk or at her head, so a stand-in's find is a real find and its miss costs it a
real cooldown. A wrong click aimed at a piece of junk that happens to have her in
front of it is sent at the sky instead, so a stand-in can never find her by
accident.

## Public contract

`index.ts` re-exports the rules, the yard, the view, the stand-ins, the roster,
the wire, the net hook, the scene and the screen. The only thing anybody outside
calls is the side effect of importing the module, which registers the build.
Everything else is exported because it is worth testing.

## Invariants you may rely on

- **`rules.ts`, `yard.ts` and `view.ts` are pure.** No clock, no three.js.
- **The same seed is the same yard, everywhere, forever** - including where she
  is. There is a test.
- **Her head is always in sight, and never all of her**, checked over a hundred
  seeds rather than a handful.
- **A click at her head is a find, at every seed.** A click four pad-widths off
  her head is not, at every seed.
- **A click is decided by `look`, and `look` is the same function on every
  screen.** The host's answer is the one that counts.
- **A click said twice counts once**, by `seq`.
- **The clock never runs backwards and never leaps**: a step is capped at 0.25 s
  and `elapsed` is held between 0 and 90.
- **Places**: earliest find first, finds on the same hundredth sharing a place,
  everybody who never found her sharing the place after the last who did.

## Deliberate non-goals

- **No models**: the junk is boxes, cylinders, tyres and blobs; the cat is
  spheres, two cones and a tail.
- **No walking**: the camera turns and zooms and never leaves the spot.
- **No hints, no highlighting, no warmer-and-colder.** Looking is the game.
- **No sound, no score kept between games.**

## Known limitations

- **The yard is laid on the main thread**, about two milliseconds, once per
  round. It would be worth moving off it if it grew.
- **A guest sees a find confirmed a round trip late.** *checking…* is what fills
  that gap; the time it is recorded at is the guest's own, so nothing is lost but
  the wait.
- **Whoever never finds her is told nothing until the round ends**, when the ring
  lights up over her for everybody. Ninety seconds of not finding a cat is a long
  ninety seconds.
- **The stand-ins do not look**, they follow a plan. They are a clock to race,
  not an opponent.
- **The assets stage is not done.** No models, no sound.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Where's
Midnight?** and press play.

- **A dark junkyard**, three pools of lamplight, a moon over the back fence. Not
  a black screen with a HUD on it, and not a lit-up junkyard either.
- **Drag.** The scene should follow the pointer exactly - pick a drum, drag it
  across the screen, and it should stay under the cursor. Try it zoomed in.
- **Drag to the limits.** You should not be able to turn past the yard, or past
  straight down, and it should stop rather than fight you.
- **Wheel.** It should zoom towards whatever is under the pointer - a thing in
  the corner should stay in the corner and grow. The pill should count up to
  about **10×**.
- **Click a piece of junk.** A red ✕ where you clicked, the pill goes red and
  counts down from 1.5 s, and the wrong-guess count goes up. Clicking again
  during it should do nothing at all.
- **Find her.** She is a cat-shaped black patch, usually beside or on top of
  something, between a third and four fifths visible. Zoomed right in her eyes
  catch the lamplight. Clicking her should say *found her in Ns - 1st*, and a
  ring should light up over her.
- **Let the clock run out** without finding her: the ring should light up anyway
  so you can see where she was, and the results should say *never*.
- **Play again.** A different yard and a different hiding place.
- **Resize the window, tall and wide.** A drag should still hold what it grabbed.

### With two or more browsers

- **Every browser should have the same yard and the same cat** - compare two
  screenshots of the same view.
- **Everybody looks where they like**: turning one browser must not turn another.
- **A guest's find should reach the host** and show up in everybody's standings
  with the same time.
- **Two guests finding her within a frame of each other** should both be placed
  by their own clocks, not by who is nearest the host.
- **As a guest, the results** should say *waiting for the host*; the host's
  **again** should give everybody a new yard.

`run-localrot`'s `solo.mjs --game wheres-midnight` opens it and screenshots the
briefing and the yard; there is no `--steer` for it yet.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The junk: five instanced meshes for about 250 parts, whatever the seed.
- The ground, the fence, its rail and the moon: four meshes.
- Three lamps: two meshes and a point light each.
- The cat: eleven small meshes.
- One ring over her, once she has been found.
- A directional light, an ambient and a hemisphere light, and three point lights.
- No shadow maps: three point lights casting would cost more than the night is
  worth, and nothing in the yard reads by its shadow.

`layYard` costs about 2 ms and runs once a round - on opening the game, and
again on **again** or when a guest first hears the host.
