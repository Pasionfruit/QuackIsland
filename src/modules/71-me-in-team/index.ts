/** ME in Team. Standalone implementation; catalogue registration is deferred. */
export { TeamPanel, type TeamProps } from './internal/TeamPanel'
export { meInTeamBuild } from './internal/build'
export { createRound, emptyHands, setInput, stepWorld, settle, tick, judgeEnd, activeTeam, CHAIN_LENGTH, DURATION, SOLO_SPEED, TEAM_SPEED, SENSITIVITY, type Round, type Player, type Hands } from './internal/rules'
export { courseFor, validPoint, type Course } from './internal/course'
export { newRound, waitingRound, gameRoster } from './internal/setup'
