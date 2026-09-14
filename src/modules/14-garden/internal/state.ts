/**
 * What this lobby has settled on for Garden Goofs, and what a round has so far.
 *
 * Three things, and they are owned by three different people, which is the
 * whole reason this file exists:
 *
 * - **The way it is played** - endless, co-op or versus - is the host's, and
 *   rides on `13-modes`'s `hostChoice` like the choice of game itself.
 * - **Your hand** is yours. You confirm it, you send it, and everybody keeps a
 *   copy. Exactly how readying up works, and for the same reason.
 * - **The seed pot is shared**, so somebody has to be right about it: the host
 *   is, and says so.
 */
import { createStore, useStore } from '../../00-core'
import { getNet, sendToRoom, subscribeRoom, useNet } from '../../09-net'
import { hostChoice } from '../../13-modes'
import { useEffect } from 'react'
import {
  GOOFS,
  decodeGoofs,
  encodeGoofs,
  validHand,
  type Hands,
} from './goofs'
import { DEFAULT_GARDEN_MODE, isGardenMode, type GardenMode } from './modes'
import type { DefenderId } from './pieces'

const mode = hostChoice<GardenMode>('garden', isGardenMode, DEFAULT_GARDEN_MODE)

/** The id used for yourself, since the relay only names other people. */
export const ME = 'self'

export interface GoofsState {
  /** Everyone who has confirmed a hand, by peer id. */
  hands: Hands
  /** The shared pot. One number for the whole party. */
  seeds: number
}

const store = createStore<GoofsState>({ hands: {}, seeds: GOOFS.startingSeeds })

export function useGoofs(): GoofsState {
  return useStore(store)
}

export function getGoofs(): GoofsState {
  return store.get()
}

function set(next: Partial<GoofsState>): void {
  store.set({ ...store.get(), ...next })
}

/** The chosen way to play, for React. */
export function useGardenMode(): GardenMode {
  return mode.use()
}

/** The chosen way to play, for anything outside React. */
export function getGardenMode(): GardenMode {
  return mode.get()
}

/** Points the lobby at one. Host only. */
export function chooseGardenMode(id: GardenMode): void {
  mode.set(id)
}

/** Tells everyone which it is. The host's answer to a new arrival. */
export function announceGardenMode(): void {
  mode.announce()
}

/** Back to the default, for leaving a lobby. */
export function resetGardenMode(): void {
  mode.reset()
}

/** Starts listening for the way it is played. Returns the unsubscribe. */
export function listenForGardenModes(): () => void {
  return mode.listen()
}

/**
 * Confirms the animals you are taking in, and tells everybody.
 *
 * Only a whole, legal hand counts. A draft - two of the three chosen, menu
 * still open - stays in the menu: this is the answer to "has everybody
 * picked", and a half-finished answer is worse than none.
 */
export function pickHand(hand: readonly DefenderId[]): void {
  const clean = validHand([...hand])
  if (!clean) return
  set({ hands: { ...store.get().hands, [ME]: clean } })
  sendToRoom(encodeGoofs({ hand: clean }))
}

/** Your hand, or `null` if you have not confirmed one. */
export function myHand(): readonly DefenderId[] | null {
  return store.get().hands[ME] ?? null
}

/**
 * Forgets every hand, for the end of a round.
 *
 * Not the pot: that is the host's and is reset with it, so a guest clearing
 * the table cannot quietly hand everybody fifty seeds.
 */
export function clearHands(): void {
  if (Object.keys(store.get().hands).length === 0) return
  set({ hands: {} })
}

/** Drops somebody who has left, so nobody waits on a closed browser. */
export function forgetPicker(id: string): void {
  const hands = store.get().hands
  if (!hands[id]) return
  const next = { ...hands }
  delete next[id]
  set({ hands: next })
}

/**
 * Puts the pot back to the start of a round. Host only.
 *
 * Seeds are shared, so one person has to be right about them and it is the
 * same person who is right about the clock.
 */
export function resetSeeds(): void {
  if (!getNet().host) return
  set({ seeds: GOOFS.startingSeeds })
  sendToRoom(encodeGoofs({ seeds: GOOFS.startingSeeds }))
}

/**
 * Moves the pot. Host only, and never below nothing.
 *
 * Nothing spends seeds yet. When planting exists this is where it will have to
 * go through, and a guest planting a duck will have to ask - see the
 * limitation in MODULE.md.
 */
export function changeSeeds(by: number): void {
  if (!getNet().host || !Number.isFinite(by)) return
  const seeds = Math.max(0, Math.floor(store.get().seeds + by))
  if (seeds === store.get().seeds) return
  set({ seeds })
  sendToRoom(encodeGoofs({ seeds }))
}

/** Tells everyone where things stand. The host's answer to a new arrival. */
export function announceGoofs(): void {
  const state = store.get()
  const mine = state.hands[ME]
  sendToRoom(
    encodeGoofs(getNet().host ? { seeds: state.seeds, ...(mine ? { hand: [...mine] } : {}) } : mine ? { hand: [...mine] } : {}),
  )
}

/**
 * Starts listening.
 *
 * A hand belongs to whoever sent it. The pot belongs to the host and only the
 * host - two clients each believing they are host would otherwise take turns
 * overruling each other about how much everybody has to spend.
 */
export function listenForGoofs(): () => void {
  return subscribeRoom((from, raw) => {
    const message = decodeGoofs(raw)
    if (!message) return
    const host = getNet().host

    if (message.hand) {
      set({ hands: { ...store.get().hands, [from]: message.hand } })
      // Somebody spoke, so the host says where things stand - which is how
      // anybody who arrives mid-round finds out what the pot is worth.
      if (host) announceGoofs()
    }

    if (message.seeds !== undefined && !host) set({ seeds: message.seeds })

    if (message.ask && host) announceGoofs()
  })
}

/**
 * Keeps this lobby's Garden Goofs in step, for as long as the interface is up.
 *
 * Call it once, from something that is always mounted. Leaving a lobby clears
 * the table: on your own again, nobody else has a hand and the pot is fresh.
 */
export function useGoofsSync(): void {
  mode.useSync()

  const net = useNet()
  const joined = net.status === 'joined'
  const room = net.room

  useEffect(() => listenForGoofs(), [])

  useEffect(() => {
    store.set({ hands: {}, seeds: GOOFS.startingSeeds })
    if (joined) sendToRoom(encodeGoofs({ ask: true }))
  }, [joined, room])
}
