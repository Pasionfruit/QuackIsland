/**
 * What was added to the game: hunters who hunt for whoever eliminated them, and
 * are put beside them; jumping; shield power-ups; and an arena over twice the size.
 */
import { describe, expect, it } from 'vitest'
import { botSteer, sightedBy, yawTowards } from '../internal/ai'
import { ARENA, SPAWN_ROOM, arenaFor, blocked, lineClear, respawnSpot } from '../internal/arena'
import {
  BODY,
  GUN,
  JUMP,
  PICKUP,
  ROUND,
  allied,
  claim,
  clock,
  collect,
  createGame,
  crewOf,
  eliminate,
  eyeOf,
  fire,
  isStanding,
  leave,
  pickupReady,
  report,
  stepGame,
  walk,
  type Game,
} from '../internal/rules'
import { across as acrossIn, lane } from './places'
import { applySnapshot, decodeSnapshot, encodeSnapshot } from '../internal/wire'
import { waitingGame } from '../internal/setup'

const SEED = 20260917

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 9)
}

function started(g: Game): Game {
  while (clock(g) < ROUND.guard) stepGame(g, 0.25)
  return g
}

function put(g: Game, i: number, x: number, z: number) {
  g.players[i].x = x
  g.players[i].z = z
}

function aim(g: Game, i: number, at: { x: number; z: number; y?: number }, height = 1.2) {
  const p = g.players[i]
  const from = eyeOf(p)
  p.yaw = yawTowards(p, at)
  p.pitch = Math.atan2((at.y ?? 0) + height - from.y, Math.hypot(at.x - p.x, at.z - p.z))
}

function reload(g: Game) {
  for (let t = 0; t < GUN.cooldown + 0.01; t += 0.25) stepGame(g, 0.25)
}

const OPEN = lane(SEED)

