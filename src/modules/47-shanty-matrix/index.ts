/**
 * 47-shanty-matrix - the public contract.
 *
 * Minigame 43. Everybody on the main deck of a pirate ship, under a barrage:
 * giant cannonballs fly across the deck from every direction at every speed,
 * each one's lane lit red a second before it arrives. Dodge them, and shove the
 * others into their way. Anybody a ball touches goes overboard, and is out.
 * Last one standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { DeckScreen } from './internal/DeckScreen'
import { newGame } from './internal/setup'

registerMinigame('shanty-matrix', {
  newGame: () => newGame(),
  Panel: DeckScreen,
})

export {
  DECK,
  LIMIT,
  SHOT,
  activeShots,
  alongLine,
  ballAt,
  barrageFor,
  crossing,
  fierceness,
  lifetime,
  offLine,
  spawnPoint,
  volleySize,
  type Ball,
  type Shot,
} from './internal/deck'

export {
  BODY,
  COLOURS,
  PUSH,
  ROUND,
  canAct,
  clock,
  cooldownLeft,
  createGame,
  face,
  hitRange,
  isStanding,
  judgeEnd,
  leave,
  move,
  placings,
  push,
  steer,
  stepGame,
  tick,
  wrapAngle,
  yawTowards,
  type Entrant,
  type Game,
  type Player,
} from './internal/rules'

export { BOT, bestWay, botSteer, danger } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WirePlayer } from './internal/wire'

export { DeckScene, PALETTE, SEA_Y } from './internal/DeckScene'

export { DeckScreen, inALane } from './internal/DeckScreen'
