/**
 * Who is ready, what phase the party is in, and how that travels.
 *
 * The rules are in `party.ts` and are pure; this is the part that has to talk
 * to other browsers. It goes through `09-net`'s room channel, which passes
 * opaque messages - so the transport never learns what a board game is, and
 * this file never learns what a WebSocket is.
 *
 * The host owns the phase, the same way it owns the clock and the weather.
 * Everyone owns their own ready flag, the same way they own their own duck.
 */
import { createStore, useStore } from '../../00-core'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { decodeParty, encodeParty, type PartyPhase } from './party'

export interface PartyState {
  phase: PartyPhase
  /** Everyone who has said they are ready, by peer id. `self` is you. */
  ready: ReadonlySet<string>
}

/** The id used for yourself, since the relay only names other people. */
export const ME = 'self'

const store = createStore<PartyState>({ phase: 'off', ready: new Set() })

export function useParty(): PartyState {
  return useStore(store)
}

export function getParty(): PartyState {
  return store.get()
}

function set(next: Partial<PartyState>): void {
  store.set({ ...store.get(), ...next })
}

/** Whether you are ready. */
export function amReady(): boolean {
  return store.get().ready.has(ME)
}

export function setReady(ready: boolean): void {
  const next = new Set(store.get().ready)
  if (ready) next.add(ME)
  else next.delete(ME)
  set({ ready: next })
  sendToRoom(encodeParty({ ready }))
}

/**
 * Opens the board for people to ready up. Host only - a guest doing this would
 * change nothing for anybody else, so the button is theirs alone.
 */
export function hostGame(): void {
  if (!getNet().host) return
  set({ phase: 'gathering' })
  sendToRoom(encodeParty({ phase: 'gathering' }))
}

/** Starts it. The caller checks `canStart` first; this trusts that. */
export function startGame(): void {
  if (!getNet().host) return
  set({ phase: 'playing' })
  sendToRoom(encodeParty({ phase: 'playing' }))
}

/** Back to the island, and everybody un-readies. */
export function endGame(): void {
  if (!getNet().host) return
  set({ phase: 'off', ready: new Set() })
  sendToRoom(encodeParty({ phase: 'off' }))
}

/**
 * Wipes the party when you leave a lobby.
 *
 * On your own there is nobody to host a game with, so the dashboard goes back
 * to offering one rather than leaving you stranded on the board.
 */
export function resetParty(): void {
  store.set({ phase: 'off', ready: new Set() })
}

/**
 * Starts listening. Called once by the scene entry.
 *
 * The host answers anybody who speaks with where things stand, so somebody who
 * joins mid-gathering finds out rather than sitting in `off` looking at a
 * button nobody else can see.
 */
export function listenForParty(): () => void {
  return subscribeRoom((from, raw) => {
    const message = decodeParty(raw)
    if (!message) return

    // Only the host's phase counts. Two clients each believing they are host
    // would otherwise take turns dragging everybody on and off the board.
    if (message.phase !== undefined && !getNet().host) {
      const now = store.get()
      if (now.phase !== message.phase) {
        // Leaving the board clears everyone's ready, so the next round starts
        // from nobody rather than from whatever was left over.
        set(message.phase === 'off' ? { phase: 'off', ready: new Set() } : { phase: message.phase })
      }
    }

    if (message.ready !== undefined) {
      const next = new Set(store.get().ready)
      if (message.ready) next.add(from)
      else next.delete(from)
      set({ ready: next })

      // Somebody said something, so the host says where things stand. This is
      // what a guest who arrived mid-gathering hears: the phase is only ever
      // broadcast when it *changes*, so without an answer to somebody turning
      // up, a late joiner sits in `off` while everybody else is getting ready.
      // The interface announces each arrival by sending its own ready state.
      if (getNet().host) announceParty()
    }
  })
}

/** Tells a peer who has just arrived where things stand. */
export function announceParty(): void {
  const state = store.get()
  const payload = getNet().host
    ? encodeParty({ phase: state.phase, ready: state.ready.has(ME) })
    : encodeParty({ ready: state.ready.has(ME) })
  sendToRoom(payload)
}

/** Drops somebody who has left out of the ready set. */
export function forgetPlayer(id: string): void {
  const ready = store.get().ready
  if (!ready.has(id)) return
  const next = new Set(ready)
  next.delete(id)
  set({ ready: next })
}
