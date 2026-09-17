/**
 * One round on the wire - eight players through it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, frameScene } from '../internal/camera'
import { WATCH, createGame, stepGame, stop, stopwatch, targetFor, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { HIDDEN, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 112358

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 29)
}

function at(game: Game, reading: number) {
  while (stopwatch(game) < reading - 1e-9 && !game.over) stepGame(game, Math.min(0.25, reading - stopwatch(game)))
}

describe('a snapshot', () => {
  it('says who has stopped but not when, until the round is over', () => {
    const game = host(3)
    at(game, 9)
    stop(game, 0, 8.76)
    const during = relay(encodeSnapshot(game))
    expect(JSON.stringify(during)).not.toContain('8.76')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(during)!, 'p3')
    expect(copy.players.map((p) => p.stopped)).toEqual([HIDDEN, null, null])
    expect(copy.seed).toBe(SEED)
    expect(targetFor(copy.seed)).toBe(targetFor(SEED))

    stop(game, 1, 9)
    stop(game, 2, 9)
    stepGame(game, 0.05)
    expect(game.over).toBe(true)
    const after = applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(after.players.map((p) => p.stopped)).toEqual([8.76, 9, 9])
    expect(after.over).toBe(true)
  })

  it("keeps a guest's own stop while it is hidden from everybody else", () => {
    const game = host(2)
    at(game, 4)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    copy.players[1].stopped = 3.9
    stop(game, 1, 3.9)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players[1].stopped).toBe(3.9)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'ft' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', -3, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', -1, 2]] })).toBeNull()
  })

  it('fits in a relay message with eight on the stage', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(29, 9.12345)))).toEqual({ game: 29, at: 9.123 })
    expect(decodeIntent({ t: 'ti-in', g: 29, a: -1 })).toBeNull()
    expect(decodeIntent({ t: 'ti-in', a: 3 })).toBeNull()
  })
})

describe('eight players on one stage', () => {
  it('agree on every stop once the round is over, with stops said again and some lost', () => {
    const game = host(8)
    let seed = 3
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const target = targetFor(SEED)
    const guests = game.players.map((p, index) => ({
      id: p.id,
      index,
      copy: waitingGame(),
      // Each means to stop somewhere near the target, on its own clock.
      means: Math.round((target + (index - 3.5) * 0.4) * 100) / 100,
      said: null as number | null,
    }))

    for (let frame = 0; !game.over && frame < 10000; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        if (copy.players.length > 0 && guest.said === null && stopwatch(copy) >= guest.means) guest.said = guest.means
        if (guest.said !== null && random() > 0.3) {
          const heard = decodeIntent(relay(encodeIntent(game.id, guest.said)))!
          stop(game, guest.index, heard.at, WATCH.grace)
        }
      }
      stepGame(game, 1 / 30)
      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) {
          if (random() < 0.2) continue
          applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
          // The guest's clock, a little behind the host's.
          guest.copy.elapsed = game.elapsed - 0.05
        }
      }
    }
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)

    expect(game.over).toBe(true)
    game.players.forEach((p, i) => expect(p.stopped).toBe(guests[i].means))
    for (const guest of guests) expect(guest.copy.players.map((p) => p.stopped)).toEqual(game.players.map((p) => p.stopped))
  })
})

describe('the fixed camera', () => {
  it('keeps the stopwatch and everybody in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const shot = frameScene(aspect)
      const camera = new PerspectiveCamera(FOV, aspect, 0.5, 200)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })
})
