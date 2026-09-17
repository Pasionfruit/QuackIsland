# 36-musical-mayhem

## What this is

Minigame 23. **Musical chairs, with pushing.** A ring of chairs stands in the
middle of a round dance floor, **one fewer than the players still in**.

- **While the music plays** everybody runs round it. Nobody can sit.
- **When it stops** - after a time nobody can know - find an empty chair and sit.
- **Anybody can push whoever is in front of them**: knocked back, stunned for a
  moment, and off their chair if they were on one.
- **Sit for a whole second and you are safe** - you cannot be pushed off any more.
- Once every chair holds somebody safe, **whoever is standing is out**, a chair
  goes, and the music starts again. Last one sitting wins.

**WASD to run, space to sit, left click to push.**

It plugs into `15-minigames` with `registerMinigame('musical-mayhem', ...)` and
one import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The floor and the chairs

The floor is a disc of radius **8.5 m** and nobody leaves it. A body is a circle
of radius **0.45 m** and runs at **5.2 m/s**.

The chairs stand on a ring whose radius is `chairs × 1.35 / 2π`, never under
**0.95 m**. That spacing is the whole geometry of the game and it is chosen, not
found: at **1.35 m** apart two neighbouring chairs (radius **0.42 m**) leave a
gap of **0.51 m**, which a **0.9 m** body cannot fit through. **From three chairs
up, nobody can cut across the ring** - you go round it, the way you do in the
real game. `chairAt` faces every chair outwards, so everybody sits facing out.

Bodies bump each other apart, cannot walk through a chair, and are held inside
the floor. A seated body does not move and does not give: two standing bodies
share a shove apart, a standing body pushed against a seated one takes all of it.

## The music

`musicFor(seed, round)` is **4 to 9 seconds**, from the seed and the round.
**Only the host knows it**, and that is enforced rather than hoped for - see
*One floor across the lobby*. Nothing can be sat on until the phase has already
changed to `scramble`, so hearing it stop is the signal and there is no earlier
one.

The tune itself is made in the browser (`tune.ts`): a 64-step square-wave melody
over a 16-step triangle bass at **168 bpm**, scheduled a quarter of a second
ahead on the Web Audio clock. No files, nothing to load. **Stopping cuts the
master gain in twelve milliseconds and schedules nothing further** - a fade would
be a fade into a scramble everybody else had already started. There is a mute
button in the HUD, and the speakers on the floor thump in time so somebody
playing with the sound off can still see the music stop.

## The scramble, and why it settles

A scramble ends when **every chair holds somebody who has been sitting a whole
second**. That is the reason the safe rule exists at all: without it, a scramble
is over only when everybody stops shoving, which is never. With it, a chair taken
and held for a second is settled, the round ends, and the game moves.

If it has not settled after **10 seconds**, whoever is standing then is out
anyway. The result is shown for **2.5 seconds**.

**Nobody out means the same round again**, not a chair gone: if a scramble ends
with everybody still standing - nobody managed to sit at all - the chairs stay as
they are and the music plays again. Otherwise a chair goes and `chairs` becomes
`still in - 1`.

## The push

`PUSH.reach` is **1.55 m** middle to middle, within **1.0 rad** either side of
straight ahead, **0.8 s** between pushes.

Everybody hit is knocked back along the push at **9 m/s**, dying away at
`e^(-5t)`, and **stunned for 0.6 s** - during which they cannot move, sit or push
back. A sitter who is not yet safe is put out of their chair, half a metre in
front of it, and knocked from there.

**You push the way you are facing, and you face where your keys point**, which is
set before the push is worked out on the same frame - so a push goes where you
meant it to rather than where you were facing last frame.

A player who is sitting cannot push. A safe sitter cannot be pushed.

## One floor across the lobby

**The host moves everybody.** Pushes send bodies flying into each other and off
chairs, and who got which chair first has to have one answer. So there is one
simulation, it is the host's, and it sends a snapshot **15 times a second**: the
clock, the round, the phase and when it began, how many chairs, and every player
- where, facing which way, on which chair, how long they have sat, how stunned,
how long since they pushed, when they went out, whether they have left.

**The seed is never sent.** `musicFor` turns the seed into the exact moment the
music will stop, so a guest holding it could sit on the beat every round. A
game's id is `hashSeed(seed, 'musical-mayhem:id')` rather than the seed itself,
so copies agree on which game they are in and nobody can run the derivation
backwards. A guest's `seed` stays `0` and it never needs one.

**A guest sends its hands** 20 times a second: where its keys point, plus running
counts of sits and pushes, so a press is never lost or counted twice whichever
message carries it. The host takes a press when a count goes up.

A guest eases its clock towards the host's and jumps if they are more than
**0.4 s** apart. Somebody who leaves the lobby is freed from their chair and
counted out. Pausing stops only your own hands.

