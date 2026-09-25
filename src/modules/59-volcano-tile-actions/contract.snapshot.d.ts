/**
 * 59-volcano-tile-actions - the public contract.
 *
 * Builds the seeded Volcano Island movement-tile layout, registers its landing
 * resolver, and presents the same procedural action markers to every browser.
 */
export { VOLCANO_TILE_ACTIONS, buildVolcanoTileActions, resolveVolcanoTileAction, volcanoTileActionAt, type VolcanoTileAction, type VolcanoTileActionKind, } from './internal/rules';
export { VolcanoTileActions } from './internal/VolcanoTileActionsView';
