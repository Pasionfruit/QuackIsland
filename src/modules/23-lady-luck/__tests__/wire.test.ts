/**
 * One round on the wire - eight hunters through it - and the camera and clicks.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, frameScene, groundHit } from '../internal/camera'
import { FIELD, click, cloverAt, createGame, fieldFor, spam, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777001
const LUCK = 99173

function host(n = 3): Game {
  return createGame(SEED, LUCK, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 52)
}

describe('a snapshot', () => {
  it('comes back as the round that went out', () => {
    const game = host(4)
    stepGame(game, 3)
    click(game, 1, game.lucky[0].clover, 1)
    click(game, 2, null, 1)
    click(game, 3, 5, 1)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect([copy.id, copy.seed, copy.over]).toEqual([52, SEED, false])
    expect(copy.lucky).toEqual(game.lucky)
    expect(copy.claims.map((c) => [c.clover, c.player])).toEqual(game.claims.map((c) => [c.clover, c.player]))
    copy.claims.forEach((c, i) => expect(c.at).toBeCloseTo(game.claims[i].at, 1))
    expect(copy.players.map((p) => [p.id, p.score, p.misses, p.cooldown, p.seq, p.miss, p.mine])).toEqual(
      game.players.map((p) => [p.id, p.score, p.misses, p.cooldown, p.seq, p.miss, p.id === 'p3']),
    )
  })

  it('never carries where the next clover will grow', () => {
    const message = relay(encodeSnapshot(host()))
    expect(JSON.stringify(message)).not.toContain(String(LUCK))
    expect(applySnapshot(waitingGame(), decodeSnapshot(message)!, 'p1').luck).toBe(0)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'dh' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, l: [[1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, l: [[FIELD.columns * FIELD.rows, 0, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, c: [[1, 9, 0]] })).toBeNull()
    const p = good.p as unknown[][]
    expect(decodeSnapshot({ ...good, p: [p[0].map((v, i) => (i === 3 ? -1 : v))] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [p[0].map((v, i) => (i === 5 ? -3 : v))] })).toBeNull()
  })

  it('fits in a relay message with eight hunters and a round of claims', () => {
    const game = host(8)
    for (let n = 0; n < 80; n++) click(game, n % 8, game.lucky[0].clover)
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(52, 4, 17)))).toEqual({ game: 52, seq: 4, clover: 17, spams: 0 })
    expect(decodeIntent(relay(encodeIntent(52, 5, null, 3)))).toEqual({ game: 52, seq: 5, clover: null, spams: 3 })
    // No click, only spam to own up to.
    expect(decodeIntent(relay(encodeIntent(52, 0, null, 2)))).toEqual({ game: 52, seq: 0, clover: null, spams: 2 })
    expect(decodeIntent({ t: 'll-in', g: 52, q: -1, c: 1, s: 0 })).toBeNull()
    expect(decodeIntent({ t: 'll-in', g: 52, q: 1, c: 1, s: -1 })).toBeNull()
    expect(decodeIntent({ t: 'll-in', g: 52, q: 1, c: FIELD.columns * FIELD.rows, s: 0 })).toBeNull()
    expect(decodeIntent({ t: 'll-in', g: 52, q: 1, c: -2, s: 0 })).toBeNull()
  })
})

describe('eight hunters in one field', () => {
  it('agree on every claim and score, with clicks repeated, some lost, and the same clover wanted twice', () => {
    const game = host(8)
    let seed = 3
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), seq: 0, spams: 0, said: [] as { seq: number; clover: number | null }[] }))
    const dt = 1 / 30

    for (let frame = 0; !game.over; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        const mine = copy.players[guest.index]
        if (!mine) continue
        // Now and then, click: mostly a four-leaf clover this guest can see - often the
        // same one as everybody else - sometimes a three-leaf one.
        if (mine.cooldown <= 0 && random() < 0.05) {
          const clover = copy.lucky.length > 0 && random() < 0.7 ? copy.lucky[0].clover : Math.floor(random() * FIELD.columns * FIELD.rows)
          guest.seq += 1
          guest.said.push({ seq: guest.seq, clover })
        } else if (mine.cooldown > 0 && random() < 0.02) {
          // Impatient: a click while the ring fills back up.
          guest.spams += 1
        }
        // Everything not yet taken is said again, and some of it is lost.
        guest.said = guest.said.filter((s) => s.seq > game.players[guest.index].seq)
        for (const s of guest.said) {
          if (random() < 0.3) continue
          const heard = decodeIntent(relay(encodeIntent(copy.id, s.seq, s.clover, guest.spams)))!
          spam(game, guest.index, heard.spams)
          click(game, guest.index, heard.clover, heard.seq)
        }
        if (guest.said.length === 0 && random() < 0.7) spam(game, guest.index, decodeIntent(relay(encodeIntent(copy.id, 0, null, guest.spams)))!.spams)
      }
      stepGame(game, dt)
      const wire = relay(encodeSnapshot(game))
      for (const guest of guests) if (frame % 3 === 0 && random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
    }
    const wire = relay(encodeSnapshot(game))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    expect(game.claims.length).toBeGreaterThan(8)
    // Every clover was claimed once, by one hunter, and scores are claims less a point a miss and a spam.
    expect(new Set(game.claims.map((c) => c.clover)).size).toBe(game.claims.length)
    game.players.forEach((p, i) =>
      expect(p.score).toBe(game.claims.filter((c) => c.player === i).length - (p.misses + p.spams) * FIELD.penalty),
    )
    expect(game.players.some((p) => p.misses > 0)).toBe(true)
    expect(game.players.some((p) => p.spams > 0)).toBe(true)
    // Never more spam taken than was made.
    game.players.forEach((p, i) => expect(p.spams).toBeLessThanOrEqual(guests[i].spams))
    for (const guest of guests) {
      expect(guest.copy.claims.map((c) => [c.clover, c.player])).toEqual(game.claims.map((c) => [c.clover, c.player]))
      expect(guest.copy.players.map((p) => [p.id, p.score])).toEqual(game.players.map((p) => [p.id, p.score]))
    }
  })
})

describe('the fixed camera, and a click', () => {
  const aspects = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]
  const cameraFor = (aspect: number) => {
    const shot = frameScene(aspect)
    const camera = new PerspectiveCamera(FOV, aspect, 0.5, 400)
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  it('keeps the whole field in frame, and fills it, at every window shape', () => {
    for (const aspect of aspects) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('lands a click on a clover on that clover, at every window shape', () => {
    const field = fieldFor(SEED)
    for (const aspect of aspects) {
      const camera = cameraFor(aspect)
      field.forEach((clover, i) => {
        for (const [dx, dz] of [[0, 0], [0.25, 0], [0, -0.25]]) {
          const screen = new Vector3(clover.x + dx, 0, clover.z + dz).project(camera)
          const direction = new Vector3(screen.x, screen.y, 0.5).unproject(camera).sub(camera.position)
          const hit = groundHit(camera.position, direction)!
          expect(cloverAt(SEED, hit.x, hit.z), `${aspect} ${i}`).toBe(i)
        }
      })
    }
  })

  it('misses a ray that never comes down', () => {
    expect(groundHit({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(groundHit({ x: 0, y: 10, z: 0 }, { x: 1, y: -1, z: 0 })).toEqual({ x: 10, z: 0 })
  })
})
