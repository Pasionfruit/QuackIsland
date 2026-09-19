/**
 * 49-needs-a-walmart - the public contract.
 *
 * Minigame 45, OG Black Friday. Everybody sprints round a
 * supermarket with a trolley and a grocery list of three of the ten things it
 * sells. Grab yours, put back what you don't need, ram the others to knock
 * theirs out, and get through a checkout first.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { StoreScreen } from './internal/StoreScreen'
import { newGame } from './internal/setup'

registerMinigame('needs-a-walmart', {
  newGame: () => newGame(),
  Panel: StoreScreen,
})

export {
  COUNTERS,
  GRID,
  ITEMS,
  LANES,
  LIST_SIZE,
  SHELVES,
  SLOTS,
  SOLIDS,
  STORE,
  blocked,
  cellMiddle,
  cellOf,
  collide,
  downhill,
  floorSpot,
  freeCell,
  inLane,
  inRect,
  listsFor,
  spawnPoint,
  stockFor,
  walkField,
  type Rect,
  type Slot,
  type Stocked,
} from './internal/store'

export {
  BODY,
  CART,
  COLOURS,
  RAM,
  ROUND,
  canAct,
  click,
  createGame,
  firstDone,
  freshItems,
  gotten,
  isShopping,
  judgeEnd,
  leave,
  move,
  placings,
  ram,
  ramLeft,
  ramming,
  landing,
  reachable,
  steer,
  stepGame,
  stillNeeds,
  stunned,
  tick,
  toPutBack,
  toTill,
  wrapAngle,
  type Entrant,
  type Game,
  type Item,
  type Player,
} from './internal/rules'

export { BOT, botSteer, fieldTo, goalFor } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WireItem, type WirePlayer } from './internal/wire'

export { PALETTE, StoreScene, type CartSpot } from './internal/StoreScene'

export { StoreScreen } from './internal/StoreScreen'
