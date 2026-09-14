# 13-modes

## What this is

Which game the party is playing.

A catalogue of the games there are, one choice shared by everyone in a lobby,
and the host's hand on it. The lobby popup in the top left corner is what
points it at one: make a lobby, share the code, pick a game.

**It holds no game.** `island` is played by `10-party` and `garden` by
`14-garden`. This module knows the names of two games and how neither of them
works.

That separation is the whole point. A game module mounts itself when
`getGameMode()` names it, and knows nothing about the other games or about the
lobby that chose between them.

## The two games

| id | title | played by |
| --- | --- | --- |
| `island` | Volcano Island | `10-party` - a spiral race up the volcano |
| `garden` | Garden Goofs | `14-garden` - a flat 2D lawn, and no game on it yet |

Neither game is *finished*. `built` is not about that: it is whether pressing
start takes everybody somewhere real. Both do — one to a volcano, one to a
lawn — and both then leave you standing there, because the rules of neither
have been written.

A mode is listed from the moment it is decided on, long before it can be
played, because the whole point of a lobby is to say what is coming. `built`
is what stops a host starting one that would move nobody anywhere.

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
| `hostChoice(tag, known, fallback)` | A setting the host decides and the lobby is told |
| `applyChoice(current, message, isHost)` | What a message means to whoever got it. Pure |
| `Choice`, `ChoiceMessage` | What that returns, and what it sends |
| `decodeChoice` / `encodeChoice` | The generic wire format underneath both. Pure |
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
- **A joiner takes the host's game.** `useModeSync` sends `ask` the moment you
  are in a room, the host answers, and the answer wins over whatever you had
  picked on your own. That is the only way somebody arriving finds out what the
  party is playing, so the rule is `applyChoice` - pure, and tested three ways:
  a guest is told, a host is never told, and only a host answers.
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

## One setting the whole lobby agrees on

Which game is being played is one of these. So is which variant of that game -
see `14-garden` - and so will every lobby setting ever added be. They all want
the same four things, and all four are easy to get subtly wrong:

- **The host owns it.** A guest changing it locally is dragged back by the next
  message and sees their choice flicker.
- **A joiner asks.** Broadcasting only on change strands everybody who arrived
  afterwards on the wrong answer.
- **Leaving forgets**, or the last lobby's choice follows you home.
- **A value nobody has heard of is refused**, whole message and all. Taken on
  trust it leaves the interface pointing at something with no row to select
  back out of.

`hostChoice` is that, written once:

```ts
const mode = hostChoice<GardenMode>('garden', isGardenMode, 'endless')
mode.use()      // in React
mode.get()      // in a frame callback
mode.set(id)    // host only
mode.useSync()  // once, from something always mounted
```

The `tag` is the message type on the room channel and **must be unique across
the build** - it is what stops two choices reading each other's messages. There
is a test that one refuses the other's.

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
- **Click a code field and type.** The player must not walk while you type,
  and the camera must not turn when you click inside the popup.
- **There are two code fields, and they are not the same field.** Yours comes
  with a code in it and a **create** under it; theirs starts empty, says
  `THEIRS`, and has **join**. Typing in one must not touch the other.
- **Press create.** The status goes to connecting and then to the code with
  `you host`.
- **While in a lobby, type another code in the join field and press join.** You
  should move to that lobby rather than being told you are already in one.
- **Press join with a half-typed code.** The button should be unpressable
  rather than reporting an error after the fact.
- **Pick Garden Goofs.** It takes the highlight, three ways to play appear
  under it, and the PARTY panel above names both the game and the way.
- **Pick Volcano Island again.** The three ways to play go away.
- **With two browsers in one lobby:** the host picks a game and the guest's
  popup should follow within a moment. The guest's rows must be unpressable
  and say *the host picks*.
- **Join a lobby that is already mid-choice.** The arriving browser should show
  what the host has selected, not the default.
- **Start a game on Volcano Island.** Everybody is moved to the island, as
  before. While playing, the game rows say *settled for this round* and cannot
  be changed.
- **Start one on Garden Goofs.** A 2D board opens over the world instead, and
  the picking menu with it. Same mechanism, pointed somewhere else, which is
  the whole point - one game moves your body, the other draws over it.
- **Leave the lobby.** The choice goes back to Volcano Island.
- **Swim out to the party island with Garden Goofs selected.** The island is
  still there. A mode is not a switch on the world.

## Gate record

Filled in when the human passes it.

## Measured

Nothing to measure: this module draws nothing.
