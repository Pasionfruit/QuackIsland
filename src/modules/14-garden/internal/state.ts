/**
 * What this lobby has settled on for Garden Goofs, and what the round has so
 * far.
 *
 * Three things owned by three different people, which is the whole reason this
 * file exists:
 *
 * - **The way it is played** - endless, co-op or versus - is the host's, and
 *   rides on `13-modes`'s `hostChoice` like the choice of game itself.
 * - **The loadout is the party's.** Anybody may add an animal or take one out,
 *   and everybody sees the same shelf. Last word wins, which is what you want
 *   from two people pointing at the same packet.
 * - **The round is the host's.** Seeds, plants and the pot are one shared
 *   truth and somebody has to hold it, because two people *will* click the
 *   same seed and exactly one of them can have it.
 *
 * So a guest never changes the round: it asks. `claim` and `plant` are
 * requests, the host runs the same pure rules from `round.ts` over its own
 * copy, and what comes back is what happened. The cost is a round trip before
 * you see your own click land, which on a lobby-sized network is nothing, and
 * the thing it buys is that the two lawns cannot drift apart.
 */
import { useEffect, useRef } from 'react'
import { createRng, createStore, useStore } from '../../00-core'
import { getNet, sendToRoom, subscribeRoom, useNet } from '../../09-net'
import { hostChoice } from '../../13-modes'
import {
  decodeGoofs,
  encodeGoofs,
  freshRound,
  fromWire,
  toWire,
  toggle,
  type Picked,
} from './goofs'
import { DEFAULT_GARDEN_MODE, isGardenMode, type GardenMode } from './modes'
import type { DefenderId } from './pieces'
import {
  addSeed,
  age,
  claimSeed,
  nextSpawnIn,
  plant as plantInto,
  spawnSeed,
  uproot,
  type Round,
} from './round'

const mode = hostChoice<GardenMode>('garden', isGardenMode, DEFAULT_GARDEN_MODE)

/** The id used for yourself, since the relay only names other people. */
export const ME = 'self'

export interface GoofsState {
  /** The animals the party is taking in. Everybody's, and everybody edits it. */
  hand: readonly DefenderId[]
  /** Everybody who has said they are done choosing. */
  picked: Picked
  /** The round in progress. */
  round: Round
}

const store = createStore<GoofsState>({ hand: [], picked: [], round: freshRound() })

export function useGoofs(): GoofsState {
  return useStore(store)
}

export function getGoofs(): GoofsState {
  return store.get()
}

function set(next: Partial<GoofsState>): void {
  store.set({ ...store.get(), ...next })
}

const amHost = (): boolean => getNet().host

/** Sends the round, if it is yours to send. */
function publishRound(round: Round): void {
  set({ round })
  if (amHost()) sendToRoom(encodeGoofs({ round: toWire(round) }))
}

// --- the way it is played ---------------------------------------------------

export function useGardenMode(): GardenMode {
  return mode.use()
}

export function getGardenMode(): GardenMode {
  return mode.get()
}

/** Points the lobby at one. Host only. */
export function chooseGardenMode(id: GardenMode): void {
  mode.set(id)
}

export function announceGardenMode(): void {
  mode.announce()
}

export function resetGardenMode(): void {
  mode.reset()
}

export function listenForGardenModes(): () => void {
  return mode.listen()
}

// --- the loadout, which belongs to everybody --------------------------------

/**
 * Adds an animal to the party's loadout, or takes it out again.
 *
 * Anybody may do this to anybody's pick. It is one lawn and one pot, so it is
 * one loadout, and arguing about it is part of the game.
 */
export function toggleAnimal(id: DefenderId): void {
  const hand = toggle(store.get().hand, id)
  set({ hand })
  sendToRoom(encodeGoofs({ hand: [...hand] }))
}

/** Says you are done choosing, or that you are not after all. */
export function setDone(done: boolean): void {
  const picked = store.get().picked.filter((who) => who !== ME)
  set({ picked: done ? [...picked, ME] : picked })
  sendToRoom(encodeGoofs({ done }))
}

/** Whether you have said you are done. */
export function amDone(): boolean {
  return store.get().picked.includes(ME)
}

/** Drops somebody who has left, so nobody waits on a closed browser. */
export function forgetPicker(id: string): void {
  const picked = store.get().picked
  if (!picked.includes(id)) return
  set({ picked: picked.filter((who) => who !== id) })
}

/** Clears the table between rounds. */
export function clearHands(): void {
  const now = store.get()
  if (now.hand.length === 0 && now.picked.length === 0) return
  set({ hand: [], picked: [] })
}

// --- the round, which belongs to the host -----------------------------------

/** Starts a fresh round with a full pot. Host only. */
export function startRound(): void {
  if (!amHost()) return
  seedId = 1
  publishRound(freshRound())
}

/**
 * Clicks a seed.
 *
 * The host answers this for everybody, including itself, because two people
 * clicking the same seed is the normal case on a shared lawn and only one of
 * them can have it.
 */
