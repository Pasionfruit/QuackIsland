/**
 * 45-binary-bs - the public contract.
 *
 * Minigame 35. Everybody on a side of a giant gear, as many sides as players,
 * with a mark at the top. A number appears; five seconds to vote 0 or 1, in
 * secret. The gear turns the number of sides, one fewer for every 0, and the
 * side it brings to the mark drops away with whoever is on it. A new gear, a
 * new number, until one is left.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { GearScreen } from './internal/GearScreen'
import { newGame } from './internal/setup'

registerMinigame('binary-bs', {
  newGame: () => newGame(),
  Panel: GearScreen,
})

export {
  COLOURS,
  GEAR,
  NUMBERS,
  PHASES,
  ROUND,
  ROUND_LENGTH,
  advance,
  canVote,
  canWalk,
  clampToSide,
  clock,
  createGame,
  dropsAt,
  isIn,
  judgeEnd,
  leave,
  markedSide,
  mod,
  numberFor,
  onSide,
  place,
  placings,
  resultOf,
  seatSpot,
  sideAngle,
  sideOf,
  stepGame,
  tally,
  tick,
  vote,
  voteEnds,
  walk,
  when,
  type Entrant,
  type Game,
  type Phase,
  type Player,
  type Result,
  type When,
} from './internal/rules'

export { BOT, botSteer, wantedVote } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  MOVE_TAG,
  SNAPSHOT_TAG,
  VOTE_TAG,
  applySnapshot,
  decodeMove,
  decodeSnapshot,
  decodeVote,
  encodeMove,
  encodeSnapshot,
  encodeVote,
  type Snapshot,
  type WirePlayer,
  type WireResult,
} from './internal/wire'

export { GearScene, PALETTE, turnAngle } from './internal/GearScene'

export { GearScreen, VOTES, VOTE_SECONDS } from './internal/GearScreen'
