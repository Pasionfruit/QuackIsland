/**
 * One game on the wire - eight players through it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, STAIRS, frameScene, pointsFor } from '../internal/camera'
import { TOWER, choose, createGame, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { HIDDEN, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 8675309

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 30)
}

describe('a snapshot', () => {
  it('says who has picked but not what, until the reveal', () => {
    const game = host(3)
    choose(game, 0, 6)
    choose(game, 1, 6)
    const during = decodeSnapshot(relay(encodeSnapshot(game)))!
    expect(during.steppers.map((s) => s[2])).toEqual([HIDDEN, HIDDEN, 0])
    const copy = applySnapshot(waitingGame(), during, 'p3')
    expect(copy.players.map((p) => p.pick)).toEqual([HIDDEN, HIDDEN, null])

    choose(game, 2, 1)
    while (game.phase === 'choose') stepGame(game, 0.25)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.phase).toBe('reveal')
    expect(copy.players.map((p) => p.pick)).toEqual([6, 6, 1])
    expect(copy.players.map((p) => p.step)).toEqual([14, 14, 20])
    expect(copy.players[0].last).toEqual({ pick: 6, with: 2, moved: 6, auto: false })
    expect(copy.id).toBe(30)
  })

  it("keeps a guest's own pick while it is hidden from everybody else", () => {
    const game = host(2)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    copy.players[1].pick = 4
    choose(game, 1, 4)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players[1].pick).toBe(4)
    expect(copy.players[0].pick).toBeNull()
  })

  it('carries who is out, the round they went and where from', () => {
    const game = host(2)
    for (const _ of [0, 1, 2, 3]) {
      choose(game, 0, 6)
      choose(game, 1, 6)
      while (game.phase === 'choose') stepGame(game, 0.25)
      while (game.phase === 'reveal') stepGame(game, 0.25)
    }
    expect(game.phase).toBe('over')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    expect(copy.players.map((p) => p.out)).toEqual([
      { round: 3, from: 2 },
      { round: 3, from: 2 },
    ])
    expect(copy.phase).toBe('over')
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'ti' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: 7 })).toBeNull()
    expect(decodeSnapshot({ ...good, r: TOWER.rounds })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 21, 0, 0, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 20, 3, 0, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [['p1', 20, 0, [2, 1, 0, 0], -1, 0]] })).toBeNull()
  })

  it('fits in a relay message with eight on the tower', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })

  it('starts a guest afresh when the host starts a new game', () => {
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(host(3))))!, 'p2')
    const next = createGame(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 31)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p2')
    expect(copy.id).toBe(31)
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.players[1].mine).toBe(true)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(30, 4, 6)))).toEqual({ game: 30, round: 4, pick: 6 })
    expect(decodeIntent({ t: 'ss-in', g: 30, r: 4, c: 2 })).toBeNull()
    expect(decodeIntent({ t: 'ss-in', g: 30, c: 1 })).toBeNull()
    expect(decodeIntent({ t: 'ss', g: 30, r: 0, c: 1 })).toBeNull()
  })
})

describe('eight players on one tower', () => {
  it('agree on every step, with picks said again, changed, late and lost', () => {
    const game = host(8)
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), pick: null as number | null, round: -1 }))
    // What each guest means to do: a first pick, a change of mind, and one who never picks in round 2.
    for (let frame = 0; game.phase !== 'over' && frame < 20000; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        if (copy.players.length === 0 || copy.phase !== 'choose') continue
        if (guest.round !== copy.round) {
          guest.round = copy.round
          guest.pick = null
        }
        if (guest.index === 7 && copy.round === 2) continue
        if (guest.pick === null && random() < 0.08) guest.pick = TOWER.options[Math.floor(random() * 3)]
        else if (guest.pick !== null && random() < 0.01) guest.pick = TOWER.options[Math.floor(random() * 3)]
        if (guest.pick !== null && copy.clock < TOWER.choose - 0.2 && random() > 0.4) {
          const heard = decodeIntent(relay(encodeIntent(game.id, copy.round, guest.pick)))!
          choose(game, guest.index, heard.pick, heard.round)
        }
      }
      stepGame(game, 1 / 30)
      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) {
          if (random() < 0.2) continue
          applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
          guest.copy.clock = game.clock
        }
      }
    }
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)

    expect(game.phase).toBe('over')
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.step, p.out])).toEqual(game.players.map((p) => [p.step, p.out]))
    }
  })
})

describe('the fixed camera', () => {
  it('keeps the whole tower in frame, and fills it, at every window shape and every headcount', () => {
    for (const lanes of [2, 4, 8]) for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const shot = frameScene(aspect, lanes)
      const camera = new PerspectiveCamera(FOV, aspect, 0.5, 200)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = pointsFor(lanes).map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${lanes} at ${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${lanes} at ${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('looks down steeply enough that nobody hides the player in the lane behind', () => {
    const shot = frameScene(16 / 9)
    const drop = shot.y - shot.target.y
    const run = shot.z - shot.target.z
    // Over one lane, the line of sight to the feet behind is higher than a player is tall.
    expect((drop / run) * STAIRS.lane).toBeGreaterThan(STAIRS.height)
  })
})
