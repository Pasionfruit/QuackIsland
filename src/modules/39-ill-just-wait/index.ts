/**
 * 39-ill-just-wait - the public contract.
 *
 * Minigame 24. A race through three clock-reading targets, each said in
 * harder words than the last - "Quarter till 4:05". Your clock starts at
 * 12:00: hold left click to wind it forward, right click to wind it back,
 * Space to confirm. Right moves you on to the next target; wrong puts your
 * clock back to 12:00. Everybody's clock is on show - so you could just wait
 * for somebody to show you. The first to get all three wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { IllJustWaitScreen } from './internal/IllJustWaitScreen'
import { newGame } from './internal/setup'

registerMinigame('ill-just-wait', {
  newGame: () => newGame(),
  Panel: IllJustWaitScreen,
})

export { DIAL, TARGETS, digital, duration, hourOf, numberWord, targetFor, wordedTime, wrap, type Target } from './internal/wording'

export {
  CLOCK,
  COLOURS,
  answerFor,
  confirm,
  createGame,
  finished,
  handAngles,
  lastAt,
  leave,
  newHand,
  placings,
  pointsOf,
  press,
  resetHand,
  setHand,
  stageOf,
  stepGame,
  sweepRate,
  timeLeft,
  turnHand,
  type Entrant,
  type Game,
  type Hand,
  type Player,
  type Verdict,
} from './internal/rules'

export { BOT_READ, BOT_WIND, botMoves, botPace } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Answer,
  type Intent,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { FILL, FOV, POINTS, STAGE, TILT, frameScene, standX, type Shot } from './internal/camera'

export { IllJustWaitScreen } from './internal/IllJustWaitScreen'
