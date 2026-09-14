/**
 * One thing the lobby has agreed on, kept the same in every browser.
 *
 * Which game is being played is one of these. So is which variant of that
 * game, and so will every setting a lobby ever grows be. They all want exactly
 * the same four things, and all four are easy to get subtly wrong:
 *
 * - **The host owns it.** A guest changing it locally would be dragged back by
 *   the next message and see their choice flicker.
 * - **A joiner asks.** Broadcasting only on change strands everybody who
 *   arrived afterwards on the wrong answer.
 * - **Leaving forgets.** Otherwise the last lobby's choice follows you home.
 * - **A value nobody has heard of is refused.** Taken on trust it leaves the
 *   interface pointing at something with no row to select back out of.
 *
 * Written once here rather than once per setting. Each choice carries its own
 * message tag, so two of them on the same room channel cannot read each
 * other's messages.
 */
import { useEffect } from 'react'
import { createStore, useStore } from '../../00-core'
import { getNet, sendToRoom, subscribeRoom, useNet } from '../../09-net'

/** A choice message, as it goes over the room channel. */
export interface ChoiceMessage<T extends string> {
  /** What the host has settled on. Only the host's copy counts. */
  value?: T
  /** Somebody newly arrived, asking what it is. */
  ask?: boolean
}

/**
 * Reads a choice message off the wire.
 *
 * As untrusted as everything else another browser sends, and rejecting the
 * whole message rather than half-reading it: a value of 7 and a value of
 * "chaos" are the same kind of wrong.
 */
export function decodeChoice<T extends string>(
  tag: string,
  known: (value: unknown) => value is T,
  message: Record<string, unknown>,
): ChoiceMessage<T> | null {
  if (message.t !== tag) return null
  const out: ChoiceMessage<T> = {}
  if (message.value !== undefined) {
    if (!known(message.value)) return null
    out.value = message.value
  }
  if (message.ask !== undefined) {
    if (typeof message.ask !== 'boolean') return null
    out.ask = message.ask
  }
  return out
}

export function encodeChoice<T extends string>(
  tag: string,
  message: ChoiceMessage<T>,
): Record<string, unknown> {
  return { t: tag, ...message }
}

/**
 * What a choice message means to whoever received it.
 *
 * The whole rule, in one pure function, because getting it wrong is silent:
 * a joiner that ignores the answer sits in a lobby playing a different game
 * from everybody else and nothing anywhere says so.
 *
 * - **A guest takes the host's word.** That is how somebody arriving finds out
 *   what the party is playing, and it is the only way they ever find out.
 * - **The host takes nobody's.** Two clients each believing they are host
 *   would otherwise take turns overruling each other.
 * - **The host answers anybody who asks**, which is what makes the arriving
 *   guest's question worth asking.
 */
export function applyChoice<T extends string>(
  current: T,
  message: ChoiceMessage<T>,
  isHost: boolean,
): { value: T; answer: boolean } {
  const told = message.value !== undefined && !isHost
  return {
    value: told ? (message.value as T) : current,
    answer: message.ask === true && isHost,
  }
}

export interface Choice<T extends string> {
  /** The current value, for React. */
  use(): T
  /** The current value, for anything outside React - a frame callback, say. */
  get(): T
  /** Settle on one. Host only; a guest's call does nothing. */
  set(value: T): void
  /** Back to the fallback. */
  reset(): void
  /** Tell everyone what it is. The host's answer to a new arrival. */
  announce(): void
  /** Ask the host what it is. */
  ask(): void
  /** Start listening. Returns the unsubscribe. */
  listen(): () => void
  /**
   * Keep it in step with the lobby for as long as the interface is up.
   *
   * A hook: call it once, unconditionally, from something that is always
   * mounted. It listens for the session, asks each time you arrive somewhere
   * new, and forgets when you leave.
   */
  useSync(): void
}

/**
 * A setting the host of a lobby decides and everybody else is told.
 *
 * `tag` is the message type on the room channel and must be unique across
 * every choice in the build. `known` is the guard that decides whether a value
 * off the wire is one of yours.
 */
export function hostChoice<T extends string>(
  tag: string,
  known: (value: unknown) => value is T,
  fallback: T,
): Choice<T> {
  const store = createStore<T>(fallback)

  const announce = (): void => {
    if (!getNet().host) return
    sendToRoom(encodeChoice<T>(tag, { value: store.get() }))
  }

  const choice: Choice<T> = {
    use: () => useStore(store),
    get: () => store.get(),

    set(value) {
      // Alone you are your own host - `09-net` reports `host: true` when you
      // are not in a lobby - so this works before anybody has arrived.
      if (!getNet().host) return
      store.set(value)
      sendToRoom(encodeChoice<T>(tag, { value }))
    },

    reset: () => store.set(fallback),
    announce,
    ask: () => sendToRoom(encodeChoice<T>(tag, { ask: true })),

    listen() {
      return subscribeRoom((_from, raw) => {
        const message = decodeChoice(tag, known, raw)
        if (!message) return
        // The rule itself is `applyChoice`, which is pure and tested. This is
        // only the part that has to touch a store and a socket.
        const { value, answer } = applyChoice(store.get(), message, getNet().host)
        store.set(value)
        if (answer) announce()
      })
    },

    useSync() {
      const net = useNet()
      const joined = net.status === 'joined'
      const room = net.room

      useEffect(() => choice.listen(), [])

      useEffect(() => {
        if (joined) choice.ask()
        else choice.reset()
        // `room` is in here so that leaving one lobby for another asks again
        // rather than keeping the first one's answer.
      }, [joined, room])
    },
  }

  return choice
}
