# 37-wheres-midnight

## What this is

Minigame 15. **A junkyard at night, and an all-black cat called Midnight hidden
somewhere in it.** Everybody stands in the same spot, looking at the same yard,
each holding their own camera.

- **W A S D to pan** the view - A and D turn it left and right, W and S up and
  down. There is no dragging. It pans at a share of the field of view, so it is
  quick when wide and slow when zoomed right in.
- **Wheel to zoom**, towards the pointer rather than the middle.
- **Flashlight**, at the **closest zoom only**: a button at the bottom of the
  board, or **F**. **While it is on the camera is locked** - no panning and no
  zooming - so the light stays on whatever you had lined up. Switch it off to move
  again.
- **Click him** and you have found him, timed at that moment.
- **Click anything else** - junk, ground, sky - and you wait **1.5 seconds**
  before you can click again, so clicking everything is slower than looking.

Ninety seconds, or until three have found him. **You place in the order
everybody finds him**; whoever never does shares last place.

**W A S D, wheel, left click.**

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
are as full as the near ones. It aims for a hundred and fifty pieces and gets
nearly all of them; the rest are refused for overlapping something already
placed.

**Every piece is two things**: the parts that are drawn, and a few boxes that
stand in for it when working out what is in the way. The boxes are the drawn
shapes exactly where the junk is boxes, and a little inside them where it is
round - so a click never lands on something that looked like a miss. Thin
decoration (scrap sticking out of a mound, a fridge handle, a wrecked car's dark
windows) is drawn and not in the way, on purpose.

**Between the junk is litter**: about **320** planks, cans, bricks, sheets of
tin and small black bags, from their own stream of the seed so they never move
where he hides. All of it is under half a metre tall and none of it stops a
click or sight - it is mess, not cover. None of it lands within **1.2 m** of him.

**And there are other cats.** Eighteen of them, placed the way he is - sitting
or loafing beside or on top of a piece of junk, facing roughly the camera, both
eyes in sight - and none within **2.5 m** of him or **1.8 m** of each other.

Each is **his body in another colour** (`COATS`: ginger, white, grey, tabby,
cream, a red tabby), drawn from the same part list he is (`catParts`), with
exactly his eyes glowing out of it. In the dark that is all any of them is, so a
glint is a lead and not an answer - and the coat is the answer, once you have
light on it. That is the search: the eyes bring you over, the coat sends you
away.

Nothing about them is in the way: a click on one lands on whatever is behind it
and is a wrong guess, and **none of them is ever between the camera and him** -
a cat that hid him would be cover a click cannot be tested against. The tests
check all of that for every decoy at every seed.

## Midnight

`hideMidnight` shuffles the pieces, then the spots on each piece - **a piece
first and then a spot on it**, so a pile of four bin bags is no likelier a hiding
place than one car - and walks them until one passes:

- **Between 11 m and 30 m away**: far enough that finding him wants the zoom. At
  that range he is well under a degree across, a couple of pixels at the widest
  view.
- **His head must be in sight.** If his head is behind something there is nothing
  to find.
- **Between 30% and 80% of him in sight**, measured on seven sample points -
  head, ears, shoulder, body, two flanks and a paw. Never all of him, never a
  glimpse.
- **Not inside anything.**
- Bin bags are skipped half the time they come up, because a low black bag hides
  exactly the right amount of a black cat and he would otherwise always be by
  one.

He faces roughly the camera, give or take **1.1 rad**, and sits or loafs.

If no spot anywhere passes - which the tests say does not happen in a hundred
seeds - he goes out in the open in the middle of the fan rather than nowhere.

**He is drawn from exactly the three spheres a click is tested against.** The
ears, tail and paws hang off the same local frame and sit well inside his click
padding, so nothing that looks like him is un-clickable.

His padding is `1.45×` on the head and `1.3×` on the body: a cat is a small thing
to click, and a click has to be forgiving without being a barn door. The tests
check both ends of that.

## The camera you hold

Everybody stands at `EYE` - **(0, 5.5, 3)**, up on a stack of crushed cars at the
near edge - and **never walks**. Turning is limited to **±64°** of yaw (the yard
is a 60° fan; there is nothing behind you but fence) and **-55° to +10°** of
pitch. The field of view runs **60° to 6°**, which is **1× to about 10×**.

`pin` is the whole of both controls: it turns the view until a given world
direction sits under a given point on the screen, by iterating rather than
solving, and clamps as it goes. A zoom pins whatever was under the pointer before
the field of view changed. There is a test for it, at four window shapes and three
zooms.

**Panning is the keys' job** (`pan`): `panRate` radians a second for every radian
of field of view, diagonals no faster, clamped to the yard. **The flashlight is for
the closest zoom only** (`canTorch`: a field of view of `torchFov` or less) and
**locks the camera** while it is on: the wheel and the keys are ignored until it is
off. A click is a press and a release, with nothing to tell it from a drag any more.

## The night

No lamps: a low moon and very little else. **It is dark on purpose**: an
all-black cat is only hard to find because the yard is dark enough to hide him.
His eyes are the one part of him that is not black, and they are two
centimetres across - a pixel at the widest zoom - but so are eighteen other
cats', so a glint is a lead and not an answer. The other cats give themselves
away by their coats, and only under light: in the dark a ginger cat and a black
one are the same two glints.

**The flashlight** is the one real light, and only yours: a spotlight from the
eye down the middle of the view, its cone 0.8 of the view's height whatever the
zoom, so it always lights the same share of the screen. It is in the scene all
the time and turned down to nothing when off, so switching it does not
recompile every material. It needs the **closest zoom**, and while it is on the
camera cannot move - so it is a lens on one spot, not a way of sweeping the yard.

