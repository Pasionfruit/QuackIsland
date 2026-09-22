export { COLOURS, FIELD, HOLES, canSwing, createGame, holeAt, isUp, molesFor, placings, schedule, spawns, stepGame, strikePoint, swing, timeLeft, walk, whackOf, type Entrant, type Game, type Intent, type Mole, type Point, type Whack, type Whacker, } from './internal/rules';
export { BOT_IGNORES, BOT_REACTION, botIntents, botTarget } from './internal/ai';
export { MAX_WHACKERS, ME, SOLO_WHACKERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, RECENT, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot, type WireWhacker, } from './internal/wire';
export { FILL, FOV, POINTS, TILT, frameScene, type Shot } from './internal/camera';
export { WackAttackScreen } from './internal/WackAttackScreen';
