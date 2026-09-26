# 63-volcano-pause

## What this is

The pause behaviour for the board portion of a Volcano Island party. During an
active board game, Escape is captured before the minigame screen can receive
it. The host pauses the party; guests see the same card and wait for the host.

The board has no autonomous timer or simulation between turns. The overlay
therefore pauses all available game controls without changing the frozen board
state or its network protocol. The full-screen card absorbs pointer input, and
its key handler absorbs movement keys while paused.

## Behaviour

- Escape while the party is playing Volcano Island and no minigame screen is
  open toggles the shared pause card for the host.
- Escape never reaches the minigame menu in that board-game context.
- Guests cannot pause or resume; they see that the host has paused the party.
- Resume is available to the host by Escape or the card button. The host can
  also leave the party from that card.
- A `hostChoice` state supplies party synchronization and late-join recovery.

## Public contract

| Export | Meaning |
| --- | --- |
| `VolcanoPause` | Scene component that owns the capture-phase Escape handler and card. |
| `useVolcanoPause`, `getVolcanoPause`, `setVolcanoPause`, `useVolcanoPauseSync` | Shared host pause state. |
| `isVolcanoBoardParty`, `shouldBlockKey`, `CONTROL_CODES` | Pure activation and input-blocking rules. |

## Non-goals

- No change to the frozen board movement or minigame modules.
- No new board snapshot or relay message type; the existing host-choice
  transport carries the simple running/paused state.
- No guest authority to change the pause state.

## How to review

1. Host a two-player Volcano Island party and start the board game.
2. Press Escape. A **Paused** card should appear in both browsers; no
   minigame dashboard should open.
3. On the host, press `W`, arrow keys, and click behind the card. The board
   should receive none of those inputs.
4. Press Escape again or click **resume** on the host. The card should vanish
   for both browsers.
5. On a guest browser, Escape must not change the shared pause state.

## Validation

`npm run test:volcano-pause` checks the active-context guard, paused control
blocking, and the mounted Escape flow that leaves the minigame screen closed.
