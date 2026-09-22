export { COLOURS, CHARGE, POND, canThrow, createGame, duckAt, duckCount, ducksFor, aimAngle, aimThrow, chargePower, distancePower, flightTime, landing, layDucks, onPond, placings, powerDistance, spotOf, stepGame, throwCracker, timeLeft, type Cracker, type Duck, type Entrant, type Feeder, type Game, type Point, type Throw, } from './internal/rules';
export { BOT_AIM, BOT_EVERY, botThrows } from './internal/ai';
export { MAX_FEEDERS, ME, SOLO_FEEDERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot, type WireCracker, type WireFeeder, } from './internal/wire';
export { FILL, FOV, POINTS, TILT, frameScene, groundAt, type Shot } from './internal/camera';
export { FeedingTimeScreen } from './internal/FeedingTimeScreen';
