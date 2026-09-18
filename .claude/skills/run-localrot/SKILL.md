---
name: run-localrot
description: Launch LocalRot and drive it in headless Chrome to see a change working - open a minigame, play it, screenshot it, or put up to eight separate browsers in one lobby and check they see the same round. Use when asked to run, screenshot, or play-test the game, or to confirm a minigame or networking change works in the real app rather than only in tests.
---

# Running LocalRot

The game is a Vite dev server; lobbies go through a small WebSocket relay.
Headless Chrome is driven over the DevTools protocol by the scripts in
`scripts/` - no Playwright, just Chrome and the `ws` package the relay already
depends on. Run every command from the **repo root**.

## 1. Start what it needs

**Dev server** - always pass the repo root explicitly. Started from any other
directory it serves a 404 and says nothing about it.

```bash
npx vite "$PWD" --port 5199 --strictPort        # run_in_background
until curl -sf http://localhost:5199/ | grep -q '<div id'; do sleep 0.5; done
```

**Relay** - only for a lobby. In dev the client connects to `<hostname>:8791`
(or `VITE_RELAY_URL`). Check before starting one; the user often has it running.

```bash
curl -s http://localhost:8791/healthz || npm run relay   # run_in_background
```

**Stop** by port, never by a broad process-name match (Windows shown):

```bash
pid=$(netstat -ano | grep ":5199 " | grep LISTEN | head -1 | awk '{print $5}')
taskkill //PID $pid //F //T
```

Leave a relay you did not start alone.

## 2. Drive it

### One player

```bash
node .claude/skills/run-localrot/scripts/solo.mjs --game messy-maze --steer --out <dir>
```

