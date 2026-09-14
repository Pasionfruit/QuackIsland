/**
 * 14-garden - the public contract.
 *
 * **Garden Goofs**: the lobby for it, the menu that opens when a round starts,
 * and the six-by-nine lawn it is played on. A 2D game, drawn in the DOM over
 * the world rather than in it.
 *
 * Animals defend the lawn - duck, frog, rabbit, turtle - and pests come for
 * it: worm, beetle, snail, ant, grasshopper, bee, spider, moth. Seeds are one
 * pot shared by the whole party.
 *
 * **There is no game in here.** Three ways to play, chosen by the host; a hand
 * chosen by each player; a board, drawn. Nothing is planted, nothing walks in,
 * nothing is eaten and nothing is scored. When that is built it goes here, on
 * top of these pieces, with pill bodies - see the note in `13-modes`.
 */

export {
  DEFAULT_GARDEN_MODE,
  GARDEN_MODES,
  gardenModeById,
  isGardenMode,
  needsPlayers,
  type GardenMode,
  type GardenModeInfo,
} from './internal/modes'

export {
  GRID,
  cellAt,
  cellIndex,
  cellCount,
  entryCol,
  everyCell,
  houseCol,
  inGrid,
  isLight,
  laneProgress,
  type Cell,
} from './internal/grid'

export {
  DEFENDERS,
  Defender,
  GardenPiece,
  PESTS,
  Pest,
  defenderById,
  isDefenderId,
  isPestId,
  pestById,
  type DefenderId,
  type DefenderSpecies,
  type PestId,
  type PestSpecies,
  type Species,
} from './internal/pieces'

export {
  GOOFS,
  canAfford,
  cheapestCost,
  decodeGoofs,
  encodeGoofs,
  everyoneHasPicked,
  gardenPhase,
  handIsFull,
  validHand,
  waitingToPick,
  type GardenPhase,
  type GoofsMessage,
  type Hands,
} from './internal/goofs'

export {
  ME,
  announceGardenMode,
  announceGoofs,
  changeSeeds,
  chooseGardenMode,
  clearHands,
  forgetPicker,
  getGardenMode,
  getGoofs,
  listenForGardenModes,
  listenForGoofs,
  myHand,
  pickHand,
  resetGardenMode,
  resetSeeds,
  useGardenMode,
  useGoofs,
  useGoofsSync,
  type GoofsState,
} from './internal/state'

export { GardenScreen } from './internal/GardenScreen'
