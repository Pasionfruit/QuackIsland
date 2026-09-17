/**
 * One round on the wire - eight players through it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, frameScene } from '../internal/camera'
import { FIELD, createGame, holeAt, molesFor, stepGame, swing, whackOf, type Game, type Intent } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { RECENT, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 60606

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 81)
}

function lineUp(game: Game, player: number, hole: number) {
  const h = holeAt(hole)
  Object.assign(game.players[player], { x: h.x - FIELD.strike, y: h.y, facing: 0 })
}

describe('a snapshot', () => {
  it('comes back as the round that went out', () => {
    const game = host(3)
    const mole = molesFor(SEED)[0]
    while (game.elapsed < mole.at + 0.1) stepGame(game, new Map(), 0.05)
    lineUp(game, 2, mole.hole)
    swing(game, 2)
    const copy = waitingGame()
    const at = applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    expect([copy.id, copy.seed, copy.over]).toEqual([81, SEED, false])
    expect(copy.whacks.map((w) => [w.mole, w.player])).toEqual([[mole.id, 2]])
    expect(copy.players.map((p) => [p.id, p.score, p.whacks, p.golden, p.mine])).toEqual(game.players.map((p) => [p.id, p.score, p.whacks, p.golden, p.id === 'p1']))
    expect(at.get('p3')!.x).toBeCloseTo(game.players[2].x, 1)
    expect(copy.players[2].swungAt).toBeCloseTo(game.players[2].swungAt, 1)
  })

  it("carries only the last few seconds' whacks, and a guest keeps the ones it has", () => {
    const game = host(2)
    const copy = waitingGame()
    for (const mole of molesFor(SEED).slice(0, 12)) {
      while (game.elapsed < mole.at + 0.05) stepGame(game, new Map(), 0.05)
      lineUp(game, 0, mole.hole)
      game.players[0].swungAt = -Infinity
      swing(game, 0)
      applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    }
    const message = relay(encodeSnapshot(game))
    expect((message.w as unknown[]).length).toBeLessThan(game.whacks.length)
    for (const [, , at] of message.w as number[][]) expect(at).toBeGreaterThanOrEqual(game.elapsed - RECENT - 0.01)
    expect(copy.whacks.map((w) => w.mole).sort((a, b) => a - b)).toEqual(game.whacks.map((w) => w.mole).sort((a, b) => a - b))
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'pb' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, w: [[1, 7, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, w: [[1, 0]] })).toBeNull()
    const f = good.f as unknown[][]
    expect(decodeSnapshot({ ...good, f: [f[0].map((v, i) => (i === 4 ? -1 : v))] })).toBeNull()
  })

  it('fits in a relay message with eight players whacking', () => {
    const game = host(8)
    for (let m = 0; m < 30; m++) game.whacks.push({ mole: m, player: m % 8, at: 12.34 })
    game.elapsed = 13
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its round, with the walk clamped', () => {
    expect(decodeIntent(relay(encodeIntent({ x: 0.5, y: -0.5, swings: 9 }, 81)))).toEqual({ game: 81, intent: { x: 0.5, y: -0.5, swings: 9 } })
    const fast = decodeIntent({ t: 'wa-in', g: 1, x: 30, y: 40, n: 0 })!
    expect(Math.hypot(fast.intent.x, fast.intent.y)).toBeCloseTo(1)
    expect(decodeIntent({ t: 'wa-in', g: 1, x: 0, y: 0, n: -1 })).toBeNull()
  })
})

describe('eight players in one field', () => {
  it('agree on every whack and score, with intents repeated and some lost', () => {
    const game = host(8)
    let seed = 13
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), swings: 0 }))
    const heard = new Map<string, Intent>()
    const dt = 1 / 30

    for (let frame = 0; !game.over; frame++) {
      for (const guest of guests) {
        const me = game.players[guest.index]
        // Head for whichever mole is up nearest, and swing when on it.
        const up = molesFor(SEED).filter((m) => m.at <= game.elapsed && game.elapsed < m.at + m.up && !whackOf(game, m.id))
        up.sort((a, b) => Math.hypot(holeAt(a.hole).x - me.x, holeAt(a.hole).y - me.y) - Math.hypot(holeAt(b.hole).x - me.x, holeAt(b.hole).y - me.y))
        let walk = { x: 0, y: 0 }
        if (up[0]) {
          const h = holeAt(up[0].hole)
          const far = Math.hypot(h.x - me.x, h.y - me.y)
          if (far > FIELD.strike) walk = { x: (h.x - me.x) / far, y: (h.y - me.y) / far }
          else if (random() < 0.2) guest.swings += 1
        }
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent({ ...walk, swings: guest.swings }, guest.copy.id || game.id)))!
        if (said.game === game.id) heard.set(guest.id, said.intent)
      }
      stepGame(game, heard, dt)
      if (frame % 2 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) if (random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    // A last few snapshots, as a guest keeps listening after the end.
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)

    expect(game.whacks.length).toBeGreaterThan(30)
    expect(new Set(game.whacks.map((w) => w.mole)).size).toBe(game.whacks.length)
    game.players.forEach((p, i) => {
      const mine = game.whacks.filter((w) => w.player === i)
      expect(p.whacks).toBe(mine.length)
      expect(p.score).toBe(mine.reduce((n, w) => n + (molesFor(SEED)[w.mole].golden ? FIELD.points.golden : FIELD.points.mole), 0))
      // Never more swings dealt than were asked for.
      expect(p.swings).toBeLessThanOrEqual(guests[i].swings)
    })
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.score])).toEqual(game.players.map((p) => [p.id, p.score]))
    }
  })
})

describe('the fixed camera', () => {
  it('keeps the whole field in frame, and fills it, at every window shape', () => {
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
    }
  })
})
