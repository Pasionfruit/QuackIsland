/**
 * One game on the wire - and the votes a secret until the count.
 */
import { describe, expect, it } from 'vitest'
import { createGame, dropsAt, stepGame, vote, voteEnds, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeMove, decodeSnapshot, decodeVote, encodeMove, encodeSnapshot, encodeVote } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 4): Game {
  return createGame(5150, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 21)
}

function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(0.05, until - g.elapsed))
}

const hear = (g: Game, into: Game, me: string) => applySnapshot(into, decodeSnapshot(relay(encodeSnapshot(g)))!, me)

describe('a snapshot', () => {
  it('says who has voted, never what, until the count', () => {
    const game = host(4)
    stepGame(game, 1)
    vote(game, 1, 0)
    vote(game, 2, 1)
    const raw = JSON.stringify(encodeSnapshot(game))
    const copy = hear(game, waitingGame(), 'p4')
    expect(copy.seats).toEqual(game.seats)
    // Voted or not - both votes arrive as the same "voted", whatever they were.
    expect(copy.players.map((p) => p.vote !== null)).toEqual([false, true, true, false])
    expect(copy.players[1].vote).toBe(copy.players[2].vote)
    expect(raw).not.toContain('"v"')
    runTo(game, voteEnds(1) + 0.5)
    hear(game, copy, 'p4')
    expect(copy.results[0].votes).toEqual([null, 0, 1, null])
    expect(copy.results[0]).toMatchObject({ zeros: 1, side: game.results[0].side, victim: game.results[0].victim })
  })

  it("keeps a guest's own vote and place while the round is the same, and lets go at the next", () => {
    const game = host(3)
    stepGame(game, 1)
    const copy = hear(game, waitingGame(), 'p2')
    copy.players[1].vote = 0
    copy.players[1].x += 0.3
    const x = copy.players[1].x
    hear(game, copy, 'p2')
    expect(copy.players[1]).toMatchObject({ vote: 0, x })
    runTo(game, dropsAt(1) + 12)
    hear(game, copy, 'p2')
    if (copy.players[1].out === null) expect(copy.players[1].vote).toBe(null)
    expect(copy.round).toBe(game.round)
  })

  it('refuses anything malformed, whole', () => {
    const game = host(3)
    runTo(game, voteEnds(1) + 0.5)
    const good = relay(encodeSnapshot(game))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => (m.q = [0, 0]))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][3] = 2))).toBe(null)
    expect(broken((m) => ((m.x as unknown[][])[0][7] = '01'))).toBe(null)
    expect(broken((m) => ((m.x as unknown[][])[0][4] = 9))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    expect(decodeVote(relay(encodeVote(3, 2, 1)))).toEqual({ game: 3, round: 2, vote: 1 })
    expect(decodeVote({ t: 'bbs-v', g: 3, n: 2, v: 2 })).toBe(null)
    expect(decodeMove(relay(encodeMove(3, { x: 1.5, z: -4 })))).toEqual({ game: 3, x: 1.5, z: -4 })
    expect(decodeMove({ t: 'bbs-mv', g: 3, x: 99, z: 0 })).toBe(null)
  })
})
