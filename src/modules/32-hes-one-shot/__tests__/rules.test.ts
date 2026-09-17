/**
 * The arena, walking, the gun, a guest's shots, the end and the placings.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { yawTowards } from '../internal/ai'
import { ARENA, SPAWN_ROOM, arenaFor, blocked, collide, lineClear, rayHit, slide, spawnPoint, type Point } from '../internal/arena'
import {
  BODY,
  CLAIM,
  GUN,
  ROUND,
  aimDirection,
  claim,
  clock,
  createGame,
  fire,
  isHunter,
  leave,
  placings,
  report,
  stepGame,
  walk,
  type Game,
} from '../internal/rules'
import { across as acrossIn, lane } from './places'

const SEED = 20260917

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 7)
}

/** Past the countdown. */
function started(g: Game): Game {
  for (let i = 0; clock(g) < 0; i++) {
    if (i > 100) throw new Error('the countdown never finished')
    stepGame(g, 0.25)
  }
  return g
}

/** Lets `seconds` go by, a quarter at a time: a single step is never longer. */
function wait(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.25) stepGame(g, Math.min(0.25, seconds - t))
}

function put(g: Game, i: number, x: number, z: number) {
  g.players[i].x = x
  g.players[i].z = z
}

/** Turns player `i` to look at the chest of whoever stands at `at`. */
function aim(g: Game, i: number, at: Point, height = 1.2) {
  const p = g.players[i]
  p.yaw = yawTowards(p, at)
  p.pitch = Math.atan2(height - BODY.eye, Math.hypot(at.x - p.x, at.z - p.z))
}

/** Waits out the gun. */
function reload(g: Game) {
  for (let t = 0; t < GUN.cooldown + 0.01; t += 0.25) stepGame(g, 0.25)
}

/** A z clear from x = -7 to 7, a metre either side. */
const OPEN = lane(SEED)

/** A piece of cover, and a spot a few metres either side of it along x. */
const across = () => acrossIn(SEED)

describe('the arena', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(arenaFor(SEED).blocks).toEqual(arenaFor(SEED).blocks)
    expect(arenaFor(SEED + 1).blocks).not.toEqual(arenaFor(SEED).blocks)
  })

  it('has cover all over, with room to walk between any two and round the edge, all of it taller than anybody', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const cover = arenaFor(seed).blocks.filter((b) => !b.wall)
      expect(cover.length).toBeGreaterThanOrEqual(8)
      for (const b of cover) {
        expect(b.height).toBeGreaterThan(BODY.eye + 0.3)
        expect(Math.min(b.x0 + ARENA.half, ARENA.half - b.x1, b.z0 + ARENA.half, ARENA.half - b.z1)).toBeGreaterThanOrEqual(ARENA.gap - 1e-9)
        for (const other of cover) {
          if (other === b) continue
          const dx = Math.max(b.x0 - other.x1, other.x0 - b.x1, 0)
          const dz = Math.max(b.z0 - other.z1, other.z0 - b.z1, 0)
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(ARENA.gap - 1e-9)
        }
      }
    }
  })

  it('starts everybody clear of everything, round the ring, facing the middle', () => {
    for (const seed of [1, 2, SEED]) {
      for (let count = 1; count <= 8; count++) {
        const g = createGame(seed, Array.from({ length: count }, (_, i) => ({ id: `p${i}` })))
        for (const p of g.players) {
          expect(blocked(arenaFor(seed), p, SPAWN_ROOM)).toBe(false)
          const ahead = aimDirection(p.yaw, 0)
          expect(ahead.x * -p.x + ahead.z * -p.z).toBeCloseTo(Math.hypot(p.x, p.z), 5)
        }
        for (const p of g.players) {
          for (const q of g.players) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(4)
        }
      }
    }
    expect(spawnPoint(SEED, 4, 1)).toEqual(spawnPoint(SEED, 4, 1))
  })

  it('pushes a body out of a box the short way, and never lets one slide through', () => {
    const arena = arenaFor(SEED)
    const { cover, west, east } = across()
    const inside = collide(arena, { x: cover.x0 + 0.05, z: (cover.z0 + cover.z1) / 2 }, BODY.radius)
    expect(inside.x).toBeCloseTo(cover.x0 - BODY.radius, 9)
    expect(blocked(arena, inside, BODY.radius)).toBe(false)
    const through = slide(arena, west, east.x - west.x, 0, BODY.radius)
    expect(through.x).toBeLessThan(cover.x0)
    expect(blocked(arena, through, BODY.radius)).toBe(false)
    // Out past the wall is back inside it.
    expect(collide(arena, { x: 40, z: -40 }, BODY.radius)).toEqual({ x: ARENA.half - BODY.radius, z: -ARENA.half + BODY.radius })
  })

  it('stops a ray at the first box, or the floor', () => {
    const arena = arenaFor(SEED)
    const { cover, west, east } = across()
    const from = { x: west.x, y: BODY.eye, z: west.z }
    expect(rayHit(arena, from, { x: 1, y: 0, z: 0 }, 100)).toBeCloseTo(cover.x0 - west.x, 9)
    expect(rayHit(arena, { x: 0, y: 2, z: OPEN }, { x: 0, y: -1, z: 0 }, 100)).toBeCloseTo(2, 9)
    expect(lineClear(arena, from, { x: east.x, y: BODY.eye, z: east.z })).toBe(false)
    expect(lineClear(arena, { x: -6, y: BODY.eye, z: OPEN }, { x: 6, y: BODY.eye, z: OPEN })).toBe(true)
  })
})

