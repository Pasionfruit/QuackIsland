import { oneVsAllSetup } from '../../68-minigame-kit'
import { createRound } from './rules'

export const kit = oneVsAllSetup({ game: 'duck-szn', solo: 5, standIn: (seat) => `duck ${seat}`, createRound })
export const { newRound, waitingRound, nextSeed } = kit
export const gameRoster = kit.roster
