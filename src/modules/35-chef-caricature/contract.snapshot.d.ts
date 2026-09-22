export { OUTLINE_NAMES, SIZE, SPACING, outlineFor, outlineNamed, pointAlong, toOutline, toSegment, type Outline, type Pt } from './internal/outlines';
export { COLOURS, TRACE, TURN, coverage, createGame, currentOutline, drawer, enclosed, leave, longestGap, penDown, penMove, penUp, phase, placings, stepGame, tick, tidiness, timeLeft, turnOrder, type Entrant, type Game, type Phase, type Player, type Stroke, } from './internal/rules';
export { BOT, botDraw, botPlan } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { INK_TAG, MAX_POINTS, SNAPSHOT_TAG, applyInk, applySnapshot, decodeInk, decodeSnapshot, encodeInk, encodeSnapshot, type Ink, type Snapshot, type WirePlayer, } from './internal/wire';
export { BOARD, CHEF, DUCK, FILL, FOV, POINTS, boardPoint, boardToScreen, cameraFor, frameScene, type Shot } from './internal/camera';
export { ChefCaricatureScene, PALETTE } from './internal/ChefCaricatureScene';
export { ChefCaricatureScreen } from './internal/ChefCaricatureScreen';
