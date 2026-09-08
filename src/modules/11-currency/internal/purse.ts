/**
 * The wallet you actually have, and remembering it.
 *
 * The arithmetic is all in `wallet.ts` and is pure; this is the one mutable
 * copy plus the part that talks to storage. Kept apart so that every rule
 * about money can be tested without a browser, and so there is exactly one
 * place that can change a balance.
 */
import { createStore, useStore } from '../../00-core'
import {
  add,
  emptyWallet,
  parseWallet,
  pay,
  sameWallet,
  type Cost,
  type CurrencyId,
  type Wallet,
} from './wallet'

/** Where the purse is kept between sessions. */
export const PURSE_KEY = 'localrot.purse'

function load(): Wallet {
  try {
    const raw = window.localStorage.getItem(PURSE_KEY)
    return raw === null ? emptyWallet() : parseWallet(JSON.parse(raw))
  } catch {
    // Unparseable, or storage blocked entirely. An empty purse is a better
    // answer than a page that will not render.
    return emptyWallet()
  }
}

function save(wallet: Wallet): void {
  try {
    window.localStorage.setItem(PURSE_KEY, JSON.stringify(wallet))
  } catch {
    // Not being able to remember it is not worth breaking anything for.
  }
}

const store = createStore<Wallet>(typeof window === 'undefined' ? emptyWallet() : load())

export function usePurse(): Wallet {
  return useStore(store)
}

export function getPurse(): Wallet {
  return store.get()
}

function commit(next: Wallet): void {
  // Nothing changed means no re-render and no write, which matters because
  // earning is the sort of thing that gets called from a frame loop.
  if (sameWallet(next, store.get())) return
  store.set(next)
  save(next)
}

/** Earns some of something. */
export function earn(id: CurrencyId, amount: number): void {
  commit(add(store.get(), id, amount))
}

/**
 * Pays a cost if it can be paid, and reports whether it was.
 *
 * All or nothing: a purchase that cannot be afforded takes nothing at all.
 */
export function trySpend(cost: Cost): boolean {
  const next = pay(store.get(), cost)
  if (!next) return false
  commit(next)
  return true
}

/** Empties it. For testing, and for whatever ends up resetting a save. */
export function clearPurse(): void {
  commit(emptyWallet())
}