describe('a hunter hunts for whoever eliminated them', () => {
  it('starts hunting again a few metres behind them, in the clear, looking the way they look', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const arena = arenaFor(seed)
      const g = started(createGame(seed, [{ id: 'a' }, { id: 'b' }], 3))
      const killer = g.players[0]
      const victim = g.players[1]
      victim.y = 0.5
      victim.trail = [{ at: 0, x: 0, z: 0, y: 0 }]
      eliminate(g, 1, 0)
      expect(victim.out).not.toBeNull()
      const d = Math.hypot(victim.x - killer.x, victim.z - killer.z)
      expect(d).toBeGreaterThan(1.5)
      expect(d).toBeLessThan(7)
      expect(blocked(arena, victim, SPAWN_ROOM - 0.05)).toBe(false)
      expect(victim.yaw).toBeCloseTo(killer.yaw, 9)
      // Behind them, not in front: on the side away from where they look.
      const ahead = { x: -Math.sin(killer.yaw), z: -Math.cos(killer.yaw) }
      expect((victim.x - killer.x) * ahead.x + (victim.z - killer.z) * ahead.z).toBeLessThan(1)
      expect(victim).toMatchObject({ y: 0, vy: 0, pitch: 0, respawns: 1, trail: [] })
    }
  })

  it('finds the nearest clear spot when the way behind is cover, and is the same every time', () => {
    const arena = arenaFor(SEED)
    for (const b of arena.blocks.filter((c) => !c.wall).slice(0, 12)) {
      // Standing with their back right against a piece of cover.
      const killer = { x: (b.x0 + b.x1) / 2, z: b.z1 + 1, yaw: Math.PI }
      const out = respawnSpot(arena, killer)
      expect(blocked(arena, out, SPAWN_ROOM - 0.05)).toBe(false)
      expect(Math.abs(out.x)).toBeLessThan(ARENA.half)
      expect(respawnSpot(arena, killer)).toEqual(out)
    }
  })

  it('cannot hurt the one it hunts for: its shots pass straight through them', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    expect(crewOf(g, 1)).toBe(0)
    expect(allied(g, 0, 1)).toBe(true)
    put(g, 1, 6, OPEN)
    aim(g, 1, g.players[0])
    const shot = fire(g, 1)!
    expect(shot.hit).toBe(-1)
    expect(g.players[0].out).toBeNull()
    // Nor by a claim: a guest that says it hit them is not believed.
    reload(g)
    const said = claim(g, 1, { x: 6, z: OPEN, yaw: yawTowards({ x: 6, z: OPEN }, g.players[0]), pitch: 0, victim: 'p1' })!
    expect(said.hit).toBe(-1)
    expect(g.players[0].out).toBeNull()
  })

  it('can hurt everybody else, who then hunt for the same side', () => {
    const g = started(game(4))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    put(g, 1, 6, OPEN)
    put(g, 2, 0, OPEN)
    reload(g)
    aim(g, 1, g.players[2])
    expect(fire(g, 1)!.hit).toBe(2)
    // p3 was got by p2's hunter, p2 by p1: all three are p1's.
    expect(g.players[2].by).toBe(1)
    expect(crewOf(g, 2)).toBe(0)
    expect(allied(g, 0, 2)).toBe(true)
    expect(allied(g, 1, 2)).toBe(true)
    expect(allied(g, 0, 3)).toBe(false)
    // Kills are the hunter's own.
    expect(g.players[1].kills).toBe(1)
    expect(g.players[0].kills).toBe(1)
  })

  it('goes with them if they are eliminated: whoever got their master is now everybody’s master', () => {
    const g = started(game(4))
    put(g, 0, -6, OPEN)
    put(g, 1, -6, OPEN + 1)
    put(g, 3, 6, OPEN)
    // p1 eliminates p2; p4 eliminates p1.
    eliminate(g, 1, 0)
    expect(crewOf(g, 1)).toBe(0)
    put(g, 3, 6, OPEN)
    eliminate(g, 0, 3)
    expect(crewOf(g, 0)).toBe(3)
    expect(crewOf(g, 1)).toBe(3)
    expect(allied(g, 1, 3)).toBe(true)
    expect(allied(g, 0, 1)).toBe(true)
    // ...and the hunter that was p1's now cannot shoot p4.
    put(g, 3, 6, OPEN)
    put(g, 1, -6, OPEN)
    aim(g, 1, g.players[3])
    expect(fire(g, 1)!.hit).toBe(-1)
  })

  it('has nobody to hunt for if they left, or in a crossfire that was somehow mutual', () => {
    const g = started(game(3))
    eliminate(g, 1, 0)
    expect(crewOf(g, 1)).toBe(0)
    leave(g, 0)
    // The one they hunted for has gone: free to shoot whoever is standing.
    expect(crewOf(g, 1)).toBeNull()
    expect(allied(g, 1, 0)).toBe(false)
    const h = game(3)
    Object.assign(h.players[0], { out: 5, by: 1 })
    Object.assign(h.players[1], { out: 5, by: 0 })
    expect(crewOf(h, 0)).toBeNull()
    expect(crewOf(h, 1)).toBeNull()
    expect(allied(h, 0, 1)).toBe(false)
  })

  it('is never on its own side against somebody standing who is not its master', () => {
    const g = started(game(3))
    eliminate(g, 1, 0)
    expect(crewOf(g, 2)).toBe(2)
    expect(allied(g, 1, 2)).toBe(false)
    expect(allied(g, 2, 0)).toBe(false)
  })

  it('is respected by the stand-ins: they never see, or shoot at, anybody on their side', () => {
    const g = started(createGame(SEED, [{ id: 'a' }, { id: 'b', bot: true }, { id: 'c' }], 4))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    put(g, 2, 0, OPEN + 30)
    eliminate(g, 1, 0)
    put(g, 1, 6, OPEN)
    g.players[1].yaw = yawTowards(g.players[1], g.players[0])
    expect(sightedBy(g, 1, null)).toBe(-1)
    for (let i = 0; i < 200; i++) {
      put(g, 0, -6, OPEN)
      put(g, 1, 6, OPEN)
      g.players[1].yaw = yawTowards(g.players[1], g.players[0])
      botSteer(g, 1 / 30)
      stepGame(g, 1 / 30)
    }
    expect(g.players[0].out).toBeNull()
  })

  it('does not change who placed where: the standing first, then the last to go', () => {
    const g = started(game(3))
    stepGame(g, 1)
    eliminate(g, 1, 0)
    stepGame(g, 1)
    eliminate(g, 2, 1)
    expect(isStanding(g.players[0])).toBe(true)
    expect(g.players[2].out!).toBeGreaterThan(g.players[1].out!)
  })
})

