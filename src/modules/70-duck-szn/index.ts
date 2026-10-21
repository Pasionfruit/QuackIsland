/** Duck Szn. Catalogue registration is intentionally deferred. */
export { DuckSznPanel, type DuckSznProps } from './internal/DuckSznPanel'
export { duckSznBuild } from './internal/build'
export { DURATION, COOLDOWN, SENSITIVITY, createRound, emptyHands, move, shoot, targetOf, tick, judgeEnd, height, eye, direction, type Round, type Player, type Hands } from './internal/rules'
export { arenaFor, walkable, slide, type Arena } from './internal/arena'
export { newRound, waitingRound, gameRoster } from './internal/setup'
