/**
 * The rules of Synchronize Steps: picks, moves, the end and the placings.
 */
import { describe, expect, it } from 'vitest'
import { BOT_PICKS, botChoices } from '../internal/ai'
import { hopAt, stepX, stepY, walkAt } from '../internal/camera'
import { TOWER, choose, createGame, leave, moveFor, onTower, placings, reachedBottom, resolve, stepGame, type Game } from '../internal/rules'

const SEED = 424242

function game(n: number, bots = false): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0, bot: bots && i > 0 })), 7)
}

/** Picks for everybody, then to the end of the round and through the reveal. */
function round(g: Game, picks: number[]) {
  picks.forEach((pick, player) => choose(g, player, pick))
  while (g.phase === 'choose') stepGame(g, 0.25)
  while (g.phase === 'reveal') stepGame(g, 0.25)
}

describe('a move', () => {
  it('is nothing alone, the number for a pair, and eight for a crowd', () => {
    expect(moveFor(6, 1)).toBe(0)
    expect(moveFor(1, 2)).toBe(1)
    expect(moveFor(4, 2)).toBe(4)
    expect(moveFor(6, 2)).toBe(6)
    expect(moveFor(1, 3)).toBe(TOWER.crowdDrop)
    expect(moveFor(6, 8)).toBe(TOWER.crowdDrop)
  })
})

describe('a round', () => {
  it('starts everybody at the top, picking', () => {
    const g = game(4)
    expect(g.phase).toBe('choose')
    expect(g.players.every((p) => p.step === TOWER.steps && p.pick === null && !p.out)).toBe(true)
    expect(createGame(SEED, [{ id: 'solo' }]).phase).toBe('over')
  })

  it('moves a pair, drops a crowd and leaves somebody alone where they are', () => {
    const g = game(6)
    round(g, [4, 4, 1, 1, 1, 6])
    expect(g.players.map((p) => p.step)).toEqual([16, 16, 12, 12, 12, 20])
    expect(g.players[0].last).toEqual({ pick: 4, with: 2, moved: 4, auto: false })
    expect(g.players[2].last).toEqual({ pick: 1, with: 3, moved: 8, auto: false })
    expect(g.players[5].last).toEqual({ pick: 6, with: 1, moved: 0, auto: false })
    expect(g.round).toBe(1)
    expect(g.players.every((p) => p.pick === null)).toBe(true)
  })

  it('takes the last pick made, and only while picking, only 1, 4 or 6', () => {
    const g = game(2)
    expect(choose(g, 0, 1)).toBe(true)
    expect(choose(g, 0, 6)).toBe(true)
    expect(choose(g, 0, 2)).toBe(false)
    expect(choose(g, 0, 4, 3)).toBe(false)
    expect(g.players[0].pick).toBe(6)
    choose(g, 1, 6)
    while (g.phase === 'choose') stepGame(g, 0.25)
    expect(g.phase).toBe('reveal')
    expect(choose(g, 0, 1)).toBe(false)
    expect(g.players.map((p) => p.step)).toEqual([14, 14])
  })

  it('lasts two seconds to pick and then the reveal', () => {
    const g = game(3)
    for (let i = 0; i < 7; i++) stepGame(g, 0.25)
    expect(g.phase).toBe('choose')
    stepGame(g, 0.25)
    expect(g.phase).toBe('reveal')
    let t = 0
    while (g.phase === 'reveal') {
      stepGame(g, 0.05)
      t += 0.05
    }
    expect(t).toBeCloseTo(TOWER.reveal, 1)
  })

  it('makes a pick at random for anybody who has not, the same one every time', () => {
    const a = game(4)
    const b = game(4)
    choose(a, 0, 4)
    choose(b, 0, 4)
    resolve(a)
    resolve(b)
    expect(a.players[0].last!.auto).toBe(false)
    expect(a.players.slice(1).every((p) => p.last!.auto && TOWER.options.includes(p.last!.pick))).toBe(true)
    expect(a.players.map((p) => p.last)).toEqual(b.players.map((p) => p.last))
  })

  it('never counts anybody already out', () => {
    const g = game(3)
    leave(g, 2)
    round(g, [6, 6, 6])
    expect(g.players[0].last!.with).toBe(2)
    expect(g.players[2].last).toBeNull()
  })
})

