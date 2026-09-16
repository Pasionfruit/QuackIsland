/**
 * Where everybody stands, and the camera that sees it.
 *
 * All of it worked out from the game alone, so the things worth checking are
 * that nobody is ever standing in the sea who should not be, that nobody
 * shares a spot, and that the whole place is always in view.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, TILT, frameScene } from '../internal/camera'
import { GAME, choose, createGame, stepGame, type Game } from '../internal/game'
import { BEATS, BOUNDS, PLACE, bridgeDrop, onGround, revealProgress, spotFor } from '../internal/place'

const SEED = 31337

function eight(): Game {
  return createGame(SEED, Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}` })))
}

function toReveal(g: Game) {
  while (g.phase === 'choosing') stepGame(g, 0.1)
}

const spread = (spots: { x: number; z: number }[]) => {
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(1)
    }
  }
}

describe('standing', () => {
  it('puts everybody on the ledge behind their path while choosing, nobody on top of anybody', () => {
    const g = eight()
    g.players.forEach((p, i) => choose(g, p.id, i % 3))
    const spots = g.players.map((p) => spotFor(g, p))
    for (const [i, spot] of spots.entries()) {
      expect(onGround(spot, g)).toBe(true)
      expect(Math.abs(spot.x - PLACE.lanes[g.players[i].pick])).toBeLessThan(PLACE.bridgeWidth / 2)
      expect(spot.z).toBeGreaterThan(PLACE.bridgeNear)
    }
    spread(spots)
  })

  it('keeps all eight on the ledge even when they all pick the same path', () => {
    const g = eight()
    const spots = g.players.map((p) => spotFor(g, p))
    for (const spot of spots) expect(onGround(spot, g)).toBe(true)
    spread(spots)
  })

  it('walks survivors across to the island and drops the rest with their bridge', () => {
    const g = eight()
    g.players.forEach((p, i) => choose(g, p.id, i % 3))
    toReveal(g)
    while (revealProgress(g) < 0.999 && g.phase === 'reveal') stepGame(g, 0.05)
    // The last moment of the reveal, before the next round deals everybody back.
    g.clock = 0.0001
    for (const p of g.players) {
      const spot = spotFor(g, p)
      if (p.alive) {
        expect(onGround(spot, g)).toBe(true)
        expect(spot.z).toBeLessThan(PLACE.bridgeFar)
      } else {
        expect(spot.y).toBeLessThan(PLACE.seaLevel)
      }
    }
  })

  it('drops only the bridges that did not hold, and only once the reveal is under way', () => {
    const g = eight()
    for (let lane = 0; lane < 3; lane++) expect(bridgeDrop(g, lane)).toBe(0)
    toReveal(g)
    g.clock = GAME.revealTime * (1 - BEATS.drop[0] / 2)
    for (let lane = 0; lane < 3; lane++) expect(bridgeDrop(g, lane)).toBe(0)
    g.clock = 0
    for (let lane = 0; lane < 3; lane++) expect(bridgeDrop(g, lane) === 1).toBe(!g.safe.includes(lane))
  })

  it('puts the fallen on the bank for the rest of the game, apart from each other', () => {
    const g = eight()
    g.players.forEach((p, i) => choose(g, p.id, i % 3))
    toReveal(g)
    while (g.phase === 'reveal') stepGame(g, 0.1)
    const fallen = g.players.filter((p) => !p.alive)
    expect(fallen.length).toBeGreaterThan(0)
    const spots = fallen.map((p) => spotFor(g, p))
    for (const spot of spots) {
      expect(onGround(spot, g)).toBe(true)
      expect(Math.abs(spot.x - PLACE.bank.x)).toBeLessThanOrEqual(PLACE.bank.width / 2)
    }
    spread(spots)
  })

  it('has room on the bank for a whole lobby', () => {
    const g = createGame(SEED, Array.from({ length: 16 }, (_, i) => ({ id: `p${i + 1}` })))
    g.round = 3
    for (const p of g.players) {
      p.alive = false
      p.outIn = 1
    }
    const spots = g.players.map((p) => spotFor(g, p))
    for (const spot of spots) expect(onGround(spot, g)).toBe(true)
    spread(spots)
  })
})

describe('the fixed camera', () => {
  const SHAPES = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]

  function cameraFor(aspect: number) {
    const shot = frameScene(aspect)
    const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  const corners = () => {
    const out: Vector3[] = []
    for (const x of [BOUNDS.minX, BOUNDS.maxX]) {
      for (const z of [BOUNDS.minZ, BOUNDS.maxZ]) {
        for (const y of [BOUNDS.minY, BOUNDS.maxY]) out.push(new Vector3(x, y, z))
      }
    }
    return out
  }

  it('looks out along the bridges at its tilt, from behind the ledge', () => {
    const shot = frameScene(1.6)
    const elevation = (Math.atan2(shot.y - shot.target.y, shot.z - shot.target.z) * 180) / Math.PI
    expect(elevation).toBeCloseTo(TILT, 6)
    expect(shot.z).toBeGreaterThan(PLACE.ledge.z)
  })

  it('keeps the whole place in frame, and fills it, at every window shape', () => {
    for (const aspect of SHAPES) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      )
      const points = corners()
      for (const c of points) expect(frustum.containsPoint(c), `${aspect}`).toBe(true)
      const projected = points.map((c) => c.clone().project(camera))
      const reach = Math.max(...projected.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('survives a window with no width', () => {
    expect(Number.isFinite(frameScene(0).distance)).toBe(true)
  })
})
