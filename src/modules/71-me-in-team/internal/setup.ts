import { oneVsAllSetup } from '../../68-minigame-kit'
import { createRound } from './rules'
export const kit = oneVsAllSetup({ game: 'me-in-team', solo: 5, standIn: (seat) => `teammate ${seat}`, createRound })
export const { newRound, waitingRound, nextSeed } = kit
export const gameRoster = kit.roster
