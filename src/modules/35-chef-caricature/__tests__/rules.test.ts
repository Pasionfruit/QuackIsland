/**
 * The outlines, the pen, the turns and the end.
 */
import { describe, expect, it } from 'vitest'
import { OUTLINE_NAMES, SIZE, SPACING, outlineFor, outlineNamed, pointAlong, toOutline, type Outline } from '../internal/outlines'
import {
  TRACE,
  TURN,
  coverage,
  createGame,
  currentOutline,
  drawer,
  enclosed,
  leave,
  longestGap,
  penDown,
  penMove,
  penUp,
  phase,
  placings,
  stepGame,
  tidiness,
  turnOrder,
  type Game,
} from '../internal/rules'

const SEED = 20260928

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 9)
}

/** Lets `seconds` go by, in small steps. */
function wait(g: Game, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9 && !g.over; t += dt) stepGame(g, Math.min(dt, seconds - t))
}

/** To the start of the current turn's drawing. */
function toDrawing(g: Game) {
  for (let i = 0; phase(g) !== 'drawing'; i++) {
    if (i > 100000 || g.over) throw new Error('never got to drawing')
    stepGame(g, 0.05)
  }
}

/**
 * Traces the outline on the board, from `from` along it for `share` of its
 * length, `off` away from it to one side, a step of `step` at a time. Returns
 * what the last move said.
 */
function trace(g: Game, player: number, { from = 0, share = 1.2, off = 0, step = 0.03, lift = true } = {}) {
  const outline: Outline = currentOutline(g)
  const at = (d: number) => {
    const p = pointAlong(outline, d)
    if (off === 0) return p
    // Outward from the middle of the board, roughly away from the outline.
    const r = Math.hypot(p.x, p.y) || 1
    return { x: p.x + (p.x / r) * off, y: p.y + (p.y / r) * off }
  }
  const start = at(from)
  if (!penDown(g, player, start.x, start.y)) return 'refused'
  let said: string | null = null
  for (let d = step; d <= outline.length * share; d += step) {
    const p = at(from + d)
    said = penMove(g, player, p.x, p.y)
    if (said === 'accepted') break
  }
  if (lift) penUp(g, player)
  return said
}

describe('the outlines', () => {
  it('are all the same size, their points evenly spaced round a closed path', () => {
    expect(OUTLINE_NAMES.length).toBeGreaterThanOrEqual(12)
    for (const name of OUTLINE_NAMES) {
      const o = outlineNamed(name)
      const xs = o.points.map((p) => p.x)
      const ys = o.points.map((p) => p.y)
      const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2
      expect(half, name).toBeGreaterThan(SIZE - 0.03)
      expect(half, name).toBeLessThanOrEqual(SIZE + 1e-9)
      expect(Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)), name).toBeLessThanOrEqual(SIZE + 1e-9)
      const gaps = o.points.map((p, i) => {
        const q = o.points[(i + 1) % o.points.length]
        return Math.hypot(q.x - p.x, q.y - p.y)
      })
      expect(Math.max(...gaps), name).toBeLessThan(SPACING * 1.6)
      expect(o.length, name).toBeGreaterThan(3)
      expect(o.length, name).toBeLessThan(7.5)
    }
  })

  it('come in an order from the seed, every one before any comes again', () => {
    const first = Array.from({ length: OUTLINE_NAMES.length }, (_, k) => outlineFor(SEED, k).name)
    expect(new Set(first).size).toBe(OUTLINE_NAMES.length)
    expect(Array.from({ length: OUTLINE_NAMES.length }, (_, k) => outlineFor(SEED, k).name)).toEqual(first)
    expect(Array.from({ length: OUTLINE_NAMES.length }, (_, k) => outlineFor(SEED + 1, k).name)).not.toEqual(first)
    expect(new Set(Array.from({ length: OUTLINE_NAMES.length }, (_, k) => outlineFor(SEED, OUTLINE_NAMES.length + k).name)).size).toBe(OUTLINE_NAMES.length)
  })
})

