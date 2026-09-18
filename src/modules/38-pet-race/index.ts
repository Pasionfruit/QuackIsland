/**
 * 38-pet-race - the public contract.
 *
 * Minigame 5. Ten seconds to read five pets' numbers and take one - dog, cat,
 * rabbit, hamster or fish - then three, two, one, and thirty seconds to race
 * two hundred metres of hedges, puddles and treats. Hold the button to boost
 * and the tank empties a second a second; let go and it fills again at whatever
 * rate your animal regrows at. Anybody who does not choose gets the fish, and
 * the fish flops on the line for the whole race.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { PetRaceScreen } from './internal/PetRaceScreen'
import { newGame } from './internal/setup'

registerMinigame('pet-race', {
  newGame: () => newGame(),
  Panel: PetRaceScreen,
  // Ten seconds of choosing come first, and it is the race that gets counted
  // in - so the screen lifts the black and leaves the three-two-one to us.
  ownCountdown: true,
})

export { DEFAULT_PET, PETS, canRun, isPetId, petAt, petBars, petById, petIndex, type Pet, type PetId } from './internal/pets'

export {
  BAND,
  FINISH_Z,
  HEDGE,
  PUDDLE,
  TRACK,
  TREAT,
  clearOf,
  courseFor,
  dragAt,
  layCourse,
  lineAt,
  progressOf,
  startAt,
  type Band,
  type Course,
  type Hedge,
  type Puddle,
  type Treat,
} from './internal/course'

export {
  COLOURS,
  NO_HANDS,
  RACE,
  advance,
  allChosen,
  allHome,
  choose,
  createGame,
  hasTaken,
  isIn,
  leave,
  petOf,
  phase,
  phaseTime,
  placings,
  progress,
  stepGame,
  tankOf,
  tick,
  timeLeft,
  type Entrant,
  type Game,
  type Hands,
  type Phase,
  type Racer,
} from './internal/rules'

export { BOT, botChoose, botDrive, botPet } from './internal/ai'

export { MAX_RACERS, ME, SOLO_RACERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

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
  type WireRacer,
} from './internal/wire'

export { AHEAD, BACK, BOUNDS, FOG, FOV, HEIGHT, LEAN, atTheLine, chase, type Shot } from './internal/camera'

export { buildPet, disposePet, type PetRig } from './internal/models'

export { useRaceNet, type Press, type RaceNet } from './internal/useRaceNet'

export { PALETTE, PetRaceScene } from './internal/PetRaceScene'

export { PetRaceScreen } from './internal/PetRaceScreen'
