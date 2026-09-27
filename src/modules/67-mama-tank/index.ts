/**
 * 67-mama-tank - the public contract.
 *
 * Minigame 43, one-vs-all. One player drives Mama Tank, a giant tank that
 * starts on a hill at the middle of the field; everybody else drives a mini
 * tank, attacking from below. Both roles share the same controls - WASD,
 * mouse, left click - and both can shoot: Mama Tank's cannon one-shots a
 * mini tank, or eliminates one by driving over it. The mini tanks win as a
 * team the instant their combined hits on Mama Tank reach twice the player
 * count; otherwise - every mini tank eliminated, or the clock running out
 * first - Mama Tank wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it
 * exists. Importing this module registers it - one line in the composition
 * root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { MamaScreen } from './internal/MamaScreen'
import { newRound } from './internal/setup'

registerMinigame('mama-tank', {
  newGame: () => newRound(),
  Panel: MamaScreen,
})

export { FIELD, SPAWN_ROOM, arenaFor, blocked, collide, hillHeightAt, lineClear, mamaSpawn, miniSpawn, openPoint, rayHit, slab, slide, type Arena, type Block, type Point, type Vec3 } from './internal/arena'

export {
  CLAIM,
  COLOURS,
  MAMA,
  MINI,
  PITCH_LIMIT,
  ROUND,
  RUNOVER,
  aimDirection,
  bodyHit,
  canAct,
  canShoot,
  claim,
  cooldownLeft,
  createRound,
  eyeOf,
  fire,
  isLegalTarget,
  isStanding,
  judgeEnd,
  leave,
  look,
  mamaOf,
  minisOf,
  report,
  resolveMama,
  runOver,
  runsOver,
  stepRound,
  summarize,
  tick,
  trace,
  walk,
  wrapAngle,
  type Claim,
  type Entrant,
  type Intent,
  type Player,
  type Role,
  type Round,
  type Shot,
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

export { MamaScene, PALETTE, PITCH, type LookRef } from './internal/MamaScene'

export { MamaScreen, SENSITIVITY } from './internal/MamaScreen'
