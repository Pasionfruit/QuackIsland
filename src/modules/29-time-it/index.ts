/**
 * 29-time-it - the public contract.
 *
 * Minigame 9. A target time, and a stopwatch everybody can watch for two and a
 * half seconds before it is covered. Click to stop your timer. Over once
 * everybody has stopped, or at thirty seconds; closest to the target wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { TimeItScreen } from './internal/TimeItScreen'
import { newGame } from './internal/setup'

registerMinigame('time-it', {
  newGame: () => newGame(),
  Panel: TimeItScreen,
})

export {
  COLOURS,
  WATCH,
  createGame,
  leave,
  offBy,
  placings,
  showing,
  stepGame,
  stop,
  stopwatch,
  targetFor,
  type Entrant,
  type Game,
  type Timer,
} from './internal/rules'

export { BOT_DRIFT, botStopAt, botStops } from './internal/ai'

export { MAX_TIMERS, ME, SOLO_TIMERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  HIDDEN,
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireTimer,
} from './internal/wire'

export { FILL, FOV, POINTS, STAGE, TILT, frameScene, standX, type Shot } from './internal/camera'

export { Answer, TimeItScreen } from './internal/TimeItScreen'
