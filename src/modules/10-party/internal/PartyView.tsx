/**
 * The scene entry: the board, and moving everybody onto it.
 *
 * The teleport happens exactly once, on the frame the phase changes. Placing
 * players every frame would mean nobody could walk once they arrived, and
 * placing them in React would mean it happened whenever React felt like
 * re-rendering rather than when the game started.
 */
import { useEffect, useRef } from 'react'
import { PRIORITY, useGameFrame } from '../../00-core'
import { getPlayerState, movePlayerTo } from '../../02-player'
import { getNet, getPeers } from '../../09-net'
import { Arena } from './ArenaView'
import { spawnFor } from './party'
import { forgetPlayer, getParty, listenForParty, resetParty } from './state'

export interface PartyProps {
  /**
   * Whether the game this module plays is the one the party has chosen.
   *
   * This is one game among several, and only one of them is being played. A
   * race up a volcano that moved everybody onto the island the moment any
   * game started would be in the way of every other game there will ever be.
   *
   * Passed in rather than imported, for the same reason as the ground the
   * player walks on: which game is running is a question for whatever is
   * composing the scene, and this module has never heard of a catalogue.
   * Left out, it is the only game there is.
   *
   * Read every frame, so it is a function and not a boolean - the choice can
   * change between renders without this component being one of them.
   */
  active?: () => boolean
}

export function Party({ active }: PartyProps) {
  /** The phase the last teleport was done for. */
  const placed = useRef<string>('off')

  // Read through a ref so a changed callback identity cannot re-run the frame
  // callback, which would drop a frame at exactly the wrong moment.
  const chosen = useRef(active)
  chosen.current = active

  useEffect(() => listenForParty(), [])

  useGameFrame(() => {
    const net = getNet()
    const party = getParty()

    // Out of a lobby there is nobody to play with, so the board goes away
    // rather than stranding you on it.
    if (net.status !== 'joined' && party.phase !== 'off') {
      resetParty()
      placed.current = 'off'
      return
    }

    // Anybody who has left stops counting towards everyone being ready, or the
    // host waits forever for somebody who closed their browser.
    const here = new Set(getPeers().map((p) => p.id))
    for (const id of party.ready) {
      if (id !== 'self' && !here.has(id)) forgetPlayer(id)
    }

    if (party.phase === placed.current) return
    placed.current = party.phase
    if (party.phase !== 'playing') return
    // Somebody else's game is starting. The island stays drawn - it is a place
    // - but nobody is moved onto it.
    if (chosen.current && !chosen.current()) return

    // Everybody works out their own place from the same list, in the same
    // order, so nobody has to be told where to stand and two people cannot be
    // given the same spot.
    const ids = [...getPeers().map((p) => p.id), net.id ?? 'self'].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true }),
    )
    const index = Math.max(0, ids.indexOf(net.id ?? 'self'))
    // World coordinates: the board is on its own island, a long way from the
    // spawn island, so there is nothing local about them.
    const spot = spawnFor(index, ids.length)
    if (getPlayerState()) movePlayerTo(spot.x, spot.y, spot.z)
  }, PRIORITY.simulation)

  // The island is always there - it is a place, not something conjured when a
  // game starts - so this renders whatever the phase, and whatever game the
  // party has chosen. You can swim out to it while other people play cards.
  return <Arena />
}
