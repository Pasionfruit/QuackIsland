/**
 * 42-i-just-work-here - the public contract.
 *
 * Minigame 32. An office, seen from above, everybody against everybody. Find
 * the four pieces of your bazooka, carry them back to your desk one at a time,
 * and once it is whole, fire. A blast takes anybody near it - you as well, if
 * you fire at a wall you are standing next to. Last one standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { OfficeScreen } from './internal/OfficeScreen'
import { newGame } from './internal/setup'

registerMinigame('i-just-work-here', {
  newGame: () => newGame(),
  Panel: OfficeScreen,
})

export {
  DESKS,
  OFFICE,
  blocked,
  cast,
  collide,
  deskSlots,
  distanceTo,
  gapBetween,
  lineClear,
  navFor,
  officeFor,
  openPoint,
  route,
  slide,
  walkClear,
  type Block,
  type Desk,
  type Kind,
  type Nav,
  type Office,
  type Point,
} from './internal/office'

export {
  BLAST,
  BLAST_LIFE,
  BODY,
  CARRIED,
  CLAIM,
  COLOURS,
  LOOSE,
  PARTS,
  PIECES_EACH,
  PLACED,
  REACH,
  ROCKET,
  ROUND,
  act,
  aim,
  aimDirection,
  atDesk,
  canAct,
  canFire,
  claimAct,
  claimFire,
  clock,
  coastRockets,
  cooldownLeft,
  createGame,
  deskOf,
  deskSpot,
  drop,
  eliminate,
  explode,
  fire,
  flyRockets,
  isArmed,
  isStanding,
  judgeEnd,
  leave,
  pickUp,
  pieceInReach,
  piecesOf,
  place,
  placedCount,
  placings,
  report,
  rocketTouch,
  scatter,
  stepGame,
  tick,
  walk,
  wrapAngle,
  yawTowards,
  type Blast,
  type Entrant,
  type FireClaim,
  type Game,
  type Piece,
  type PieceState,
  type Player,
  type Rocket,
} from './internal/rules'

export { BOT, botSteer, sightedBy, wouldHitSelf } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  ACT_TAG,
  MOVE_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeAct,
  decodeMove,
  decodeSnapshot,
  encodeAct,
  encodeMove,
  encodeSnapshot,
  type Act,
  type ActKind,
  type Snapshot,
  type WireBlast,
  type WirePiece,
  type WirePlayer,
  type WireRocket,
} from './internal/wire'

export { CAMERA_OVER, OfficeScene, PALETTE, ROCKET_Y, type AimRef } from './internal/OfficeScene'

export { OfficeScreen } from './internal/OfficeScreen'