describe('jumping', () => {
  const jumpFor = (g: Game, i: number, seconds: number, dt = 1 / 60) => {
    let peak = 0
    for (let t = 0; t < seconds; t += dt) {
      walk(g, i, { forward: 0, right: 0, jump: t < dt * 1.5 }, dt)
      peak = Math.max(peak, g.players[i].y)
    }
    return peak
  }

  it('goes nearly a metre up and comes back to the floor, and no further', () => {
    const g = started(game(2))
    const peak = jumpFor(g, 0, 1.2)
    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeLessThanOrEqual(JUMP.max)
    expect(g.players[0]).toMatchObject({ y: 0, vy: 0 })
    // About six tenths of a second in the air.
    let air = 0
    const h = started(game(2))
    for (let t = 0; t < 2; t += 1 / 60) {
      walk(h, 0, { forward: 0, right: 0, jump: t < 0.02 }, 1 / 60)
      if (h.players[0].y > 0) air += 1 / 60
    }
    expect(air).toBeGreaterThan(0.5)
    expect(air).toBeLessThan(0.75)
  })

  it('cannot be done again in the air, and can again once down - held, it goes on', () => {
    const g = started(game(2))
    let peak = 0
    for (let t = 0; t < 0.5; t += 1 / 60) {
      walk(g, 0, { forward: 0, right: 0, jump: true }, 1 / 60)
      peak = Math.max(peak, g.players[0].y)
    }
    // Held through the whole first jump, and still no higher than one.
    expect(peak).toBeLessThanOrEqual(JUMP.max)
    let jumps = 0
    let was = 0
    for (let t = 0; t < 3; t += 1 / 60) {
      walk(g, 0, { forward: 0, right: 0, jump: true }, 1 / 60)
      if (was === 0 && g.players[0].y > 0) jumps += 1
      was = g.players[0].y
    }
    expect(jumps).toBeGreaterThanOrEqual(3)
  })

  it('does not stop the walk, and goes the same whatever the frame rate', () => {
    const a = started(game(2))
    const b = started(game(2))
    put(a, 0, 0, OPEN)
    put(b, 0, 0, OPEN)
    a.players[0].yaw = -Math.PI / 2
    b.players[0].yaw = -Math.PI / 2
    let peakA = 0
    let peakB = 0
    for (let t = 0; t < 0.6; t += 1 / 60) {
      walk(a, 0, { forward: 1, right: 0, jump: t < 0.02 }, 1 / 60)
      peakA = Math.max(peakA, a.players[0].y)
    }
    for (let t = 0; t < 0.6; t += 1 / 20) {
      walk(b, 0, { forward: 1, right: 0, jump: t < 0.02 }, 1 / 20)
      peakB = Math.max(peakB, b.players[0].y)
    }
    expect(a.players[0].x).toBeGreaterThan(2.5)
    expect(Math.abs(peakA - peakB)).toBeLessThan(0.12)
  })

  it('is nothing before the start, or once it is over', () => {
    const g = game(2)
    g.elapsed = -1
    walk(g, 0, { forward: 0, right: 0, jump: true }, 0.1)
    expect(g.players[0].y).toBe(0)
    const h = started(game(2))
    h.over = true
    walk(h, 0, { forward: 0, right: 0, jump: true }, 0.1)
    expect(h.players[0].y).toBe(0)
  })

  it('keeps the eyes under the cover, at the top of a jump: nobody shoots over it', () => {
    expect(BODY.eye + JUMP.max).toBeLessThan(ARENA.coverHeight)
    const g = started(game(2))
    const { cover, west, east } = acrossIn(SEED)
    put(g, 0, west.x, west.z)
    put(g, 1, east.x, east.z)
    g.players[0].y = JUMP.max
    aim(g, 0, g.players[1])
    const shot = fire(g, 0)!
    // From as high as a jump goes, a shot at somebody behind a crate still meets the crate.
    expect(shot.from.y).toBeCloseTo(BODY.eye + JUMP.max, 6)
    expect(shot.hit).toBe(-1)
    expect(shot.to.x).toBeLessThan(cover.x1 + 0.01)
    expect(lineClear(arenaFor(SEED), eyeOf(g.players[0]), { x: east.x, y: 1.2, z: east.z })).toBe(false)
  })

  it('makes a body in the air a body in the air: a shot under it misses, one at it hits', () => {
    const g = started(game(2))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    g.players[1].y = JUMP.max
    // At the feet of where they would stand: passes under.
    aim(g, 0, { x: 6, z: OPEN, y: 0 }, 0.3)
    expect(fire(g, 0)!.hit).toBe(-1)
    expect(g.players[1].out).toBeNull()
    reload(g)
    // At their chest, where they are: a hit.
    aim(g, 0, { x: 6, z: OPEN, y: JUMP.max }, 1.2)
    expect(fire(g, 0)!.hit).toBe(1)
  })

  it('makes a shooter in the air shoot from higher up, and a guest’s claimed height is held to what a jump reaches', () => {
    const g = started(game(2))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    g.players[0].y = 0.5
    expect(eyeOf(g.players[0]).y).toBeCloseTo(BODY.eye + 0.5, 9)
    const h = started(game(2))
    put(h, 0, -6, OPEN)
    put(h, 1, 6, OPEN + 30)
    // A guest that says it is on the moon is taken to be as high as a jump goes.
    const shot = claim(h, 0, { x: -6, z: OPEN, y: 40, yaw: 0, pitch: 0, victim: null })!
    expect(shot.from.y).toBeLessThanOrEqual(BODY.eye + JUMP.max + 1e-9)
    // Or on the floor, if it says nothing.
    reload(h)
    expect(claim(h, 0, { x: -6, z: OPEN, yaw: 0, pitch: 0, victim: null })!.from.y).toBeCloseTo(BODY.eye, 9)
    // A guest's report moves the host's copy up, no higher than a jump goes.
    report(h, 1, { x: 6, z: OPEN + 30 }, 0, 0, 0.05, 0.6)
    expect(h.players[1].y).toBeCloseTo(0.6, 9)
    report(h, 1, { x: 6, z: OPEN + 30 }, 0, 0, 0.05, 9)
    expect(h.players[1].y).toBeLessThanOrEqual(JUMP.max)
    report(h, 1, { x: 6, z: OPEN + 30 }, 0, 0, 0.05, -4)
    expect(h.players[1].y).toBe(0)
  })

  it('is counted against a victim in the air on a guest’s claim, where they were', () => {
    const g = started(game(2))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    g.players[1].y = 0.7
    aim(g, 0, { x: 6, z: OPEN, y: 0.7 }, 1.2)
    const p = g.players[0]
    expect(claim(g, 0, { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, victim: 'p2' })!.hit).toBe(1)
  })
})

