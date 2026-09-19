/**
 * One game on the wire - a lobby collecting its pieces through a lossy relay.
 */
import { describe, expect, it } from 'vitest'
import { officeFor, route } from '../internal/office'
import {
  BODY,
  LOOSE,
  PLACED,
  act,
  atDesk,
  claimAct,
  claimFire,
  clock,
  coastRockets,
  createGame,
  deskOf,
  explode,
  fire,
  isArmed,
  judgeEnd,
  pieceInReach,
  piecesOf,
  report,
  stepGame,
  tick,
  walk,
  type Game,
} from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeAct, decodeMove, decodeSnapshot, encodeAct, encodeMove, encodeSnapshot } from '../internal/wire'
import { EAST, arm, away, clearing, lane, stand } from './places'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777002

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 41)
}

const hear = (game: Game, me: string) => applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, me)

describe('a snapshot', () => {
  it('carries every player and piece, and a guest keeps its own player where its own screen has it', () => {
    const game = host(3)
    const k = piecesOf(game, 1)[0]
    stand(game, 1, game.pieces[k].x, game.pieces[k].z)
    act(game, 1)
    const copy = hear(game, 'p3')
    expect(copy.players.map((p) => [p.id, p.mine, p.slot, p.carrying])).toEqual(game.players.map((p) => [p.id, p.id === 'p3', p.slot, p.carrying]))
    expect(copy.pieces.map((it) => it.state)).toEqual(game.pieces.map((it) => it.state))
    expect(copy.pieces[5].x).toBeCloseTo(game.pieces[5].x, 2)

    // The guest walks; the host has not heard.
    copy.players[2].x += 0.5
    const x = copy.players[2].x
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBe(x)
    // Once it is over, the host's word is everything.
    game.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBeCloseTo(game.players[2].x, 2)
    expect(copy.over).toBe(true)
  })

  it("keeps a guest's own pieces as its screen has them, just after it did something, until the host has heard", () => {
    const game = host(2)
    const copy = hear(game, 'p2')
    const k = piecesOf(copy, 1)[0]
    stand(copy, 1, copy.pieces[k].x, copy.pieces[k].z)
    stepGame(copy, 0.1)
    expect(act(copy, 1)).toBe('pick')
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2', true)
    expect(copy.players[1].carrying).toBe(k)
    expect(copy.pieces[k].state).not.toBe(LOOSE)
    // Held no longer: the host's word.
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2', false)
    expect(copy.players[1].carrying).toBe(-1)
    expect(copy.pieces[k].state).toBe(LOOSE)
  })

  it("carries rockets and blasts, and lets go of a guest's own rocket once the host's arrives", () => {
    const game = arm(host(3), 1)
    const { x, z } = lane(SEED)
    stand(game, 1, x, z, EAST)
    away(game, 0, { x, z }, { x: x + 12, z })
    away(game, 2, { x, z }, { x: x + 12, z })
    const copy = hear(game, 'p2')
    stand(copy, 1, x, z, EAST)
    stepGame(game, 0.1)
    tick(copy, 0.1)
    // The guest draws its own at once.
    expect(fire(copy, 1, false)).not.toBe(null)
    expect(copy.rockets.map((r) => r.seq)).toEqual([0])
    // The host hears it and fires the real one.
    expect(claimFire(game, 1, { x, z, yaw: EAST })).not.toBe(null)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.rockets.map((r) => r.seq)).toEqual([game.rockets[0].seq])
    // It coasts on between snapshots, and bursts only on the host.
    const before = copy.rockets[0].x
    coastRockets(copy, 0.1)
    expect(copy.rockets[0].x).toBeGreaterThan(before)
    for (let i = 0; i < 90 && game.rockets.length > 0; i++) stepGame(game, 1 / 30)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.rockets).toHaveLength(0)
    expect(copy.blasts).toHaveLength(1)
    expect(copy.blasts[0]).toMatchObject({ by: 1, x: game.blasts[0].x })
  })

  it('carries who a blast took', () => {
    const game = arm(host(3), 0)
    const { x, z } = clearing(SEED)
    away(game, 0, { x, z })
    stand(game, 1, x, z)
    stand(game, 2, x + 1, z)
    stepGame(game, 1)
    const copy = hear(game, 'p1')
    explode(game, 0, { x: x + 0.5, z })
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    expect(copy.blasts[copy.blasts.length - 1].victims).toEqual([1, 2])
    expect(copy.players.map((p) => p.out)).toEqual(game.players.map((p) => p.out))
    expect(copy.players[0].kills).toBe(2)
  })

  it('refuses anything malformed, whole', () => {
    const game = host(3)
    const good = relay(encodeSnapshot(game))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    expect(broken((m) => (m.t = 'nope'))).toBe(null)
    expect(broken((m) => (m.k as unknown[]).pop())).toBe(null)
    expect(broken((m) => ((m.k as number[][])[0][2] = 3))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 99999))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][8] = 99))).toBe(null)
    expect(broken((m) => (m.r = [[1, 7, 0, 0, 0, 100]]))).toBe(null)
    expect(broken((m) => (m.b = [[1, 0, 0, 0, 1 << 5]]))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    expect(decodeMove(relay(encodeMove(3, { x: 1.23456, z: -2, yaw: 0.5 })))).toEqual({ game: 3, x: 1.235, z: -2, yaw: 0.5 })
    expect(decodeMove({ t: 'ijw-mv', g: 3, x: 99, z: 0, y: 0 })).toBe(null)
    const a = { game: 3, kind: 'pick' as const, piece: 5, x: 1, z: 2, yaw: 0 }
    expect(decodeAct(relay(encodeAct(a)))).toEqual(a)
    expect(decodeAct({ ...relay(encodeAct(a)), k: 'teleport' })).toBe(null)
    expect(decodeAct({ ...relay(encodeAct(a)), n: 999 })).toBe(null)
  })
})

