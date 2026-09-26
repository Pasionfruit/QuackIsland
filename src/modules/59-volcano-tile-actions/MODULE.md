# 59-volcano-tile-actions

## What this is

Volcano Island's complete 120-space tile deck. Every board tile receives a
seeded, reproducible colour: 55 regular, 18 Spring ±5, 8 Spring ±10, 7 Swap,
8 Jump ahead/back, 4 Go in volcano, 4 Group return, 7 1v1, 5 1vAll, and 4 Back
to start. Start and summit remain regular; their two regular spaces are part of
the requested total.

## Behaviour

- Springs and jumps use a seeded forward or backward displacement of 5, 10, or
  4 tiles. Volcano moves the landing player back 15. Back to start returns
  them to tile zero.
- Swap exchanges the landing player with the next available player in turn
  order. Group return sends the current group back to its trailing position.
- 1v1 advances the landing player three tiles and pushes the leading opponent
  back three. 1vAll advances the landing player two and pushes every opponent
  back two.
- All effects are resolved only by the elected host after the dice movement
  visibly lands. The resulting positions are part of the normal board snapshot.
- Ten instanced procedural marker sets colour the board; there is no tile HUD,
  dialog, network message, external asset, or unseeded randomness.

## Public contract

`buildVolcanoTileActions`, `volcanoTileActionAt`, and
`resolveVolcanoTileAction` expose the layout and host resolver. The
`VolcanoTileActions` scene entry registers that resolver and draws markers.

## Review

Start a party and compare both browsers: all coloured spaces must match. Land
on each type and confirm the resulting movement or positional contest matches
the rules above in both browsers. Start and summit remain regular.