describe('shields', () => {
  it('lie about the arena: apart, in the open, the same every game of a seed', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const arena = arenaFor(seed)
      expect(arena.pickups.length).toBeGreaterThanOrEqual(6)
      expect(arena.pickups.length).toBeLessThanOrEqual(ARENA.pickups)
      for (const at of arena.pickups) {
        expect(Math.abs(at.x)).toBeLessThan(ARENA.half)
        expect(Math.abs(at.z)).toBeLessThan(ARENA.half)
        for (const b of arena.blocks) {
          const d = Math.hypot(at.x - Math.max(b.x0, Math.min(at.x, b.x1)), at.z - Math.max(b.z0, Math.min(at.z, b.z1)))
          expect(d).toBeGreaterThanOrEqual(ARENA.pickupRoom - 1e-9)
        }
        for (const other of arena.pickups) if (other !== at) expect(Math.hypot(at.x - other.x, at.z - other.z)).toBeGreaterThanOrEqual(ARENA.pickupGap - 1e-9)
      }
    }
    expect(arenaFor(SEED).pickups).toEqual(arenaFor(SEED).pickups)
    expect(arenaFor(SEED + 1).pickups).not.toEqual(arenaFor(SEED).pickups)
  })

  it('are all there at the start, and are picked up by walking through one', () => {
    const g = started(game(3))
    const spots = arenaFor(SEED).pickups
    expect(g.pickups).toHaveLength(spots.length)
    expect(spots.every((_, k) => pickupReady(g, k))).toBe(true)
    // Not from a step too far.
    put(g, 0, spots[0].x + PICKUP.reach + 0.3, spots[0].z)
    collect(g)
    expect(g.players[0].shield).toBe(false)
    put(g, 0, spots[0].x + PICKUP.reach - 0.2, spots[0].z)
    collect(g)
    expect(g.players[0].shield).toBe(true)
    expect(pickupReady(g, 0)).toBe(false)
    expect(pickupReady(g, 1)).toBe(true)
  })

  it('take a while to come back, and somebody who already has one cannot take another', () => {
    const g = started(game(3))
    const spots = arenaFor(SEED).pickups
    put(g, 0, spots[0].x, spots[0].z)
    collect(g)
    // Standing on the empty spot does nothing for anybody else.
    put(g, 1, spots[0].x, spots[0].z)
    collect(g)
    expect(g.players[1].shield).toBe(false)
    // A second spot, with a shield already in hand: left where it is.
    put(g, 0, spots[1].x, spots[1].z)
    collect(g)
    expect(pickupReady(g, 1)).toBe(true)
    expect(g.players[0].shield).toBe(true)
    // Back after the wait, and not before - with nobody standing on it to take it the moment it is.
    put(g, 1, 0, OPEN)
    for (let t = 0; t < PICKUP.respawn - 1; t += 0.25) stepGame(g, 0.25)
    expect(pickupReady(g, 0)).toBe(false)
    for (let t = 0; t < 1.5; t += 0.25) stepGame(g, 0.25)
    expect(pickupReady(g, 0)).toBe(true)
  })

  it('go to whoever is first in player order when two get there together', () => {
    const g = started(game(3))
    const spots = arenaFor(SEED).pickups
    put(g, 0, spots[2].x + 0.3, spots[2].z)
    put(g, 1, spots[2].x - 0.3, spots[2].z)
    collect(g)
    expect(g.players.map((p) => p.shield)).toEqual([true, false, false])
  })

  it('are for those standing: a hunter walks through one and gets nothing', () => {
    const g = started(game(3))
    const spots = arenaFor(SEED).pickups
    eliminate(g, 1, 0)
    put(g, 1, spots[0].x, spots[0].z)
    collect(g)
    expect(g.players[1].shield).toBe(false)
    expect(pickupReady(g, 0)).toBe(true)
  })

  it('take the next hit and nothing else: the shooter kills nobody, and the shield is gone', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    g.players[1].shield = true
    aim(g, 0, g.players[1])
    const first = fire(g, 0)!
    // The shot met them, and that is all it did.
    expect(first.hit).toBe(1)
    expect(g.players[1]).toMatchObject({ out: null, by: null, shield: false })
    expect(g.players[0].kills).toBe(0)
    expect(g.players.filter(isStanding)).toHaveLength(3)
    // And the next one does not.
    reload(g)
    aim(g, 0, g.players[1])
    fire(g, 0)
    expect(g.players[1].out).not.toBeNull()
    expect(g.players[0].kills).toBe(1)
  })

  it('take a guest’s hit the same way, and are not a place to hide a hunter', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    g.players[1].shield = true
    aim(g, 0, g.players[1])
    const p = g.players[0]
    claim(g, 0, { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, victim: 'p2' })
    expect(g.players[1]).toMatchObject({ out: null, shield: false })
    // A shield does not move anybody: nobody was eliminated, so nobody is put anywhere.
    expect(g.players[1].respawns).toBe(0)
    expect(g.players[1].x).toBe(6)
  })

  it('are picked up by stand-ins, who head for one when they have none', () => {
    let held = 0
    for (const seed of [11, 12, 13, 14]) {
      const g = createGame(seed, Array.from({ length: 4 }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
      for (let i = 0; i < 30 * 40 && !g.over; i++) {
        botSteer(g, 1 / 30)
        stepGame(g, 1 / 30)
        if (g.players.some((p) => p.shield)) {
          held += 1
          break
        }
      }
    }
    expect(held).toBeGreaterThan(0)
  }, 30000)
})

