/**
 * Putting a race together: who is in it, and which maze.
 *
 * Separate from the rules so the rules never know where a roster came from.
 * **The people in the lobby are the people in the maze**, host first, read at
 * the moment the host deals the race. Stand-in racers fill the corners only
 * when there is nobody else - the same rule Zombie Tag keeps.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createRace, type Race } from './race'

/** What this browser's racer is called when there is no lobby to name it. */
export const ME = 'you'

/** How many racers there are when nobody else is: one per corner. */
export const SOLO_RACERS = 4

/** What this browser is called in a race: its lobby id, or `ME` when alone. */
export function myId(): string {
  return getNet().id ?? ME
}

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

/** Races dealt this session, so the next one is a different maze. */
let dealt = 0

/**
 * A seed for the next race.
 *
 * Derived from the world seed through `hashSeed`, like everything else, and
 * made different per race by what is different about it: the lobby, how many
 * races came before, and when. The maze a seed makes is exactly reproducible;
 * which seed comes up next is meant not to be, or the first maze of every
 * session would be the same one and people would learn it.
 */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `messy-maze:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
}

export interface RaceSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

/** A fresh race: a new maze, the lobby in its corners, everybody on WASD. */
export function newRace({ seed = nextSeed(), roster = raceRoster(), me = myId() }: RaceSetup = {}): Race {
  return createRace(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
  )
}

/**
 * A race with nobody in it yet, for a guest to draw until the host's first
 * snapshot says which maze and who is where.
 */
export function waitingRace(): Race {
  return { seed: 0, racers: [], elapsed: 0, over: false, firstIn: null }
}
