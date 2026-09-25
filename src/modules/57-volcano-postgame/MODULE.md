# 57-volcano-postgame

## Purpose

This module provides the exit from a completed Volcano Island match. While the
frozen victory screen preserves the result, it gives only the host a Return to
lobby action and tells guests to wait. The action uses `10-party`'s existing
host-authoritative `endGame()` path, so every browser returns to the same lobby
without leaving the relay room or disbanding the party.

This is deliberately not an automatic rematch. Returning to the lobby resets
ready state through the party contract; the host and players can deliberately
start another game through the ordinary lobby flow.

## Public contract

The public surface is `index.ts`.

- `volcanoPostgameDecision` is the pure host/guest visibility and permission
  decision for a victory, party phase, mode, and host flag.
- `VolcanoPostgameDecision` and `VolcanoPostgameReason` describe that result.
- `returnVolcanoToLobby` validates live state, rejects guests and stale matches,
  suppresses duplicate clicks for the same victory session, and calls the
  public synchronized party end-game action.
- `resetVolcanoPostgame` clears the local duplicate-action guard between match
  sessions.
- `VolcanoPostgame` mounts the control layer outside react-three-fiber.

## Lifecycle and authority

Controls are visible only when `56-volcano-victory` exposes a complete winner,
the party is still `playing`, and the selected mode is `island`. The host sees
Return to lobby. Guests see a waiting message and have no action.

The action reads live dependency state again when clicked; rendering a button
does not grant lasting authority. A stale winner, changed mode, ended party, or
guest host flag rejects the call. The victory session id is retained after the
first accepted click so rapid double-clicks cannot publish duplicate end-game
messages. A later victory session remains eligible.

`endGame()` owns synchronization and moves the party to `off`, preserving the
room while clearing readiness. That state change hides this module and causes
the preceding gameplay lifecycle modules to clear their match state through
their own public behavior.

## Human review

Use one host browser and one guest browser in the same two-player Island party:

1. Reach the summit and wait for the synchronized victory screen on both
   browsers.
2. Confirm the host sees Return to lobby near the bottom of the winner screen.
3. Confirm the guest instead sees “Waiting for the host to return everyone to
   the lobby” and has no clickable postgame action.
4. Rapidly click Return to lobby on the host. Confirm both browsers leave the
   victory screen and return to the existing party lobby without disconnecting
   from the room.
5. Confirm players are no longer readied automatically. Ready both players and
   start another Island game through the normal lobby flow; no old winner or
   postgame control should reappear.

Automated coverage includes host and guest decisions, inactive winner/party/
mode states, missing winner identity, host-only action authority, duplicate
click suppression, and a later independent victory session.

## Non-goals

- Automatic rematch or automatic ready state.
- Party disband or relay disconnect.
- Changes to the frozen victory presentation or gameplay modules.
- Tile actions, obstacles, or persistent match history.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
