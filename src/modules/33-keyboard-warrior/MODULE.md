# 33-keyboard-warrior

## What this is

Minigame 21, free-for-all. **Letters float into the arena one at a time.** Each
is worth a point to whoever types it correctly first, and **everybody gets exactly
one attempt at each**. Fifteen letters; the most points wins.

**Keyboard: type the letter.**

It plugs into `15-minigames` with `registerMinigame('keyboard-warrior', ...)` and
one import line in `src/App.tsx`. Nothing else in the build knows it exists.

## The letters

**Fifteen of them, from the seed.** Any of A-Z, never the same letter twice
running. Over enough letters, every letter turns up.

- **A pause before each, 0.8-2 s, different every time**, so nobody can press a
  key on a rhythm.
- **Somewhere new each time**: each letter floats at its own spot in the space
  between the players and the camera.
- **Up for four seconds at most.** If nobody gets it by then, nobody does.
- **After each letter**, who got it and how fast shows for 1.3 s, then the next
  pause starts. A game takes about a minute.

## One attempt, and who is first

**The first letter key you press after a letter appears is your attempt**, right
or wrong. A wrong key puts you out for that letter, and pressing the right one
afterwards counts for nothing.

- **A key pressed before the letter is on your screen is not an attempt.** It is
  ignored, and your attempt is still to come.
- **Other keys are ignored:** anything that is not a letter, held keys repeating,
  and anything with Ctrl, Alt or Cmd.
- **Case does not matter.** It is the letter you type (`KeyboardEvent.key`) that
  counts, not where the key sits, so it works on any keyboard layout.

**First is measured on your own screen, not by who reaches the host first.** Your
reaction is timed from the frame the letter first showed on *your* screen to your
key going down, using the key event's own timestamp rather than whenever the next
frame noticed it. A slow connection costs you nothing: you see the letter a
little later, and your clock starts a little later too.

**The host gives the point to the quickest reaction**, in three steps:

1. Once the host hears a right answer, it waits **0.3 s** for anybody faster
   whose answer is still on its way.
2. It decides at once if everybody has already had their attempt.
3. Otherwise it decides when the letter's four seconds are up.

Ties go to whoever the host heard first, then roster order.

Tested in Node, eight players over a relay with up to 120 ms of lag each way and
a fifth of the snapshots lost: the quickest player, who also had the worst lag,
won all fifteen letters. With eight real browsers, the browser furthest down the
roster reacted quickest and won all five letters it was tested on.

## The end

After the fifteenth letter. **Most points first; level scores share a place.**
Anybody who left is placed after everybody who stayed. The results show each
player's letters and their quickest winning reaction.

## The arena

A round sand arena in the evening, with posts round the back. Everybody stands
in a shallow curve across the back, facing the camera, each on a disc of their
colour, in roster order left to right.

- **The letter** is a big cream tile with the letter in ink. It pops up where it
  floats, bobs and sways a little, so it never sits still to be read.
- **When somebody gets it**, the tile turns their colour and flies to them,
  shrinking away. They hop, and a +1 in their colour rises over their head.
- **When nobody does**, the tile drops out of the air and fades.
- **A wrong key** shakes the body and puts a red ✗ over the head for the rest of
  that letter. Once a letter is decided, a green ✓ shows over everybody else who
  had it right but was slower.

**The camera is still.** It sits a little above and looks a little down, and is
pulled back just far enough that the whole line of eight and every place a letter
can float stay in frame. Tested at eight window shapes, and it fills the frame at
each.

**On the screen:** which letter of fifteen, a pill per player with their points,
and a banner:

- the countdown;
- *Get ready…* in the pause;
- *Type it!* while the letter is up;
- *✓ K in 0.42 s* or *✗ You typed J* once you have tried;
- *+1*, *… got K - 0.42 s* (with your own time, if you were right but slower), or
  *Nobody got K* once the letter is decided.

## One contest across the lobby

**The host runs the game**: the clock, the letters, its own attempts, the
stand-ins', the guests' as they arrive, and every point. It sends a snapshot ten
times a second:

- which letter is up, when it appears, and whether and when it was decided and
  for whom;
- every attempt at it;
- everybody's score and quickest reaction.

The letter itself is not sent; the seed makes it. Eight players, all having
tried, fit well under the relay's 4 KB.

**A guest times its own reaction and sends its one attempt the moment it makes
it**: which letter, the key, and the reaction.

- The guest's banner shows the result at once.
- While the letter is still up, the guest's own attempt stays on its screen even
  if the host has not heard it yet.
- Once the host decides, only what the host heard counts.
- An attempt at a letter the host has already moved past is ignored.

Guest clocks can run a little ahead of the host's, so the host accepts an attempt
up to half a second before the letter is up by its own clock.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out, and nobody waits for their attempt;
pausing in a lobby stops only your own hands. Alone, it stops the clock.

## Stand-ins

**Only when you are alone**: you and three stand-ins. In a lobby it is the host
and everybody else, up to eight, with no stand-ins.

Each stand-in has a usual reaction of 0.6-0.9 s, and each letter strays up to
0.2 s either way from it.

- **Lapses:** one letter in eight its attention wanders, adding 0.4-1.2 s.
- **Wrong keys:** one letter in fourteen it hits the wrong key.
- **Misses:** one in twenty-five it does not try at all.

All of it comes from the seed, so the same game plays out the same way. Tested.

