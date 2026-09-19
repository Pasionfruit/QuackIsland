/**
 * The game on the wire: everybody's pieces go out, and nothing malformed comes in.
 */
import { describe, expect, it } from 'vitest'
import { FULL, createGame, place } from '../internal/rules'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const hostGame = () => createGame(31337, [{ id: 'h', mine: true }, { id: 'g' }, { id: 'x' }], 5)

describe('the snapshot', () => {
  it('round-trips everybody\'s pieces', () => {
    const g = hostGame()
    g.clock = 17.123
    place(g, 2, 0b1011)
    const snap = decodeSnapshot(encodeSnapshot(g))!
    expect(snap).toMatchObject({ id: 5, seed: 31337, clock: 17.12, over: false })
    expect(snap.players[2]).toEqual(['x', 0b1011, -1, 0])
  })

  it('refuses what is not one', () => {
    const good = encodeSnapshot(hostGame())
    expect(decodeSnapshot({ ...good, t: 'rpm' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 64, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 1.5, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 1, -2, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 1, -1]] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: -1 })).toBeNull()
  })

  it('gives a guest everybody\'s pieces', () => {
    const host = hostGame()
    place(host, 0, 0b11)
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.seed).toBe(31337)
    expect(guest.players.map((p) => p.placed)).toEqual([0b11, 0, 0])
    expect(guest.players[1].mine).toBe(true)
  })

  it('keeps a guest\'s own pieces in ahead of what the host has heard - until the game is over', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    place(guest, 1, 0b110)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[1].placed).toBe(0b110)
    host.over = true
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[1].placed).toBe(0)
  })

  it('takes the host\'s word on when a guest finished', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    guest.clock = 10
    place(guest, 1, FULL)
    expect(guest.players[1].finishedAt).toBe(10)
    host.clock = 10.4
    place(host, 1, FULL)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[1].finishedAt).toBe(10.4)
  })

  it('starts afresh on a new game', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    place(guest, 1, 0b1)
    const next = createGame(777, [{ id: 'h', mine: true }, { id: 'g' }], 6)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(next))!, 'g')
    expect(guest.id).toBe(6)
    expect(guest.seed).toBe(777)
    expect(guest.players[1].placed).toBe(0)
  })
})

describe('the intent', () => {
  it('round-trips which pieces a guest has in', () => {
    const said = { game: 5, placed: 0b101010 }
    expect(decodeIntent(encodeIntent(said))).toEqual(said)
  })

  it('refuses what is not one', () => {
    expect(decodeIntent({ t: 'op-in', g: 5, m: 64 })).toBeNull()
    expect(decodeIntent({ t: 'op-in', g: 5, m: -1 })).toBeNull()
    expect(decodeIntent({ t: 'op-in', g: -5, m: 1 })).toBeNull()
    expect(decodeIntent({ t: 'op', g: 5, m: 1 })).toBeNull()
  })
})
