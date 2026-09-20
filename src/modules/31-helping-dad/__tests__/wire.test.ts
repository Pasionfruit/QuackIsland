/**
 * One game on the wire - eight torches through it - and the camera, and the mouse.
 */
import { Frustum, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, HOLD, POINTS, SWEEP, aimAt, cameraFor } from '../internal/camera'
import { GRID, HALF, intoWorld, mazeAngle, mazeFor, routeTarget, touchesWall } from '../internal/maze'
import { ROUND, TORCH, clock, createGame, finishPoint, inJunk, report, steer, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777001

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 31)
}

function started(g: Game): Game {
  while (clock(g) < 0) stepGame(g, 0.25)
  return g
}

/**
 * A careful mouse a little ahead of a torch, along the way out - and the torch's
 * own place, holding it still, while a piece of Dad's junk is in the way of it.
 */
function mouseFor(g: Game, player: number, dt = 1 / 30) {
  const torch = g.players[player]
  const here = { x: torch.x, z: torch.z }
  if (!torch.held) return here
  const goal = routeTarget(mazeFor(g.seed), torch)
  const d = Math.hypot(goal.x - torch.x, goal.z - torch.z)
  if (d < 1e-6) return goal
  const to = (m: number) => ({ x: torch.x + ((goal.x - torch.x) / d) * m, z: torch.z + ((goal.z - torch.z) / d) * m })
  if (inJunk(g, to(Math.min(d, TORCH.speed * dt))) || inJunk(g, to(0.3))) return here
  return to(Math.min(d, 0.25))
}

describe('a snapshot', () => {
  it('carries every torch, and a guest keeps its own where its own screen has it', () => {
    const game = started(host(3))
    game.players[1].x += 0.3
    game.players[2].hits = 2
    game.players[2].stunned = 1.2
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.seed).toBe(SEED)
    expect(copy.players.map((p) => [p.id, +p.x.toFixed(2), p.hits, p.mine])).toEqual(game.players.map((p) => [p.id, +p.x.toFixed(2), p.hits, p.id === 'p3']))
    expect(copy.players[2].stunned).toBeCloseTo(1.2)

    // The guest moves its own torch; the host has not heard yet.
    copy.players[2].x += 0.4
    copy.players[2].hits = 3
    game.players[0].x += 0.2
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBeCloseTo(game.players[2].x + 0.4)
    expect(copy.players[2].hits).toBe(3)
    expect(copy.players[0].x).toBeCloseTo(game.players[0].x, 2)

    // The host's finish counts; and once over, the host's word is everything.
    game.players[2].finished = 40.5
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].finished).toBe(40.5)
    game.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBeCloseTo(game.players[2].x, 2)
    expect(copy.over).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'ss' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, o: 2 })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 99999, 0, 0, 0, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 0, 0, 900, 0, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 0, 0, 0, 0, -1, 4]] })).toBeNull()
  })

  it('fits in a relay message with eight in the maze', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })

  it('starts a guest afresh when the host starts a new game', () => {
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(host(3))))!, 'p2')
    copy.players[1].x += 1
    const next = createGame(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 32)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p2')
    expect(copy.id).toBe(32)
    expect(copy.players[1].x).toBeCloseTo(next.players[1].x, 2)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(31, 1.23456, -2.5, 2)))).toEqual({ game: 31, x: 1.235, z: -2.5, hits: 2 })
    expect(decodeIntent({ t: 'hd-in', g: 31, x: 1, z: 99, h: 0 })).toBeNull()
    expect(decodeIntent({ t: 'hd-in', g: 31, x: 1, z: 1, h: -1 })).toBeNull()
    expect(decodeIntent({ t: 'hd', g: 31, x: 1, z: 1, h: 0 })).toBeNull()
  })
})

