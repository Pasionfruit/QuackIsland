# 38-pet-race

## What this is

Minigame 5. **Ten seconds to choose an animal, then thirty to race it.**

- **The table** is up for ten seconds with five cards on it: **Dog, Cat, Rabbit,
  Hamster, Fish**, each with its speed, boost, tank, regrow and grip drawn as
  bars. Click one, or press **1** to **5**. Change your mind as often as you
  like. **Choose nothing and you get the fish**, and the fish does not run.
- **Three, two, one**, and then **180 metres** of fenced course: bands of hedges
  with a gate in each, puddles that drag, and treats that give stamina back.
- **Hold left click to boost.** It multiplies your speed and empties your tank
  at a second a second. Let go and the tank fills again.

The race ends when three are home, everybody who can finish has, or after thirty seconds.
Finishers place by their time; everybody else by how far they got.

**WASD to move, hold left click to boost, 1-5 at the table.**

It plugs into `15-minigames` with `registerMinigame('pet-race', ...)` and one
import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The five pets

| | speed | boost | tank | regrow | grip |
|---|---|---|---|---|---|
| **Dog** | 7.9 | ×1.55 | 5.0 s | 0.85/s | 9 |
| **Cat** | 7.1 | ×2.00 | 3.0 s | 0.65/s | 13 |
| **Rabbit** | 8.5 | ×1.35 | 2.2 s | 1.70/s | 5.5 |
| **Hamster** | 6.5 | ×1.85 | 9.0 s | 1.15/s | 11 |
| **Fish** | 0 | — | — | — | — |

- **Speed** is metres a second on dry, clear ground.
- **Grip** is how fast the animal turns towards where the keys point. It is the
  stat that makes the course matter: the rabbit is the quickest thing on the
  track and cannot get through a gate; the cat can change its mind inside one.
- **The dog is middling at all five**, on purpose, and there is a test for it.
- **The rabbit leads two and trails three.** A glass cannon is allowed; an
  all-rounder that is simply better than everybody is not.

**These numbers were fitted, not guessed.** Four stand-ins driving the same
policy over sixteen courses come home between 19.7 and 21.1 seconds whichever
animal they are on, and the test holds that spread under three seconds. Change
any number in `pets.ts` and that test is what tells you what it cost.

### The fish

**It is a joke and it is meant to be.** Speed zero: it flops on the start line
for the whole thirty seconds and places last. It is what you get for not
choosing, and picking it on purpose is a bit you are doing for other people. It
cannot finish, so it never holds the race open - a field of nothing but fish
runs the full thirty seconds and then stops.

## The tank

Boosting drains one second of tank per second. Letting go regrows it at the
animal's own rate.

**Run it dry and you are winded**: the button does nothing until `RACE.breath`
(0.75 s) is back in the tank. Without that rule, holding the button on an empty
tank gets you a boost *every other frame* - the tank regrows a frame's worth,
that is more than nothing, so it boosts, which empties it again - which is a
free half-speed boost for ever and makes the tank meaningless. The HUD says
**winded** in red, and the state is on the wire, because "empty" and "the button
will not work yet" are different things and a guest has to be able to tell you
which.

## The course

Laid from the seed, the same in every browser. 180 m long, 26 m wide, fenced.

- **Bands of hedges every 9.5 m**, each with a **gate**: a gap `BAND.gate` wide
  that hedges are kept out of. That is what makes the course always runnable,
  and there is a test that walks every band of sixty courses checking no hedge
  is within a body's width of the gate.
- **A gate is a walk, not a fresh draw.** Each one is within `BAND.drift` of the
  last, so the course reads as a line to follow rather than a row of coin
  flips - and a loose animal is punished for its driving rather than for the
  seed.
- **Puddles** drag you to 0.55 of your speed. About half of them are put **in a
  gate**, which is the whole point of them: the tidy line is not always the
  quick one.
- **Treats** give 1.5 s of tank back and are put **away from the line the course
  suggests**, so taking one costs you ground. A cat with a three-second tank has
  to go and get them; a hamster can ignore them. **Each racer has their own
  copy** of every treat - there is no racing anybody for one - which travels as
  one bit each in a single number, and is why `TREAT.max` caps a course at 31.

