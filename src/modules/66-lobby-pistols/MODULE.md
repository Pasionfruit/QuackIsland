# 66-lobby-pistols

## What this is

In first person, lobby players carry a small procedural pistol and see a
centre crosshair. A short left click at another player fires a client-side aim
ray; a hit is announced to the room, records a K/D result for everybody, and
stuns the target briefly. The existing player
stun state is already replicated by the lobby avatar stream, so every player
sees the target fall backward, hears the shot and fall cues, and then sees
them get back up. Nobody is removed, respawned, or blocked from continuing to
play. Holding Tab includes each player's K/D in the lobby scoreboard.

The pistol and crosshair are active only in first person while no party game
or minigame screen is running. The bottom-left K/D card remains visible across
the lobby. One click captures the mouse for free look; after it is captured,
a short left click attempts a shot. Escape releases free look.

Hold **E** in the lobby to open the face-emote selector. Hover Mad, Scared,
Laugh, Sad, Surprised, or Mog and release E to show that expression for three
seconds. The expression travels with the regular player pose, so everyone in
the room sees it.

## Public contract

- `LobbyPistols` mounts the first-person pistol, input, room listener, and HUD.
- `aimedLobbyTarget`, `scoreLobbyHit`, and the message encoder/decoder are
  pure helpers for the aim and score rules.
- `useLobbyPistols` exposes the current room's K/D entries.

## Review

1. Join two browsers to the same lobby, click once, and move the mouse without
   holding a button. Confirm the camera turns and the other avatar's head turns
   with it. Press Escape to release the mouse.
2. Aim the centre of the captured view at the other player's body and click.
   The target falls briefly in both browsers and then stands again.
3. Confirm the shooter's K/D becomes `1 / 0` and the target's becomes `0 / 1`.
4. Start a party or open a minigame: the pistol meshes and K/D card disappear,
   and clicks no longer cause lobby hits.
5. Hold E, hover an expression, and release E. Confirm the expression shows on
   both browsers, then returns to the smile after three seconds.
