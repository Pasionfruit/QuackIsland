# 63-volcano-pause

## What this is

The pause behaviour for the board portion of a Volcano Island party. During an
active board game, Escape is captured before the minigame screen can receive
it. Any player may pause the party; everybody sees the same card, including
the name of the player who paused it.

The board has no autonomous timer or simulation between turns. The overlay
therefore pauses all available game controls without changing the frozen board
state or its network protocol. The full-screen card absorbs pointer input, and
its key handler absorbs movement keys while paused.

## Behaviour

- Escape while the party is playing Volcano Island and no minigame screen is
  open toggles the shared pause card for every player.
- Escape never reaches the minigame menu in that board-game context.
- The player who paused may resume by Escape or the card button; everyone else
  sees who they are waiting for. The host can still leave the party from the
  card.
- A small room broadcast carries the player-owned pause action.

## Public contract

| Export | Meaning |
| --- | --- |
| `VolcanoPause` | Scene component that owns the capture-phase Escape handler and card. |
| `useVolcanoPause`, `getVolcanoPause`, `pauseVolcanoGame`, `resumeVolcanoGame`, `mayResumeVolcanoGame`, `clearVolcanoPause`, `useVolcanoPauseSync` | Shared player-owned pause state. |
| `isVolcanoBoardParty`, `shouldBlockKey`, `CONTROL_CODES` | Pure activation and input-blocking rules. |

## Non-goals

- No change to the frozen board movement or minigame modules.
- No board restart or turn-state change from the pause card.
- No non-pauser authority to resume a paused party.

## How to review

1. Host a two-player Volcano Island party and start the board game.
2. Press Escape on either browser. A **Paused** card should appear in both
   browsers, name the player who paused, and no
   minigame dashboard should open.
3. On either browser, press `W`, arrow keys, and click behind the card. The board
   should receive none of those inputs.
4. On the browser that paused, press Escape again or click **resume**. The
   card should vanish for both browsers.
5. On the other browser, check that the card says it is waiting for the named
   player to resume.

## Validation

`npm run test:volcano-pause` checks the active-context guard, paused control
blocking, and the mounted Escape flow that leaves the minigame screen closed.
