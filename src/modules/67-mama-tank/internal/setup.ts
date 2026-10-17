/**
 * Putting a round together: who is in the lobby, and who drives Mama Tank.
 *
 * The one-vs-all base case from `68-minigame-kit`: the lobby are the players,
 * host first, up to eight; stand-ins fill in only when there is nobody else,
 * and **a stand-in never drives Mama Tank** - alone, the human is the 1 and
 * the stand-ins attack from below.
 */
import { MAX_PLAYERS, ME, myId, oneVsAllSetup, type RoundSetup } from '../../68-minigame-kit'
import { createRound } from './rules'

export { ME, MAX_PLAYERS, myId, type RoundSetup }

/** You and four stand-ins: enough that Mama Tank has something to actually fight. */
export const SOLO_PLAYERS = 5

const kit = oneVsAllSetup({ game: 'mama-tank', solo: SOLO_PLAYERS, standIn: (seat) => `mini tank ${seat}`, createRound })

export const { nextSeed, newRound, waitingRound } = kit
export const gameRoster = kit.roster
