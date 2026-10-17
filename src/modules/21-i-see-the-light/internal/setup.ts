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

/**
 * A seed for the lights and the circles, and so an id to tell races apart.
 * Nothing secret: knowing when the light will change does not press space for
 * you, and every browser needs it to draw the same light.
 */
export const nextSeed = seedDealer('i-see-the-light')

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

/** A track with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingRace(): Race {
  return { seed: 0, id: 0, elapsed: 0, over: false, racers: [] }
}
