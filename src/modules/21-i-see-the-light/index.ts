/**
 * 21-i-see-the-light - the public contract.
 *
 * Minigame 17. Red light, green light: mash space on green to step towards the
 * line; on red, stand still and keep the pointer inside a circle that wanders
 * over the view. Space on red, or a pointer out of the circle, and you are out.
 * First to the line wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { ISeeTheLightScreen } from './internal/ISeeTheLightScreen'
import { newRace } from './internal/setup'

registerMinigame('i-see-the-light', {
  newGame: () => newRace(),
  Panel: ISeeTheLightScreen,
})

export {
  COLOURS,
  FRESH,
  LIGHT,
  WHYS,
  checkPointer,
  circleAt,
  countdownAt,
  createRace,
  greenBefore,
  insideCircle,
  lightAt,
  placings,
  pressSpace,
  racing,
  report,
  schedule,
  scheduleFor,
  stepRace,
  type Circle,
  type Colour,
  type Entrant,
  type Phase,
  type Pointer,
  type Race,
  type Racer,
  type Self,
  type Why,
} from './internal/rules'

export { BOT_RATE, BOT_SLIP, botSelf } from './internal/ai'

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

export { FILL, FOV, POINTS, TILT, TRACK, frameScene, laneX, trackZ, type Shot } from './internal/camera'

export { ISeeTheLightScreen } from './internal/ISeeTheLightScreen'
