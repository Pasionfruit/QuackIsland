export { COLOURS, PHASES, TOWER, aimAt, createGame, cut, deadlyCount, deadlyLeft, distanceTo, inReach, layWeb, leave, nearestString, placings, rayToSegment, spawns, standing, stepGame, stringCount, walk, webFor, whoseTurn, type Cut, type Cutter, type Entrant, type Game, type Intent, type Last, type Pending, type Phase, type Point3, type Strand, } from './internal/rules';
export { BOT_THINK, botCut, botIntents, botPlan } from './internal/ai';
export { MAX_CUTTERS, ME, SOLO_CUTTERS, gameRoster, myId, newGame, secret, waitingGame, type GameSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type GuestIntent, type Snapshot, type WireCutter, } from './internal/wire';
export { FILL, FOV, POINTS, TILT, frameScene, type Point, type Shot } from './internal/camera';
export { MakeTheCutScreen } from './internal/MakeTheCutScreen';
