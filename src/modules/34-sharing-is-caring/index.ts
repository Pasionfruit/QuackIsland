/**
 * 34-sharing-is-caring - the public contract.
 *
 * Minigame 20. A crown sits in the middle of a walled arena. Walk into it and it
 * is yours, and you score a point a second for as long as you wear it. Anybody
 * who bumps into you takes it. After a minute, the most points wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { SharingIsCaringScreen } from './internal/SharingIsCaringScreen'
import { newRound } from './internal/setup'

registerMinigame('sharing-is-caring', {
  newGame: () => newRound(),
  Panel: SharingIsCaringScreen,
})

export {
  ARENA,
  COLOURS,
  canTake,
  createRound,
  holderOf,
  placings,
  points,
  spawns,
  stepRound,
  timeLeft,
  type Entrant,
  type Intent,
  type Point,
  type Round,
  type Wearer,
} from './internal/rules'

export { botIntent, botIntents } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, myId, newRound, nextSeed, roundRoster, waitingRound, type RoundSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { BOUNDS, FILL, FOV, TILT, frameScene, type Shot } from './internal/camera'

export { SharingIsCaringScreen } from './internal/SharingIsCaringScreen'
