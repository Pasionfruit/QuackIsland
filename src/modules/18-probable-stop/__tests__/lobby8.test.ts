/**
 * A full lobby: eight people in one game of Probable Stop.
 *
 * A host and seven guests, every message through JSON the way the relay hands
 * it over, each guest with its own copy of the game. What this checks: every
 * guest sees one game; each guest's wishes move them and nobody else; a
 * confirm from last round never leaks into the next; and the game plays to
 * the end with everybody agreeing who fell where.
 */
import { describe, expect, it } from 'vitest'
import { applyIntent, createGame, decideSafe, stepGame, type Game, type Intent } from '../internal/game'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
const GUESTS = IDS.slice(1)
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function lobby(seed = 777) {
  const host = createGame(seed, IDS.map((id) => ({ id, mine: id === 'p1' })), 99)
  const guests = new Map(GUESTS.map((id) => [id, waitingGame()]))
  const heard = new Map<string, Intent>()
  let frame = 0

  const tick = () => {
    if (host.phase === 'choosing') for (const [id, wish] of heard) applyIntent(host, id, wish)
    const round = host.round
    stepGame(host, 1 / 20)
    if (host.round !== round) heard.clear()
    if (frame++ % 2 === 1) {
      const wire = relay(encodeSnapshot(host))
      for (const [id, copy] of guests) applySnapshot(copy, decodeSnapshot(wire)!, id)
    }
  }
  const wish = (id: string, w: Intent) => heard.set(id, decodeIntent(relay(encodeIntent(w)))!)
  return { host, guests, tick, wish }
}

const byId = (g: Game, id: string) => g.players.find((p) => p.id === id)!

describe('eight people in one game', () => {
  it('shows every guest the same game, with themselves in it', () => {
    const { host, guests, tick } = lobby()
    tick()
    tick()
    for (const [id, copy] of guests) {
      expect(copy.id).toBe(host.id)
      expect(copy.players.map((p) => p.id)).toEqual(IDS)
      expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual([id])
    }
  })

  it("moves each guest to the path they asked for, and nobody else's", () => {
    const { host, guests, tick, wish } = lobby()
    GUESTS.forEach((id, i) => wish(id, { round: 0, pick: i % 3, confirmed: false }))
    tick()
    tick()
    GUESTS.forEach((id, i) => expect(byId(host, id).pick).toBe(i % 3))
    expect(byId(host, 'p1').pick).toBe(1)
    for (const copy of guests.values()) {
      GUESTS.forEach((id, i) => expect(byId(copy, id).pick).toBe(i % 3))
    }
  })

  it('cuts the countdown once all eight have confirmed', () => {
    const { host, tick, wish } = lobby()
    for (const id of GUESTS) wish(id, { round: 0, pick: 0, confirmed: true })
    applyIntent(host, 'p1', { round: 0, pick: 2, confirmed: true })
    tick()
    expect(host.clock).toBeLessThanOrEqual(1.5)
  })

  it('does not carry a confirm from one round into the next', () => {
    const { host, tick, wish } = lobby(12)
    // Everybody on a path that holds, so there is a second round to look at.
    const safe = decideSafe(host.seed, 0)[0]
    for (const id of IDS) {
      if (id === 'p1') applyIntent(host, id, { round: 0, pick: safe, confirmed: true })
      else wish(id, { round: 0, pick: safe, confirmed: true })
    }
    while (host.round === 0) {
      tick()
      // A guest that has not caught up keeps saying round 0.
      for (const id of GUESTS) wish(id, { round: 0, pick: safe, confirmed: true })
    }
    expect(host.phase).toBe('choosing')
    tick()
    for (const p of host.players) expect(p.confirmed).toBe(false)
  })

  it('plays to the end with every guest agreeing who fell, and when', () => {
    const { host, guests, tick, wish } = lobby(2024)
    for (let i = 0; i < 20000 && host.phase !== 'over'; i++) {
      GUESTS.forEach((id, n) => wish(id, { round: host.round, pick: (n + host.round) % 3, confirmed: true }))
      tick()
    }
    tick()
    tick()
    expect(host.phase).toBe('over')
    for (const copy of guests.values()) {
      expect(copy.phase).toBe('over')
      expect(copy.players.map((p) => [p.id, p.alive, p.outIn])).toEqual(host.players.map((p) => [p.id, p.alive, p.outIn]))
    }
  })
})
