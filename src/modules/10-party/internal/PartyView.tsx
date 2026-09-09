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

export function Party() {
  /** The phase the last teleport was done for. */
  const placed = useRef<string>('off')

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
  // game starts - so this renders whatever the phase.
  return <Arena />
}
