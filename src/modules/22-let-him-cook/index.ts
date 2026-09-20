/**
 * 22-let-him-cook - the public contract.
 *
 * Minigame 16. Watch the chef cook from six baskets of ingredients - three of
 * each - and remember what went in, and in what order. The baskets rotate round
 * the counter. Then, in a random turn order, take an item from a basket and toss
 * it in the pot: anything but the ingredient the recipe is up to and you are
 * out; the right one, and you go to the back of the line. Last cook standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { LetHimCookScreen } from './internal/LetHimCookScreen'
import { newGame } from './internal/setup'

registerMinigame('let-him-cook', {
  newGame: () => newGame(),
  Panel: LetHimCookScreen,
})

export {
  COLOURS,
  INGREDIENTS,
  KINDS,
  KITCHEN,
  PHASES,
  WHYS,
  claimedOf,
  cookTime,
  createGame,
  dealRecipe,
  dueIndex,
  dueKind,
  fastForwarding,
  leave,
  pick,
  pace,
  pickTime,
  placings,
  recipeOrder,
  recipeSize,
  rotation,
  stepGame,
  stillIn,
  turnTime,
  unclaimed,
  whoseTurn,
  type Cook,
  type Entrant,
  type Game,
  type Phase,
  type Pick,
  type Recipe,
  type Why,
} from './internal/rules'

export { BOT_FORGETS, BOT_MEMORY, BOT_THINK, botMove, remembered } from './internal/ai'

export { MAX_COOKS, ME, SOLO_COOKS, gameRoster, myId, newGame, secret, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  LOOKAHEAD,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  shownPicks,
  type Snapshot,
  type WireCook,
} from './internal/wire'

export { FILL, FOV, LAYOUT, LOOP, POINTS, POT, TILT, basketAt, chipAt, frameScene, itemAt, pickBasket, type Point, type Shot } from './internal/camera'

export { LetHimCookScreen } from './internal/LetHimCookScreen'