The cost is that a guest's own body answers its keys a round trip late. On a
relay in the same town that is a few frames.

## Stand-ins

Only when there is nobody else in the lobby: alone it is you and **five**
stand-ins, which is five rounds of musical chairs.

A stand-in jogs round the ring **1.9 m** outside it at **0.7** of a run, the way
it happens to be going, and shoves whoever it runs up behind about **one time in
fifty** it could. When the music stops it takes **0.2 to 0.65 s** to notice, then
makes for the nearest empty chair - **round the outside of the ring, never across
it**, because the ring is too tight to cross - and sits. If every chair is taken
it goes for the nearest one whose sitter is not yet safe, pushes them off, and
takes it.

Everything a stand-in does goes through the same `sit` and `push` as anybody
else, from the same hands, on the host only.

## Public contract

`index.ts` re-exports the rules, the stand-ins, the roster, the wire, the tune,
the camera, the net hook, the scene and the screen. The only thing anybody
outside calls is the side effect of importing the module, which registers the
build. Everything else is exported because it is worth testing.

## Invariants you may rely on

- **`rules.ts` is pure.** No clock, no three.js, no randomness that is not the
  seed. Two copies fed the same steps and the same presses agree.
- **A step is capped at 0.1 s.** A slow frame cannot teleport a body through a
  chair.
- **Chairs never overlap and are always well inside the floor**: every chair is
  at least `CHAIR.radius + PUSH.reach` from the edge, so nobody is shoved off the
  floor while taking one.
- **`chairs` is at least 1 and always fewer than the players still in**, and the
  decoder refuses a snapshot that says otherwise.
- **A safe sitter is safe.** `isSafe` is the only thing `push` consults, and it
  is the same on every screen because *how long they have sat* is on the wire.
- **The seed is not on the wire.** There is a test for it.
- **Places**: last one in first, then by the round they went out, latest first.
  Out in the same round shares a place.

## Deliberate non-goals

- **No models**: bodies are the island's capsule, chairs are boxes and a back.
- **No moving camera**: it is fitted once per window shape and never moves.
- **No music files**: the tune is made in the browser.
- **No score kept between games.**

## Known limitations

- **A guest's own body lags its keys by a round trip.** The screen eases every
  body towards where the host has it, so it glides rather than jumps, but a
  guest on a slow link will feel it on a scramble.
- **Eight players is about five rounds**, three quarters of a minute or so. The
  music range (`ROUND.music`) is the knob.
- **The stand-ins are not clever.** They go for the nearest chair, not the one
  they will reach first, so two of them will sometimes race for the same one
  while another sits empty.
- **A mute is a mute for the tune only**; it does not touch the island's music,
  which is already stopped while a minigame is open.
- **The assets stage is not done.** No models, no sound beyond the tune.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Musical
Mayhem** and press play.

- **The countdown**, then the tune, and the speakers thumping with it.
- **Run with WASD.** The body should go where the keys point, W away from you.
- **Press space while the music is playing.** Nothing should happen - the pill
  should still say *keep moving*.
- **When the music stops** it should stop dead, the pill should say *SIT DOWN!*
  and the free chairs should start glowing.
- **Press space next to a free chair.** You should drop onto it. Try it a metre
  and a half away: nothing.
- **Left click somebody in front of you.** They should be knocked back and reel
  for a moment. Click somebody who has just sat: they should come off the chair.
- **Wait a second after sitting**, then get somebody to click you: nothing should
  happen, and the pill should say *you're safe*.
- **Watch a round end.** Whoever is standing goes out, the result says who, and
  then a chair should **slide** out of the ring - not blink out - while the rest
  close up.
- **Play to the end.** The last one sitting wins; the results should place
  everybody by the round they went out in, latest first.
- **Resize the window, tall and wide.** The whole floor should stay in frame.
- **Mute and unmute** with the speaker button.

### With two or more browsers

- **Everybody should see the same round, the same chairs and the same bodies**,
  with exactly one marked as their own.
- **A guest holding a key** should move on the host's screen.
- **A guest's push** should knock the host back on the host's screen.
- **A guest must not be able to sit before the music stops** - and must not sit
  the instant it does, every round, which would mean the seed had leaked.
- **A guest closing their browser** should free their chair and count them out.
- **As a guest, the results** should say *waiting for the host*; the host's
  **again** should start everybody over.

`run-localrot`'s `solo.mjs --game musical-mayhem` opens it and screenshots the
briefing and the floor; there is no `--steer` for it yet.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The floor: a disc, twelve board wedges, a rim, a rock, sixteen posts and a rope.
- Two speakers, three meshes each.
- Seven meshes a chair, up to seven chairs.
- Two calls a body per player (the island's avatar), up to eight.
- One ring under your own body, one glow under each free chair.
- One shadow-casting directional light, an ambient and a hemisphere light.