describe('the arena is big', () => {
  it('is 48 m across, with a lot of cover and room to start, and everybody clear of it', () => {
    expect(ARENA.half * 2).toBeGreaterThanOrEqual(46)
    for (const seed of [1, 2, 3, SEED]) {
      const cover = arenaFor(seed).blocks.filter((b) => !b.wall)
      expect(cover.length).toBeGreaterThanOrEqual(40)
      for (let count = 1; count <= 8; count++) {
        const g = createGame(seed, Array.from({ length: count }, (_, i) => ({ id: `p${i}` })))
        for (const p of g.players) {
          expect(blocked(arenaFor(seed), p, SPAWN_ROOM)).toBe(false)
          expect(Math.hypot(p.x, p.z)).toBeGreaterThan(ARENA.spawnRing - 3)
        }
        for (const p of g.players) for (const q of g.players) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(4)
      }
    }
  })

  it('has cover that still leaves the whole of it one open space, with the walls intact', () => {
    const arena = arenaFor(SEED)
    expect(arena.blocks.filter((b) => b.wall)).toHaveLength(4)
    // Everywhere a body can stand is reachable from the middle of it: a coarse flood fill over the floor.
    const cell = 1
    const n = Math.floor((ARENA.half * 2) / cell)
    const free = (i: number, j: number) => !blocked(arena, { x: -ARENA.half + (i + 0.5) * cell, z: -ARENA.half + (j + 0.5) * cell }, BODY.radius + 0.1)
    const seen = new Set<number>()
    const queue: [number, number][] = []
    const start = [Math.floor(n / 2), Math.floor(n / 2)] as const
    for (let d = 0; d < 6 && queue.length === 0; d++) for (let i = -d; i <= d; i++) for (let j = -d; j <= d; j++) if (free(start[0] + i, start[1] + j)) queue.push([start[0] + i, start[1] + j])
    for (const [i, j] of queue) seen.add(i * n + j)
    while (queue.length) {
      const [i, j] = queue.pop()!
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const a = i + di
        const b = j + dj
        if (a < 0 || b < 0 || a >= n || b >= n || seen.has(a * n + b) || !free(a, b)) continue
        seen.add(a * n + b)
        queue.push([a, b])
      }
    }
    let open = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (free(i, j)) open += 1
    expect(seen.size / open).toBeGreaterThan(0.97)
  })
})

