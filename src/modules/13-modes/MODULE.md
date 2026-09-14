# 13-modes

## What this is

Which game the party is playing.

A catalogue of the games there are, one choice shared by everyone in a lobby,
and the host's hand on it. The lobby popup in the top left corner is what
points it at one: make a lobby, share the code, pick a game.

**It holds no game.** `island` is played by `10-party`; nothing plays `garden`
yet. This module knows the names of two games and how neither of them works.

That separation is the whole point. A game module mounts itself when
`getGameMode()` names it, and knows nothing about the other games or about the
lobby that chose between them.

## The two games

| id | title | played by |
| --- | --- | --- |
| `island` | Volcano Island | `10-party` - a spiral race up the volcano |
| `garden` | Garden Defence | nothing yet - a flat 2D lane defence |

`garden` is listed and selectable and **does not exist**. That is deliberate: a
lobby is where you say what is coming, and a mode that only appeared the day
its game was finished would be a mode nobody could plan around. `built: false`
is how the interface knows — the party dashboard will not let a host start it,
because starting a game that is not there drops everybody somewhere with
nothing to do.

Adding a third game is one entry in `MODES` and a module that mounts on its id.
There is no switch statement to extend and nothing in the interface to change:
the lobby draws whatever the catalogue holds.

## Public contract

| Export | Meaning |
| --- | --- |
| `MODES` | Every game, in the order the lobby lists them. Frozen |
| `GameMode` | `{ id, title, blurb, built }` |
| `ModeId` | `'island' \| 'garden'` |
| `DEFAULT_MODE` | What a lobby plays until somebody says otherwise |
| `modeById(id)` | The entry for an id. Total on `ModeId`. Pure |
| `isModeId(v)` | Whether an unknown value is one of ours. Pure |
| `isPlayable(id)` | Whether the game behind it exists yet. Pure |
| `nextMode(id, step?)` | The next one along, wrapping both ways. Pure |
| `decodeMode(raw)` / `encodeMode(m)` | The wire format, and its validation. Pure |
| `ModeMessage` | `{ mode?, ask? }` |
| `useGameMode()` | The chosen id, for React |
| `getGameMode()` | The chosen id, for anything outside React |
| `chooseMode(id)` | Point the party at a game. Host only |
| `useModeSync()` | Keep it in step with the lobby. Call once, from the interface |
| `listenForModes()` / `announceMode()` / `askForMode()` / `resetMode()` | The parts `useModeSync` is made of |

## Invariants you may rely on

- **The host owns the choice.** Same as the clock, the weather and the party
  phase. A guest's `chooseMode` does nothing at all rather than changing the
  game for one person until the next message drags them back.
- **Alone, you are your own host.** `09-net` reports `host: true` when you are
  not in a lobby, so picking a game works before anybody has arrived and
  nothing is taken away by joining.
- **A joiner asks.** `useModeSync` sends `ask` the moment you are in a room and
  the host answers with what is selected. A lobby that only broadcast on change
  would leave everyone who arrived afterwards looking at the wrong game.
- **Leaving forgets.** On your own again the choice goes back to
  `DEFAULT_MODE`, rather than the last lobby's game following you home.
- **The default is a game that exists.** There is a test. A lobby that opens
  pointing at something unbuilt is broken before anybody touches it.
- **An unknown mode is rejected, not half-read.** A message naming a game this
  build has never heard of would leave the lobby pointing at nothing, with no
  row in the interface to select back out of it. `decodeMode` returns `null`
  for the whole message instead.
- **The catalogue is frozen.** It is read every render; nothing may push onto
  it at runtime.

## How to use it from a new module

A game module decides for itself whether it is the one being played:

```ts
import { getGameMode } from '../13-modes'

useGameFrame(() => {
  if (getGameMode() !== 'garden') return
  // ... your game
}, PRIORITY.simulation)
```

Read it per frame with `getGameMode()`, not per render with `useGameMode()`,
for anything inside the canvas — the choice can change without your component
being re-rendered.

**Or take it as a prop and let the composition root decide**, which is what
`10-party` does:

```tsx
// src/app/scene.ts
const PartyIfChosen = () => createElement(Party, { active: () => getGameMode() === 'island' })
```

That way the game module has never heard of a catalogue, and this module has
never heard of a volcano. Either is fine; the prop is better when the module
existed before the catalogue did.

## What a mode does *not* switch off

The party island is still drawn while `garden` is selected, because it is a
**place** and not a game: you can swim out to it whenever you like. What the
choice gates is the part that takes over your body — being moved onto the
starting line when the host presses start.

That distinction is worth keeping for every game added later. A mode decides
what happens when a game starts, not what the world contains.

## How the games get built, when they are

Decided with the catalogue, and worth knowing before anybody starts one:

- **Mechanics first.** A game is finished when it plays, not when it looks
  like anything. Rules, state, turns, collision, win and lose - those are the
  work.
- **Everything is the pill.** `02-player`'s body is the placeholder for every
  character in every mode, including the ones that are not people. A plant and
  a zombie are both a pill until proven otherwise.
- **Art and animation come afterwards, in their own pass.** Not alongside, and
  not "while we are in there". A mode that is held up waiting for a model is a
  mode that is not being played.

So a new game module is judged on whether it works with two pills in a lane,
and the gate's review list should say so.

## Deliberate non-goals

- **No games.** Two names, no rules, no play.
- **No per-game settings**, rounds, scoring or difficulty.
- **No voting.** The host picks, the same as the clock and the weather.
- **No starting a game.** That stays the party dashboard's button, which reads
  `built` and refuses a game that is not there.
- **No map, character or colour selection.**
- **No authority.** A modified client can point its own lobby anywhere, the
  same trade as the rest of the networking.

## How to review

- **Open the lobby, top left.** The button says `LOBBY offline` before you
  join and shows the code once you have.
- **Press it again.** It closes. This is the bug that was there first: closing
  on mouse-down and opening on click meant the button could not be pressed
  twice.
- **Press escape, and click out on the world.** Both close it.
- **Click the code field and type.** The player must not walk while you type,
  and the camera must not turn when you click inside the popup.
- **Press new, then create or join.** The status should go to connecting and
  then to the code with `you host`.
- **Pick Garden Defence.** It should take the highlight, the PARTY panel above
  should name it and say it is not built yet, and the host button there should
  refuse to be pressed.
- **Pick Volcano Island again.** The PARTY panel goes back to offering a game.
- **With two browsers in one lobby:** the host picks a game and the guest's
  popup should follow within a moment. The guest's rows must be unpressable
  and say *the host picks*.
- **Join a lobby that is already mid-choice.** The arriving browser should show
  what the host has selected, not the default.
- **Start a game on Volcano Island.** Everybody is moved to the island, as
  before. While playing, the game rows say *settled for this round* and cannot
  be changed.
- **Leave the lobby.** The choice goes back to Volcano Island.
- **Swim out to the party island with Garden Defence selected.** The island is
  still there. A mode is not a switch on the world.

## Gate record

Filled in when the human passes it.

## Measured

Nothing to measure: this module draws nothing.