describe('a lobby of four', () => {
  it('collects every piece through a relay that loses snapshots, and every screen agrees', () => {
    const game = host(4)
    const office = officeFor(SEED)
    const ids = game.players.map((p) => p.id)
    const guests = ids.slice(1).map((id) => ({ id, copy: waitingGame(), heldUntil: 0, reportedAt: 0 }))
    const toHost: { from: string; message: Record<string, unknown> }[] = []
    let dropped = 0
    const DT = 1 / 30
    let sentAt = -1
    const heardAt = new Map<string, number>()

    for (let frame = 0; frame < 150 * 30 && !guests.every((g) => isArmed(game, ids.indexOf(g.id))); frame++) {
      const now = frame * DT
      // The host.
      tick(game, DT)
      for (const { from, message } of toHost.splice(0)) {
        const player = ids.indexOf(from)
        const move = decodeMove(message)
        if (move) {
          report(game, player, move, move.yaw, game.elapsed - (heardAt.get(from) ?? 0))
          heardAt.set(from, game.elapsed)
          continue
        }
        const a = decodeAct(message)!
        if (a.kind === 'fire') claimFire(game, player, a)
        else claimAct(game, player, a.kind, a.piece, a)
      }
      judgeEnd(game)
      const snap = now - sentAt >= 0.066 ? relay(encodeSnapshot(game)) : null
      if (snap) sentAt = now

      // Every guest: the host's word, if it got through, then its own hands.
      for (const guest of guests) {
        if (snap && (frame * 7 + guest.id.length * 13 + ids.indexOf(guest.id)) % 5 !== 0) applySnapshot(guest.copy, decodeSnapshot(snap)!, guest.id, now < guest.heldUntil)
        else if (snap) dropped += 1
        const g = guest.copy
        if (g.players.length === 0) continue
        tick(g, DT)
        const me = g.players.findIndex((p) => p.mine)
        const mine = g.players[me]
        const tell = (kind: 'pick' | 'place', piece: number) => {
          guest.heldUntil = now + 0.8
          toHost.push({ from: guest.id, message: relay(encodeAct({ game: g.id, kind, piece, x: mine.x, z: mine.z, yaw: mine.yaw })) })
        }
        if (mine.carrying >= 0 && atDesk(g, me)) {
          const k = mine.carrying
          if (act(g, me) === 'place') tell('place', k)
        } else if (mine.carrying < 0 && pieceInReach(g, me) >= 0) {
          if (act(g, me) === 'pick') tell('pick', mine.carrying)
        }
        const goal = mine.carrying >= 0 ? deskOf(g, me).spot : g.pieces[piecesOf(g, me).find((k) => g.pieces[k].state === LOOSE) ?? -1]
        const next = goal ? route(office, mine, goal, BODY.radius)[0] : undefined
        if (next) {
          const d = Math.hypot(next.x - mine.x, next.z - mine.z)
          if (d > 0.05) walk(g, me, { x: (next.x - mine.x) / Math.max(d, 0.3), z: (next.z - mine.z) / Math.max(d, 0.3) }, DT)
        }
        if (now - guest.reportedAt >= 0.05 && clock(g) >= 0) {
          guest.reportedAt = now
          toHost.push({ from: guest.id, message: relay(encodeMove(g.id, mine)) })
        }
      }
    }

    expect(dropped).toBeGreaterThan(0)
    for (const guest of guests) expect(isArmed(game, ids.indexOf(guest.id))).toBe(true)
    // One last snapshot, and everybody sees the same desks.
    const last = relay(encodeSnapshot(game))
    for (const guest of guests) {
      applySnapshot(guest.copy, decodeSnapshot(last)!, guest.id)
      expect(guest.copy.pieces.map((it) => it.state)).toEqual(game.pieces.map((it) => it.state))
      expect(guest.copy.pieces.filter((it) => it.state === PLACED)).toHaveLength(12)
    }
  })
})
