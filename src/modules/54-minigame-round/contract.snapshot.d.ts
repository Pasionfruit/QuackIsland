/**
 * 54-minigame-round - the public contract.
 *
 * Turns a completed Volcano Island board round into one host-controlled,
 * randomly selected free-for-all minigame with practices and one final result.
 */
export { EMPTY_MINIGAME_ROUND, MINIGAME_ROUND, beginMinigameAttempt, canAcknowledgeMinigameRound, createMinigameRound, eligibleFreeForAll, finishFinalMinigame, isMinigameRoundSnapshot, requestRewardHandoff, type MinigamePlacement, type MinigameRoundPhase, type MinigameRoundPlayer, type MinigameRoundSnapshot, } from './internal/rules';
export { MINIGAME_ROUND_WIRE, decodeMinigameRoundMessage, encodeMinigameRoundMessage, type MinigameRoundMessage, } from './internal/protocol';
export { acknowledgeMinigameRound, getMinigameRound, isMinigameRoundAcknowledged, listenForMinigameRound, recordFinalMinigame, requestMinigameRoundSync, continueToMinigameRewards, resetMinigameRound, startFinalMinigame, startMinigamePractice, syncMinigameRoundLifecycle, useMinigameRound, useMinigameRoundAcknowledged, } from './internal/state';
export { MinigameRound } from './internal/MinigameRoundView';