Opens the minigames dashboard, opens the game, presses play, and screenshots
the briefing and the game. `--steer` plays Messy Maze to the finish - routing
with the stand-ins' pathfinding and pressing whatever letters the racer's
current binding says, so the spins and rebinding are exercised for real - and
screenshots the results. For Zombie Tag it holds D for two seconds. For
Probable Stop (`--game probable-stop`) it plays all six rounds with the keys -
a different path each round, confirmed with Space - screenshotting a reveal
and the results, and prints each round's pick and whether it held. For Duck
Hunt (`--game duck-hunt`) it shoots one of its own balloons whenever the
cooldown allows, for the whole minute - a real pointer event at the balloon's
spot on screen, projected with the game's own camera fit, so it goes through
the real aiming - and screenshots mid-game and the results. For Punch Buggy
(`--game punch-buggy`) it walks at the nearest fighter with WASD, clicks to
punch when facing them within reach and again to pull back, and screenshots a
punch in flight and the results. For Time It
(`--game time-it`) it clicks during the countdown and fails if that stops the
timer, then clicks on the target by the page's own clock and fails unless the
stop is within 0.15 s of it; screenshots the countdown, the stopwatch running,
covered, and the results. For Feeding Time
(`--game feeding-time`) it first moves the pointer about without pressing and
fails if that throws, then throws at the nearest hungry duck for the minute - a
real pointermove onto the spot, pointerdown, and pointerup held for the power that
reaches it - spoiling every fourth, and fails unless ducks are fed. For Find Yourself
(`--game find-yourself`) it picks the cup its face is really under in stages 1
and 3 and the one next to it in stage 2 - clicking the cup on the canvas - and
fails unless that scores 4; screenshots the faces, a shuffle, a hovered cup, a
result and the results. For Sprint Triathlon
(`--game sprint-triathlon`) it clicks to swim, presses Space to bike and types
the sentence to run - read from the page's `data-task` - to the finish,
screenshotting the countdown and each leg; `--slip` types a wrong key on the run
and fails unless the next right key is ignored. For Wack-Attack
(`--game wack-attack`) it walks with WASD to the nearest mole that is up and
clicks to swing once over it, for the whole minute, failing if it never whacks
one; screenshots a swing, the field and the results. For Make The Cut
(`--game make-the-cut`) it plays each of your turns - holding WASD towards the
nearest string until it is in reach, then aiming at the string and clicking -
failing if a cut in reach does not count, and screenshots the draw, walking, a
cut, a launch and the results. For Lady Luck
(`--game lady-luck`) it clicks a three-leaf clover once and fails unless that
starts the cooldown and a click during it is ignored, then claims a four-leaf
clover every three seconds for the minute - a real pointer event at the
clover's spot - screenshotting the field and the results. For Let Him Cook
(`--game let-him-cook`) it watches the cooking and, on each of your turns, clicks
an item this browser saw go in that nobody has claimed - a real pointer event at
the item's spot, projected with the game's camera fit - failing if one is not
accepted; `--slip` picks one it never saw go in on the second turn and fails
unless that is out. Screenshots the cooking, the order, a hovered item, results
and the end. For I See The Light (`--game i-see-the-light`)
it presses space once a tick on green and moves the pointer onto the middle of
the circle (read from the page's `data-circle`) on red, screenshotting a red and
the results; `--slip` also presses space a second into the second red and fails
unless that puts it out. For Synchronize Steps (`--game synchronize-steps`) it
picks every round with a number key or the buttons - once changing its mind - sits
round 3 out, and presses a key in each reveal. It fails if a pick is not the one
counted, if the sat-out round is not picked for it, or if a key pressed in the
reveal carries into the next round. It screenshots a pick, the others' ticks, a
reveal and the results. For He's One Shot (`--game hes-one-shot`) it stands in
for the pointer lock (see the gotcha below), then checks each control through
real events - a click in the countdown shoots nothing, a `mousemove` turns the
view by exactly its `movementX`/`movementY` times the sensitivity, W walks the
way you look, a click fires and a second click inside the cooldown does not -
and then hunts for the rest of the game, turning onto whoever it has a clear line
to and shooting. It aims perfectly, so its games are short. It screenshots the
countdown, a shot, a hit, being a hunter and the results. For Keyboard Warrior
(`--game keyboard-warrior`) it presses a key in the pause before the first
letter and fails if that counts, then types each letter 0.35 s after the page
shows it (`data-letter`) with real keydowns - a wrong letter and then the right
one on the second, which must stay wrong, and nothing on the fourth - failing if
a right letter is not taken, if the reaction the page timed is not about 0.35 s,
or if it never wins a letter. For Chef Caricature (`--game chef-caricature`) it
watches whoever draws before it, then on its turn draws with real pointer events
at board positions projected with the game's own camera fit: it lets go of an
outline part way and fails unless that is wiped, scribbles over the whole board
and fails if that is accepted, then traces outlines for the rest of the turn and
fails unless at least four are accepted, a dish each. It takes as long as every
turn together - a few minutes. Prints the
race's layout and seed, each spin, the finishing place, and console errors.
About 30 seconds.

**Musical Mayhem** (`--game musical-mayhem`), **Where's Midnight?**
(`--game wheres-midnight`) and **Pet Race** (`--game pet-race`) are opened and
screenshotted but have no `--steer` yet: the briefing and the round, and nothing
played. All three read their state the usual way, so `gameState` gives you the
floor, the search or the race to drive by hand. Pet Race opens on its ten-second
table - the cards carry `data-pick="<pet>"`, and clicking one is a pick; choose
nothing and you are a fish.

### A full lobby

```bash
node .claude/skills/run-localrot/scripts/lobby.mjs --players 8 --out <dir>
```

Starts N **separate** headless Chromes, puts them in one lobby, then for each
game (default `zombie-tag,messy-maze,probable-stop,duck-hunt,feeding-time,sprint-triathlon,punch-buggy,time-it,wack-attack,lady-luck,find-yourself,make-the-cut,let-him-cook,i-see-the-light,helping-dad,synchronize-steps,hes-one-shot,keyboard-warrior,chef-caricature`): the host opens and starts it, and it
checks every browser has the same round (same seed, maze and headcount - Zombie
Tag has no seed or maze, so there it is headcount alone) with exactly one body
marked as its own, then that a guest holding a key moves on
the host's screen - or, in Probable Stop, that a guest stepping to another path
and confirming shows up on the host's; in Duck Hunt, that a guest's shot at one
of its own balloons counts on the host; in Punch Buggy, that a guest walking and
clicking moves and throws a punch on the host; in Time It, every browser stops a little after the
target by its own clock, then that all agree on the stops once the round is
over and each is within 0.03 s of the reading its browser clicked at; in Feeding Time, every browser throws at ducks for
twelve seconds, then that guests' throws reached the host and all agree on the
scores; in Find Yourself, every browser picks its own cup in
the first stage, then that all agree on the picks and everybody scored; in Sprint Triathlon, every browser races for twelve
seconds, then that guests' progress reached the host and all agree on where
everybody got to; in Wack-Attack, every browser walks and swings for
fifteen seconds, then that guests' whacks landed on the host and all agree on
the scores; in Make The Cut, every browser plays its own turns with
the keys and the mouse until a guest's cut lands on the host, then that all agree
on the cuts and who is out; in Lady Luck, that a guest's click on a four-leaf
clover is its claim on the host, that two guests clicking the same one at once
leaves it claimed once, and that all agree on the claims; in Let Him Cook, every browser plays its own turns
with what it saw the chef take until a guest's pick is claimed on the host, then
that all agree on the plates and the line; in I See The Light, that a guest
running through a green and a red shows its steps on the host and is still in;
in Synchronize Steps, every browser picks for three rounds, in twos so there are
pairs and crowds, with keys or buttons and some changing their minds. At each
reveal every browser must agree on the picks and steps, and each pick must be the
one its browser meant. In He's One Shot, that a guest holding W walks on the
host's screen, then every browser hunts for twenty seconds with the real
controls, and every browser must agree on who is out, by whom, and the kills -
with at least one elimination a guest's own shot made. In Keyboard Warrior,
every browser types each of five letters after its own delay, the last guest
quickest and the host slowest, and the last guest must win at least four of the
five - reactions are timed on each screen, so being furthest from the host must
not matter - with every browser agreeing on the scores. In Chef Caricature,
whoever draws first traces three outlines while everybody else watches: a
watcher must see the ink mid-stroke, at least two must be accepted, and every
browser must agree on the turn, the outline and the scores.
The other browsers are left idle there, so they go out on the first red for a
pointer that was never in the circle - that is the rules, not a failure. Screenshots the host and a guest per game. Exits non-zero on
any disagreement. Needs the relay. About a minute for eight.

**Look at the screenshots.** A blank sky with a HUD over it is a canvas that is
not rendering, not a pass.

## 3. Reading game state

`gameState(game)` in `scripts/cdp.mjs` evaluates to a minigame screen's round
or race, read through React's dev-build fiber: from an element inside the
screen, up `.return` to the component by name, whose first hook is the state.
Use it for anything the screenshots cannot say - positions, bindings, places.
Dev server only.

Modules can be imported in the page for their functions:
`await import('/src/modules/09-net/index.ts')`. Calling `createLobby`,
`openMinigame` and the like this way is how `lobby.mjs` avoids clicking through
the lobby popup eight times.

## Gotchas, all of them hit

- **One browser per player, never one browser with N tabs.** Chrome allows about
  sixteen live WebGL contexts across the whole browser, each player's page has
  two (the world and the minigame), and eight tabs freeze at 0.1 s with blank
  canvases. The same applies to a person testing by hand.
- **Use the GPU.** `--software` (SwiftShader) runs at a few frames a second, and
  both games clamp a frame to 50 ms of game time, so a 15-second race takes
  minutes. The scripts default to ANGLE on the real GPU.
- **Restart the dev server after editing a module you import in the page.** Hot
  reload serves the app a new copy of the module under `?t=...`; importing the
  plain path then gets a *different* copy with its own empty store, and a
  lobby made through it is not one the app can see. `lobby.mjs` checks the
  lobby code appears on the app's own button for exactly this reason.
- **Zombie Tag reads `KeyboardEvent.code`, Messy Maze reads `KeyboardEvent.key`.**
  Dispatch both (`{ key: 'd', code: 'KeyD' }`).
- **The relay drops anything over 60 messages a second from one client, silently.**
  If a lobby run gets stuck waiting on something the host did, suspect this
  first: copy `server/relay.mjs` somewhere, log inside the rate-limit branch,
  run it on another port, and start a dev server with
  `VITE_RELAY_URL=ws://localhost:<port>`.
- **Headless Chrome will not lock the pointer.** He's One Shot reads the mouse
  only while `document.pointerLockElement` is its arena, so `oneShotPlay` makes
  that property answer with the arena and sends `pointerlockchange`. Everything
  after that is the real code path; only the lock itself is stood in for.
- **Screenshots at 480x300** (what `lobby.mjs` uses, to keep eight browsers
  light) cut off the results card. That is the window, not the layout.
