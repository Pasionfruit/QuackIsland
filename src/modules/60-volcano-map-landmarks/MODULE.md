# 60-volcano-map-landmarks

Procedural route furniture for Volcano Island. This module makes the course's
start, quarter points, and summit readable while leaving movement, landing
effects, and multiplayer authority in their existing owners.

## Public contract

| Export | Purpose |
| --- | --- |
| `VOLCANO_LANDMARKS` | The shared five-landmark plan for the current board |
| `createVolcanoLandmarks(tileCount)` | Pure layout creation for another board size |
| `volcanoLandmarkPose(landmark, tileCount)` | World pose and route frame beside a tile |
| `volcanoLandmarksVisible(mode, phase)` | Pure Volcano/party visibility decision |
| `VOLCANO_LANDMARK_BUDGET` | Exact renderer footprint: 5 calls, 302 triangles |
| `VolcanoMapLandmarks` | Scene component registered by `src/app/scene.ts` |

## What is drawn

- An obsidian start gate spanning the first tile.
- Three alternating-side cairns at 25%, 50%, and 75% of the climb, coloured
  from amber to hot orange so the route reads uphill.
- A red summit crystal and halo beside the final tile.

Posts and caps are instanced. The remaining gate beam, summit crystal, and
halo are one draw each. All geometry uses low-segment Three.js primitives;
there are no downloaded assets or textures.

## Ownership and behavior

The plan is derived from `BOARD_TILES`, and every pose comes from the frozen
`boardPointAt()` contract. Route tangents determine yaw and route normals put
markers beside the path. There is no random input, so every browser constructs
the same map without network traffic.

The component renders only while the selected mode is `island` and the party
phase is `playing`. It has no pointer or keyboard handlers, colliders, player
state, relay messages, timers, or frame callbacks. It therefore cannot block
movement or compete with the host-authoritative race flow.

## Human check

1. Start a two-browser Volcano Island party.
2. Confirm both browsers show the same start gate, three slope cairns, and
   summit beacon.
3. Roll through several turns and confirm ducks pass the furniture without
   collision or input changes.
4. End the game or return to the lobby and confirm the landmarks disappear.
5. Start a non-Volcano game and confirm no landmarks appear.

## Non-goals

- No obstacle collision or gameplay penalty.
- No new movement or landing effect.
- No changes to terrain, board, tile-action, or game-flow modules.
- No external models, textures, animation loop, or network state.

