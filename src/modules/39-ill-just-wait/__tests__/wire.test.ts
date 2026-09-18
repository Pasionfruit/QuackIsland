/**
 * The game on the wire: everybody's clock goes out, and nothing malformed comes in.
 */
import { describe, expect, it } from 'vitest'
import { answerFor, confirm, createGame, setHand } from '../internal/rules'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const hostGame = () => createGame(31337, [{ id: 'h', mine: true }, { id: 'g' }, { id: 'x' }], 5)

describe('the snapshot', () => {
  it('round-trips everybody\'s clock and progress', () => {
    const g = hostGame()
    g.clock = 17.123
    setHand(g, 2, 123)
    confirm(g, 1, 0, answerFor(g, 0))
    const snap = decodeSnapshot(encodeSnapshot(g))!
    expect(snap).toMatchObject({ id: 5, seed: 31337, clock: 17.12, over: false })
    expect(snap.players[2]).toEqual(['x', 123, [-1, -1, -1], 0])
    expect(snap.players[1][2][0]).toBe(17.12)
  })

  it('refuses what is not one', () => {
    const good = encodeSnapshot(hostGame())
    expect(decodeSnapshot({ ...good, t: 'ti' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 720, [-1, -1, -1], 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['a', 5, [-1, -1], 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: -1 })).toBeNull()
  })

  it('shows a guest everybody\'s clock but its own', () => {
    const host = hostGame()
    setHand(host, 0, 300)
    setHand(host, 1, 50)
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    guest.players[1].minutes = 77
    setHand(host, 1, 51)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    expect(guest.players[0].minutes).toBe(300)
    expect(guest.players[1]).toMatchObject({ id: 'g', mine: true, minutes: 77 })
  })

  it('keeps a target the guest has got until the host shows it - unless the game is over', () => {
    const host = hostGame()
    const guest = createGame(0, [])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g')
    guest.players[1].solved[0] = 4
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g', [0])
    expect(guest.players[1].solved[0]).toBe(4)
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g', [])
    expect(guest.players[1].solved[0]).toBeNull()
    guest.players[1].solved[0] = 4
    host.over = true
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'g', [0])
    expect(guest.players[1].solved[0]).toBeNull()
  })
})

describe('the intent', () => {
  it('round-trips a reading and its answers', () => {
    const said = { game: 5, minutes: 42, answers: [{ stage: 0, minutes: 230 }] }
    expect(decodeIntent(encodeIntent(said))).toEqual(said)
  })

  it('refuses what is not one', () => {
    expect(decodeIntent({ t: 'ijw-in', g: 5, m: 720, a: [] })).toBeNull()
    expect(decodeIntent({ t: 'ijw-in', g: 5, m: 1, a: [[3, 5]] })).toBeNull()
    expect(decodeIntent({ t: 'ijw-in', g: 5, m: 1, a: [[0]] })).toBeNull()
    expect(decodeIntent({ t: 'ijw', g: 5, m: 1, a: [] })).toBeNull()
  })
})
