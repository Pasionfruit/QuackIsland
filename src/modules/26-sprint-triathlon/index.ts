/**
 * 26-sprint-triathlon - the public contract.
 *
 * Minigame 7. Three legs, back to back: swim by clicking as fast as you can,
 * bike by hammering space, run by typing the sentence on the screen - a wrong
 * key trips you up. Your time over all three is your race time; fastest wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { TriathlonScreen } from './internal/TriathlonScreen'
import { newRace } from './internal/setup'

registerMinigame('sprint-triathlon', {
  newGame: () => newRace(),
  Panel: TriathlonScreen,
})

export {
  COLOURS,
  COURSE,
  FRESH,
  SENTENCES,
  click,
  createRace,
  leave,
  legOf,
  pedal,
  placings,
  progressOf,
  raceClock,
  report,
  sentenceFor,
  stepRace,
  timeOf,
  type,
  type Entrant,
  type Leg,
  type Race,
  type Racer,
  type Self,
} from './internal/rules'

export { BOT_MASH, BOT_MISTAKES, BOT_TYPE, botSelf } from './internal/ai'

export { MAX_RACERS, ME, SOLO_RACERS, myId, newRace, nextSeed, raceRoster, waitingRace, type RaceSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireRacer,
} from './internal/wire'

export { FILL, FINISH_X, FOV, POINTS, START_X, TILT, TRACK, courseX, frameScene, laneZ, type Shot } from './internal/camera'

export { TriathlonScreen } from './internal/TriathlonScreen'