describe('walking', () => {
  it('goes at a jog, no faster on a diagonal, and only once the countdown is done', () => {
    const g = game(2)
    put(g, 0, -6, OPEN)
    g.players[0].yaw = -Math.PI / 2 // east
    walk(g, 0, { forward: 1, right: 0 }, 0.1)
    expect(g.players[0].x).toBe(-6)
    started(g)
    for (let i = 0; i < 60; i++) walk(g, 0, { forward: 1, right: 0 }, 1 / 60)
    expect(g.players[0].x).toBeCloseTo(-6 + BODY.speed, 6)
    expect(g.players[0].z).toBeCloseTo(OPEN, 6)
    // Diagonally, a few centimetres - which is all it takes to see the length of the step.
    put(g, 0, -6, OPEN)
    walk(g, 0, { forward: 1, right: 1 }, 0.01)
    expect(Math.hypot(g.players[0].x + 6, g.players[0].z - OPEN)).toBeCloseTo(BODY.speed * 0.01, 9)
  })

  it('goes forward where a camera turned the same way looks, and right to its right, at any angle', () => {
    for (const yaw of [0, 0.7, -1.9, Math.PI, 2.6]) {
      for (const pitch of [0, 0.5, -1.1]) {
        const camera = new PerspectiveCamera()
        camera.rotation.set(pitch, yaw, 0, 'YXZ')
        camera.updateMatrixWorld(true)
        const looks = camera.getWorldDirection(new Vector3())
        const d = aimDirection(yaw, pitch)
        expect(looks.x).toBeCloseTo(d.x, 9)
        expect(looks.y).toBeCloseTo(d.y, 9)
        expect(looks.z).toBeCloseTo(d.z, 9)

        const cameraRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
        const cameraAhead = looks.clone().setY(0).normalize()
        for (const [forward, right, want] of [
          [1, 0, cameraAhead],
          [0, 1, cameraRight],
        ] as const) {
          const g = started(game(2))
          // A quarter metre any way from here is clear of the cover and the wall.
          put(g, 0, 0, OPEN)
          g.players[0].yaw = yaw
          walk(g, 0, { forward, right }, 0.05)
          const moved = new Vector3(g.players[0].x, 0, g.players[0].z - OPEN).normalize()
          expect(moved.dot(want)).toBeCloseTo(1, 6)
        }
      }
    }
  })

  it('never takes a body into anything, walking into it for as long as you like', () => {
    const g = started(game(2))
    const { west, cover } = across()
    put(g, 0, west.x, west.z)
    g.players[0].yaw = -Math.PI / 2
    for (let i = 0; i < 300; i++) {
      walk(g, 0, { forward: 1, right: 0.3 }, 1 / 60)
      expect(blocked(arenaFor(SEED), g.players[0], BODY.radius)).toBe(false)
    }
    expect(g.players[0].x < cover.x0 || g.players[0].z < cover.z0 || g.players[0].z > cover.z1).toBe(true)
  })
})

