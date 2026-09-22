/**
 * 53-board-movement - the public contract.
 *
 * Consumes the frozen turn order, owns one revisioned position per player,
 * accepts only the active player's host-generated dice, and ends at either a
 * completed board round or the volcano summit.
 */
export { BOARD_MOVEMENT, EMPTY_BOARD_MOVEMENT, activeBoardPlayer, applyBoardRoll, beginNextBoardRound, boardPosition, canAcknowledgeBoardRound, createBoardMovement, reconcileBoardPlayers, validBoardDice, type BoardDieKind, type BoardDieRoll, type BoardDieSides, type BoardDieSpec, type BoardMove, type BoardMovementPhase, type BoardMovementSnapshot, type BoardPlayer, type BoardPosition, } from './internal/rules';
export { BOARD_MOVEMENT_WIRE, decodeBoardMovementMessage, decodeBoardMovementSnapshot, encodeBoardMovementMessage, type BoardMovementMessage, } from './internal/protocol';
export { BOARD_TILES, boardPointAt, tileWorldPoint, type BoardWorldPoint } from './internal/position';
export { acknowledgeBoardRound, getBoardMovement, isBoardMovementVisualSettled, isBoardRoundAcknowledged, listenForBoardMovement, requestBoardRoll, resetBoardMovement, resumeBoardMovement, setBoardDiceProvider, syncBoardMovementLifecycle, useBoardMovement, useBoardMovementVisualSettled, useBoardRoundAcknowledged, type BoardDiceProvider, } from './internal/state';
export { BoardMovement } from './internal/BoardMovementView';
