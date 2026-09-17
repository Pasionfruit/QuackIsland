/**
 * One round on the wire - eight players through it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, frameScene } from '../internal/camera'
import { POND, createGame, duckAt, ducksFor, flightTime, spotOf, stepGame, throwCracker, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 97531

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 61)
}

const spots = (n: number) => (player: number) => spotOf(player, n)

describe('a snapshot', () => {
  it('comes back as the round that went out', () => {
    const game = host(3)
    for (let i = 0; i < 40; i++) stepGame(game, 0.05)
    throwCracker(game, 1, { angle: 0.2, distance: 9 })
    for (let i = 0; i < 20; i++) stepGame(game, 0.05)
    throwCracker(game, 2, { angle: -0.1, distance: 14 })
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2', spots(3))
    expect([copy.id, copy.seed, copy.over]).toEqual([61, SEED, false])
    expect(copy.players.map((p) => [p.id, p.score, p.throws, p.seq, p.mine])).toEqual(game.players.map((p) => [p.id, p.score, p.throws, p.seq, p.id === 'p2']))
    expect(copy.crackers.map((c) => [c.id, c.player, c.fed, c.from])).toEqual(game.crackers.map((c) => [c.id, c.player, c.fed, c.from]))
    copy.crackers.forEach((c, i) => {
      expect(c.to.x).toBeCloseTo(game.crackers[i].to.x, 1)
      expect(c.lands).toBeCloseTo(game.crackers[i].lands, 1)
    })
    expect(copy.eating).toEqual(game.eating)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'fy' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: [[1, 5, 0, 0, 0, 1, -2]] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: [[1, 0, 0, 0, 0, 1, 99]] })).toBeNull()
    expect(decodeSnapshot({ ...good, d: 'x' })).toBeNull()
  })

  it('fits in a relay message with eight players throwing', () => {
    const game = host(8)
    for (let i = 0; i < 60; i++) {
      game.players.forEach((_, p) => throwCracker(game, p, { angle: 0.1 * p, distance: 10 + p }))
      stepGame(game, 0.3)
    }
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    const said = decodeIntent(relay(encodeIntent(61, 4, { angle: 0.3456, distance: 12.345 })))!
    expect([said.game, said.seq]).toEqual([61, 4])
    expect(said.thrown.angle).toBeCloseTo(0.346, 3)
    expect(said.thrown.distance).toBeCloseTo(12.35, 2)
    expect(decodeIntent({ t: 'ft-in', g: 61, q: 0, a: 0, d: 5 })).toBeNull()
    expect(decodeIntent({ t: 'ft-in', g: 61, q: 1, a: 'x', d: 5 })).toBeNull()
  })
})

describe('eight players at one pond', () => {
  it('agree on every score, with throws said again and some lost, and no throw counted twice', () => {
    const game = host(8)
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), seq: 0, said: [] as { seq: number; angle: number; distance: number }[] }))
    const ducks = ducksFor(SEED, game.eating.length)

    for (let frame = 0; !game.over; frame++) {
      for (const guest of guests) {
        // Now and then, a throw at a duck, a little off.
        if (random() < 0.06) {
          const from = spotOf(guest.index, 8)
          const d = ducks[Math.floor(random() * ducks.length)]
          const now = duckAt(d, game.elapsed)
          const at = duckAt(d, game.elapsed + flightTime(Math.hypot(now.x - from.x, now.z - from.z)))
          guest.seq += 1
          guest.said.push({ seq: guest.seq, angle: Math.atan2(at.x - from.x, from.z - at.z) + (random() - 0.5) * 0.08, distance: Math.hypot(at.x - from.x, at.z - from.z) })
        }
        guest.said = guest.said.filter((s) => s.seq > game.players[guest.index].seq)
        for (const s of guest.said) {
          if (random() < 0.3) continue
          const heard = decodeIntent(relay(encodeIntent(game.id, s.seq, { angle: s.angle, distance: s.distance })))!
          throwCracker(game, guest.index, heard.thrown, heard.seq)
        }
      }
      stepGame(game, 1 / 30)
      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) if (random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id, spots(8))
      }
    }
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id, spots(8))

    const fed = game.players.reduce((n, p) => n + p.score, 0)
    expect(fed).toBeGreaterThan(10)
    for (const p of game.players) expect(p.throws).toBeLessThanOrEqual(p.seq)
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.score, p.throws])).toEqual(game.players.map((p) => [p.id, p.score, p.throws]))
    }
    expect(POND.duration).toBe(60)
  })
})

describe('the fixed camera', () => {
  it('keeps the pond and the bank in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const shot = frameScene(aspect)
      const camera = new PerspectiveCamera(FOV, aspect, 0.5, 400)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
      // Behind the bank, looking out over the water.
      expect(shot.z).toBeGreaterThan(POND.standZ)
    }
  })
})
