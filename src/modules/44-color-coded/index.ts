/**
 * 44-color-coded - the public contract.
 *
 * Minigame 34. Everybody on a grid of colour panels floating over nothing. A
 * giant wheel spins and lands on a colour: two seconds to get onto a panel of
 * it, shoving anybody in the way. Then every other panel drops, and whoever is
 * on one falls and is out. The panels rebuild, fewer of the colour each round.
 * Last one standing wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { ColorScreen } from './internal/ColorScreen'
import { newGame } from './internal/setup'

registerMinigame('color-coded', {
  newGame: () => newGame(),
  Panel: ColorScreen,
})

export {
  GRID,
  HALF,
  PANEL_COLOURS,
  PANEL_NAMES,
  PHASES,
  ROUND_LENGTH,
  VIABLE,
  dealFor,
  panelAt,
  panelCentre,
  panelColour,
  panelLift,
  solid,
  spawnPoint,
  viable,
  wheelAngle,
  when,
  type Deal,
  type Phase,
  type When,
} from './internal/arena'

export {
  BODY,
  COLOURS,
  PUSH,
  ROUND,
  canAct,
  clock,
  cooldownLeft,
  createGame,
  edgeRoom,
  facing,
  isStanding,
  judgeEnd,
  leave,
  move,
  placings,
  push,
  roundOf,
  steer,
  stepGame,
  supported,
  tick,
  wrapAngle,
  yawTowards,
  type Entrant,
  type Game,
  type Player,
} from './internal/rules'

export { BOT, bestPanel, botSteer } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WirePlayer } from './internal/wire'

export { CAMERA_BACK, ColorScene, PALETTE, PITCH, WHEEL_AT, type LookRef } from './internal/ColorScene'

export { ColorScreen, SENSITIVITY, walkFor } from './internal/ColorScreen'
