import { oneVsAllSetup } from '../../68-minigame-kit'
import { createRound } from './rules'

export const kit = oneVsAllSetup({ game: 'aura-debt', solo: 4, standIn: seat => `Trap bot ${seat}`, createRound })
export const { nextSeed, newRound, waitingRound } = kit
export const auraRoster = kit.roster
