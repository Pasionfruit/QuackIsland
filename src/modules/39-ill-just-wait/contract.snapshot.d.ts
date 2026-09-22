export { DIAL, TARGETS, digital, duration, hourOf, numberWord, targetFor, wordedTime, wrap, type Target } from './internal/wording';
export { CLOCK, COLOURS, answerFor, confirm, createGame, finished, handAngles, lastAt, leave, newHand, placings, pointsOf, press, resetHand, setHand, stageOf, stepGame, sweepRate, timeLeft, turnHand, type Entrant, type Game, type Hand, type Player, type Verdict, } from './internal/rules';
export { BOT_READ, BOT_WIND, botMoves, botPace } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Answer, type Intent, type Snapshot, type WirePlayer, } from './internal/wire';
export { FILL, FOV, POINTS, STAGE, TILT, frameScene, standX, type Shot } from './internal/camera';
export { IllJustWaitScreen } from './internal/IllJustWaitScreen';
