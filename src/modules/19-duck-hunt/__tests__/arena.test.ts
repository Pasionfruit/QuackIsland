/**
 * The balloons: how many, whose, where, and what a shot along a ray hits.
 *
 * The property that matters most is fairness - everybody gets the same number
 * of balloons, and they are spread over the arena rather than stacked - and the
 * one that matters next is that a shot hits exactly what is under it.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { ARENA, BOUNDS, COLOURS, EMBLEMS, balloonAt, lifetime, pickBalloon, schedule, shootable } from '../internal/arena'
import { FILL, FOV, frameScene } from '../internal/camera'

const SEED = 4242

describe('the schedule', () => {
  it('gives every player exactly the same number of balloons, for any lobby size', () => {
    for (let players = 1; players <= 8; players++) {
      const balloons = schedule(SEED, players)
      const counts = Array.from({ length: players }, (_, i) => balloons.filter((b) => b.owner === i).length)
      expect(new Set(counts).size, `${players} players`).toBe(1)
      expect(counts[0]).toBeGreaterThan(20)
    }
  })

  it('lets them go in waves, every one of them on the floor of the arena, none on top of another', () => {
    const balloons = schedule(SEED, 8)
    const waves = new Map<number, typeof balloons>()
    for (const b of balloons) {
      expect(b.x >= ARENA.floor.minX && b.x <= ARENA.floor.maxX).toBe(true)
      expect(b.z >= ARENA.floor.minZ && b.z <= ARENA.floor.maxZ).toBe(true)
      waves.set(b.spawnAt, [...(waves.get(b.spawnAt) ?? []), b])
    }
    for (const wave of waves.values()) {
      expect(new Set(wave.map((b) => b.owner)).size).toBe(8)
      for (const a of wave) for (const b of wave) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(ARENA.radius * 2)
    }
  })

  it('does not let a balloon go too late to be shot, or before the game has started', () => {
    for (const b of schedule(SEED, 4)) {
      expect(b.spawnAt).toBeGreaterThan(0)
      expect(b.spawnAt).toBeLessThanOrEqual(ARENA.duration - ARENA.lastWaveBefore)
    }
  })

  it('does not always put the same player on the same side', () => {
    const balloons = schedule(SEED, 4)
    const leftShare = balloons.filter((b) => b.owner === 0 && b.x < 0).length / balloons.filter((b) => b.owner === 0).length
    expect(leftShare).toBeGreaterThan(0.25)
    expect(leftShare).toBeLessThan(0.75)
  })

  it('is the same schedule for the same seed, and a different one for another', () => {
    expect(schedule(SEED, 3)).toEqual(schedule(SEED, 3))
    expect(schedule(SEED, 3)).not.toEqual(schedule(SEED + 1, 3))
  })

  it('has eight colours and eight shapes, all different', () => {
    expect(new Set(COLOURS).size).toBe(8)
    expect(new Set(EMBLEMS).size).toBe(8)
  })
})

describe('a balloon in flight', () => {
  const balloon = schedule(SEED, 2)[0]

  it('is nowhere before it lets go and after it floats away', () => {
    expect(balloonAt(balloon, balloon.spawnAt - 0.01)).toBeNull()
    expect(balloonAt(balloon, balloon.spawnAt + lifetime(balloon) + 0.01)).toBeNull()
  })

  it('rises steadily from the floor to the ceiling, swaying but staying put front to back', () => {
    let lastY = -Infinity
    for (let t = 0; t <= lifetime(balloon); t += 0.25) {
      const at = balloonAt(balloon, balloon.spawnAt + t)!
      expect(at.y).toBeGreaterThan(lastY)
      expect(Math.abs(at.x - balloon.x)).toBeLessThanOrEqual(balloon.sway + 1e-9)
      expect(at.z).toBe(balloon.z)
      lastY = at.y
    }
    expect(balloonAt(balloon, balloon.spawnAt)!.y).toBeCloseTo(ARENA.startY)
    expect(balloonAt(balloon, balloon.spawnAt + lifetime(balloon))!.y).toBeCloseTo(ARENA.ceiling)
  })

  it('can still be shot a moment after it floats away, to allow for the network', () => {
    const gone = balloon.spawnAt + lifetime(balloon)
    expect(shootable(balloon, gone + ARENA.escapeGrace / 2)).toBe(true)
    expect(shootable(balloon, gone + ARENA.escapeGrace * 2)).toBe(false)
  })
})

describe('a shot along a ray', () => {
  const balloons = schedule(SEED, 3)
  const t = balloons[0].spawnAt + 2
  const camera = { x: 0, y: 6, z: 30 }
  const aimAt = (p: { x: number; y: number; z: number }) => ({ x: p.x - camera.x, y: p.y - camera.y, z: p.z - camera.z })

  it('hits the balloon it is aimed at, on its surface', () => {
    const target = balloons.find((b) => balloonAt(b, t))!
    const at = balloonAt(target, t)!
    const hit = pickBalloon(balloons, new Map(), camera, aimAt(at), t)
    expect(hit).not.toBeNull()
    const along = (b: typeof target) => Math.hypot(balloonAt(b, t)!.x - camera.x, balloonAt(b, t)!.y - camera.y, balloonAt(b, t)!.z - camera.z)
    // Whatever it hit is on the line and at least as close as the target.
    expect(along(hit!.balloon)).toBeLessThanOrEqual(along(target) + ARENA.radius * 2)
    expect(Math.hypot(hit!.point.x - balloonAt(hit!.balloon, t)!.x, hit!.point.y - balloonAt(hit!.balloon, t)!.y, hit!.point.z - balloonAt(hit!.balloon, t)!.z)).toBeCloseTo(ARENA.radius, 5)
  })

  it('misses just outside the edge, and hits just inside', () => {
    const lone = [balloons[0]]
    const at = balloonAt(lone[0], t)!
    const inside = pickBalloon(lone, new Map(), camera, aimAt({ ...at, x: at.x + ARENA.radius * 0.9 }), t)
    const outside = pickBalloon(lone, new Map(), camera, aimAt({ ...at, x: at.x + ARENA.radius * 1.3 }), t)
    expect(inside?.balloon.id).toBe(lone[0].id)
    expect(outside).toBeNull()
  })

  it('goes straight through a popped balloon', () => {
    const lone = [balloons[0]]
    const at = balloonAt(lone[0], t)!
    expect(pickBalloon(lone, new Map([[lone[0].id, 1]]), camera, aimAt(at), t)).toBeNull()
  })

  it('hits the nearer of two balloons in a line', () => {
    const [a, b] = [balloons[0], balloons[1]].map((x) => ({ ...x }))
    const far = { ...a, id: 100, z: -6, x: 0, sway: 0 }
    const near = { ...b, id: 101, z: 0, x: 0, sway: 0, spawnAt: a.spawnAt, speed: a.speed }
    const at = balloonAt(far, t)!
    const hit = pickBalloon([far, near], new Map(), { x: 0, y: at.y, z: 30 }, { x: 0, y: 0, z: -1 }, t)
    expect(hit?.balloon.id).toBe(101)
  })

  it('never hits anything behind it', () => {
    const lone = [balloons[0]]
    const at = balloonAt(lone[0], t)!
    expect(pickBalloon(lone, new Map(), camera, { x: -(at.x - camera.x), y: -(at.y - camera.y), z: -(at.z - camera.z) }, t)).toBeNull()
  })
})

describe('the fixed camera', () => {
  const SHAPES = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]

  it('keeps the whole arena in frame, floor to ceiling, and fills it, at every window shape', () => {
    for (const aspect of SHAPES) {
      const shot = frameScene(aspect)
      const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const corners: Vector3[] = []
      for (const x of [BOUNDS.minX, BOUNDS.maxX]) for (const z of [BOUNDS.minZ, BOUNDS.maxZ]) for (const y of [BOUNDS.minY, BOUNDS.maxY]) corners.push(new Vector3(x, y, z))
      for (const c of corners) expect(frustum.containsPoint(c), `${aspect}`).toBe(true)
      const reach = Math.max(...corners.map((c) => c.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('sits in front of the arena, looking across it', () => {
    const shot = frameScene(1.6)
    expect(shot.z).toBeGreaterThan(BOUNDS.maxZ)
    expect(shot.y).toBeGreaterThan(0)
  })
})
