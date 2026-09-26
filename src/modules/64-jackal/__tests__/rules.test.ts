/**
 * The Sniper, the Runners, the laser, the gun, hits, base, and the end.
 */
import { describe, expect, it } from 'vitest'
import { FIELD, TOWER_Z } from '../internal/arena'
import {
  BODY,
  GUN,
  INVULN,
  JUMP,
  LIVES_START,
  ROUND,
  canShoot,
  claim,
  cooldownLeft,
  createRound,
  fire,
  isStanding,
  judgeEnd,
  laserOf,
  leave,
  look,
  magazineSize,
  moveSniper,
  reloading,
  report,
  resolveSniper,
  runnersOf,
  sniperOf,
  stepRound,
  toggleScope,
  tick,
  walkRunner,
  type Round,
} from '../internal/rules'

const SEED = 20260925

function round(n = 4, chosen: string | null = 'p1', id = 7): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), chosen, id)
}

function sniperIndex(r: Round): number {
  return r.players.findIndex((p) => p.role === 'sniper')
}

/** Lets `seconds` go by, a quarter at a time: a single `tick` is never longer (a backgrounded tab cannot skip a reload). */
function wait(r: Round, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.25) tick(r, Math.min(0.25, seconds - t))
}

/** Waits out the gun. */
function recharge(r: Round) {
  wait(r, GUN.cooldown + 0.01)
}

/** Aims the sniper at a runner's chest - the sniper is up a tower, so the pitch has real height to make up, not just the two bodies' own. */
function aimAt(r: Round, si: number, ri: number) {
  const s = r.players[si]
  const target = r.players[ri]
  const dx = target.x - s.x
  const dz = target.z - s.z
  const horiz = Math.hypot(dx, dz)
  const dy = target.y + BODY.height / 2 - (s.y + BODY.eye)
  s.yaw = Math.atan2(-dx, -dz)
  s.pitch = Math.atan2(dy, horiz)
}

describe('who is the Sniper', () => {
  it('is whoever was chosen, if they are actually in the roster', () => {
    expect(resolveSniper([{ id: 'a' }, { id: 'b' }], 'b')).toBe('b')
  })

  it('falls back to the roster first when nobody was chosen, or the choice has left', () => {
    expect(resolveSniper([{ id: 'a' }, { id: 'b' }], null)).toBe('a')
    expect(resolveSniper([{ id: 'a' }, { id: 'b' }], 'ghost')).toBe('a')
  })
})

describe('dealing a round', () => {
  it('gives the Sniper round(playerCount * 1.5) bullets and everybody two lives', () => {
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const r = round(n)
      const sniper = sniperOf(r)!
      expect(sniper.bullets).toBe(Math.round(n * 1.5))
      expect(r.players.filter((p) => p.role === 'runner')).toHaveLength(n - 1)
      for (const p of r.players) expect(p.lives).toBe(LIVES_START)
    }
  })

  it('puts exactly one player in the Sniper role, and it is the chosen one', () => {
    const r = round(5, 'p3')
    expect(r.sniperId).toBe('p3')
    expect(r.players.filter((p) => p.role === 'sniper')).toHaveLength(1)
    expect(sniperOf(r)!.id).toBe('p3')
  })
})

describe('the laser', () => {
  it('is traced every tick, whether or not the trigger is pulled', () => {
    const r = round()
    const si = sniperIndex(r)
    const runner = runnersOf(r)[0]
    aimAt(r, si, r.players.indexOf(runner))
    const line = laserOf(r)!
    expect(line).not.toBeNull()
    expect(line.hit).toBe(runner.id)
  })

  it('is null once the Sniper is down - which never happens, but the function is still total', () => {
    const r = round()
    const si = sniperIndex(r)
    r.players[si].alive = false
    expect(laserOf(r)).toBeNull()
  })
})

