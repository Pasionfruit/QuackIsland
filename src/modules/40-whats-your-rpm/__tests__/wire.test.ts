/**
 * The game on the wire: everybody's progress goes out, and nothing malformed comes in.
 */
import { describe, expect, it } from 'vitest'
import { createGame, scroll, skipAd } from '../internal/rules'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const hostGame = () => createGame(31337, [{ id: 'h', mine: true }, { id: 'g' }, { id: 'x' }], 5)

describe('the snapshot', () => {
  it('round-trips everybody\'s progress', () => {
    const g = hostGame()
    g.clock = 17.123
    scroll(g, 2, 2.345)
    const snap = decodeSnapshot(encodeSnapshot(g))!
    expect(snap).toMatchObject({ id: 5, seed: 31337, clock: 17.12, over: false })
    expect(snap.players[2]).toEqual(['x', 2.35, 0, -1, 0])
  })

  it('refuses what is not one', () => {
    const good = encodeSnapshot(hostGame())
    expect(decodeSnapshot({ ...good, t: 'ijw' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 61, 0, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 5, 0.5, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 5, 0, -2, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 5, 0, -1]] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: -1 })).toBeNull()
  })

  it('gives a guest the feed, and everybody\'s progress', () => {
    const host = hostGame()
    scroll(host, 0, 2)
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.ads).toEqual(host.ads)
    expect(guest.players.map((p) => p.progress)).toEqual([2, 0, 0])
    expect(guest.players[1].mine).toBe(true)
  })

  it('keeps a guest\'s own scrolling ahead of what the host has heard - until the game is over', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    scroll(guest, 1, 100, false)
    skipAd(guest, 1, 0)
    scroll(guest, 1, 1, false)
    const ahead = guest.players[1].progress
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[1]).toMatchObject({ progress: ahead, skipped: 1 })
    host.over = true
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[1]).toMatchObject({ progress: 0, skipped: 0 })
  })

  it('starts afresh on a new game', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    scroll(guest, 1, 2, false)
    const next = createGame(777, [{ id: 'h', mine: true }, { id: 'g' }], 6)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(next))!, 'g')
    expect(guest.id).toBe(6)
    expect(guest.ads).toEqual(next.ads)
    expect(guest.players[1].progress).toBe(0)
  })
})

describe('the intent', () => {
  it('round-trips how far a guest has got', () => {
    const said = { game: 5, progress: 12.5, skipped: 3 }
    expect(decodeIntent(encodeIntent(said))).toEqual(said)
  })

  it('refuses what is not one', () => {
    expect(decodeIntent({ t: 'rpm-in', g: 5, p: 61, s: 0 })).toBeNull()
    expect(decodeIntent({ t: 'rpm-in', g: 5, p: -1, s: 0 })).toBeNull()
    expect(decodeIntent({ t: 'rpm-in', g: 5, p: 1, s: 99 })).toBeNull()
    expect(decodeIntent({ t: 'rpm', g: 5, p: 1, s: 0 })).toBeNull()
  })
})
