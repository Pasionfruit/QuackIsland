export { ARENA, COLOURS, canBoost, canTake, createRound, holderOf, placings, points, rocksFor, spawns, stepRound, timeLeft, type Entrant, type Intent, type Point, type Rock, type Round, type Wearer, } from './internal/rules';
export { botIntent, botIntents } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, myId, newRound, nextSeed, roundRoster, waitingRound, type RoundSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot, type WirePlayer, } from './internal/wire';
export { BOUNDS, FILL, FOV, TILT, frameScene, type Shot } from './internal/camera';
export { SharingIsCaringScreen } from './internal/SharingIsCaringScreen';