`lineAt` is the course's own answer to "where should I be": gate to gate,
straight in between. It lives in `course.ts` rather than in the stand-ins
because it is a fact about the course, and it is what the stand-ins follow.

## One course across the lobby

**The host runs the race.** Who got through a gate, who was in a puddle, who
took which treat and who crossed the line first all have to have one answer. It
sends a snapshot **15 times a second**: the seed, the clock, the phase and when
it began, and every racer - which pet (or that they have not chosen yet), where,
facing which way, how much tank, whether they are spending or winded, which
treats they have taken, when they finished, how far they got, whether they left.

**The seed is sent in the open**, unlike Musical Mayhem's: the course is drawn
on every screen, so knowing it is the same as looking out of the window.

**A guest sends its hands** 20 times a second - where its keys point, whether
boost is held, and which pet it has chosen. **The pick rides on every message**
rather than being sent once, so a pick made a frame before the table comes down
cannot be the one message that goes missing, and changing your mind is just the
next message saying something else. A guest also applies its own pick locally at
once, so its card lights up on the press rather than a round trip later.

Somebody who leaves the lobby stops where they are and keeps the ground they
made. A pause stops the round for everybody. Alone, the clock stops.

## Stand-ins

Only when there is nobody else: alone it is you and **four**, which is a
five-lane race and one of most of the pets. They never take the fish.

Each follows `lineAt` at `BOT.lookahead` (9 m) ahead - **pure pursuit, not
gate-chasing**. Steering at the next gate means arriving at it sideways: an
animal that only starts moving across when the hedge is in front of it spends
the whole race bouncing off one. They also:

- **lean off the middle of the gate** by their own amount from the seed, and
  hold boost above their own tank threshold, so eight of them do not run one
  line in single file and a person can beat them;
- **go for a treat only if their animal regrows slower than `BOT.greedyUnder`**,
  and only one that is near the line - a rabbit refilling in 1.3 s has no
  business crossing the course for a biscuit;
- **give up on a treat** after `BOT.giveUp` and never look at that one again;
- **notice being wedged** against a hedge and back out sideways *and forwards* -
  backing up only takes you further from the line.

**A stand-in's mind is thrown away when the clock goes backwards.** Everything
in it is a moment in `game.elapsed`, so a mind carried into a later race with
the same id and seed would hold timers from the future and sit there escaping a
hedge that no longer exists. That was a real bug and this is the fix.

## What it costs a frame

Both of the things a round does sixty times a second are kept off React.

- **The canvas is drawn from the live game**, inside `useFrame`, by each piece
  of the scene moving itself. The scene is handed to React **only when what is
  on it changes** - somebody joining, somebody picking another pet, a fresh race -
  rather than every frame. A React pass over the whole scene sixty times a
  second was the most expensive thing here, and it bought nothing: everything on
  it had already moved itself.
- **The words round the canvas are redrawn twenty times a second** (`HUD_MS`),
  not sixty - as fast as anybody reads a clock - with the end of the round,
  and a change of phase, going through the moment it happens. The game still steps
  every frame; this is only how often the HUD is handed a new state.
- **At most one and a half pixels to the CSS pixel** (`DPR`). Two is four times
  the pixels of one, which on a laptop's own screen is where a weaker machine's
  frame goes.

Measured in headless Chrome over six seconds of a round, script time went from
1721 ms to 922 ms - about 2.6 ms a frame rather than 4.8 ms. On a machine
three times slower, that is the difference between a frame with
room to spare and a frame that drops.

## Public contract

`index.ts` re-exports the pets, the course, the rules, the stand-ins, the
roster, the wire, the camera, the models, the net hook, the scene and the
screen. The only thing anybody outside calls is the side effect of importing the
module, which registers the build. Everything else is exported because it is
worth testing.

## Invariants you may rely on

- **`pets.ts`, `course.ts` and `rules.ts` are pure.** No clock, no three.js, no
  randomness that is not the seed.
- **The same seed is the same course, everywhere.**
- **Every band has a gate the widest animal fits through**, and the stand-ins
  finish on every seed tested - which is the behavioural proof that a generated
  course can actually be run.
