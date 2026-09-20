/**
 * 51-perfect-game - the public contract.
 *
 * Minigame 27, Perfect Game. One turn each while everybody else watches: a bent
 * column of thirty crabs marches from left to right across the beach, and the
 * thrower has ten seconds to choose where to stand, the angle of the coconut,
 * and when to let it go. It rolls in a straight line; every crab it hits is a
 * point; the most points wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { BeachScreen } from './internal/BeachScreen'
import { newGame } from './internal/setup'

registerMinigame('perfect-game', {
  newGame: () => newGame(),
  Panel: BeachScreen,
})

export { BEACH, BOX, COCONUT, COLUMN, WALL, bendAt, clampThrow, coconutAt, columnFor, columnX, crabAt, foldX, heading, headingAt, hits, legsOf, pathAt, travel, type Column, type Leg, type Shape, type Throw } from './internal/beach'

export { COLOURS, HOME, ROLL_SLACK, TURN, advanceTurn, aimTo, createGame, judgeEnd, leave, phaseOf, placings, roll, stepGame, tau, throwOf, thrower, tick, turnHits, turnOrder, type Entrant, type Game, type Phase, type Player } from './internal/rules'

export { BOT, bestThrow, botAim } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WireAim, type WirePlayer } from './internal/wire'

export { BeachScene, PALETTE, type PointerRef } from './internal/BeachScene'

export { BeachScreen, WALK } from './internal/BeachScreen'