describe('the pen', () => {
  it('draws only for whoever is drawing, and only in their turn', () => {
    const g = game()
    const d = drawer(g)
    // The first turn has no intro - the screen has counted - so it is drawing at once.
    expect(phase(g)).toBe('drawing')
    toDrawing(g)
    expect(penDown(g, (d + 1) % 3, 0, 0)).toBe(false)
    expect(penDown(g, d, 0, 0)).toBe(true)
    // Already down.
    expect(penDown(g, d, 0.1, 0)).toBe(false)
  })

  it('accepts a careful tracing of every outline the moment it encloses it, from anywhere round it', () => {
    for (const [k, name] of OUTLINE_NAMES.entries()) {
      const g = game()
      toDrawing(g)
      g.outline = OUTLINE_NAMES.map((_, i) => outlineFor(SEED, i).name).indexOf(name)
      const d = drawer(g)
      expect(trace(g, d, { from: (k / OUTLINE_NAMES.length) * currentOutline(g).length, off: 0.03, lift: false }), name).toBe('accepted')
      expect(g.players[d].score, name).toBe(1)
      expect(g.dish).not.toBeNull()
      // The pen has to come up before it draws the next.
      expect(penDown(g, d, 0, 0), name).toBe(false)
      penUp(g, d)
      expect(penDown(g, d, 0, 0), name).toBe(true)
    }
  })

  it('does not accept a tracing that stops short of closing the loop, however much it covers', () => {
    for (const name of OUTLINE_NAMES) {
      const g = game()
      toDrawing(g)
      g.outline = OUTLINE_NAMES.map((_, i) => outlineFor(SEED, i).name).indexOf(name)
      const d = drawer(g)
      const length = currentOutline(g).length
      // All the way round but for a gap of three times the allowance.
      const share = (length - TRACE.gap * 3 - TRACE.reach * 2) / length
      expect(trace(g, d, { share, lift: false }), name).toBe('drawn')
      expect(coverage(g.stroke), name).toBeGreaterThan(0.9)
      expect(enclosed(g.stroke), name).toBe(false)
      expect(longestGap(g.stroke), name).toBeGreaterThan(TRACE.gap)
      expect(g.players[d].score, name).toBe(0)
      // Carrying on over the gap closes it, and the duck takes it.
      let said = null
      for (let s = share * length; s <= length + 0.3 && said !== 'accepted'; s += 0.03) {
        const p = pointAlong(currentOutline(g), s)
        said = penMove(g, d, p.x, p.y)
      }
      expect(said, name).toBe('accepted')
      expect(g.players[d].score, name).toBe(1)
    }
  })

  it('does not accept ink that stays too far off the outline', () => {
    const g = game()
    toDrawing(g)
    const d = drawer(g)
    expect(trace(g, d, { off: TRACE.reach + 0.03, share: 1.1 })).toBe('drawn')
    expect(g.players[d].score).toBe(0)
  })

  it('does not accept a scribble over the whole board, however much it covers', () => {
    const g = game()
    toDrawing(g)
    const d = drawer(g)
    penDown(g, d, -1, -1)
    let said = null
    for (let row = 0; row <= 40; row++) {
      const y = -1 + row * 0.05
      said = penMove(g, d, row % 2 ? -1 : 1, y) ?? said
      said = penMove(g, d, row % 2 ? -1 : 1, y + 0.05) ?? said
    }
    expect(enclosed(g.stroke)).toBe(true)
    expect(tidiness(g.stroke)).toBeLessThan(TRACE.tidy)
    expect(said).toBe('drawn')
    expect(g.players[d].score).toBe(0)
  })

  it('wipes an attempt let go of before it is done, and the next starts from nothing on the same outline', () => {
    const g = game()
    toDrawing(g)
    const d = drawer(g)
    const outline = g.outline
    expect(trace(g, d, { share: 0.5, lift: false })).toBe('drawn')
    expect(coverage(g.stroke)).toBeGreaterThan(0.4)
    expect(penUp(g, d)).toBe('wiped')
    expect(g.stroke).toBeNull()
    expect(g.erasedAt).not.toBeNull()
    expect(g.outline).toBe(outline)
    expect(trace(g, d, { share: 0.3, lift: false })).toBe('drawn')
    expect(coverage(g.stroke)).toBeLessThan(0.4)
  })

  it('never starts the same attempt twice', () => {
    const g = game()
    toDrawing(g)
    const d = drawer(g)
    expect(penDown(g, d, 0, 0, 5)).toBe(true)
    penUp(g, d)
    expect(penDown(g, d, 0, 0, 5)).toBe(false)
    expect(penDown(g, d, 0, 0, 4)).toBe(false)
    expect(penDown(g, d, 0, 0, 6)).toBe(true)
  })

  it('keeps going for the whole turn, as many dishes as there is time for, and stops at the end', () => {
    const g = game()
    toDrawing(g)
    const d = drawer(g)
    let dishes = 0
    while (phase(g) === 'drawing') {
      if (trace(g, d, { off: 0.02 }) === 'accepted') dishes += 1
      wait(g, 1.5)
    }
    expect(dishes).toBeGreaterThan(20)
    expect(g.players[d].score).toBe(dishes)
    expect(penDown(g, d, 0, 0)).toBe(false)
  })
})