The junk is **instanced**: every part is a box, a cylinder, a tyre, a blob, a
sphere or a cone, so each is one `InstancedMesh` with a colour per instance,
built once per seed. A yard is about **650 parts**, litter included, and they
cost **five draw calls** - the shapes it uses plus one for the handful of glowing
parts (reflectors, a television's standby light), which are unlit and instanced
the same way. The other cats go through the same path - eighteen cats is about
220 parts and two more draw calls, spheres and cones - and their eyes are one
more.

## One yard across the lobby

The **host** runs the clock and settles every click - its own, the stand-ins' and
the guests' - working out for itself what each one landed on, and sends the
search out **12 times a second**: the seed, the clock, and each seeker's find
time, misses, cooldown, last click taken and last miss.

**The seed is sent on purpose here**, unlike Musical Mayhem's: where he is
*follows* from the seed and every browser has to draw him, so it is not a secret
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
somewhere between **18 s** and **85 s** - and **one in five never finds him at
all**. Every click goes through `select` like anybody's, aimed at a real piece of
junk or at his head, so a stand-in's find is a real find and its miss costs it a
real cooldown. A wrong click aimed at a piece of junk that happens to have him in
front of it is sent at the sky instead, so a stand-in can never find him by
accident.

## Public contract

`index.ts` re-exports the rules, the yard, the view, the stand-ins, the roster,
the wire, the net hook, the scene and the screen. The only thing anybody outside
calls is the side effect of importing the module, which registers the build.
Everything else is exported because it is worth testing.

## Invariants you may rely on

- **`rules.ts`, `yard.ts` and `view.ts` are pure.** No clock, no three.js.
- **The same seed is the same yard, everywhere, forever** - including where he
  is. There is a test.
- **His head is always in sight, and never all of him**, checked over a hundred
  seeds rather than a handful.
- **A click at his head is a find, at every seed.** A click four pad-widths off
  his head is not, at every seed.
- **A click is decided by `look`, and `look` is the same function on every
  screen.** The host's answer is the one that counts.
- **A click said twice counts once**, by `seq`.
- **The clock never runs backwards and never leaps**: a step is capped at 0.25 s
  and `elapsed` is held between 0 and 90.
- **Places**: earliest find first, finds on the same hundredth sharing a place,
  everybody who never found him sharing the place after the last who did.

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
- **Whoever never finds him is told nothing until the round ends**, when the ring
  lights up over him for everybody. Ninety seconds of not finding a cat is a long
  ninety seconds.
- **The stand-ins do not look**, they follow a plan. They are a clock to race,
  not an opponent.
- **The assets stage is not done.** No models, no sound.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Where's
Midnight?** and press play.

- **A dark junkyard**, a moon over the back fence, litter everywhere, and pairs
  of faint yellow-green dots here and there. Not a black screen with a HUD on
  it, and not a lit-up junkyard either.
- **Zoom all the way in.** A *flashlight* button appears at the bottom; it and **F**
  light the middle of the view. At any other zoom, F does nothing. With it on, **W A
  S D and the wheel do nothing** - the button says the camera is locked. Switch it
  off and they work again.
- **Click a pair of eyes that is not his.** A wrong guess, like any junk - and
  with the flashlight on it is plainly a ginger or a white or a grey cat sitting
  there, not him.
- **W A S D.** Holding D should turn the view right, A left, W up, S down, smoothly,
  and slower the further you are zoomed in. Diagonals are no quicker. Dragging with
  the mouse should do nothing.
- **Pan to the limits.** You should not be able to turn past the yard, or past
  straight down, and it should stop rather than fight you.
- **Wheel.** It should zoom towards whatever is under the pointer - a thing in
  the corner should stay in the corner and grow. The pill should count up to
  about **10×**.
- **Click a piece of junk.** A red ✕ where you clicked, the pill goes red and
  counts down from 1.5 s, and the wrong-guess count goes up. Clicking again
  during it should do nothing at all.
- **Find him.** He is a cat-shaped black patch, usually beside or on top of
  something, between a third and four fifths visible. Zoomed right in, with the
  flashlight on, he is the only cat in the yard still black - every other pair of
  eyes turns out to have a coloured cat under it. Clicking him should say *found him in Ns - 1st*, and a
  ring should light up over him.
- **Let the clock run out** without finding him: the ring should light up anyway
  so you can see where he was, and the results should say *never*.
- **Play again.** A different yard and a different hiding place.
- **Resize the window, tall and wide.** The wheel should still zoom towards the pointer.

### With two or more browsers

- **Every browser should have the same yard and the same cat** - compare two
  screenshots of the same view.
- **Everybody looks where they like**: turning one browser must not turn another.
- **A guest's find should reach the host** and show up in everybody's standings
  with the same time.
- **Two guests finding him within a frame of each other** should both be placed
  by their own clocks, not by who is nearest the host.
- **As a guest, the results** should say *waiting for the host*; the host's
  **again** should give everybody a new yard.

`run-localrot`'s `solo.mjs --game wheres-midnight` opens it and screenshots the
briefing and the yard; there is no `--steer` for it yet.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The junk and the litter: five instanced meshes for about 650 parts, whatever the seed.
- The other cats: two instanced meshes for about 220 parts, and one more for
  their 36 eyes.
- The ground, the fence, its rail and the moon: four meshes.
- The cat: eleven small meshes.
- One ring over him, once he has been found.
- A directional light, an ambient and a hemisphere light, and the flashlight's
  spotlight (at zero when off).
- No shadow maps: nothing in the yard reads by its shadow.

`layYard` costs about 5-9 ms (it was 2 before the litter and the decoys) and runs once a round - on opening the game, and
again on **again** or when a guest first hears the host.
