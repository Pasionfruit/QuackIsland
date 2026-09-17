/**
 * The chairs, the music, sitting, pushing, the rounds, the end, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { botPlay } from '../internal/ai'
import {
  BODY,
  CHAIR,
  FLOOR,
  PUSH,
  ROUND,
  chairAt,
  createGame,
  isIn,
  leave,
  musicFor,
  phase,
  placings,
  push,
  sit,
  sitter,
  stepGame,
  type Game,
} from '../internal/rules'

const SEED = 20261001

function game(n = 4): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 3)
}

function wait(g: Game, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9 && !g.over; t += dt) stepGame(g, Math.min(dt, seconds - t))
}

function until(g: Game, want: string, limit = 60) {
  for (let t = 0; phase(g) !== want; t += 1 / 60) {
    if (t > limit || g.over) throw new Error(`never got to ${want}: ${phase(g)}`)
    stepGame(g, 1 / 60)
  }
}

/** Puts player `i` right by chair `c`, just outside it. */
function byChair(g: Game, i: number, c: number) {
  const at = chairAt(g.chairs, c)
  g.players[i].x = at.x + Math.sin(at.facing) * (BODY.radius + CHAIR.radius + 0.05)
  g.players[i].z = at.z + Math.cos(at.facing) * (BODY.radius + CHAIR.radius + 0.05)
}

describe('the chairs', () => {
  it('are one fewer than the players, in a ring too close for anybody to slip between, and nobody walks through', () => {
    for (let n = 3; n <= 7; n++) {
      const a = chairAt(n, 0)
      const b = chairAt(n, 1)
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${n}`).toBeLessThan(CHAIR.radius * 2 + BODY.radius * 2)
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${n}`).toBeGreaterThan(CHAIR.radius * 2)
    }
    const g = game(5)
    expect(g.chairs).toBe(4)
    const at = Array.from({ length: 4 }, (_, i) => chairAt(4, i))
    until(g, 'music')
    // Walk straight through the middle, the whole music long.
    g.players[0].x = 0
    g.players[0].z = 6
    g.hands[0] = { x: 0, z: -1 }
    for (let t = 0; t < 2 && phase(g) === 'music'; t += 1 / 60) {
      stepGame(g, 1 / 60)
      for (const c of at) expect(Math.hypot(g.players[0].x - c.x, g.players[0].z - c.z)).toBeGreaterThan(BODY.radius + CHAIR.radius - 0.02)
    }
  })

  it('keeps everybody on the floor and apart', () => {
    const g = game(6)
    until(g, 'music')
    g.players.forEach((p, i) => {
      p.x = 0.1 * i
      p.z = FLOOR.radius - 0.2
      g.hands[i] = { x: 0, z: 1 }
    })
    wait(g, 1)
    for (const p of g.players) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(FLOOR.radius - BODY.radius + 1e-6)
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) expect(Math.hypot(g.players[i].x - g.players[j].x, g.players[i].z - g.players[j].z)).toBeGreaterThan(BODY.radius * 2 - 0.1)
    }
  })
})

describe('the music', () => {
  it('plays for a time from the seed - different every round - before anybody can sit', () => {
    const lengths = Array.from({ length: 20 }, (_, r) => musicFor(SEED, r + 1))
    expect(new Set(lengths.map((l) => l.toFixed(3))).size).toBe(20)
    for (const l of lengths) {
      expect(l).toBeGreaterThanOrEqual(ROUND.music[0])
      expect(l).toBeLessThanOrEqual(ROUND.music[1])
    }
    const g = game(3)
    until(g, 'music')
    byChair(g, 0, 0)
    expect(sit(g, 0)).toBe(-1)
    const started = g.elapsed
    until(g, 'scramble')
    expect(g.elapsed - started).toBeCloseTo(musicFor(SEED, 1), 1)
    byChair(g, 0, 0)
    expect(sit(g, 0)).toBe(0)
    expect(g.players[0]).toMatchObject({ seat: 0, x: chairAt(g.chairs, 0).x, z: chairAt(g.chairs, 0).z })
  })

  it('once stopped, lets you sit only in an empty chair in reach, and holds you there', () => {
    const g = game(3)
    until(g, 'scramble')
    g.players[0].x = 7
    g.players[0].z = 0
    expect(sit(g, 0)).toBe(-1)
    byChair(g, 0, 1)
    expect(sit(g, 0)).toBe(1)
    byChair(g, 1, 1)
    expect(sit(g, 1)).toBe(-1)
    g.hands[0] = { x: 1, z: 0 }
    wait(g, 0.3)
    expect(g.players[0].seat).toBe(1)
    expect(sitter(g, 1)).toBe(0)
  })
})

