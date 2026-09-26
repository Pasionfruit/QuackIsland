/**
 * One round on the wire: the snapshot, a guest's move - no claim message at
 * all, since a catch is host-derived every tick off trusted positions - and
 * a full lobby playing it out over a lossy relay.
 */
import { describe, expect, it } from 'vitest'
import { catchHiders, createRound, hidersOf, judgeEnd, look, report, ROUND, tick, walkHider, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeMove, decodeSnapshot, encodeMove, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 20260926

function host(n = 4, chosen = 'p2'): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), chosen, 41)
}

const hear = (round: Round, me: string) => applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, me)

describe('a snapshot', () => {
  it('carries who is the Hunter, every player and the winner once there is one', () => {
    const round = host(3)
    const hider = hidersOf(round)[0]
    hider.steppedAt = 1.2
    tick(round, 1.5)

    const copy = hear(round, 'p3')
    expect(copy.hunterId).toBe(round.hunterId)
    expect(copy.players.find((p) => p.id === round.hunterId)!.role).toBe('hunter')
    expect(copy.players.find((p) => p.id === hider.id)!.role).toBe('hider')
    expect(copy.players.map((p) => p.mine)).toEqual([false, false, true])

    round.winner = 'hunter'
    round.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p3')
    expect(copy.winner).toBe('hunter')
    expect(copy.over).toBe(true)
  })

  it('keeps a guest walking its own copy between snapshots, not snapping it back', () => {
    const round = host(2)
    const copy = hear(round, 'p2')
    copy.players[1].x += 0.7
    const x = copy.players[1].x
    const wasX = round.players[0].x
    round.players[0].x -= 0.3
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.players[1].x).toBe(x)
    expect(copy.players[0].x).toBeCloseTo(wasX - 0.3, 2)
  })

  it("keeps a guest's own sprinting flag local, never overwritten by a delayed echo of it", () => {
    const round = host(2)
    const copy = hear(round, 'p2')
    copy.players[1].sprinting = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.players[1].sprinting).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const round = host()
    const good = relay(encodeSnapshot(round))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'nope' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, w: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 'nobody-here' })).toBeNull()
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot(withField(1, 999999))).toBeNull()
    expect(decodeSnapshot(withField(6, -1))).toBeNull()
    expect(decodeSnapshot(withField(6, 8))).toBeNull()
  })

  it('fits in a relay message with eight players', () => {
    const round = host(8)
    round.players.forEach((p) => Object.assign(p, { id: `player-${p.id}-with-a-long-id` }))
    expect(JSON.stringify(encodeSnapshot(round)).length).toBeLessThan(2048)
  })

  it('starts a guest afresh when the host deals a new round', () => {
    const copy = hear(host(3), 'p2')
    copy.players[1].x += 1
    const next = createRound(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 'p1', 42)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p2')
    expect(copy.id).toBe(42)
    expect(copy.players[1].x).toBeCloseTo(next.players[1].x, 2)
  })
})

describe('what a guest sends', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeMove(relay(encodeMove(41, { x: 1.23456, z: -2.5, yaw: 0.5, pitch: -0.25, sprint: true })))).toEqual({
      round: 41,
      x: 1.235,
      z: -2.5,
      yaw: 0.5,
      pitch: -0.25,
      sprint: true,
    })
    expect(decodeMove({ t: 'bbn-mv', g: 41, x: 99999, z: 0, y: 0, p: 0, s: 0 })).toBeNull()
    expect(decodeMove({ t: 'bbn-mv', g: 41, x: 1, z: 0, y: 0, p: 3, s: 0 })).toBeNull()
    expect(decodeMove({ t: 'bbn-mv', g: 41, x: 1, z: 0, y: 0, p: 0, s: 2 })).toBeNull()
    expect(decodeMove({ t: 'bbn-mv', g: 41, x: 1, z: 0, y: 0, p: 0 })).toBeNull()
    expect(decodeMove({ t: 'nope', g: 41, x: 1, z: 0, y: 0, p: 0, s: 0 })).toBeNull()
  })
})

describe('a full lobby', () => {
  it('agrees on alive, left and the winner - with messages lost, over a real maze', () => {
    const round = host(5, 'p2')
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = round.players.slice(1).map((p, i) => ({ id: p.id, index: i + 1, copy: hear(round, p.id), lastHeard: 0 }))
    const dt = 1 / 30
    const heardMoves: { from: string; round: number; x: number; z: number; yaw: number; pitch: number; sprint: boolean }[] = []

    // Nobody chases anybody - each Hider only jitters gently in place, so the
    // round is guaranteed to end on the buzzer, exercising the clock, the
    // wire, and `report`'s footstep bookkeeping without depending on anyone
    // successfully navigating the maze to a catch.
    for (let frame = 0; !round.over && frame < 30 * (ROUND.limit + 5); frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        tick(copy, dt)
        const me = copy.players.findIndex((p) => p.mine)
        const mine = copy.players[me]
        if (!mine || !mine.alive || mine.left) continue
        if (mine.role === 'hider') {
          const yaw = random() * Math.PI * 2
          look(copy, me, yaw, 0)
          walkHider(copy, me, { forward: random() < 0.5 ? 1 : 0, right: (random() - 0.5) * 0.4 }, dt)
        }
        if (frame % 2 === 0 && random() > 0.2) {
          heardMoves.push({ from: guest.id, round: copy.id, x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, sprint: mine.sprinting })
        }
      }

      for (const said of heardMoves.splice(0)) {
        const said2 = decodeMove(relay(encodeMove(said.round, said)))
        const player = round.players.findIndex((p) => p.id === said.from)
        if (!said2 || player < 0 || said2.round !== round.id) continue
        const guest = guests.find((g) => g.id === said.from)!
        report(round, player, said2, said2.yaw, said2.pitch, round.elapsed - guest.lastHeard, said2.sprint)
        guest.lastHeard = round.elapsed
      }
      tick(round, dt)
      catchHiders(round)
      judgeEnd(round)

      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(round))
        for (const guest of guests) if (random() > 0.15) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }

    expect(round.over).toBe(true)
    expect(round.winner).toBe('hider')
    for (const guest of guests) {
      applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(round)))!, guest.id)
      expect(guest.copy.winner).toBe(round.winner)
      expect(guest.copy.players.map((p) => [p.id, p.alive, p.left])).toEqual(round.players.map((p) => [p.id, p.alive, p.left]))
    }
  })
})
