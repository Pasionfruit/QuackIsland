/**
 * 36-musical-mayhem - the public contract.
 *
 * Minigame 23. Musical chairs, with pushing. A ring of chairs one fewer than the
 * players still in; everybody runs round while the music plays and sits the
 * moment it stops. Anybody can shove whoever is in front of them - off their
 * chair, if they have not been sitting a whole second. Whoever is left standing
 * is out, a chair goes, and it runs again until one player is left.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { MusicalMayhemScreen } from './internal/MusicalMayhemScreen'
import { newGame } from './internal/setup'

registerMinigame('musical-mayhem', {
  newGame: () => newGame(),
  Panel: MusicalMayhemScreen,
})

export {
  BODY,
  CHAIR,
  COLOURS,
  FLOOR,
  PUSH,
  ROUND,
  advance,
  canAct,
  chairAt,
  chairInReach,
  createGame,
  isIn,
  isSafe,
  leave,
  musicFor,
  phase,
  phaseTime,
  placings,
  push,
  ringRadius,
  sit,
  sitter,
  startAt,
  stepGame,
  tick,
  type Entrant,
  type Game,
  type Hands,
  type Phase,
  type Player,
} from './internal/rules'

export { BOT, botPlay } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameId, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  HANDS_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeHands,
  decodeSnapshot,
  encodeHands,
  encodeSnapshot,
  type HandsMessage,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { BASS, MELODY, TEMPO, createTune, frequency, stepNotes, type Tune } from './internal/tune'

export { FILL, FOV, POINTS, TILT, cameraFor } from './internal/camera'

export { useMayhemNet, type MayhemNet, type Press } from './internal/useMayhemNet'

export { MusicalMayhemScene, PALETTE } from './internal/MusicalMayhemScene'

export { MusicalMayhemScreen } from './internal/MusicalMayhemScreen'
