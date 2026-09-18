/**
 * 19-duck-hunt - the public contract.
 *
 * Minigame 4. A minute of balloons rising round an arena, each wearing a
 * player's colour and shape. Shoot your own; leave everybody else's. A second
 * and a half between shots, hit or miss. Most of your own popped wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { DuckHuntScreen } from './internal/DuckHuntScreen'
import { newGame } from './internal/setup'

registerMinigame('duck-hunt', {
  newGame: () => newGame(),
  Panel: DuckHuntScreen,
})

export {
  AIM_PLANE_Z,
  ARENA,
  BOUNDS,
  COLOURS,
  EMBLEMS,
  aimAt,
  balloonAt,
  lifetime,
  pickBalloon,
  schedule,
  shootable,
  type Balloon,
  type Emblem,
  type Point,
} from './internal/arena'

export {
  balloonsFor,
  createGame,
  fire,
  placings,
  ready,
  stepGame,
  timeLeft,
  type Entrant,
  type Fire,
  type Game,
  type Shooter,
  type Shot,
} from './internal/game'

export { BOT_ACCURACY, BOT_AIM, botAim, botShot, botShots } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  AIM_TAG,
  SHOT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeAim,
  decodeShot,
  decodeSnapshot,
  encodeAim,
  encodeShot,
  encodeSnapshot,
  type ShotMessage,
  type Snapshot,
  type WirePlayer,
  type WireShot,
} from './internal/wire'

export { FILL, FOV, TILT, frameScene, type Shot as CameraShot } from './internal/camera'

export { DuckHuntScreen, EmblemIcon } from './internal/DuckHuntScreen'
