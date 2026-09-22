export { DECK, LIMIT, SHOT, activeShots, alongLine, ballAt, barrageFor, crossing, fierceness, lifetime, offLine, spawnPoint, volleySize, type Ball, type Shot, } from './internal/deck';
export { BODY, COLOURS, PUSH, ROUND, canAct, clock, cooldownLeft, createGame, face, hitRange, isStanding, judgeEnd, leave, move, placings, push, steer, stepGame, tick, wrapAngle, yawTowards, type Entrant, type Game, type Player, } from './internal/rules';
export { BOT, bestWay, botSteer, danger } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WirePlayer } from './internal/wire';
export { DeckScene, PALETTE, SEA_Y } from './internal/DeckScene';
export { DeckScreen, inALane } from './internal/DeckScreen';
