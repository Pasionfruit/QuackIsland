/**
 * Putting a race together: who is in a lane.
 *
 * **The people in the lobby are the racers**, host first - roster order is
 * colour order and lane order - up to eight. Stand-ins fill in only when there
 * is nobody else, the same rule as the other minigames.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createRace, type Race } from './rules'

export const ME = 'you'
export const SOLO_RACERS = 4
/** Eight colours, eight lanes. */
export const MAX_RACERS = 8

export function myId(): string {
  return getNet().id ?? ME
}

export function raceRoster(): { id: string; bot: boolean }[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [
      { id: mine, bot: false },
      ...Array.from({ length: SOLO_RACERS - 1 }, (_, i) => ({ id: `racer ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_RACERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/**
 * A seed for the lights and the circles, and so an id to tell races apart.
 * Nothing secret: knowing when the light will change does not press space for
 * you, and every browser needs it to draw the same light.
 */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `i-see-the-light:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
}

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
