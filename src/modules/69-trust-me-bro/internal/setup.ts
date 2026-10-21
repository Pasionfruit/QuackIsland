import { hashSeed } from '../../00-core'
import { oneVsAllSetup, seedDealer } from '../../68-minigame-kit'
import { createRound } from './rules'

// A separate kit dealer keeps the secret deal unrelated to the public round id.
const secretSeed = seedDealer('trust-me-bro-private')
export const kit = oneVsAllSetup({
  game: 'trust-me-bro', solo: 5, standIn: (seat) => `bro ${seat}`,
  createRound: (seed, entrants, chosen, id) => createRound(hashSeed(secretSeed(), String(seed)), entrants, chosen, id),
})
export const { newRound, waitingRound, nextSeed } = kit
export const gameRoster = kit.roster
