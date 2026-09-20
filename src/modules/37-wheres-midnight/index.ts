/**
 * 37-wheres-midnight - the public contract.
 *
 * Minigame 15. A junkyard at night, everybody standing in the same spot with
 * the same view of it, and an all-black cat called Midnight hidden somewhere
 * among the wrecks. Drag to look round, zoom in, and click him. A click on
 * anything else costs a second and a half, so clicking everything is slower
 * than looking. You place in the order everybody finds him.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { newGame } from './internal/setup'
import { WheresMidnightScreen } from './internal/WheresMidnightScreen'

registerMinigame('wheres-midnight', {
  newGame: () => newGame(),
  Panel: WheresMidnightScreen,
})

export {
  COLOURS,
  SEARCH,
  createGame,
  placings,
  select,
  stepGame,
  timeLeft,
  type Entrant,
  type Game,
  type Outcome,
  type Seeker,
  type Select,
} from './internal/rules'

export {
  CLICK_PAD,
  COATS,
  EYE_OFFSET,
  YARD,
  catFeet,
  catParts,
  catShape,
  eyeAt,
  fanPoint,
  inSight,
  layYard,
  look,
  rayBox,
  toward,
  yardFor,
  type Box,
  type Coat,
  type Decoy,
  type Kind,
  type Midnight,
  type Part,
  type Piece,
  type Pose,
  type Seen,
  type Shape,
  type Sphere,
  type Yard,
} from './internal/yard'

export {
  EYE,
  VIEW,
  anglesOf,
  clampView,
  direction,
  magnification,
  pin,
  rayThrough,
  startView,
  wheelFov,
  zoomAt,
  type Vec3,
  type View,
} from './internal/view'

export { BOT_FIND, BOT_NEVER, botClicks, botPlan, type BotClick } from './internal/ai'

export { MAX_SEEKERS, ME, SOLO_SEEKERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Click,
  type Snapshot,
  type WireSeeker,
} from './internal/wire'

export { useSearchNet, type SearchNet } from './internal/useSearchNet'

export { PALETTE, WheresMidnightScene } from './internal/WheresMidnightScene'

export { WheresMidnightScreen } from './internal/WheresMidnightScreen'
