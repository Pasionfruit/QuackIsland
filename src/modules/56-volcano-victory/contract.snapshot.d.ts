/**
 * 56-volcano-victory - the public contract.
 *
 * Turns the frozen board's visually-settled summit state into one synchronized
 * end-of-match winner shared by the whole Volcano Island party.
 */
export { EMPTY_VOLCANO_VICTORY, VOLCANO_VICTORY, createVolcanoVictory, isVolcanoVictorySnapshot, volcanoWinner, type VolcanoVictoryPhase, type VolcanoVictorySnapshot, type VolcanoWinner, } from './internal/rules';
export { VOLCANO_VICTORY_WIRE, decodeVolcanoVictoryMessage, encodeVolcanoVictoryMessage, type VolcanoVictoryMessage, } from './internal/protocol';
export { getVolcanoVictory, listenForVolcanoVictory, requestVolcanoVictorySync, resetVolcanoVictory, syncVolcanoVictoryLifecycle, useVolcanoVictory, } from './internal/state';
export { VolcanoVictory } from './internal/VolcanoVictoryView';
