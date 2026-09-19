/**
 * One game on the wire - a lobby typing through a relay that loses snapshots.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../../00-core'
import { arrowFor, createGame, knockOut, judgeEnd, press, tick, type Arrow, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodePress, decodeSnapshot, encodePress, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 2468

function host(n = 3): Game {
  const g = createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 17)
  tick(g, 0.1)
  return g
}

const snap = (g: Game) => decodeSnapshot(relay(encodeSnapshot(g)))!

describe('a snapshot', () => {
  it('carries every tower, and a guest keeps its own until the host has heard every key', () => {
    const game = host(3)
    press(game, 1, arrowFor(game, game.players[1]))
    const copy = applySnapshot(waitingGame(), snap(game), 'p3')
    expect(copy.players.map((p) => [p.id, p.mine, p.height, p.typed])).toEqual([
      ['p1', false, 0, 0],
      ['p2', false, 1, 1],
      ['p3', true, 0, 0],
    ])
    // The guest presses twice; the host has heard neither.
    press(copy, 2, arrowFor(copy, copy.players[2]))
    press(copy, 2, arrowFor(copy, copy.players[2]))
    applySnapshot(copy, snap(game), 'p3')
    expect(copy.players[2].height).toBe(2)
    // The host hears one: still behind, still ours.
    press(game, 2, arrowFor(game, game.players[2]))
    applySnapshot(copy, snap(game), 'p3')
    expect(copy.players[2].height).toBe(2)
    // Both: the same answer, now the host's.
    press(game, 2, arrowFor(game, game.players[2]))
    game.players[2].best = 2
    applySnapshot(copy, snap(game), 'p3')
    expect(copy.players[2]).toMatchObject({ height: 2, inputs: 2 })
    // Given up on: whatever the host says.
    game.players[2].height = 1
    game.players[2].typed = 1
    game.players[2].misses = 1
    copy.players[2].inputs = 5
    applySnapshot(copy, snap(game), 'p3', false)
    expect(copy.players[2].height).toBe(1)
  })

  it('refuses anything malformed, whole', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 5))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][3] = 7))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][6] = -5))).toBe(null)
    expect(broken((m) => (m.p = []))).toBe(null)
  })
})

describe('a key on the wire', () => {
  it('goes there and back, and nonsense does not', () => {
    expect(decodePress(relay(encodePress(4, 12, 3)))).toEqual({ game: 4, n: 12, arrow: 3 })
    expect(decodePress({ t: 'hir-k', g: 4, n: 1, k: 4 })).toBe(null)
    expect(decodePress({ t: 'hir-k', g: 4, n: -1, k: 0 })).toBe(null)
  })
})

describe('a lobby of four', () => {
  it('types through a relay that loses snapshots, and every screen ends up agreeing', () => {
    const game = host(4)
    const ids = game.players.map((p) => p.id)
    const guests = ids.slice(1).map((id, k) => ({ id, copy: waitingGame(), random: createRng(k + 1), next: 0.3, pace: 0.2 + k * 0.05, slip: 0.05 * (k + 1), last: -Infinity }))
    const toHost: { from: string; message: Record<string, unknown> }[] = []
    const DT = 1 / 60
    let sentAt = -1
    let dropped = 0
    let sent = 0
    for (let frame = 0; frame < 60 * 60 && !game.over; frame++) {
      const now = frame * DT
      tick(game, DT)
      for (const { from, message } of toHost.splice(0)) {
        const said = decodePress(message)!
        const player = ids.indexOf(from)
        if (said.n >= game.players[player].inputs) press(game, player, said.arrow)
      }
      knockOut(game)
      judgeEnd(game)
      const s = now - sentAt >= 0.066 ? relay(encodeSnapshot(game)) : null
      if (s) {
        sentAt = now
        sent += 1
      }
      for (const guest of guests) {
        if (s && (sent + ids.indexOf(guest.id)) % 4 !== 0) applySnapshot(guest.copy, decodeSnapshot(s)!, guest.id, now - guest.last < 1)
        else if (s) dropped += 1
        const g = guest.copy
        if (g.players.length === 0) continue
        tick(g, DT)
        const me = g.players.findIndex((p) => p.mine)
        if (g.elapsed < guest.next || g.over) continue
        const n = g.players[me].inputs
        const right = arrowFor(g, g.players[me])
        const arrow = (guest.random() < guest.slip ? (right + 1) % 4 : right) as Arrow
        if (press(g, me, arrow) !== null) {
          guest.last = now
          toHost.push({ from: guest.id, message: relay(encodePress(g.id, n, arrow)) })
        }
        guest.next = g.elapsed + guest.pace
      }
    }
    expect(dropped).toBeGreaterThan(0)
    expect(game.over).toBe(true)
    expect(game.players.filter((p) => p.out !== null).length).toBeGreaterThanOrEqual(2)
    // The host pressed what every guest pressed, and got the same towers.
    const last = relay(encodeSnapshot(game))
    for (const guest of guests) {
      applySnapshot(guest.copy, decodeSnapshot(last)!, guest.id)
      expect(guest.copy.players.map((p) => [p.height, p.inputs, p.out])).toEqual(game.players.map((p) => [p.height, p.inputs, p.out]))
    }
  })
})