Tuned against a steady player: somebody who types every letter in 0.65 s wins
between a third and nine tenths of the letters against three stand-ins (tested
over four seeds). In the browser, the run-localrot skill's typist at about
0.37 s won 12 of 15.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `LETTERS`, `ROUND`, `FLOAT`, `EARLY`, `COLOURS` | The alphabet; the number of letters, the pauses, the window, the host's wait and the showing; where letters float; how early a guest's attempt may arrive; eight colours. |
| `letterFor`, `openLetter` | Letter `n` of a game from the seed: which, the pause before it, and where it floats. |
| `createGame`, `Game`, `Player`, `Letter`, `Attempt`, `Entrant`, `Phase` | A game at its start. |
| `attempt`, `attemptOf`, `asLetter` | Answering the letter up now. All pure. |
| `judge`, `fastest`, `nextLetter` | Who gets the point, and the next letter. All pure. |
| `tick`, `stepGame`, `clock`, `phase`, `leave`, `placings` | The clock, what is happening, leaving, and who placed where. |
| `botPlan`, `botType`, `BOT` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG`, `Snapshot`, `WirePlayer`, `WireAttempt` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `cameraFor`, `standPoint`, `POINTS`, `FOV`, `TILT`, `FILL`, `TARGET`, `LINE`, `TILE` | The still camera, and where everybody stands. |
| `KeyboardWarriorScene`, `PALETTE` | The 3D view. |
| `KeyboardWarriorScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **The same seed makes the same letters**, never the same one twice running,
  each floating where everybody can see it. Tested over four seeds and 200
  letters each.
- **One attempt per player per letter.** A second is refused, even if it is
  right. Tested.
- **A key before the letter is up is not an attempt.** Tested in the browser.
- **The point goes to the quickest reaction heard in time, not the first
  heard.** Tested.
- **A letter is decided as soon as it can be**: at once when everybody has tried,
  after the host's wait once somebody is right, and never before. Tested.
- **Nobody waits for somebody who has left.** Tested.
- **Most points first, level scores sharing, leavers last.** Tested.
- **Lag does not decide a point.** Tested in Node with eight players, each lagged
  differently and losing snapshots, and in eight real browsers.
- **Every screen agrees on the scores.** Tested in both.
- **Everybody and every place a letter can float are in frame at any window
  shape.** Tested.

## Deliberate non-goals

- No models: players are the island's capsule, and the letter is a tile with a
  drawn glyph, not a font loaded as an asset.
- No moving camera.
- No words, numbers or symbols; single letters only.
- No sound. No score kept between games.

## Known limitations

- **A guest is trusted with its own reaction time.** The host bounds it (no less
  than zero, no more than the letter's four seconds) but cannot check it; a
  modified client could claim an impossible time.
- **An answer more than 0.3 s behind the first right one the host hears can miss
  the point**, even if its reaction was quicker. That only happens with more than
  about 0.3 s of lag between that guest and the host, well beyond the relay's
  usual.
- **Knowing the seed means knowing the letters.** They come from the seed every
  browser has, so a modified client could know the next letter, though it would
  still have to wait for it to appear before its attempt counts.
- **A slow player may never get to try.** Once a letter is decided, the tile
  flies off before they type, and their key counts for nothing.
- **Reaction is timed from the frame the letter first appeared**, which is up to
  a frame (17 ms at 60 Hz) before or after it was actually on the glass.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Keyboard
Warrior** and press play.

- **During the three, two, one**, everybody should be lined up across the back of
  the arena in their colours, facing you. Typing should do nothing.
- **In the pause before a letter** (*Get ready…*), press a key. It should do
  nothing, and you should still get your attempt when the letter comes.
- **When the letter pops up**, type it. You should see *✓ K in 0.xx s*, and the
  time should feel honest. If you were quickest, the tile flies to you, turns
  your colour, and a +1 rises over you.
- **Type a wrong letter, then the right one.** A red ✗ over you and *✗ You typed
  …*; the right letter afterwards should change nothing.
- **Sit one out.** A stand-in should get it; the tile flies to them and they hop.
  If nobody gets it within four seconds, the tile drops and fades.
- **Watch where letters appear.** Somewhere different each time, never the same
  letter twice running, and never the same length of pause.
- **Hold a key down, or press Ctrl or Alt with a letter.** Neither should count.
- **The results** should put the most letters first, level scores sharing a
  place, with each player's quickest winning reaction, and **again** for a new
  set of letters.
- **Resize the window**, tall and wide. Everybody and every letter should stay in
  frame.

### With two or more browsers

- **Everybody should see the same letters**, in the same order.
- **The quickest typist should win the letter**, whether host or guest,
  whichever is further from the host.
- **Everybody should see the same scores**, and the same player's tile flying to
  them.
- **A guest closing their browser** should not hold up a letter for everybody
  else.
- **As a guest, the results** should say *waiting for the host*. The host's
  **again** should start everybody on new letters.

`run-localrot` covers typing, the one attempt, a key in the pause and the reaction
timing with `solo.mjs --game keyboard-warrior --steer`, and the quickest guest
winning across eight real browsers with `lobby.mjs --games keyboard-warrior`.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The ground, the arena and its rim, and ten posts.
- Per player: two calls for the body (the island's avatar), a disc, and three
  marks, only while shown.
- The tile and its face.
- One shadow-casting directional light and a hemisphere light.
