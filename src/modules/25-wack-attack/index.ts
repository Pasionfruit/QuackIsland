/**
 * 25-wack-attack - the public contract.
 *
 * Minigame 10. A fenced field with sixteen holes and everybody walking about it
 * with a hammer. Moles pop out; walk over and swing. An ordinary mole is a
 * point, the golden mole is five and does not stay up long. Most points when the
 * minute is up wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { WackAttackScreen } from './internal/WackAttackScreen'
import { newGame } from './internal/setup'

registerMinigame('wack-attack', {
  newGame: () => newGame(),
  Panel: WackAttackScreen,
})

export {
  COLOURS,
  FIELD,
  HOLES,
  canSwing,
  createGame,
  holeAt,
  isUp,
  molesFor,
  placings,
  schedule,
  spawns,
  stepGame,
  strikePoint,
  swing,
  timeLeft,
  walk,
  whackOf,
  type Entrant,
  type Game,
  type Intent,
  type Mole,
  type Point,
  type Whack,
  type Whacker,
} from './internal/rules'

export { BOT_IGNORES, BOT_REACTION, botIntents, botTarget } from './internal/ai'

export { MAX_WHACKERS, ME, SOLO_WHACKERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  RECENT,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireWhacker,
} from './internal/wire'

export { FILL, FOV, POINTS, TILT, frameScene, type Shot } from './internal/camera'

export { WackAttackScreen } from './internal/WackAttackScreen'
