/**
 * 50-milf-fishing - the public contract.
 *
 * Minigame 46, M.I.L.F (fishing). Everybody fishes off one dock for 25 seconds.
 * Watch your rod: a slight bend is a small fish, a dramatic one a big fish, and
 * straight is nothing. Four sizes bite at unpredictable times, each player their
 * own, with no promise the biggest ever comes. Click to pull. Biggest total
 * catch wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { PondScreen } from './internal/PondScreen'
import { newGame } from './internal/setup'

registerMinigame('milf-fishing', {
  newGame: () => newGame(),
  Panel: PondScreen,
})

export { BITE, FISH, LENGTH, ODDS, RECAST, bendAt, bitesFor, fishFor, hooked, playBack, type Bend, type Bite, type Played } from './internal/pond'

export { COLOURS, PULL_SLACK, bitesOf, canPull, castLeft, catches, createGame, judgeEnd, leave, placings, pull, stepGame, tick, total, type Entrant, type Game, type Player } from './internal/rules'

export { BOT, botPull, wantsAt } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WirePlayer } from './internal/wire'

export { PALETTE, PondScene, SPACING, standAt } from './internal/PondScene'

export { PondScreen } from './internal/PondScreen'