describe('the gun', () => {
  it('eliminates with one shot, and needs a second and a half before the next', () => {
    const g = game(3)
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    put(g, 2, 0, -OPEN)
    aim(g, 0, g.players[1])
    expect(fire(g, 0)).toBeNull()
    started(g)
    const shot = fire(g, 0)!
    expect(shot.hit).toBe(1)
    expect(Math.hypot(shot.to.x - 6, shot.to.z - OPEN)).toBeCloseTo(BODY.radius, 1)
    expect(g.players[1]).toMatchObject({ out: 0, by: 0 })
    expect(g.players[0].kills).toBe(1)
    aim(g, 0, g.players[2])
    wait(g, GUN.cooldown - 0.25)
    expect(fire(g, 0)).toBeNull()
    stepGame(g, 0.25)
    expect(fire(g, 0)).not.toBeNull()
  })

  it('is stopped by cover, and misses when it is aimed off', () => {
    const g = started(game(3))
    const { west, east } = across()
    put(g, 0, west.x, west.z)
    put(g, 1, east.x, east.z)
    aim(g, 0, g.players[1])
    const blockedShot = fire(g, 0)!
    expect(blockedShot.hit).toBe(-1)
    expect(g.players[1].out).toBeNull()

    reload(g)
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    aim(g, 0, g.players[1])
    g.players[0].yaw += 0.12
    expect(fire(g, 0)!.hit).toBe(-1)
    reload(g)
    // Over their head.
    aim(g, 0, g.players[1], BODY.height + 0.3)
    expect(fire(g, 0)!.hit).toBe(-1)
    expect(g.players[1].out).toBeNull()
  })

  it('goes through a hunter, who cannot be shot, and a hunter can still shoot', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 0, OPEN)
    put(g, 2, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    expect(isHunter(g.players[1])).toBe(true)
    reload(g)
    aim(g, 0, g.players[2])
    const through = fire(g, 0)!
    expect(through.hit).toBe(2)
    expect(g.players[2].by).toBe(0)
    // The hunter turns on the shooter.
    const h = started(game(3))
    put(h, 0, -6, OPEN)
    put(h, 1, 6, OPEN)
    aim(h, 0, h.players[1])
    fire(h, 0)
    aim(h, 1, h.players[0])
    expect(fire(h, 1)!.hit).toBe(0)
    expect(h.players[0].by).toBe(1)
    // Both went at the same moment, behind p3, who nobody shot.
    expect(placings(h).map((e) => [e.player.id, e.place])).toEqual([
      ['p3', 1],
      ['p1', 2],
      ['p2', 2],
    ])
  })
})

