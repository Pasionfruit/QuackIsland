/**
 * 48-spidy-senses - the public contract.
 *
 * Minigame 44. A game of chicken round a trapdoor with a spider's nest under
 * it: everybody creeps in, and a click stops you where you stand. At a random
 * moment the trapdoor springs - a fraction of a second to click, or the spider
 * jumps out at you. If nobody is too late, it takes whoever stopped furthest
 * back. The last one left wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { NestScreen } from './internal/NestScreen'
import { newGame } from './internal/setup'

registerMinigame('spidy-senses', {
  newGame: () => newGame(),
  Panel: NestScreen,
})

export { CELLAR, MAX_ROUNDS, TIMING, rattle, scheduleFor, spawnPoint, sprung, when, windowFor, type Phase, type Round, type When } from './internal/nest'

export {
  BODY,
  COLOURS,
  LEVEL,
  STOP_SLACK,
  advanceRounds,
  canCreep,
  createGame,
  creep,
  distance,
  inTime,
  isStanding,
  judge,
  judgeEnd,
  leave,
  move,
  offMoment,
  placings,
  roundNow,
  startRound,
  steer,
  stepGame,
  stop,
  tick,
  victims,
  type Entrant,
  type Game,
  type How,
  type Player,
} from './internal/rules'

export { BOT, botSteer } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WirePlayer } from './internal/wire'

export { DRAG, LEAP, NestScene, PALETTE } from './internal/NestScene'

export { JumpScare, NestScreen, SCARE, SCARE_GIF } from './internal/NestScreen'
