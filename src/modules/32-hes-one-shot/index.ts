/**
 * 32-hes-one-shot - the public contract.
 *
 * Minigame 14. First person, everybody against everybody, one shot eliminates,
 * with a second and a half between shots. The eliminated keep hunting; the last
 * to be eliminated wins; a minute and fifteen on the clock.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { HesOneShotScreen } from './internal/HesOneShotScreen'
import { newGame } from './internal/setup'

registerMinigame('hes-one-shot', {
  newGame: () => newGame(),
  Panel: HesOneShotScreen,
})

export {
  ARENA,
  arenaFor,
  blocked,
  collide,
  lineClear,
  openPoint,
  rayHit,
  slab,
  slide,
  spawnPoint,
  type Arena,
  type Block,
  type Point,
  type Vec3,
} from './internal/arena'

export {
  BODY,
  CLAIM,
  COLOURS,
  GUN,
  PITCH_LIMIT,
  ROUND,
  SHOT_LIFE,
  aimDirection,
  bodyHit,
  canAct,
  canShoot,
  claim,
  clock,
  cooldownLeft,
  createGame,
  eliminate,
  eyeOf,
  fire,
  isHunter,
  isStanding,
  judgeEnd,
  leave,
  look,
  placings,
  report,
  stepGame,
  tick,
  trace,
  walk,
  wrapAngle,
  type Claim,
  type Entrant,
  type Game,
  type Player,
  type Shot,
} from './internal/rules'

export { BOT, botSteer, sightedBy, yawTowards } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  MOVE_TAG,
  SHOT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeMove,
  decodeShot,
  decodeSnapshot,
  encodeMove,
  encodeShot,
  encodeSnapshot,
  type Snapshot,
  type WirePlayer,
  type WireShot,
} from './internal/wire'

export { GUN_AT, GUN_SCALE, HesOneShotScene, PALETTE, type LookRef } from './internal/HesOneShotScene'

export { HesOneShotScreen, SENSITIVITY } from './internal/HesOneShotScreen'
