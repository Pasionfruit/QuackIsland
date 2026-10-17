/**
 * Putting a round together: who is in the lane, and who is the Sniper.
 *
 * The one-vs-all base case from `68-minigame-kit`: the lobby are the players,
 * host first, up to eight; stand-ins fill in only when there is nobody else,
 * and **a stand-in never plays the Sniper** - alone, the human is the 1 and
 * the stand-ins rush the tower.
 */
import { MAX_PLAYERS, ME, myId, oneVsAllSetup, type RoundSetup } from '../../68-minigame-kit'
import { createRound } from './rules'

export { ME, MAX_PLAYERS, myId, type RoundSetup }

/** You and four stand-ins: enough that the tower's defence is worth testing alone. */
export const SOLO_PLAYERS = 5

const kit = oneVsAllSetup({ game: 'jackal', solo: SOLO_PLAYERS, standIn: (seat) => `runner ${seat}`, createRound })

export const { nextSeed, newRound, waitingRound } = kit
export const gameRoster = kit.roster