describe('eight torches in one maze', () => {
  it('end where each guest had its own, with reports lost, the host placing the first three out', () => {
    const game = started(host(8))
    let seed = 5
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), lastHeard: game.elapsed }))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)
    const dt = 1 / 30
    for (let frame = 0; !game.over && frame < 30 * 150; frame++) {
      for (const guest of guests.slice(1)) {
        const copy = guest.copy
        stepGame(copy, dt)
        copy.over = false
        const me = copy.players.findIndex((p) => p.mine)
        // Each guest at its own pace: some frames it does not move.
        if (random() < 0.15 * guest.index / 8) continue
        steer(copy, me, mouseFor(copy, me), dt)
        // Guest 5 is careless once.
        if (guest.index === 5 && frame === 200) copy.players[me].hits += 1
        if (frame % 2 === 0 && random() > 0.25) {
          const said = decodeIntent(relay(encodeIntent(game.id, copy.players[me].x, copy.players[me].z, copy.players[me].hits)))!
          report(game, guest.index, { x: said.x, z: said.z }, said.hits, game.elapsed - guest.lastHeard)
          guest.lastHeard = game.elapsed
        }
      }
      steer(game, 0, mouseFor(game, 0), dt)
      stepGame(game, dt)
      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests.slice(1)) if (random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    expect(game.over).toBe(true)
    const end = finishPoint(SEED)
    const out = game.players.filter((torch) => torch.finished !== null)
    expect(out.length).toBeGreaterThanOrEqual(ROUND.podium)
    expect(clock(game)).toBeLessThan(ROUND.limit)
    for (const torch of out) expect(Math.hypot(torch.x - end.x, torch.z - end.z)).toBeLessThanOrEqual(TORCH.finish + 1e-9)
    expect(game.players[5].hits).toBe(1)
    for (const guest of guests.slice(1)) {
      applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)
      expect(guest.copy.players.map((p) => p.finished)).toEqual(game.players.map((p) => p.finished))
    }
  })
})

describe('the fixed camera', () => {
  it('keeps the maze and Dad in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('keeps the maze in frame however far round it has turned', () => {
    const maze = mazeFor(SEED)
    const corners = [
      { x: -HALF.x, z: -HALF.z },
      { x: HALF.x, z: -HALF.z },
      { x: -HALF.x, z: HALF.z },
      { x: HALF.x, z: HALF.z },
    ]
    // Every corner, at every angle the maze ever reaches, is inside the circle
    // the camera is fitted to - and so inside the frame at every window shape.
    for (const aspect of [0.5, 1, 1.78, 2.35]) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      for (let t = 0; t <= ROUND.limit; t += 1) {
        const angle = mazeAngle(maze.seed, t)
        for (const corner of corners) {
          const at = intoWorld(corner, angle)
          expect(Math.hypot(at.x, at.z)).toBeLessThanOrEqual(SWEEP)
          expect(frustum.containsPoint(new Vector3(at.x, GRID.height, at.z)), `${aspect} ${t}`).toBe(true)
        }
      }
    }
  })

  it('puts the mouse exactly where it points in the maze', () => {
    for (const aspect of [0.75, 1.78, 2.35]) {
      const camera = cameraFor(aspect)
      for (const [x, z] of [
        [0, 0],
        [-HALF.x + 0.6, HALF.z - 0.6],
        [HALF.x - 0.6, -HALF.z + 0.6],
        [2.4, -1.2],
      ]) {
        const ndc = new Vector3(x, HOLD, z).project(camera)
        const at = aimAt({ x: ndc.x, y: ndc.y }, aspect)!
        expect(at.x).toBeCloseTo(x, 4)
        expect(at.z).toBeCloseTo(z, 4)
      }
    }
  })

  it('looks steeply enough that a wall never hides the torch beside it by more than a few millimetres', () => {
    const camera = cameraFor(1.78)
    const toward = camera.position.clone().sub(new Vector3(0, 0, 0)).normalize()
    // How far a wall's top reaches out over the floor, seen from the camera: its height over the tan of the view.
    const lean = GRID.height / Math.tan(Math.asin(toward.y))
    expect(lean).toBeLessThan(0.1)
    // And the torch is carried at the wall tops, so at the ring's own height there is no lean at all.
    expect(HOLD).toBe(GRID.height)
    expect(touchesWall(mazeFor(SEED), { x: 0, z: -HALF.z + GRID.wall / 2 + TORCH.radius + 0.01 }, TORCH.radius)).toBe(false)
  })
})