describe('the turns', () => {
  it('go to everybody once, in an order from the seed', () => {
    expect([...turnOrder(SEED, 6)].sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(turnOrder(SEED, 6)).toEqual(turnOrder(SEED, 6))
    const g = game(3)
    const seen: number[] = []
    for (let i = 0; i < 100000 && !g.over; i++) {
      if (phase(g) === 'drawing' && seen[seen.length - 1] !== drawer(g)) seen.push(drawer(g))
      stepGame(g, 0.1)
    }
    expect(seen).toEqual(g.order)
    // Every turn but the first has its intro: that one starts on the screen's "Start!".
    expect(g.elapsed).toBeCloseTo(3 * (TURN.length + TURN.result) + 2 * TURN.intro, 0)
  })

  it('start each with the first outline and nothing drawn', () => {
    const g = game(2)
    toDrawing(g)
    const first = currentOutline(g).name
    trace(g, drawer(g))
    penDown(g, drawer(g), 0, 0)
    while (g.turn === 0) stepGame(g, 0.1)
    expect(g).toMatchObject({ outline: 0, stroke: null, dish: null })
    toDrawing(g)
    expect(currentOutline(g).name).toBe(first)
  })

  it('skip anybody who has left, and end a turn at once when its drawer leaves', () => {
    const g = game(3)
    toDrawing(g)
    const [first, second, third] = g.order
    leave(g, second)
    leave(g, first)
    stepGame(g, 0.05)
    expect(phase(g)).toBe('result')
    wait(g, TURN.result + 0.1)
    expect(drawer(g)).toBe(third)
  })
})

describe('the end', () => {
  it('puts the most dishes first, level scores sharing, anybody who left last', () => {
    const g = game(4)
    Object.assign(g.players[0], { score: 5 })
    Object.assign(g.players[1], { score: 8 })
    Object.assign(g.players[2], { score: 5 })
    Object.assign(g.players[3], { score: 9, left: true })
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 2],
      ['p4', 4],
    ])
  })
})

describe('distance to an outline', () => {
  it('is near zero on it and the offset off it', () => {
    const o = outlineNamed('orange')
    expect(toOutline(o, pointAlong(o, 1.3))).toBeLessThan(0.002)
    expect(toOutline(o, { x: 0, y: 0 })).toBeCloseTo(SIZE, 2)
  })
})
