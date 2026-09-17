/**
 * One game on the wire - eight players through it - and the camera and clicks.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { CUP_HEIGHT, FILL, FOV, POINTS, TOP, frameScene, pickSlot, pointsFor } from '../internal/camera'
import { createGame, cupCount, currentStage, facesBySlot, found, pick, slotX, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { HIDDEN, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 4455

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 72)
}

function toPhase(game: Game, phase: Game['phase']) {
  while (game.phase !== phase) stepGame(game, 0.05)
}

describe('a snapshot', () => {
  it('keeps picks hidden until the cups come up', () => {
    const game = host(3)
    toPhase(game, 'pick')
    pick(game, 0, 2)
    pick(game, 1, 4)
    const during = relay(encodeSnapshot(game))
    expect(JSON.stringify((during.f as unknown[][]).map((f) => f[3]))).not.toContain('4')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(during)!, 'p3')
    expect(copy.players.map((p) => p.picks[0])).toEqual([HIDDEN, HIDDEN, null])

    toPhase(game, 'result')
    const after = applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(after.players.map((p) => p.picks[0])).toEqual([2, 4, null])
    expect(after.players.map((p) => p.score)).toEqual(game.players.map((p) => p.score))
  })

  it("leaves a guest's own pick alone while it is hidden from everybody else", () => {
    const game = host(2)
    toPhase(game, 'pick')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    copy.players[1].picks[0] = 3
    pick(game, 1, 3)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players[1].picks[0]).toBe(3)
  })

  it('carries the stage, phase and seed, so a guest deals the same shuffle', () => {
    const game = host(4)
    toPhase(game, 'shuffle')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    expect([copy.id, copy.seed, copy.stage, copy.phase]).toEqual([72, SEED, 0, 'shuffle'])
    expect(currentStage(copy)).toEqual(currentStage(game))
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'wa' })).toBeNull()
    expect(decodeSnapshot({ ...good, st: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    const f = good.f as unknown[][]
    expect(decodeSnapshot({ ...good, f: [[f[0][0], f[0][1], f[0][2], [9, -1, -1]]] })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [[f[0][0], f[0][1], f[0][2], [-1, -1]]] })).toBeNull()
  })

  it('fits in a relay message with eight at the table', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(72, 2, 5)))).toEqual({ game: 72, stage: 2, slot: 5 })
    expect(decodeIntent({ t: 'fy-in', g: 72, st: 0, c: 9 })).toBeNull()
    expect(decodeIntent({ t: 'fy-in', g: 72, st: 0, c: -1 })).toBeNull()
  })
})

describe('eight players at one table', () => {
  it('agree on every pick and score once the cups come up, with picks said again and some lost', () => {
    const game = host(8)
    let seed = 21
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), wants: null as { stage: number; slot: number } | null }))

    for (let frame = 0; game.phase !== 'over'; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        if (copy.phase === 'pick' && (!guest.wants || guest.wants.stage !== copy.stage)) {
          // Tracks its own cup some of the time, from its own copy of the shuffle.
          const bySlot = facesBySlot(currentStage(copy))
          const slot = random() < 0.6 ? bySlot.indexOf(guest.index) : Math.floor(random() * cupCount(8))
          guest.wants = { stage: copy.stage, slot }
          copy.players[guest.index].picks[copy.stage] = slot
        }
        if (guest.wants && random() > 0.3) {
          const said = decodeIntent(relay(encodeIntent(copy.id, guest.wants.stage, guest.wants.slot)))!
          pick(game, guest.index, said.slot, said.stage)
        }
      }
      stepGame(game, 0.05)
      if (frame % 2 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) {
          if (random() < 0.2) continue
          applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
          guest.copy.clock = game.clock
        }
      }
    }
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)

    expect(game.players.some((p) => p.score > 0)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.score, p.picks])).toEqual(game.players.map((p) => [p.id, p.score, p.picks]))
      for (let stage = 0; stage < 3; stage++) {
        expect(found(guest.copy, guest.index, stage)).toBe(found(game, guest.index, stage))
      }
    }
  })
})

describe('the fixed camera, and a click', () => {
  const aspects = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]
  const cameraFor = (aspect: number, cups?: number) => {
    const shot = frameScene(aspect, cups)
    const camera = new PerspectiveCamera(FOV, aspect, 0.5, 200)
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  it('keeps the whole row in frame, and fills it, for any number of cups, at every window shape', () => {
    for (const cups of [5, 7, 9]) for (const aspect of aspects) {
      const camera = cameraFor(aspect, cups)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = pointsFor(cups).map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
    expect(POINTS).toEqual(pointsFor(9))
  })

  it('lands a click on a cup on that cup, for any number of cups, at every window shape', () => {
    for (const cups of [5, 7, 9]) {
      for (const aspect of aspects) {
        const camera = cameraFor(aspect, cups)
        for (let slot = 0; slot < cups; slot++) {
          for (const y of [TOP + 0.3, TOP + CUP_HEIGHT * 0.6]) {
            const screen = new Vector3(slotX(slot, cups), y, 0).project(camera)
            const direction = new Vector3(screen.x, screen.y, 0.5).unproject(camera).sub(camera.position)
            expect(pickSlot(camera.position, direction, cups), `${cups} ${aspect} ${slot}`).toBe(slot)
          }
        }
        const gap = new Vector3((slotX(0, cups) + slotX(1, cups)) / 2, TOP + 0.3, 0).project(camera)
        const between = new Vector3(gap.x, gap.y, 0.5).unproject(camera).sub(camera.position)
        expect(pickSlot(camera.position, between, cups)).toBeNull()
      }
    }
  })
})