describe('the push', () => {
  it('knocks back and stuns whoever is in front, and nobody behind', () => {
    const g = game(3)
    until(g, 'music')
    Object.assign(g.players[0], { x: 0, z: 6, facing: 0 })
    Object.assign(g.players[1], { x: 0, z: 7 })
    Object.assign(g.players[2], { x: 0, z: 5 })
    expect(push(g, 0)).toEqual([1])
    expect(g.players[1].stunned).toBe(PUSH.stun)
    expect(g.players[2].stunned).toBe(0)
    wait(g, 0.3)
    expect(g.players[1].z).toBeGreaterThan(7.5)
    // Not again until the cooldown is over.
    Object.assign(g.players[1], { x: 0, z: 7 })
    expect(push(g, 0)).toEqual([])
    wait(g, PUSH.cooldown)
    expect(push(g, 0)).toEqual([1])
  })

  it('knocks a sitter off their chair, and a stunned player can do nothing', () => {
    const g = game(3)
    until(g, 'scramble')
    byChair(g, 1, 0)
    sit(g, 1)
    const chair = chairAt(g.chairs, 0)
    Object.assign(g.players[0], { x: chair.x + Math.sin(chair.facing) * 1.1, z: chair.z + Math.cos(chair.facing) * 1.1, facing: chair.facing + Math.PI })
    expect(push(g, 0)).toEqual([1])
    expect(g.players[1].seat).toBeNull()
    expect(sitter(g, 0)).toBe(-1)
    expect(sit(g, 1)).toBe(-1)
    expect(push(g, 1)).toEqual([])
    // The pusher takes the chair.
    wait(g, 0.05)
    byChair(g, 0, 0)
    expect(sit(g, 0)).toBe(0)
  })
})

describe('a safe sitter', () => {
  it('cannot be pushed off after sitting a second', () => {
    const g = game(3)
    until(g, 'scramble')
    byChair(g, 1, 0)
    sit(g, 1)
    const chair = chairAt(g.chairs, 0)
    wait(g, ROUND.settle + 0.02)
    Object.assign(g.players[0], { x: chair.x + Math.sin(chair.facing) * 1.1, z: chair.z + Math.cos(chair.facing) * 1.1, facing: chair.facing + Math.PI })
    expect(push(g, 0)).toEqual([])
    expect(g.players[1].seat).toBe(0)
  })
})

describe('the rounds', () => {
  it('end once every chair has stayed taken a second, with whoever is standing out, and a chair fewer next time', () => {
    const g = game(4)
    until(g, 'scramble')
    for (let c = 0; c < 3; c++) {
      byChair(g, c, c)
      expect(sit(g, c)).toBe(c)
    }
    wait(g, ROUND.settle - 0.1)
    expect(phase(g)).toBe('scramble')
    wait(g, 0.15)
    expect(phase(g)).toBe('result')
    expect(g.players.map((p) => p.out)).toEqual([null, null, null, 1])
    wait(g, ROUND.result + 0.05)
    expect(phase(g)).toBe('music')
    expect(g).toMatchObject({ round: 2, chairs: 2 })
    expect(g.players.every((p) => p.seat === null)).toBe(true)
  })

  it('end after the longest scramble anyway, and if nobody sat at all, the round is played again', () => {
    const g = game(3)
    until(g, 'scramble')
    wait(g, ROUND.scramble + 0.05)
    expect(phase(g)).toBe('result')
    expect(g.players.every(isIn)).toBe(true)
    wait(g, ROUND.result + 0.05)
    expect(g).toMatchObject({ phase: 'music', round: 1, chairs: 2 })
  })

  it('stop at the last one in, who wins; the rest placed by when they went', () => {
    const g = game(3)
    until(g, 'scramble')
    byChair(g, 0, 0)
    sit(g, 0)
    byChair(g, 1, 1)
    sit(g, 1)
    until(g, 'result')
    until(g, 'scramble')
    byChair(g, 1, 0)
    sit(g, 1)
    wait(g, ROUND.settle + ROUND.result + 0.2)
    expect(g.over).toBe(true)
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 3],
    ])
  })

  it('free the chair of somebody who leaves, and count them out', () => {
    const g = game(4)
    until(g, 'scramble')
    byChair(g, 2, 0)
    sit(g, 2)
    leave(g, 2)
    expect(sitter(g, 0)).toBe(-1)
    expect(g.players[2].out).toBe(1)
  })
})

describe('the stand-ins', () => {
  it('play a whole game to one winner, pushing and sitting, the same way every time', () => {
    const runs = [1, 2].map(() => {
      const g = createGame(SEED, Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, bot: true })), 1)
      let pushes = 0
      let last = g.players.map((p) => p.pushAt)
      for (let i = 0; i < 60 * 240 && !g.over; i++) {
        botPlay(g)
        stepGame(g, 1 / 60)
        pushes += g.players.filter((p, j) => p.pushAt !== last[j]).length
        last = g.players.map((p) => p.pushAt)
      }
      return { g, pushes }
    })
    const [{ g, pushes }] = runs
    expect(g.over).toBe(true)
    expect(g.players.filter((p) => p.out === null)).toHaveLength(1)
    expect(g.players.map((p) => p.out).filter((o) => o !== null).sort()).toEqual([1, 2, 3, 4, 5])
    expect(g.elapsed).toBeLessThan(120)
    expect(pushes).toBeGreaterThan(0)
    expect(runs[1].g.players.map((p) => p.out)).toEqual(g.players.map((p) => p.out))
  })
})
