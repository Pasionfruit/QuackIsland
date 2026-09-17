/**
 * 27-find-yourself - the public contract.
 *
 * Minigame 12. Everybody's face under a cup, the cups shuffled, and everybody
 * picks the cup they think they are under. Three stages, each shuffle faster
 * than the last, worth 1, 2 and 3 points. Most points wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { FindYourselfScreen } from './internal/FindYourselfScreen'
import { newGame } from './internal/setup'

registerMinigame('find-yourself', {
  newGame: () => newGame(),
  Panel: FindYourselfScreen,
})

export {
  COLOURS,
  PHASES,
  TABLE,
  allPicked,
  createGame,
  cupCount,
  cupsAt,
  currentStage,
  dealStage,
  facesBySlot,
  found,
  leave,
  phaseLength,
  pick,
  placings,
  shuffleTime,
  slotX,
  slotsAfter,
  stageFor,
  stepGame,
  type Entrant,
  type Finder,
  type Game,
  type Phase,
  type Stage,
} from './internal/rules'

export { BOT_DECIDES, BOT_TRACKS, botPicks } from './internal/ai'

export { MAX_FINDERS, ME, SOLO_FINDERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  HIDDEN,
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  picksShown,
  type Snapshot,
  type WireFinder,
} from './internal/wire'

export { CUP_HEIGHT, FILL, FOV, LIFT, LIFT_BACK, POINTS, TILT, TOP, frameScene, pickSlot, pointsFor, type Point, type Shot } from './internal/camera'

export { FindYourselfScreen } from './internal/FindYourselfScreen'
