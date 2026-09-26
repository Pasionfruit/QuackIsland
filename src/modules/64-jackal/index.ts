/**
 * 64-jackal - the public contract.
 *
 * Minigame 41, one-vs-all. One player is the Sniper, alone on a tower with a
 * laser-sighted rifle; everybody else is a Runner, rushing the tower through
 * cover. The Sniper wins by eliminating every runner; the Runners win the
 * instant one of them reaches the base.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { JackalScreen } from './internal/JackalScreen'
import { newRound } from './internal/setup'

registerMinigame('jackal', {
  newGame: () => newRound(),
  Panel: JackalScreen,
})

export {
  FIELD,
  SPAWN_Z,
  TOWER_Z,
  arenaFor,
  atBase,
  blocked,
  clampToPlatform,
  collide,
  lineClear,
  openPoint,
  advancePoint,
  rayHit,
  runnerSpawn,
  slab,
  slide,
  sniperSpawn,
  type Arena,
  type Block,
  type CoverKind,
  type Point,
  type Vec3,
} from './internal/arena'

export {
  BODY,
  CLAIM,
  COLOURS,
  GUN,
  INVULN,
  JUMP,
  LIVES_START,
  PITCH_LIMIT,
  ROUND,
  RUNNER,
  SNIPER,
  aimDirection,
  bodyHit,
  canAct,
  canShoot,
  claim,
  cooldownLeft,
  createRound,
  eyeOf,
  fire,
  isStanding,
  judgeEnd,
  laserOf,
  leave,
  look,
  magazineSize,
  moveSniper,
  reloading,
  report,
  resolveSniper,
  runnersOf,
  sniperOf,
  stepRound,
  summarize,
  tick,
  toggleScope,
  trace,
  walkRunner,
  wrapAngle,
  type Claim,
  type Entrant,
  type Player,
  type Role,
  type Round,
  type RunnerIntent,
  type SniperIntent,
} from './internal/rules'

export { BOT, botSteer } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newRound, nextSeed, waitingRound, type RoundSetup } from './internal/setup'

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
  type MoveOut,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { HIT_FLASH, JackalScene, PALETTE, PITCH, type LookRef } from './internal/JackalScene'

export { JackalScreen, SENSITIVITY } from './internal/JackalScreen'
