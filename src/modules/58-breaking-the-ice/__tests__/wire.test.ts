/**
 * One round on the wire - players, tile damage, and eight of them playing through it.
 */
import { describe, expect, it } from 'vitest'
import {
  LAYERS,
  broken,
  createRound,
  stepRound,
  tileIndex,
  type Intent,
  type Round,
} from '../internal/rules'
import { waitingRound } from '../internal/setup'
import {
  applySnapshot,
  applyTiles,
  decodeIntent,
  decodeSnapshot,
  decodeTiles,
  encodeIntent,
  encodeSnapshot,
  encodeTiles,
  sparseDamage,
} from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 321

function host(n = 3): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 77)
}

describe('a player snapshot', () => {
  it('comes back as the round that went out, layer and all', () => {
    const round = host()
    const [a, b] = round.players
    Object.assign(a, { x: 0, z: 0, yaw: 0, layer: 0, y: LAYERS[0].y, grounded: true })
    b.alive = false
    b.eliminatedAt = 12.5

    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.id).toBe(77)
    for (const p of round.players) {
      const c = copy.players.find((x) => x.id === p.id)!
      expect([c.alive, c.layer, c.grounded]).toEqual([p.alive, p.layer, p.grounded])
      expect(c.x).toBeCloseTo(p.x, 1)
      expect(c.y).toBeCloseTo(p.y, 1)
      if (p.eliminatedAt !== null) expect(c.eliminatedAt).toBeCloseTo(p.eliminatedAt, 1)
    }
    expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['p2'])
  })

  it('updates the players a guest already has, and deals a new round - and its tiles - on a new id', () => {
    const round = host()
    const copy = applySnapshot(waitingRound(), decodeSnapshot(encodeSnapshot(round))!, 'p1')
    const before = [...copy.players]
    round.players[0].x += 1
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(round))!, 'p1')
    copy.players.forEach((p, i) => expect(p).toBe(before[i]))
    copy.tiles.crackedAt[0] = 3

    const next = createRound(1, [{ id: 'p1' }, { id: 'p2' }], 78)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(next))!, 'p1')
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.players.every((p) => p.alive)).toBe(true)
    expect(copy.tiles.crackedAt[0]).toBeNull()
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot({ ...good, t: 'dh' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot(withField(0, 7))).toBeNull()
    expect(decodeSnapshot(withField(5, 3))).toBeNull()
    expect(decodeSnapshot(withField(6, 2))).toBeNull()
    expect(decodeSnapshot(withField(7, -1))).toBeNull()
    expect(decodeSnapshot(withField(8, 'soon'))).toBeNull()
  })

  it('fits in a relay message with eight on the ice', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(1024)
  })
})