- **A step is capped at 0.1 s.** A slow frame cannot teleport an animal through
  a hedge.
- **Nobody leaves the fences, and nobody runs past the run-off.**
- **A treat is taken once per racer**, and never sits inside a hedge - a final
  sweep drops any that a later band grew over.
- **The fish never moves and never finishes.**
- **Nobody is best at everything or worst at everything**, and each of the five
  numbers has exactly one leader and one trailer.
- **Places**: finishers by time, then everybody else by distance. Level to the
  hundredth of a second, or the tenth of a metre, shares a place.

## Deliberate non-goals

- **No models**: the five animals are boxes, balls, rods and cones.
- **No racer-on-racer collision.** Pets run through each other, so nobody can be
  blocked out of a win by somebody parking in a gate.
- **No lap counting, no checkpoints**: one run, one line.
- **No sound, no score kept between games.**

## Known limitations

- **A guest's own animal answers its keys a round trip late.** An animal here
  has momentum anyway, so a few frames reads as the animal being heavy rather
  than as the controls being broken - but on a bad link, a gate is hard.
- **The camera chases and never turns.** That is the right call for a race (see
  `camera.ts`) but it means you cannot look sideways at somebody overtaking you;
  you see them when they pass through the frame.
- **The stand-ins do not race each other.** They drive the course, not the
  field: none of them will block, draft or cut you up.
- **Eight racers on a 26 m line is tight.** They spread over `TRACK.width - 4`
  and the stagger keeps them visible, but the far lanes start wide of the first
  gate.
- **The assets stage is not done.** No models, no sound.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Pet Race**
and press play.

- **The table**, five cards, bars that differ, and a ten-second clock. The five
  animals should be standing on the start line behind it.
- **Click a card**, then another. The pill should count who is in, the card
  should light up, and **the animal on the line should change** as you change
  your mind. Press **3**: the rabbit.
- **Choose nothing at all** and let the ten seconds run out. You should be a
  fish, and you should stay on the line flopping for the whole race.
- **Once everybody has chosen the table should come down early** rather than
  sitting there with nothing to wait for.
- **Three, two, one.** Nothing should move through the countdown however hard
  you press.
- **Run.** W is down the course. The animal should lean into the turn rather
  than snapping to it, and the legs should move at the speed it is going.
- **Hold left click.** The tank should drain, a ring should light under you, and
  you should visibly pull away. Let go and it should fill.
- **Hold it until it empties.** The bar should go red and say **winded**, and
  the button should do nothing at all until some of it is back.
- **Run into a hedge.** You should stop against it, not go through it.
- **Run through a puddle.** You should bog down.
- **Take a treat.** It should vanish and the tank should jump.
- **Finish.** You should run the line off rather than stopping dead on it, and
  the results should place the finishers by time and the rest by distance.
- **Try the rabbit and then the cat** through the same gates. The rabbit should
  be obviously harder to place and obviously faster in a straight line.
- **Resize the window, tall and wide.** Both fences should stay in frame.

### With two or more browsers

- **Everybody should see the same course** and the same field.
- **The table should fill up on everybody's screen** as people choose, and a
  guest changing its mind should change on the host.
- **A guest holding a key** should move on the host's screen; **holding the
  button** should drain its tank on the host's standings.
- **Two racers crossing together** should both be placed by the host's clock.
- **A guest closing their browser** should stop where they are and keep their
  distance.
- **As a guest, the results** should say *waiting for the host*; the host's
  **again** should give everybody a new course and a new table.

`run-localrot`'s `solo.mjs --game pet-race` opens it and screenshots the
briefing and the table; there is no `--steer` for it yet.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The ground, the track, two lines, the finish gantry and two fence rails: about
  ten meshes.
- Every fence post on the course in one instanced mesh; every hedge in another.
- The puddles, about ten flat circles.
- The treats, two small meshes each, about ten of them.
- One animal per racer: fifteen to twenty small meshes each, up to eight.
- One shadow-casting directional light that follows you down the course, an
  ambient and a hemisphere light.

`layCourse` runs once a race. The pet rigs are rebuilt whenever somebody changes
their pick, which during the choosing can be several times a second - hence
`disposePet`.