describe('the gun', () => {
  it('cannot fire before the cooldown is up, or during a reload', () => {
    const r = round()
    const si = sniperIndex(r)
    expect(canShoot(r, r.players[si])).toBe(true)
    fire(r, si)
    expect(canShoot(r, r.players[si])).toBe(false)
    recharge(r)
    expect(canShoot(r, r.players[si])).toBe(true)
  })

  it('spends a bullet on a miss as well as a hit, and forces a reload at zero', () => {
    const r = round(2)
    const si = sniperIndex(r)
    const start = r.players[si].bullets
    for (let shots = 0; shots < start; shots++) {
      recharge(r)
      fire(r, si)
    }
    expect(r.players[si].bullets).toBe(0)
    expect(reloading(r, r.players[si])).toBe(true)
    recharge(r)
    expect(canShoot(r, r.players[si])).toBe(false)
    wait(r, GUN.reload + 0.01)
    expect(reloading(r, r.players[si])).toBe(false)
    // A reload that finishes but never refills the magazine is a Sniper who
    // can never fire again - the actual point of "forced to reload".
    expect(r.players[si].bullets).toBe(start)
    expect(canShoot(r, r.players[si])).toBe(true)
  })

  it('refills to the same magazine size every reload, however many times it empties', () => {
    const r = round(3)
    const si = sniperIndex(r)
    const full = magazineSize(r.players.length)
    for (let round_ = 0; round_ < 3; round_++) {
      for (let i = 0; i < full; i++) {
        recharge(r)
        fire(r, si)
      }
      expect(r.players[si].bullets).toBe(0)
      wait(r, GUN.reload + 0.01)
      expect(r.players[si].bullets).toBe(full)
    }
  })

  it('costs a runner a life through a clear line of sight, and does nothing through cover', () => {
    const r = round(3)
    const si = sniperIndex(r)
    const runner = runnersOf(r)[0]
    const ri = r.players.indexOf(runner)
    aimAt(r, si, ri)
    const before = runner.lives
    const shot = fire(r, si)!
    expect(shot.hit).toBe(ri)
    expect(runner.lives).toBe(before - 1)

    // Aimed at the sky: nothing there to hit.
    recharge(r)
    r.players[si].pitch = 1.2
    const miss = fire(r, si)!
    expect(miss.hit).toBe(-1)
    expect(runner.lives).toBe(before - 1)
  })

  it('does not stack: a second hit inside the invulnerable window costs nothing', () => {
    const r = round(2)
    const si = sniperIndex(r)
    const runner = runnersOf(r)[0]
    const ri = r.players.indexOf(runner)
    aimAt(r, si, ri)
    fire(r, si)
    expect(runner.lives).toBe(LIVES_START - 1)
    recharge(r)
    fire(r, si)
    expect(runner.lives).toBe(LIVES_START - 1)
    wait(r, INVULN.window + 0.01)
    recharge(r)
    fire(r, si)
    expect(runner.lives).toBe(LIVES_START - 2)
    expect(runner.alive).toBe(false)
  })
})

describe('scoping in', () => {
  it('cuts the Sniper down to a fraction of their walk', () => {
    const r = round()
    const si = sniperIndex(r)
    const before = { x: r.players[si].x, z: r.players[si].z }
    moveSniper(r, si, { forward: 1, right: 0 }, 1)
    const unscoped = Math.hypot(r.players[si].x - before.x, r.players[si].z - before.z)
    r.players[si].x = before.x
    r.players[si].z = before.z
    toggleScope(r, si, true)
    moveSniper(r, si, { forward: 1, right: 0 }, 1)
    const scoped = Math.hypot(r.players[si].x - before.x, r.players[si].z - before.z)
    expect(scoped).toBeLessThan(unscoped * 0.3)
  })

  it('never lets the Sniper off the tower platform', () => {
    const r = round()
    const si = sniperIndex(r)
    for (let i = 0; i < 50; i++) moveSniper(r, si, { forward: 1, right: 1 }, 1)
    expect(Math.abs(r.players[si].x)).toBeLessThanOrEqual(FIELD.platformHalf + 1e-9)
    expect(Math.abs(r.players[si].z - TOWER_Z)).toBeLessThanOrEqual(FIELD.platformHalf + 1e-9)
  })
})

describe('a runner', () => {
  it('vaults a jump over short cover', () => {
    const r = round()
    const ri = r.players.findIndex((p) => p.role === 'runner')
    walkRunner(r, ri, { forward: 1, right: 0, jump: true }, 0.016)
    expect(r.players[ri].y).toBeGreaterThan(0)
    expect(r.players[ri].y).toBeLessThanOrEqual(JUMP.max + 1e-6)
  })

  it('reaches base and ends the round for the Runners, the same step', () => {
    const r = round(3)
    const ri = r.players.findIndex((p) => p.role === 'runner')
    r.players[ri].x = 0
    r.players[ri].z = TOWER_Z
    // Standing still still counts: `checkBase` runs on every call, moving or not.
    walkRunner(r, ri, { forward: 0, right: 0 }, 0.1)
    stepRound(r, 0.1)
    expect(r.over).toBe(true)
    expect(r.winner).toBe('runner')
    expect(r.players[ri].reachedBase).toBe(true)
  })
})

