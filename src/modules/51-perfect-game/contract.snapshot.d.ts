export { BEACH, BOX, COCONUT, COLUMN, WALL, bendAt, clampThrow, coconutAt, columnFor, columnX, crabAt, foldX, heading, headingAt, hits, legsOf, pathAt, travel, type Column, type Leg, type Shape, type Throw } from './internal/beach';
export { COLOURS, HOME, ROLL_SLACK, TURN, advanceTurn, aimTo, createGame, judgeEnd, leave, phaseOf, placings, roll, stepGame, tau, throwOf, thrower, tick, turnHits, turnOrder, type Entrant, type Game, type Phase, type Player } from './internal/rules';
export { BOT, bestThrow, botAim } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WireAim, type WirePlayer } from './internal/wire';
export { BeachScene, PALETTE, type PointerRef } from './internal/BeachScene';
export { BeachScreen, WALK } from './internal/BeachScreen';
