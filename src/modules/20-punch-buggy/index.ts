/**
 * 20-punch-buggy - the public contract.
 *
 * Minigame 8. A floating platform and everybody on it with a fist that comes
 * off: click to shoot it out, click again to pull it back. A fist that reaches
 * somebody on its way out knocks them out of the round; an arm that is out
 * shoves, and a shove off the edge is out too. Thirty seconds, last one standing.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { PunchBuggyScreen } from './internal/PunchBuggyScreen'
import { newRound } from './internal/setup'

registerMinigame('punch-buggy', {
  newGame: () => newRound(),
  Panel: PunchBuggyScreen,
})

export {
  COLOURS,
  PUNCHES,
  RING,
  click,
  createRound,
  fistAt,
  placings,
  spawns,
  standing,
  stepRound,
  timeLeft,
  type Entrant,
  type Fighter,
  type Intent,
  type Out,
  type Point,
  type Punch,
  type Round,
} from './internal/rules'

export { BOT_OPENING, botIntent, botIntents } from './internal/ai'

export { MAX_FIGHTERS, ME, SOLO_FIGHTERS, myId, newRound, nextSeed, roundRoster, waitingRound, type RoundSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireFighter,
} from './internal/wire'

export { BOUNDS, FILL, FOV, TILT, frameScene, type Shot } from './internal/camera'

export { PunchBuggyScreen } from './internal/PunchBuggyScreen'
