/**
 * Putting a race together: who is in it, and which maze.
 *
 * Separate from the rules so the rules never know where a roster came from.
 * **The people in the lobby are the people in the maze**, host first, read at
 * the moment the host deals the race. Stand-in racers fill the corners only
 * when there is nobody else - the same rule Zombie Tag keeps.
 */
import { getNet, getPeers } from '../../09-net'
import { ME, myId, seedDealer } from '../../68-minigame-kit'
import { MAZES } from './maze'
import { createRace, type Race } from './race'

export { ME, myId }

/** How many racers there are when nobody else is: one per corner. */
export const SOLO_RACERS = 4

/**
 * Everybody in the lobby, host first, or you and three stand-ins.
 *
 * A lobby of one is alone: somebody who has made a lobby and is waiting for
 * friends is still the only person in it.
 */
export function raceRoster(): { id: string; bot: boolean }[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [
      { id: mine, bot: false },
      ...Array.from({ length: SOLO_RACERS - 1 }, (_, i) => ({ id: `racer ${i + 1}`, bot: true })),
    ]
  }
  return [mine, ...others].map((id) => ({ id, bot: false }))
}

/** The maze the last race was in, so the next one is a different one. */
let lastLayout: number | null = null

/**
 * A seed for the next race: what its spins deal.
 *
 * Derived from the world seed through `hashSeed`, like everything else, and
 * made different per race by the lobby, how many races came before, and when
 * - so the letters a spin deals cannot be learned from one race to the next.
 */
export const nextSeed = seedDealer('messy-maze')

/**
 * Which maze the next race is in.
 *
 * Round the three in turn, starting wherever the seed says, so a session opens
 * on any of them and two races in a row are never the same maze.
 */
export function nextLayout(seed: number): number {
  lastLayout = lastLayout === null ? seed % MAZES.length : (lastLayout + 1) % MAZES.length
  return lastLayout
}

export interface RaceSetup {
  seed?: number
  layout?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

/** A fresh race: the next maze, the lobby in its corners, everybody on WASD. */
export function newRace({
  seed = nextSeed(),
  layout = nextLayout(seed),
  roster = raceRoster(),
  me = myId(),
}: RaceSetup = {}): Race {
  return createRace(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    layout,
  )
}

/**
 * A race with nobody in it yet, for a guest to draw until the host's first
 * snapshot says which maze and who is where.
 */
export function waitingRace(): Race {
  return { seed: 0, layout: 0, racers: [], elapsed: 0, over: false, firstIn: null }
}
