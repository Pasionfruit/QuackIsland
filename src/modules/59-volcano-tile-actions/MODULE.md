# 59-volcano-tile-actions

## Purpose

This module adds the first functional action tiles to Volcano Island. Lava Lift
tiles move a player three spaces forward; Ash Slide tiles move a player two
spaces backward. The markers, rules, and feedback are separate from the frozen
board module and use its public landing-effect resolver.

The board host remains authoritative. Dice movement visibly lands first, then
the host resolves at most one action for that landing and broadcasts the normal
board snapshot. The second displacement uses the board's movement animation and
settlement lock, so another roll or the minigame transition cannot begin midway
through an action.

## Public contract

The public surface is `index.ts`.

- `VOLCANO_TILE_ACTIONS` contains the two definitions and layout bounds.
- `buildVolcanoTileActions(tileCount, seed)` returns the deterministic balanced
  layout for one board seed.
- `volcanoTileActionAt(actions, tile)` performs a catalogue lookup.
- `resolveVolcanoTileAction(context, snapshot)` is the resolver registered with
  `53-board-movement` and returns only its bounded movement effect.
- `VolcanoTileAction` and `VolcanoTileActionKind` describe public placements.
- `VolcanoTileActions` is the scene entry for resolver registration, procedural
  markers, the compact legend, and shared result feedback.

## Layout

Placement uses `00-core`'s seeded RNG. It never uses `Math.random`. The opening
four tiles and summit tile are excluded, and selected action tiles remain at
least three indices apart. The layout adds one balanced boost/setback pair per
twelve track tiles, capped at six pairs. A full 120-tile board therefore has six
Lava Lifts and six Ash Slides.

The seed is derived from the board seed and a versioned tile-action namespace.
All browsers independently construct the same ordered catalogue; no extra room
messages or server storage are required.

## Effects and authority

The scene entry registers `resolveVolcanoTileAction` through the frozen board's
public resolver. Only the board host invokes it, after the rolled landing is
visually settled. The resolver confirms that board session and tile count match
the context before returning a copied effect.

Lava Lift returns `+3`; Ash Slide returns `-2`. The board owns validation,
clamping, duplicate protection, animation, synchronization, active turns, and
summit victory. Passing over a marker does nothing: a die roll must finish on
the marked tile.

## Presentation and budget

Two instanced procedural cylinder meshes mark all action tiles: orange for Lava
Lift and slate for Ash Slide. The board applies the deterministic movement
effect without an Action Tiles legend or landing-result dialog.

At the maximum twelve placements the markers use two draw calls and about 864
displayed triangles. There are no textures, models, generated assets, or extra
network messages.

## Human review

Use one host browser and one guest browser in the same two-player Island party:

1. Complete turn order and enter the board. Confirm both browsers show action
   markers on the same tiles, without an Action Tiles legend.
2. Confirm the opening tiles and summit are unmarked and no two action markers
   are adjacent.
3. Continue rolling until a player lands exactly on a Lava Lift. The ordinary
   dice movement must land first; then the player should travel three more
   tiles. Both browsers must show the same final position without a result dialog.
4. Land exactly on an Ash Slide. After landing, the player should visibly move
   backward two tiles on both browsers.
5. During either action, confirm the next player cannot roll. If it is the last
   turn, the minigame must wait until the action movement lands.
6. Confirm merely passing across an action tile does not trigger it.
7. Complete a normal minigame/reward cycle and confirm reward dice still work
   on the next board round. An action-assisted summit arrival should still show
   the shared victory screen.

Automated coverage verifies deterministic and seed-sensitive layouts, equal
action counts, spacing and endpoint exclusions, public effect validation,
ordinary-tile rejection, mismatched-session rejection, and identical effect
resolution for two-player and eight-player board rosters.

## Non-goals

- Skipped turns, extra turns, branching routes, or player choices.
- Changes inside frozen board, minigame, reward, victory, or postgame modules.
- Unseeded placement or client-authoritative movement.
- External models, textures, or an asset pipeline.

## Measured

Maximum two draw calls and approximately 864 displayed triangles.
