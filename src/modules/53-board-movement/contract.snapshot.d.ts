/**
 * 53-board-movement - the public contract.
 *
 * Consumes the frozen turn order, owns one revisioned position per player,
 * accepts only the active player's host-generated dice, and ends at either a
 * completed board round or the volcano summit.
 */
export { BOARD_MOVEMENT, BOARD_LANDING_EFFECT, EMPTY_BOARD_MOVEMENT, activeBoardPlayer, applyBoardLandingEffect, applyBoardRoll, beginNextBoardRound, boardLandingContext, boardPosition, canAcknowledgeBoardRound, createBoardMovement, reconcileBoardPlayers, validBoardLandingEffect, validBoardDice, type BoardDieKind, type BoardDieRoll, type BoardDieSides, type BoardDieSpec, type BoardLandingContext, type BoardLandingEffect, type BoardLandingEffectResolver, type BoardMove, type BoardMovementPhase, type BoardMovementSnapshot, type BoardPlayer, type BoardPosition, } from './internal/rules';
export { BOARD_MOVEMENT_WIRE, decodeBoardMovementMessage, decodeBoardMovementSnapshot, encodeBoardMovementMessage, type BoardMovementMessage, } from './internal/protocol';
export { BOARD_SHARED_TILE, BOARD_TILES, boardPointAt, sharedTileOffset, tileWorldPoint, type BoardTileOccupant, type BoardTileOffset, type BoardWorldPoint, } from './internal/position';
export { BOARD_CAMERA, advanceBoardCameraPosition, boardCameraPose, boardCameraSubject, type BoardCameraPose, } from './internal/camera';
export { acknowledgeBoardRound, getBoardMovement, isBoardMovementVisualSettled, isBoardRoundAcknowledged, listenForBoardMovement, requestBoardRoll, resetBoardMovement, resumeBoardMovement, setBoardDiceProvider, setBoardLandingEffectResolver, syncBoardMovementLifecycle, useBoardMovement, useBoardMovementVisualSettled, useBoardRoundAcknowledged, type BoardDiceProvider, } from './internal/state';
export { BoardMovement } from './internal/BoardMovementView';