describe('tile damage', () => {
  it('sends only what a player did, never what the shrink already claimed', () => {
    const round = host()
    round.tiles.crackedAt[tileIndex(0, 4, 4)] = 1
    round.tiles.instantAt[tileIndex(0, 0, 0)] = 2 // ring 4, claimed by the shrink well before elapsed 70
    round.elapsed = 70
    const sparse = sparseDamage(round)
    expect(sparse.some(([i]) => i === tileIndex(0, 4, 4))).toBe(true)
    expect(sparse.some(([i]) => i === tileIndex(0, 0, 0))).toBe(false)
  })

  it('comes back as the marks that went out, and merges onto what a guest already has', () => {
    const round = host()
    round.tiles.crackedAt[tileIndex(0, 4, 4)] = 5
    round.tiles.instantAt[tileIndex(1, 4, 4)] = 6
    const copy = createRound(SEED, [{ id: 'p1' }], 77)
    applyTiles(copy, decodeTiles(relay(encodeTiles(round)))!)
    expect(copy.tiles.crackedAt[tileIndex(0, 4, 4)]).toBe(5)
    expect(copy.tiles.instantAt[tileIndex(1, 4, 4)]).toBe(6)
  })

  it('is refused whole rather than half-read', () => {
    expect(decodeTiles({ t: 'nope', g: 1, d: [] })).toBeNull()
    expect(decodeTiles({ t: 'bti-t', g: 1, d: [[0, 3, 0]] })).toBeNull()
    expect(decodeTiles({ t: 'bti-t', g: 1, d: [[-1, 1, 0]] })).toBeNull()
    expect(decodeTiles({ t: 'bti-t', g: 1, d: [[0, 1]] })).toBeNull()
    expect(decodeTiles({ t: 'bti-t', g: -1, d: [] })).toBeNull()
  })

  it('never rejects the round even at the worst case: every real tile player-damaged, eight on the ice', () => {
    const round = host(8)
    for (let layer = 0; layer < LAYERS.length; layer++) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) round.tiles.crackedAt[tileIndex(layer, row, col)] = 0
      }
    }
    const size = JSON.stringify(encodeTiles(round)).length
    expect(size).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its round', () => {
    const said = decodeIntent(relay(encodeIntent({ x: 0.5, z: -0.5, yaw: 1.2, breaks: 2, jumps: 1, pushes: 0 }, 12)))!
    expect(said.round).toBe(12)
    expect(said.intent.x).toBeCloseTo(0.5)
    expect(said.intent.z).toBeCloseTo(-0.5)
    expect(said.intent.yaw).toBeCloseTo(1.2)
    expect(said.intent.breaks).toBe(2)
    expect(said.intent.jumps).toBe(1)
  })

  it('cannot ask for more than full speed, and is refused when a count is missing or negative', () => {
    const fast = decodeIntent({ t: 'bti-in', r: 1, x: 30, z: 40, w: 0, b: 0, j: 0, u: 0 })!
    expect(Math.hypot(fast.intent.x, fast.intent.z)).toBeCloseTo(1)
    expect(decodeIntent({ t: 'bti-in', r: 1, x: 0, z: 0, w: 0, b: -1, j: 0, u: 0 })).toBeNull()
    expect(decodeIntent({ t: 'bti-in', x: 0, z: 0, w: 0, b: 0, j: 0, u: 0 })).toBeNull()
  })
})

describe('eight players in one round', () => {
  it('agree on who fell in and where, with messages repeated and some lost', () => {
    const round = host(8)
    const guests = round.players.slice(1).map((p) => ({ id: p.id, copy: waitingRound() }))
    const heard = new Map<string, Intent>()
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

    for (let frame = 0; frame < 60 * 60 && !round.over; frame++) {
      for (const guest of guests) {
        const me = round.players.find((p) => p.id === guest.id)!
        if (!me.alive) continue
        const dx = -me.x
        const dz = -me.z
        const length = Math.hypot(dx, dz) || 1
        const breaks = frame % 90 === guests.indexOf(guest) * 11 ? me.breaks + 1 : me.breaks
        const intent: Intent = { x: dx / length, z: dz / length, yaw: 0, breaks, jumps: 0, pushes: 0 }
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent(intent, round.id)))!
        if (said.round === round.id) heard.set(guest.id, said.intent)
      }
      stepRound(round, heard, 1 / 60)
      if (frame % 3 === 0) {
        const snap = relay(encodeSnapshot(round))
        const tiles = relay(encodeTiles(round))
        for (const guest of guests) {
          applySnapshot(guest.copy, decodeSnapshot(snap)!, guest.id)
          applyTiles(guest.copy, decodeTiles(tiles)!)
        }
      }
    }
    const snap = relay(encodeSnapshot(round))
    const tiles = relay(encodeTiles(round))
    for (const guest of guests) {
      applySnapshot(guest.copy, decodeSnapshot(snap)!, guest.id)
      applyTiles(guest.copy, decodeTiles(tiles)!)
    }

    expect(round.players.some((p) => !p.alive)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.alive, p.layer])).toEqual(round.players.map((p) => [p.id, p.alive, p.layer]))
      // Every tile the host still thinks is broken by a player's own mark, the guest agrees is broken too.
      for (let layer = 0; layer < LAYERS.length; layer++) {
        for (let row = 0; row < 9; row++) {
          for (let col = 0; col < 9; col++) {
            if (!broken(round.tiles, layer as 0 | 1 | 2, row, col, round.elapsed)) continue
            expect(broken(guest.copy.tiles, layer as 0 | 1 | 2, row, col, round.elapsed)).toBe(true)
          }
        }
      }
    }
  })
})
