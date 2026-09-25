/**
 * 58-breaking-the-ice - the public contract.
 *
 * Minigame 2 written, catalogue slot "Breaking the Ice". Three layers of
 * breakable ice tiles stacked over the sea. Break the tile under an
 * opponent, or push them toward a hole; crack one under yourself and you
 * still have a moment to get off it. Fall through a layer and you land on
 * the one below rather than going straight out - only the bottom layer, into
 * the sea, eliminates you. The iceberg shrinks and weakens as the round
 * runs on, fastest on the layer nearest the water. Last one standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it
 * exists. Importing this module registers it - one line in the composition
 * root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { IceScreen } from './internal/IceScreen'
import { newRound } from './internal/setup'

registerMinigame('breaking-the-ice', {
  newGame: () => newRound(),
  Panel: IceScreen,
})

export {
  BREAK,
  CELL,
  COLOURS,
  DIM,
  LAYERS,
  MOVE,
  PUSH,
  ROUND,
  TILE_COUNT,
  TILES_PER_LAYER,
  broken,
  cracked,
  createRound,
  createTiles,
  crackTime,
  forward,
  inFootprint,
  placings,
  ringOf,
  ringsGoneAt,
  rightOf,
  shrunk,
  spawns,
  standing,
  stepRound,
  tileAt,
  tileCentre,
  tileIndex,
  timeLeft,
  type Entrant,
  type Intent,
  type Player,
  type Round,
  type Tiles,
} from './internal/rules'

export { BOT_OPENING, botIntent, botIntents } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, myId, newRound, nextSeed, roundRoster, waitingRound, type RoundSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  TILE_TAG,
  applySnapshot,
  applyTiles,
  decodeIntent,
  decodeSnapshot,
  decodeTiles,
  encodeIntent,
  encodeSnapshot,
  encodeTiles,
  sparseDamage,
  type Snapshot,
  type TileSync,
  type WirePlayer,
  type WireTile,
} from './internal/wire'

export { IceScreen } from './internal/IceScreen'
