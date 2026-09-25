/**
 * 61-op-finder - the public contract.
 *
 * Minigame 3 written, catalogue slot "OP Finder". Everybody races through
 * the same seeded sequence of ten CAPTCHA-style challenges - matching
 * images, warped text, the odd one out, what-comes-next, checkbox rules,
 * counting icons - first to clear all ten wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it
 * exists. Importing this module registers it - one line in the composition
 * root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { OpFinderScreen } from './internal/OpFinderScreen'
import { newRound } from './internal/setup'

registerMinigame('op-finder', {
  newGame: () => newRound(),
  Panel: OpFinderScreen,
})

export {
  ANSWER,
  CATEGORIES,
  COLOURS,
  KINDS,
  ROUND,
  STAGE_COUNT,
  THINGS,
  answer,
  challengeFor,
  checkGuess,
  createRound,
  placings,
  stepRound,
  timeLeft,
  type Challenge,
  type CheckboxesChallenge,
  type CountChallenge,
  type Entrant,
  type Guess,
  type IdentifyChallenge,
  type Intent,
  type Kind,
  type MatchChallenge,
  type PatternChallenge,
  type Player,
  type Round,
  type TextChallenge,
  type Thing,
} from './internal/rules'

export { BOT_MISTAKE_CHANCE, BOT_SOLVE, botIntent, botIntents } from './internal/ai'

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

export { OpFinderScreen } from './internal/OpFinderScreen'
