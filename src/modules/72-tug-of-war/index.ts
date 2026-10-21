/** Tug-of-war. Standalone implementation; catalogue registration is deferred. */
export { TugPanel,type TugProps } from './internal/TugPanel'
export { tugOfWarBuild } from './internal/build'
export { createRound,sequenceFor,applyPress,projectPlayer,emptyHands,KEYS,SOLO_PULL,TEAM_PULL,type Round,type Player,type Press,type Hands } from './internal/rules'
export { newRound,waitingRound,gameRoster } from './internal/setup'
