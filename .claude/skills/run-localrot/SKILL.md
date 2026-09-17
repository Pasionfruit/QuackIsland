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
punch in flight and the results. For Lady Luck
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
unless that puts it out. Prints the
race's layout and seed, each spin, the finishing place, and console errors.
About 30 seconds.

### A full lobby

```bash
node .claude/skills/run-localrot/scripts/lobby.mjs --players 8 --out <dir>
```

Starts N **separate** headless Chromes, puts them in one lobby, then for each
game (default `zombie-tag,messy-maze,probable-stop,duck-hunt,punch-buggy,lady-luck,let-him-cook,i-see-the-light`): the host opens and starts it, and it
checks every browser has the same round (same seed, maze and headcount - Zombie
Tag has no seed or maze, so there it is headcount alone) with exactly one body
marked as its own, then that a guest holding a key moves on
the host's screen - or, in Probable Stop, that a guest stepping to another path
and confirming shows up on the host's; in Duck Hunt, that a guest's shot at one
of its own balloons counts on the host; in Punch Buggy, that a guest walking and
clicking moves and throws a punch on the host; in Lady Luck, that a guest's click on a four-leaf
clover is its claim on the host, that two guests clicking the same one at once
leaves it claimed once, and that all agree on the claims; in Let Him Cook, every browser plays its own turns
with what it saw the chef take until a guest's pick is claimed on the host, then
that all agree on the plates and the line; in I See The Light, that a guest
running through a green and a red shows its steps on the host and is still in.
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
- **Screenshots at 480x300** (what `lobby.mjs` uses, to keep eight browsers
  light) cut off the results card. That is the window, not the layout.
