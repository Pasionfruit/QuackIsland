/**
 * 54-minigame-round - the public contract.
 *
 * Turns a completed Volcano Island board round into one host-controlled,
 * randomly selected free-for-all minigame with practices and one final result.
 */
export { EMPTY_MINIGAME_ROUND, MINIGAME_ROUND, beginMinigameAttempt, canAcknowledgeMinigameRound, createMinigameRound, eligibleFreeForAll, finishFinalMinigame, isMinigameRoundSnapshot, requestRewardHandoff, type MinigamePlacement, type MinigameRoundPhase, type MinigameRoundPlayer, type MinigameRoundSnapshot, } from './internal/rules';
export { MINIGAME_ROUND_WIRE, decodeMinigameRoundMessage, encodeMinigameRoundMessage, type MinigameRoundMessage, } from './internal/protocol';
export { MINIGAME_ROUND_READY_WIRE, allConnectedMinigamePlayersReady, decodeMinigameRoundReady, encodeMinigameRoundReady, type MinigameRoundReadyMessage, } from './internal/readiness';
export { acknowledgeMinigameRound, getMinigameRound, isMinigameRoundAcknowledged, listenForMinigameRound, markMinigameRoundReady, recordFinalMinigame, requestMinigameRoundSync, continueToMinigameRewards, resetMinigameRound, startFinalMinigame, startMinigamePractice, syncMinigameRoundLifecycle, isMinigameRoundReadyToStart, useMinigameRound, useMinigameRoundAcknowledged, useMinigameRoundReadyPlayers, } from './internal/state';
export { MinigameRound } from './internal/MinigameRoundView';
