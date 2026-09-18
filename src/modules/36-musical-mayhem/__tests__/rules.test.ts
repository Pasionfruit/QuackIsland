/**
 * The chairs, the music, sitting, pushing, the rounds, the end, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { botPlay } from '../internal/ai'
import {
  BODY,
  CHAIR,
  FLOOR,
  KEEP,
  PUSH,
  ROUND,
  chairAt,
  createGame,
  isIn,
  keepOut,
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

describe('no camping', () => {
  it('throws anybody who tries to sit while the music plays to the edge of the floor, stunned', () => {
    const g = game(4)
    until(g, 'music')
    byChair(g, 0, 0)
    expect(sit(g, 0)).toBe(-1)
    const p = g.players[0]
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(FLOOR.radius - BODY.radius, 5)
    expect(p.stunned).toBe(KEEP.stun)
    expect(p.thrownAt).toBe(g.elapsed)
    // Stunned, so a second try does nothing more.
    expect(sit(g, 0)).toBe(-1)
    expect(p.stunned).toBe(KEEP.stun)
  })

  it('keeps everybody out of reach of the chairs, and out of the middle, while the music plays', () => {
    for (const n of [2, 4, 8]) {
      const g = game(n)
      until(g, 'music')
      expect(keepOut(g)).toBeGreaterThan((g.chairs <= 1 ? 0 : chairAt(g.chairs, 0).z) + CHAIR.reach)
      // Everybody runs straight for the middle and holds it.
      g.players.forEach((p, i) => {
        g.hands[i] = { x: -Math.sin(Math.atan2(p.x, p.z)), z: -Math.cos(Math.atan2(p.x, p.z)) }
      })
      wait(g, 1)
      for (const p of g.players) {
        for (let c = 0; c < g.chairs; c++) {
          const at = chairAt(g.chairs, c)
          expect(Math.hypot(p.x - at.x, p.z - at.z), `${n}`).toBeGreaterThan(CHAIR.reach)
        }
      }
    }
  })

  it('throws out anybody who stands about, or shuffles on the spot, instead of going round', () => {
    const g = game(3)
    until(g, 'music')
    const r = keepOut(g) + 0.5
    Object.assign(g.players[0], { x: 0, z: r })
    Object.assign(g.players[1], { x: 0, z: -r })
    wait(g, KEEP.idle / 2)
    // One goes round, the other shuffles back and forth where it is.
    for (let t = 0; t < KEEP.idle && phase(g) === 'music'; t += 1 / 60) {
      const a = Math.atan2(g.players[0].x, g.players[0].z)
      g.hands[0] = { x: Math.cos(a), z: -Math.sin(a) }
      g.hands[1] = { x: Math.sin(t * 12), z: 0 }
      stepGame(g, 1 / 60)
    }
    expect(g.players[0].thrownAt).toBe(-Infinity)
    expect(g.players[1].thrownAt).toBeGreaterThan(0)
    expect(Math.hypot(g.players[1].x, g.players[1].z)).toBeGreaterThan(FLOOR.radius - BODY.radius - 0.1)
  })
})

describe('the push', () => {
  it('knocks back and stuns whoever is in front, and nobody behind', () => {
    const g = game(3)
    until(g, 'music')
    // Three in a line out towards the camera, the middle one facing away from it.
    const mid = FLOOR.radius / 2
    Object.assign(g.players[0], { x: 0, z: mid, facing: 0 })
    Object.assign(g.players[1], { x: 0, z: mid + 1 })
    Object.assign(g.players[2], { x: 0, z: mid - 1 })
    expect(push(g, 0)).toEqual([1])
    expect(g.players[1].stunned).toBe(PUSH.stun)
    expect(g.players[2].stunned).toBe(0)
    wait(g, 0.3)
    expect(g.players[1].z).toBeGreaterThan(mid + 1.5)
    // Not again until the cooldown is over.
    Object.assign(g.players[1], { x: 0, z: mid + 1 })
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
    // Standing about through the music gets you thrown out and stunned: let it wear off.
    wait(g, KEEP.stun)
    byChair(g, 0, 0)
    sit(g, 0)
    byChair(g, 1, 1)
    sit(g, 1)
    until(g, 'result')
    until(g, 'scramble')
    wait(g, KEEP.stun)
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
      let thrown = 0
      let last = g.players.map((p) => p.pushAt)
      for (let i = 0; i < 60 * 240 && !g.over; i++) {
        botPlay(g)
        stepGame(g, 1 / 60)
        pushes += g.players.filter((p, j) => p.pushAt !== last[j]).length
        last = g.players.map((p) => p.pushAt)
        thrown += g.players.filter((p) => p.thrownAt === g.elapsed).length
      }
      return { g, pushes, thrown }
    })
    const [{ g, pushes, thrown }] = runs
    // They keep going round while the music plays, and never sit early.
    expect(thrown).toBe(0)
    expect(g.over).toBe(true)
    expect(g.players.filter((p) => p.out === null)).toHaveLength(1)
    expect(g.players.map((p) => p.out).filter((o) => o !== null).sort()).toEqual([1, 2, 3, 4, 5])
    expect(g.elapsed).toBeLessThan(120)
    expect(pushes).toBeGreaterThan(0)
    expect(runs[1].g.players.map((p) => p.out)).toEqual(g.players.map((p) => p.out))
  })
})