describe('the wire, for what was added', () => {
  it('carries who is shielded and how high anybody is, and which shields are there', () => {
    const g = started(game(3))
    g.players[1].shield = true
    g.players[2].y = 0.6
    g.pickups[1] = g.elapsed + 10
    const copy = applySnapshot(waitingGame(), decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!, 'p1')
    expect(copy.players.map((p) => p.shield)).toEqual([false, true, false])
    expect(copy.players[2].y).toBeCloseTo(0.6, 2)
    const spots = arenaFor(SEED).pickups.length
    expect(copy.pickups).toHaveLength(spots)
    expect(copy.pickups[0]).toBe(0)
    expect(copy.pickups[1]).toBe(Infinity)
    expect(pickupReady(copy, 0)).toBe(true)
    expect(pickupReady(copy, 1)).toBe(false)
  })

  it('leaves a guest’s own height to its own screen, and moves it once, when it is eliminated', () => {
    const g = started(game(3))
    const copy = applySnapshot(waitingGame(), decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!, 'p2')
    copy.players[1].y = 0.4
    copy.players[1].x += 2
    const there = copy.players[1].x
    applySnapshot(copy, decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!, 'p2')
    expect(copy.players[1]).toMatchObject({ y: 0.4, respawns: 0 })
    expect(copy.players[1].x).toBe(there)
    // Eliminated by p1: put beside them by the host, and told once.
    eliminate(g, 1, 0)
    applySnapshot(copy, decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!, 'p2')
    expect(copy.players[1]).toMatchObject({ y: 0, respawns: 1 })
    expect(copy.players[1].x).toBeCloseTo(g.players[1].x, 2)
    expect(copy.players[1].yaw).toBeCloseTo(g.players[0].yaw, 2)
    // Another snapshot: not moved again, and its own from now on.
    copy.players[1].x += 1
    const now = copy.players[1].x
    applySnapshot(copy, decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!, 'p2')
    expect(copy.players[1].respawns).toBe(1)
    expect(copy.players[1].x).toBe(now)
    // A guest whose shield broke without being eliminated is not moved.
    const h = started(game(3))
    h.players[1].shield = true
    const twin = applySnapshot(waitingGame(), decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(h))))!, 'p2')
    expect(twin.players[1].shield).toBe(true)
    h.players[1].shield = false
    applySnapshot(twin, decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(h))))!, 'p2')
    expect(twin.players[1]).toMatchObject({ shield: false, respawns: 0 })
  })
})
