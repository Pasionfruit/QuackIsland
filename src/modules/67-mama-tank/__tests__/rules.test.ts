/**
 * The rules of Mama Tank, as arithmetic: who drives her, the two cannons,
 * a hit's effect, no friendly fire, a claim's own double-check, running a
 * mini tank down, and the end, decided the same step.
 */
import { describe, expect, it } from 'vitest'
import { MAMA, MINI, ROUND, claim, createRound, fire, isLegalTarget, judgeEnd, leave, mamaOf, minisOf, resolveMama, runOver, type Round } from '../internal/rules'

const SEED = 20260927

function host(n = 4, chosen: string | null = 'p1'): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), chosen, 1)
}

/**
 * The pitch that aims from a shooter's own eye height at a target's own
 * vertical middle, over the ground distance between them - the two roles'
 * bodies are quite different heights (Mama Tank towers over a mini tank),
 * so a level shot (`pitch: 0`) is not generally the one that actually
 * connects, the same reasoning every other one-vs-all game's own tests
 * already give a shooter's aim.
 */
function pitchTo(shooterEye: number, targetHeight: number, dx: number, dz: number): number {
  return Math.atan2(targetHeight / 2 - shooterEye, Math.hypot(dx, dz))
}

describe('who drives Mama Tank', () => {
  it("is the host's own pick, if they are still in the roster", () => {
    const roster = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(resolveMama(roster, 'b')).toBe('b')
  })

  it('falls back to the roster first if the pick has left, or nobody has picked', () => {
    const roster = [{ id: 'a' }, { id: 'b' }]
    expect(resolveMama(roster, 'gone')).toBe('a')
    expect(resolveMama(roster, null)).toBe('a')
  })
})

describe('hitsNeeded', () => {
  it('is round(playerCount * 2), the whole roster including Mama Tank', () => {
    expect(host(5).hitsNeeded).toBe(10)
    expect(host(3).hitsNeeded).toBe(6)
  })
})

describe('the two cannons', () => {
  it("Mama Tank's own cooldown is meaningfully longer than a mini tank's", () => {
    expect(MAMA.cooldown).toBeGreaterThan(MINI.cooldown * 2)
  })

  it("Mama Tank's own pace trades a little speed for her bulk", () => {
    expect(MAMA.speed).toBeLessThan(MINI.speed)
  })
})

describe('a hit', () => {
  it('eliminates a mini tank outright - no lives', () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    mini.x = mama.x + 5
    mini.z = mama.z
    mama.yaw = Math.atan2(-(mini.x - mama.x), -(mini.z - mama.z))
    mama.pitch = pitchTo(MAMA.eye, MINI.height, mini.x - mama.x, mini.z - mama.z)
    const shot = fire(round, round.players.indexOf(mama), true)!
    expect(shot.hit).toBe(mi)
    expect(mini.alive).toBe(false)
  })

  it("on Mama Tank increments hitsOnMama and the shooter's own hits stat", () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    mini.x = mama.x + 5
    mini.z = mama.z
    mini.yaw = Math.atan2(-(mama.x - mini.x), -(mama.z - mini.z))
    mini.pitch = pitchTo(MINI.eye, MAMA.height, mama.x - mini.x, mama.z - mini.z)
    const before = round.hitsOnMama
    const shot = fire(round, mi, true)!
    expect(shot.hit).toBe(round.players.indexOf(mama))
    expect(round.hitsOnMama).toBe(before + 1)
    expect(mini.hits).toBe(1)
    expect(mama.alive).toBe(true)
  })
})

describe('no friendly fire either direction', () => {
  it("a mini tank's only target is Mama Tank - another mini tank is never hit", () => {
    const round = host(4)
    const minis = minisOf(round)
    const shooter = round.players.indexOf(minis[0])
    minis[1].x = minis[0].x + 3
    minis[1].z = minis[0].z
    minis[0].yaw = Math.atan2(-(minis[1].x - minis[0].x), -(minis[1].z - minis[0].z))
    minis[0].pitch = 0
    const shot = fire(round, shooter, true)!
    expect(shot.hit).toBe(-1)
  })

  it("Mama Tank's only targets are standing mini tanks - Mama Tank is never a legal target at all", () => {
    expect(isLegalTarget('mama', { role: 'mama' })).toBe(false)
    expect(isLegalTarget('mini', { role: 'mini' })).toBe(false)
    expect(isLegalTarget('mini', { role: 'mama' })).toBe(true)
    expect(isLegalTarget('mama', { role: 'mini' })).toBe(true)
  })
})

describe('a claim', () => {
  it('is refused against an already-eliminated victim, even when the ray lines up perfectly', () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    mini.x = mama.x + 5
    mini.z = mama.z
    mini.alive = false
    const c = { x: mama.x, z: mama.z, yaw: Math.atan2(-(mini.x - mama.x), -(mini.z - mama.z)), pitch: 0, victim: mini.id }
    const shot = claim(round, round.players.indexOf(mama), c)!
    expect(shot.hit).toBe(-1)
  })

  it('is refused against the wrong role - a mini tank naming another mini tank', () => {
    const round = host(4)
    const minis = minisOf(round)
    const shooter = round.players.indexOf(minis[0])
    minis[1].x = minis[0].x + 3
    minis[1].z = minis[0].z
    const c = { x: minis[0].x, z: minis[0].z, yaw: Math.atan2(-(minis[1].x - minis[0].x), -(minis[1].z - minis[0].z)), pitch: 0, victim: minis[1].id }
    const shot = claim(round, shooter, c)!
    expect(shot.hit).toBe(-1)
  })

  it('counts a real hit the same way `fire` would, when the named victim is legal and standing', () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    mini.x = mama.x + 5
    mini.z = mama.z
    const c = {
      x: mama.x,
      z: mama.z,
      yaw: Math.atan2(-(mini.x - mama.x), -(mini.z - mama.z)),
      pitch: pitchTo(MAMA.eye, MINI.height, mini.x - mama.x, mini.z - mama.z),
      victim: mini.id,
    }
    const shot = claim(round, round.players.indexOf(mama), c)!
    expect(shot.hit).toBe(mi)
    expect(mini.alive).toBe(false)
  })
})

describe('running a mini tank down', () => {
  it('needs both the radius and a clear line', () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    mini.x = mama.x + 50
    mini.z = mama.z
    expect(runOver(round)).toEqual([])
    expect(mini.alive).toBe(true)
    mini.x = mama.x + 1
    mini.z = mama.z
    expect(runOver(round)).toEqual([mini.id])
    expect(mini.alive).toBe(false)
  })
})

describe('the end, decided the same step', () => {
  it('is a win for the mini tanks the instant Mama Tank has left - unambiguous, nobody left to stop them', () => {
    const round = host(3)
    leave(round, round.players.indexOf(mamaOf(round)!))
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('mini')
  })

  it('is a win for the mini tanks the instant hitsOnMama reaches hitsNeeded', () => {
    const round = host(3)
    round.hitsOnMama = round.hitsNeeded
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('mini')
  })

  it('is a win for Mama Tank once every mini tank is down or gone', () => {
    const round = host(3)
    for (const p of minisOf(round)) p.alive = false
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('mama')
  })

  it("is a win for Mama Tank once the clock runs out - the brief's own second way this round ends, not a fallback", () => {
    const round = host(3)
    round.elapsed = ROUND.limit
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('mama')
  })
})
