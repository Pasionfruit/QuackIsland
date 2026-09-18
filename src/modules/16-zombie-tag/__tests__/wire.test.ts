/**
 * One round, shared across a lobby.
 *
 * The host's arena goes out as a snapshot and comes back as a guest's arena,
 * and a guest's keys go the other way. Everything that can silently go wrong
 * with that - a field read back in the wrong order, a body rebuilt instead of
 * moved, a push dropped between two frames - is arithmetic, so it is checked
 * here rather than with two browsers open.
 */
import { describe, expect, it } from 'vitest'
import { NO_INTENT, createRound, stepRound, type Intent, type Round } from '../internal/round'
import { SOLO_RUNNERS, emptyRound, lobbyRoster, newRound } from '../internal/setup'
import {
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  hearIntent,
} from '../internal/wire'

/** What the relay actually hands over: the message, through JSON and back. */
const overTheWire = (message: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(message)) as Record<string, unknown>

function hostRound(): Round {
  return newRound({ ids: ['p1', 'p2', 'p3'], me: 'p1' })
}

describe('a snapshot', () => {
  it('comes back as the round that went out', () => {
    const host = hostRound()
    const still = new Map<string, Intent>()
    for (let i = 0; i < 30; i++) stepRound(host, still, 1 / 30)

    const snap = decodeSnapshot(overTheWire(encodeSnapshot(host)))
    expect(snap).not.toBeNull()
    const guest = applySnapshot(emptyRound(), snap!, 'p2')

    expect(guest.bodies.map((b) => b.id)).toEqual(host.bodies.map((b) => b.id))
    for (const body of host.bodies) {
      const copy = guest.bodies.find((b) => b.id === body.id)!
      expect(copy.x).toBeCloseTo(body.x, 1)
      expect(copy.y).toBeCloseTo(body.y, 1)
      expect(copy.side).toBe(body.side)
      expect(copy.caughtAt).toBe(body.caughtAt)
    }
    expect(guest.elapsed).toBeCloseTo(host.elapsed, 1)
    expect(guest.over).toBe(host.over)
  })

  it('carries the push cooldown, so a guest can see theirs count down', () => {
    const host = hostRound()
    host.bodies.find((b) => b.id === 'p2')!.cooldown = 2.4
    const guest = applySnapshot(emptyRound(), decodeSnapshot(overTheWire(encodeSnapshot(host)))!, 'p2')
    expect(guest.bodies.find((b) => b.id === 'p2')!.cooldown).toBeCloseTo(2.4)
  })

  it('marks as yours the body with your id, and no other', () => {
    const snap = decodeSnapshot(overTheWire(encodeSnapshot(hostRound())))!
    const guest = applySnapshot(emptyRound(), snap, 'p2')
    expect(guest.bodies.filter((b) => b.mine).map((b) => b.id)).toEqual(['p2'])
  })

  it('carries the end of a round, and the winner', () => {
    const host = createRound([
      { id: 'p1', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'p2', at: { x: 3, y: 0 }, side: 'zombie' },
    ])
    for (let i = 0; i < 60; i++) stepRound(host, new Map(), 1 / 60)
    expect(host.over).toBe(true)

    const guest = applySnapshot(emptyRound(), decodeSnapshot(overTheWire(encodeSnapshot(host)))!, 'p2')
    expect(guest.over).toBe(true)
    expect(guest.winner).toBe('p1')
  })

  it('moves the bodies a guest already has rather than building new ones', () => {
    const host = hostRound()
    const guest = applySnapshot(emptyRound(), decodeSnapshot(encodeSnapshot(host))!, 'p2')
    const before = [...guest.bodies]

    host.bodies[0].x += 1
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'p2')
    guest.bodies.forEach((body, i) => expect(body).toBe(before[i]))
  })

  it('takes a guest out of a finished round and into the next one', () => {
    const over = createRound([
      { id: 'p1', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'p2', at: { x: 3, y: 0 }, side: 'zombie' },
    ])
    for (let i = 0; i < 60; i++) stepRound(over, new Map(), 1 / 60)
    const guest = applySnapshot(emptyRound(), decodeSnapshot(encodeSnapshot(over))!, 'p2')
    expect(guest.over).toBe(true)

    const next = newRound({ ids: ['p1', 'p2'], me: 'p1' })
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(next))!, 'p2')
    expect(guest.over).toBe(false)
    expect(guest.winner).toBeNull()
    expect(guest.bodies.find((b) => b.id === 'p2')!.side).toBe('player')
    expect(guest.bodies.find((b) => b.id === 'p2')!.caughtAt).toBeNull()
  })

  it('drops a body the host no longer has', () => {
    const host = hostRound()
    const guest = applySnapshot(emptyRound(), decodeSnapshot(encodeSnapshot(host))!, 'p2')
    host.bodies = host.bodies.filter((b) => b.id !== 'p3')
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'p2')
    expect(guest.bodies.map((b) => b.id)).not.toContain('p3')
  })

  it('is refused whole rather than half-read', () => {
    const good = overTheWire(encodeSnapshot(hostRound()))
    const bodies = good.b as unknown[][]

    expect(decodeSnapshot({ ...good, t: 'duck' })).toBeNull()
    expect(decodeSnapshot({ ...good, e: 'soon' })).toBeNull()
    expect(decodeSnapshot({ ...good, b: [bodies[0].slice(0, 8), ...bodies.slice(1)] })).toBeNull()
    expect(decodeSnapshot({ ...good, b: [[...bodies[0].slice(0, 1), null, ...bodies[0].slice(2)]] })).toBeNull()
    expect(decodeSnapshot({ ...good, b: [['', ...bodies[0].slice(1)]] })).toBeNull()
  })

  it("refuses a round with nobody in it, which could only wipe everybody else's", () => {
    // What a guest that took over as host before being dealt anything would
    // send: an empty arena, already over.
    expect(decodeSnapshot(overTheWire(encodeSnapshot(emptyRound())))).toBeNull()
  })

  it('fits in a relay message with a full arena in it', () => {
    const full = newRound({ ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], me: 'p1' })
    expect(JSON.stringify(encodeSnapshot(full)).length).toBeLessThan(4096)
  })
})

