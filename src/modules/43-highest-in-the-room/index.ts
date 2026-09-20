/**
 * 43-highest-in-the-room - the public contract.
 *
 * Minigame 33. Everybody on a tower of their own: press the arrow on the
 * screen and another block goes in under you; press the wrong one and you are
 * knocked down four. Ten blocks behind whoever is highest and you are out. The
 * last one left wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { TowerScreen } from './internal/TowerScreen'
import { newGame } from './internal/setup'

registerMinigame('highest-in-the-room', {
  newGame: () => newGame(),
  Panel: TowerScreen,
})

export {
  ARROWS,
  CLIMB,
  COLOURS,
  ROUND,
  arrowAt,
  arrowFor,
  nextArrowFor,
  behind,
  canPress,
  clock,
  createGame,
  isIn,
  judgeEnd,
  knockOut,
  leader,
  leaderHeight,
  leave,
  placings,
  press,
  stepGame,
  tick,
  type Arrow,
  type Entrant,
  type Game,
  type Player,
} from './internal/rules'

export { BOT, botSteer } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { PRESS_TAG, SNAPSHOT_TAG, applySnapshot, decodePress, decodeSnapshot, encodePress, encodeSnapshot, type Snapshot, type WirePlayer } from './internal/wire'

export { BLOCK, PALETTE, SPACING, TowerScene, towerX } from './internal/TowerScene'

export { ArrowTrack, GLYPHS, KEYCAPS, KEYS, TowerScreen } from './internal/TowerScreen'