describe('the end', () => {
  it('puts anybody who reaches the bottom out, and ends there and then', () => {
    const g = game(3)
    round(g, [6, 6, 1]) // 14 14 20
    round(g, [6, 6, 4]) // 8 8 20
    round(g, [1, 6, 6]) // 8 2 14
    expect(g.phase).toBe('choose')
    expect(reachedBottom(g)).toBe(false)
    round(g, [4, 4, 6]) // 4 0 14
    expect(g.players.map((p) => p.step)).toEqual([4, 0, 14])
    expect(g.players[1].out).toEqual({ round: 3, from: 2 })
    expect(reachedBottom(g)).toBe(true)
    expect(onTower(g)).toHaveLength(2)
    expect(g.phase).toBe('over')
    expect(placings(g).map((e) => [e.stepper.id, e.place])).toEqual([
      ['p3', 1],
      ['p1', 2],
      ['p2', 3],
    ])
  })

  it('does not end because somebody left the lobby', () => {
    const g = game(3)
    leave(g, 2)
    expect(reachedBottom(g)).toBe(false)
    round(g, [1, 4, 6])
    expect(g.phase).toBe('choose')
  })

  it('walks down a step at a time', () => {
    expect(walkAt(20, 12, 0, 0.15)).toEqual(hopAt(20, 20, 1))
    for (let i = 0; i < 8; i++) {
      expect(walkAt(20, 12, (i + 1) * 0.15 - 1e-9, 0.15).x).toBeCloseTo(stepX(20 - i - 1), 3)
      const mid = walkAt(20, 12, i * 0.15 + 0.075, 0.15)
      const hop = hopAt(20 - i, 20 - i - 1, 0.5)
      expect(mid.x).toBeCloseTo(hop.x, 6)
      expect(mid.y).toBeCloseTo(hop.y, 6)
    }
    expect(walkAt(20, 12, 5, 0.15)).toEqual(hopAt(13, 12, 1))
    // The longest walk, eight steps, is done before the reveal is over.
    expect(0.35 + TOWER.crowdDrop * 0.15).toBeLessThan(TOWER.reveal)
  })

  it('ends with everybody out at once if a crowd takes them all down, placed by where they fell from', () => {
    const g = game(3)
    round(g, [6, 6, 1])
    round(g, [6, 6, 4])
    round(g, [6, 6, 4]) // 2 2 20
    round(g, [4, 4, 1]) // 0 0 20
    expect(g.phase).toBe('over')
    const h = game(3)
    round(h, [6, 6, 6]) // crowd: 12 12 12
    round(h, [6, 6, 6]) // 4 4 4
    round(h, [1, 4, 1]) // 3 4 3
    round(h, [6, 6, 6]) // all out, from 3 4 3
    expect(h.phase).toBe('over')
    expect(placings(h).map((e) => [e.stepper.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 2],
    ])
  })

  it('ends after the last round when nobody ever matches, highest first', () => {
    const g = game(3)
    round(g, [1, 1, 4]) // 19 19 20
    for (let i = 1; i < TOWER.rounds; i++) round(g, [1, 4, 6])
    expect(g.phase).toBe('over')
    expect(g.round).toBe(TOWER.rounds - 1)
    expect(placings(g).map((e) => [e.stepper.id, e.place])).toEqual([
      ['p3', 1],
      ['p1', 2],
      ['p2', 2],
    ])
  })

  it('puts somebody who leaves out where they stood', () => {
    const g = game(4)
    round(g, [6, 6, 1, 4])
    leave(g, 1)
    expect(g.players[1]).toMatchObject({ step: 0, out: { round: 1, from: 14 } })
    leave(g, 1)
    expect(g.players[1].out).toEqual({ round: 1, from: 14 })
  })
})

describe('the stand-ins', () => {
  it('pick once each in the first second and a half, the same way every time', () => {
    const a = game(5, true)
    const b = game(5, true)
    const when: number[] = []
    for (let t = 0; a.phase === 'choose' && t < 100; t++) {
      for (const g of [a, b]) for (const m of botChoices(g)) {
        if (g === a) when.push(g.clock)
        choose(g, m.player, m.pick)
      }
      stepGame(a, 0.05)
      stepGame(b, 0.05)
    }
    expect(when).toHaveLength(4)
    expect(Math.max(...when)).toBeLessThanOrEqual(BOT_PICKS[1] + 0.06)
    expect(a.players.map((p) => p.last?.pick)).toEqual(b.players.map((p) => p.last?.pick))
    expect(a.players.slice(1).every((p) => p.last && !p.last.auto)).toBe(true)
  })

  it('play games that end, with somebody on top', () => {
    for (let s = 1; s <= 20; s++) {
      const g = createGame(s * 97, Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, bot: true })), s)
      for (let t = 0; g.phase !== 'over' && t < 10000; t++) {
        for (const m of botChoices(g)) choose(g, m.player, m.pick)
        stepGame(g, 0.05)
      }
      expect(g.phase).toBe('over')
      expect(placings(g).filter((e) => e.place === 1).length).toBeGreaterThan(0)
    }
  })
})

describe('a hop', () => {
  it('starts on one step and lands on the other, above the treads on the way', () => {
    expect(hopAt(20, 14, 0)).toEqual({ x: stepX(20), y: stepY(20) })
    const end = hopAt(20, 14, 1)
    expect(end.x).toBeCloseTo(stepX(14))
    expect(end.y).toBeCloseTo(stepY(14))
    for (const [from, to] of [
      [20, 19],
      [20, 12],
      [8, 0],
      [3, 0],
    ]) {
      for (let k = 0.05; k < 1; k += 0.05) {
        const at = hopAt(from, to, k)
        // The step under the feet here, by where along the staircase they are.
        const under = Math.max(0, Math.min(from, Math.round(20 / 2 - at.x / 0.95)))
        expect(at.y, `${from}->${to} at ${k.toFixed(2)}`).toBeGreaterThan(stepY(under) - 0.25)
      }
    }
  })
})
