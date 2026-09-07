/**
 * A three-line external store.
 *
 * The lighting slider lives in the DOM and the lights live inside the canvas.
 * Rather than thread a provider across that boundary - or pull in a state
 * library for two values - this is useSyncExternalStore with a setter.
 */
import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      for (const l of listeners) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
