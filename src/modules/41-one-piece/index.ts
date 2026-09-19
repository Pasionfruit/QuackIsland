/**
 * 41-one-piece - the public contract.
 *
 * Minigame 25. Everybody gets a square picture of their own face cut into six
 * pieces, scattered and turned the wrong way: drag each into the frame, turn
 * it the right way up, and it clicks in. Players place in the order they
 * finish their puzzle.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { OnePieceScreen } from './internal/OnePieceScreen'
import { newGame } from './internal/setup'

registerMinigame('one-piece', {
  newGame: () => newGame(),
  Panel: OnePieceScreen,
})

export {
  COLOURS,
  FULL,
  PIECE,
  PUZZLE,
  TABLE,
  cellOf,
  countPlaced,
  createGame,
  deselect,
  drop,
  finished,
  halfExtent,
  judgeEnd,
  leave,
  lockedMask,
  moveTo,
  newBoard,
  newPlayer,
  place,
  placings,
  planPieces,
  select,
  slotOf,
  solved,
  stepGame,
  timeLeft,
  trySnap,
  turn,
  type Board,
  type Entrant,
  type Game,
  type Piece,
  type Player,
  type Start,
} from './internal/rules'

export { BOT_LOOK, BOT_PIECE, botMask, botPlan, stepBots } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Intent,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { Portrait } from './internal/Portrait'
export { OnePieceScreen } from './internal/OnePieceScreen'
