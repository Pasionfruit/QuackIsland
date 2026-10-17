/**
 * Putting a race together: who is in a lane.
 *
 * **The people in the lobby are the racers**, host first - roster order is
 * colour order and lane order - up to eight. Stand-ins fill in only when there
 * is nobody else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createRace, type Race } from './rules'

export { ME, myId }

export const SOLO_RACERS = 4
/** Eight colours, eight lanes. */
export const MAX_RACERS = 8

export function raceRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_RACERS, max: MAX_RACERS, standIn: (seat) => `racer ${seat}` })
}

/** A seed for the sentence and the stand-ins' pace, and so an id to tell races apart. Nothing secret. */
export const nextSeed = seedDealer('sprint-triathlon')

export interface RaceSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newRace({ seed = nextSeed(), roster = raceRoster(), me = myId() }: RaceSetup = {}): Race {
  return createRace(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    seed || 1,
  )
}

/** A course with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingRace(): Race {
  const race = createRace(0, [], 0)
  race.over = false
  return race
}