describe("a guest's keys", () => {
  it('come back as what was pressed', () => {
    expect(decodeIntent(overTheWire(encodeIntent({ x: 0.6, y: -0.8, push: true })))).toEqual({
      x: 0.6,
      y: -0.8,
      push: true,
    })
  })

  it('cannot ask for more than full speed', () => {
    const intent = decodeIntent({ t: 'zt-in', x: 30, y: 40, p: 0 })!
    expect(Math.hypot(intent.x, intent.y)).toBeCloseTo(1)
  })

  it('are refused when they are not keys', () => {
    expect(decodeIntent({ t: 'zt-in', x: 'left', y: 0, p: 0 })).toBeNull()
    expect(decodeIntent({ t: 'zt', x: 0, y: 0, p: 0 })).toBeNull()
    expect(decodeIntent({ t: 'zt-in', x: 0, y: 0, p: 2 })).toBeNull()
  })

  it('keep a push that arrived just before a key was let go', () => {
    const pushed = hearIntent(undefined, { x: 1, y: 0, push: true })
    const released = hearIntent(pushed, NO_INTENT)
    expect(released).toEqual({ x: 0, y: 0, push: true })
  })

  it('do not invent a push nobody threw', () => {
    expect(hearIntent({ x: 1, y: 0, push: false }, { x: 0, y: 1, push: false }).push).toBe(false)
  })
})

describe('the roster', () => {
  it('fills the empty seats when nobody else is here', () => {
    const ids = lobbyRoster()
    expect(ids).toHaveLength(SOLO_RUNNERS)
    expect(newRound({ ids }).over).toBe(false)
  })

  it('deals the people in the lobby, with nobody filling in', () => {
    const round = newRound({ ids: ['p1', 'p2'], me: 'p2' })
    expect(round.bodies.filter((b) => b.side === 'player').map((b) => b.id)).toEqual(['p1', 'p2'])
    expect(round.bodies.filter((b) => b.mine).map((b) => b.id)).toEqual(['p2'])
  })
})
