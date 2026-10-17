/**
 * Putting a round together: who is in the maze, and who is the Hunter.
 *
 * The one-vs-all base case from `68-minigame-kit`: the lobby are the players,
 * host first, up to eight; stand-ins fill in only when there is nobody else,
 * and **a stand-in never plays the Hunter** - alone, the human is the 1 and
 * the stand-ins are the Hiders.
 */
import { MAX_PLAYERS, ME, myId, oneVsAllSetup, type RoundSetup } from '../../68-minigame-kit'
import { createRound } from './rules'

export { ME, MAX_PLAYERS, myId, type RoundSetup }

/** You and four stand-ins: enough of a maze to actually have to search it alone. */
export const SOLO_PLAYERS = 5

const kit = oneVsAllSetup({ game: 'bbn', solo: SOLO_PLAYERS, standIn: (seat) => `hider ${seat}`, createRound })

export const { nextSeed, newRound, waitingRound } = kit
export const gameRoster = kit.roster
