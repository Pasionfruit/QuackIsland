/**
 * 24-make-the-cut - the public contract.
 *
 * Minigame 13. A tower in a web of strings: three for every player, and one
 * eliminating string fewer than players. A random player cuts first and the
 * turn passes round. Walk to a string, aim, cut: a normal one, nothing; an
 * eliminating one, you are launched off the tower. Last one standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { MakeTheCutScreen } from './internal/MakeTheCutScreen'
import { newGame } from './internal/setup'

registerMinigame('make-the-cut', {
  newGame: () => newGame(),
  Panel: MakeTheCutScreen,
})

export {
  COLOURS,
  PHASES,
  TOWER,
  aimAt,
  createGame,
  cut,
  deadlyCount,
  deadlyLeft,
  distanceTo,
  inReach,
  layWeb,
  leave,
  nearestString,
  placings,
  rayToSegment,
  spawns,
  standing,
  stepGame,
  stringCount,
  walk,
  webFor,
  whoseTurn,
  type Cut,
  type Cutter,
  type Entrant,
  type Game,
  type Intent,
  type Last,
  type Phase,
  type Point3,
  type Strand,
} from './internal/rules'

export { BOT_THINK, botCut, botIntents, botPlan } from './internal/ai'

export { MAX_CUTTERS, ME, SOLO_CUTTERS, gameRoster, myId, newGame, secret, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type GuestIntent,
  type Snapshot,
  type WireCutter,
} from './internal/wire'

export { FILL, FOV, POINTS, TILT, frameScene, type Point, type Shot } from './internal/camera'

export { MakeTheCutScreen } from './internal/MakeTheCutScreen'