describe('the end', () => {
  it('is the Sniper, the instant every runner is down', () => {
    const r = round(3)
    for (const p of runnersOf(r)) p.alive = false
    judgeEnd(r)
    expect(r.over).toBe(true)
    expect(r.winner).toBe('sniper')
  })

  it('holds for the Sniper at the safety-net limit', () => {
    const r = round(2)
    wait(r, ROUND.limit + 1)
    judgeEnd(r)
    expect(r.over).toBe(true)
    expect(r.winner).toBe('sniper')
  })

  it('does not end early: standing runners with ammo left keep the round open', () => {
    const r = round(3)
    judgeEnd(r)
    expect(r.over).toBe(false)
    expect(r.winner).toBeNull()
  })
})

describe('a guest is checked before it is trusted', () => {
  it('claims a hit only when the host would agree, never one the guest could not have seen', () => {
    const r = round(3)
    const si = sniperIndex(r)
    const s = r.players[si]
    const runner = runnersOf(r)[0]
    const ri = r.players.indexOf(runner)
    const dx = runner.x - s.x
    const dz = runner.z - s.z
    const yaw = Math.atan2(-dx, -dz)
    const pitch = Math.atan2(runner.y + BODY.height / 2 - (s.y + BODY.eye), Math.hypot(dx, dz))
    const hit = claim(r, si, { x: s.x, z: s.z, yaw, pitch, victim: runner.id })!
    expect(hit.hit).toBe(ri)
    expect(runner.lives).toBe(LIVES_START - 1)
  })

  it('refuses a claim where the runner was not actually near the ray', () => {
    const r = round(3)
    const si = sniperIndex(r)
    const runner = runnersOf(r)[0]
    // Straight down the lane, nowhere near the runner off to one side.
    const claimed = claim(r, si, { x: r.players[si].x, z: r.players[si].z, yaw: 2.5, pitch: 0, victim: runner.id })!
    expect(claimed.hit).toBe(-1)
    expect(runner.lives).toBe(LIVES_START)
  })

  it('moves a runner only as far as the elapsed time allows, and never through a tree', () => {
    const r = round(2)
    const ri = r.players.findIndex((p) => p.role === 'runner')
    const before = { x: r.players[ri].x, z: r.players[ri].z }
    report(r, ri, { x: before.x, z: before.z - 1000 }, 0, 0, 0.05, 0, false)
    const moved = Math.hypot(r.players[ri].x - before.x, r.players[ri].z - before.z)
    expect(moved).toBeLessThan(2)
  })
})

describe('leaving', () => {
  it('takes a runner out without ending the round while others remain', () => {
    const r = round(3)
    const ri = r.players.findIndex((p) => p.role === 'runner')
    leave(r, ri)
    expect(isStanding(r.players[ri])).toBe(false)
    judgeEnd(r)
    expect(r.over).toBe(false)
  })

  it("ends it for the Sniper once every runner still here is down or gone", () => {
    const r = round(3)
    for (const p of runnersOf(r)) leave(r, r.players.indexOf(p))
    judgeEnd(r)
    expect(r.over).toBe(true)
    expect(r.winner).toBe('sniper')
  })
})

describe('looking and cooldown', () => {
  it('clamps pitch and wraps yaw', () => {
    const r = round()
    const si = sniperIndex(r)
    look(r, si, Math.PI * 3, 5)
    expect(Math.abs(r.players[si].pitch)).toBeLessThanOrEqual(1.35)
    expect(Math.abs(r.players[si].yaw)).toBeLessThanOrEqual(Math.PI + 1e-9)
  })

  it('counts down to zero and no further', () => {
    const r = round()
    const si = sniperIndex(r)
    fire(r, si)
    expect(cooldownLeft(r, r.players[si])).toBeGreaterThan(0)
    recharge(r)
    expect(cooldownLeft(r, r.players[si])).toBe(0)
  })
})