export function claim(id: number): void {
  if (!amHost()) {
    sendToRoom(encodeGoofs({ claim: id }))
    return
  }
  const { round, gained } = claimSeed(store.get().round, id)
  if (gained > 0) publishRound(round)
}

/**
 * Asks for an animal to go in a square.
 *
 * Refused silently here and answered by the host, whose copy of the pot is the
 * one that counts. The interface checks the same rules before it lets go of
 * the drag, so a refusal that gets this far is a race rather than a mistake.
 */
export function place(row: number, col: number, id: DefenderId): void {
  if (!amHost()) {
    sendToRoom(encodeGoofs({ plant: { row, col, id } }))
    return
  }
  const { round, refused } = plantInto(store.get().round, store.get().hand, row, col, id)
  if (!refused) publishRound(round)
}

/**
 * Asks for whatever is in a square to come out again - the trowel. No seeds
 * come back; see `uproot`.
 *
 * Same shape as `place`: a guest asks, the host decides. Refused silently here
 * for the same reason too - the interface checks there is something to dig up
 * before it lets go of the trowel, so a refusal that gets this far is a race
 * rather than a mistake.
 */
export function dig(row: number, col: number): void {
  if (!amHost()) {
    sendToRoom(encodeGoofs({ dig: { row, col } }))
    return
  }
  const round = uproot(store.get().round, row, col)
  if (round !== store.get().round) publishRound(round)
}

/** The host's own numbering for seeds. Unique within a round. */
let seedId = 1
/** Seconds until the host drops the next seed. */
let untilSpawn = 0
const random = createRng(0x600f5)

/**
 * A moment of the round passing.
 *
 * **Everybody ages their own copy**, so seeds fade smoothly between the host's
 * messages rather than jumping when one arrives. Only the host adds new ones,
 * and only the host's pot is real - a guest counting a seed out is drawing,
 * not deciding.
 */
export function tick(delta: number): void {
  if (!(delta > 0)) return
  const now = store.get().round
  let round = age(now, delta)

  if (amHost()) {
    untilSpawn -= delta
    if (untilSpawn <= 0) {
      untilSpawn = nextSpawnIn(random)
      const seed = spawnSeed(round, seedId, random)
      if (seed) {
        seedId++
        round = addSeed(round, seed)
        publishRound(round)
        return
      }
    }
  }

  if (round !== now) set({ round })
}

// --- talking to everybody else ----------------------------------------------

/** Tells everyone where things stand. */
export function announceGoofs(): void {
  const state = store.get()
  // Your own answer to "is everybody done", which is yours to give whoever you
  // are. The host adds the things only it can be right about.
  sendToRoom(encodeGoofs({ done: state.picked.includes(ME) }))
  if (amHost()) {
    sendToRoom(encodeGoofs({ hand: [...state.hand], round: toWire(state.round) }))
  }
}

/**
 * Starts listening.
 *
 * A loadout and a done flag belong to whoever sent them. The round belongs to
 * the host and only the host; a guest sending one is either confused or lying,
 * and either way it is not the round.
 */
export function listenForGoofs(): () => void {
  return subscribeRoom((from, raw) => {
    const message = decodeGoofs(raw)
    if (!message) return
    const host = amHost()

    if (message.hand) set({ hand: message.hand })

    if (message.done !== undefined) {
      const picked = store.get().picked.filter((who) => who !== from)
      set({ picked: message.done ? [...picked, from] : picked })
    }

    if (message.round && !host) set({ round: fromWire(message.round) })

    // Requests. Only the host acts on these, and it runs the same rules it
    // would run for its own click.
    if (host && message.claim !== undefined) claim(message.claim)
    if (host && message.plant) place(message.plant.row, message.plant.col, message.plant.id)
    if (host && message.dig) dig(message.dig.row, message.dig.col)

    if (message.ask) announceGoofs()
  })
}

/**
 * Keeps this lobby's Garden Goofs in step, for as long as the interface is up.
 *
 * Call it once, from something that is always mounted. Leaving a lobby clears
 * the table: on your own again, nobody else is choosing and the round is new.
 */
export function useGoofsSync(): void {
  mode.useSync()

  const net = useNet()
  const joined = net.status === 'joined'
  const room = net.room

  useEffect(() => listenForGoofs(), [])

  useEffect(() => {
    store.set({ hand: [], picked: [], round: freshRound() })
    if (joined) sendToRoom(encodeGoofs({ ask: true }))
  }, [joined, room])
}

/**
 * Runs the round while it is on the screen.
 *
 * A frame loop of its own rather than `00-core`'s, because this is a 2D game
 * drawn in the DOM and `useGameFrame` belongs to the canvas. It stops when the
 * screen goes, which is exactly when there is no round to run.
 */
export function useRoundClock(running: boolean): void {
  const last = useRef(0)

  useEffect(() => {
    if (!running) return
    let frame = 0
    last.current = performance.now()

    const step = (at: number) => {
      // Clamped, so a tab that was in the background does not come back and
      // expire every seed on the lawn at once.
      const delta = Math.min(0.25, (at - last.current) / 1000)
      last.current = at
      tick(delta)
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [running])
}
