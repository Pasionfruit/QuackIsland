/**
 * 57-volcano-postgame - the public contract.
 *
 * Adds the host-controlled, party-synchronized exit from a completed Volcano
 * Island match back to the existing lobby.
 */
export { volcanoPostgameDecision, type VolcanoPostgameDecision, type VolcanoPostgameReason, } from './internal/rules';
export { resetVolcanoPostgame, returnVolcanoToLobby, } from './internal/state';
export { VolcanoPostgame } from './internal/VolcanoPostgameView';
