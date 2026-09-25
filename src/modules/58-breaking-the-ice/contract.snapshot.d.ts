export { BREAK, CELL, COLOURS, DIM, LAYERS, MOVE, PUSH, ROUND, TILE_COUNT, TILES_PER_LAYER, broken, cracked, createRound, createTiles, crackTime, forward, inFootprint, placings, ringOf, ringsGoneAt, rightOf, shrunk, spawns, standing, stepRound, tileAt, tileCentre, tileIndex, timeLeft, type Entrant, type Intent, type Player, type Round, type Tiles, } from './internal/rules';
export { BOT_OPENING, botIntent, botIntents } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, myId, newRound, nextSeed, roundRoster, waitingRound, type RoundSetup } from './internal/setup';
export { INTENT_TAG, SNAPSHOT_TAG, TILE_TAG, applySnapshot, applyTiles, decodeIntent, decodeSnapshot, decodeTiles, encodeIntent, encodeSnapshot, encodeTiles, sparseDamage, type Snapshot, type TileSync, type WirePlayer, type WireTile, } from './internal/wire';
export { IceScreen } from './internal/IceScreen';
