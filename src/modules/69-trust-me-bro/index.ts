/** Trust Me Bro: isolated game implementation; catalogue integration is pending. */
export { TrustMeBroPanel, type TrustMeBroProps } from './internal/TrustMeBroPanel'
export { trustMeBroBuild } from './internal/build'
export { DOOR_COUNTS, CHOOSE_SECONDS, REVEAL_SECONDS, TARGET, createRound, applyIntent, tick, bots, leave, type Round, type Player, type Intent, type Result } from './internal/rules'
export { newRound, waitingRound, gameRoster } from './internal/setup'
