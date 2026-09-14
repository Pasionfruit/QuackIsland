/**
 * Which game this lobby is playing, and how that stays the same for everybody.
 *
 * The rules are in `modes.ts` and are pure; this is the part that has to talk
 * to other browsers. It goes through `09-net`'s room channel, exactly as the
 * party phase does - so the transport never learns what a game mode is, and
 * this file never learns what a WebSocket is.
 *
 * **The host owns the choice**, the same way it owns the clock, the weather
 * and the party phase. Alone you are your own host, so picking a game on your
 * own works and nothing is taken away by joining a lobby of one.
 */
import { useEffect } from 'react'
import { createStore, useStore } from '../../00-core'
import { getNet, sendToRoom, subscribeRoom, useNet } from '../../09-net'
import { DEFAULT_MODE, decodeMode, encodeMode, type ModeId } from './modes'

const store = createStore<ModeId>(DEFAULT_MODE)

export function useGameMode(): ModeId {
  return useStore(store)
}

/** Read outside React - by the scene, every frame, to place a game or not. */
export function getGameMode(): ModeId {
  return store.get()
}

/**
 * Points the party at a game. Host only.
 *
 * A guest pressing this would change the game for nobody but themselves and
 * then be dragged back the next time the host said anything, which is worse
 * than a button that plainly does not move.
 */
export function chooseMode(id: ModeId): void {
  if (!getNet().host) return
  store.set(id)
  sendToRoom(encodeMode({ mode: id }))
}

/** Tells everyone what is selected. The host's answer to a new arrival. */
export function announceMode(): void {
  if (!getNet().host) return
  sendToRoom(encodeMode({ mode: store.get() }))
}

/** Asks the host what everybody is playing. */
export function askForMode(): void {
  sendToRoom(encodeMode({ ask: true }))
}

/** Back to the default, for leaving a lobby. */
export function resetMode(): void {
  store.set(DEFAULT_MODE)
}

/**
 * Starts listening. One subscription for the page - see `useModeSync`.
 *
 * Two jobs: a guest takes the host's choice, and the host answers anybody who
 * asks. The answer is what makes joining half way through work - a lobby that
 * only broadcast on change would leave everyone who arrived afterwards looking
 * at the wrong game.
 */
export function listenForModes(): () => void {
  return subscribeRoom((_from, raw) => {
    const message = decodeMode(raw)
    if (!message) return

    const host = getNet().host

    // Only the host's copy counts. Two clients each believing they are host
    // would otherwise take turns dragging the lobby between games.
    if (message.mode !== undefined && !host) store.set(message.mode)

    if (message.ask && host) announceMode()
  })
}

/**
 * Keeps the choice in step with the lobby, for as long as the interface is up.
 *
 * Call it once, from something that is always mounted. It listens for the
 * whole session, asks what is being played each time you arrive somewhere new,
 * and forgets the answer when you leave - on your own again, the choice is
 * yours and it starts from the default rather than from whatever the last
 * lobby happened to be doing.
 */
export function useModeSync(): void {
  const net = useNet()
  const joined = net.status === 'joined'
  const room = net.room

  useEffect(() => listenForModes(), [])

  useEffect(() => {
    if (joined) askForMode()
    else resetMode()
    // `room` is in here so that leaving one lobby and joining another asks
    // again rather than keeping the first lobby's game.
  }, [joined, room])
}