describe("a guest's shot", () => {
  const facing = (g: Game, i: number, at: Point) => {
    const p = g.players[i]
    return { x: p.x, z: p.z, yaw: yawTowards(p, at), pitch: Math.atan2(1.2 - BODY.eye, Math.hypot(at.x - p.x, at.z - p.z)) }
  }

  it('counts where the victim was a moment ago on its screen, but not a mile off', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    // The guest saw them 0.6 m back.
    const shot = claim(g, 0, { ...facing(g, 0, { x: 6, z: OPEN - 0.6 }), victim: 'p2' })!
    expect(shot.hit).toBe(1)
    expect(g.players[1].out).not.toBeNull()

    const h = started(game(3))
    put(h, 0, -6, OPEN)
    put(h, 1, 6, OPEN)
    expect(claim(h, 0, { ...facing(h, 0, { x: 6, z: OPEN - (BODY.radius + CLAIM.slack + 0.5) }), victim: 'p2' })!.hit).toBe(-1)
    expect(h.players[1].out).toBeNull()
  })

  it('does not count through cover, at a hunter, too soon, or where the guest saw nothing', () => {
    const g = started(game(3))
    const { west, east } = across()
    put(g, 0, west.x, west.z)
    put(g, 1, east.x, east.z)
    expect(claim(g, 0, { ...facing(g, 0, g.players[1]), victim: 'p2' })!.hit).toBe(-1)

    const h = started(game(3))
    put(h, 0, -6, OPEN)
    put(h, 1, 6, OPEN)
    h.players[1].out = 0
    expect(claim(h, 0, { ...facing(h, 0, h.players[1]), victim: 'p2' })!.hit).toBe(-1)
    h.players[1].out = null
    expect(claim(h, 0, { ...facing(h, 0, h.players[1]), victim: 'p2' })).toBeNull()
    wait(h, GUN.cooldown - CLAIM.early)
    // Right at them, but the guest's own screen saw a miss: a miss.
    expect(claim(h, 0, { ...facing(h, 0, h.players[1]), victim: null })!.hit).toBe(-1)
    expect(h.players[1].out).toBeNull()
  })

  it('is taken from where the host has the shooter, if the guest says somewhere far off', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    const shot = claim(g, 0, { x: 0, z: -OPEN, yaw: -Math.PI / 2, pitch: -0.05, victim: 'p2' })!
    expect(shot.from.x).toBeCloseTo(-6, 9)
    expect(shot.hit).toBe(1)
  })

  it('in a crossfire, both shots count: the one shot first is already a hunter, and hunters shoot', () => {
    const g = started(game(2))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    claim(g, 0, { ...facing(g, 0, g.players[1]), victim: 'p2' })
    claim(g, 1, { ...facing(g, 1, g.players[0]), victim: 'p1' })
    expect(g.players.map((p) => p.out)).toEqual([0, 0])
    expect(placings(g).map((e) => e.place)).toEqual([1, 1])
    expect(stepGame(g, 0.01).over).toBe(true)
  })

  it("takes a guest's walk only as far as it could have gone, and never through anything", () => {
    const g = started(game(2))
    put(g, 1, -6, OPEN)
    report(g, 1, { x: 6, z: OPEN }, 0.3, 0, 0.1)
    expect(g.players[1].x).toBeCloseTo(-6 + 0.1 * BODY.speed * 1.5 + 0.3, 6)
    expect(g.players[1].yaw).toBeCloseTo(0.3, 9)
    const { west, east } = across()
    put(g, 1, west.x, west.z)
    report(g, 1, east, 0, 0, 100)
    expect(g.players[1].x).toBeLessThan(across().cover.x0)
  })
})

describe('the end', () => {
  it('comes when nobody is left standing, and the last to go wins', () => {
    const g = started(game(3))
    put(g, 0, -6, OPEN)
    put(g, 1, 0, OPEN)
    put(g, 2, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    wait(g, 5)
    // p1 alone standing, but the hunter p2 is still here: not over.
    reload(g)
    aim(g, 2, g.players[0])
    fire(g, 2)
    expect(stepGame(g, 0.01).over).toBe(false)
    wait(g, 5)
    aim(g, 1, g.players[2])
    fire(g, 1)
    expect(stepGame(g, 0.01).over).toBe(true)
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p3', 1],
      ['p1', 2],
      ['p2', 3],
    ])
  })

  it('comes at a minute and fifteen, and everybody standing shares first', () => {
    const g = started(game(4))
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    while (!g.over) stepGame(g, 0.25)
    expect(clock(g)).toBeGreaterThanOrEqual(ROUND.limit)
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p1', 1],
      ['p3', 1],
      ['p4', 1],
      ['p2', 4],
    ])
  })

  it('puts anybody who left standing last, and ends when there is nobody left to shoot at', () => {
    const g = started(game(3))
    wait(g, 2)
    leave(g, 2)
    expect(g.over).toBe(false)
    put(g, 0, -6, OPEN)
    put(g, 1, 6, OPEN)
    aim(g, 0, g.players[1])
    fire(g, 0)
    expect(placings(g).map((e) => e.player.id)).toEqual(['p1', 'p2', 'p3'])
    wait(g, 1)
    leave(g, 1)
    expect(stepGame(g, 0.01).over).toBe(true)
  })
})
