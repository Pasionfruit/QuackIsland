/**
 * One round on the wire - and eight players playing through it.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOUNDS, FILL, FOV, frameScene } from '../internal/camera'
import { ARENA, createRound, placings, stepRound, type Intent, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Round {
  return createRound(321, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 77)
}

describe('a snapshot', () => {
  it('comes back as the round that went out, crown and scores and all', () => {
    const round = host()
    Object.assign(round.players[1], { x: 0, y: 0 })
    for (let i = 0; i < 200; i++) stepRound(round, new Map(), 1 / 60)
    expect(round.holder).toBe('p2')

    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, 'p3')
    expect([copy.id, copy.holder, copy.over]).toEqual([77, 'p2', false])
    expect(copy.heldSince).toBeCloseTo(round.heldSince, 2)
    for (const p of round.players) {
      const c = copy.players.find((x) => x.id === p.id)!
      expect(c.takes).toBe(p.takes)
      expect(c.dazed).toBeCloseTo(p.dazed, 1)
      expect(c.score).toBeCloseTo(p.score, 1)
      expect(c.x).toBeCloseTo(p.x, 1)
    }
    expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['p3'])
  })

  it('carries an unclaimed crown as nobody', () => {
    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(host())))!, 'p1')
    expect(copy.holder).toBeNull()
  })

  it('updates the players a guest already has, and deals a new round on a new id', () => {
    const round = host()
    const copy = applySnapshot(waitingRound(), decodeSnapshot(encodeSnapshot(round))!, 'p1')
    const before = [...copy.players]
    round.players[0].x += 1
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(round))!, 'p1')
    copy.players.forEach((p, i) => expect(p).toBe(before[i]))

    const next = createRound(1, [{ id: 'p1' }, { id: 'p2' }], 78)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(next))!, 'p1')
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.players.every((p) => p.score === 0)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'pb' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 'nobody-here' })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 3 })).toBeNull()
    expect(decodeSnapshot(withField(0, ''))).toBeNull()
    expect(decodeSnapshot(withField(4, -1))).toBeNull()
    expect(decodeSnapshot(withField(5, 1.5))).toBeNull()
    expect(decodeSnapshot(withField(6, -0.5))).toBeNull()
    expect(decodeSnapshot({ ...good, p: [p[0].slice(0, 6)] })).toBeNull()
    expect(decodeSnapshot(withField(7, -0.1))).toBeNull()
    expect(decodeSnapshot(withField(8, 1.5))).toBeNull()
  })

  it('fits in a relay message with eight in the arena', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its round', () => {
    expect(decodeIntent(relay(encodeIntent({ x: 0.5, y: -0.5 }, 12)))).toEqual({ round: 12, intent: { x: 0.5, y: -0.5 } })
  })

  it('carries a boost press, and only a one says boost', () => {
    expect(decodeIntent(relay(encodeIntent({ x: 1, y: 0, boost: true }, 3)))!.intent.boost).toBe(true)
    expect(decodeIntent(relay(encodeIntent({ x: 1, y: 0 }, 3)))!.intent.boost).toBeUndefined()
    expect(decodeIntent({ t: 'sc-in', r: 1, x: 0, y: 0, b: 'yes' })!.intent.boost).toBeUndefined()
  })

  it('brings the boost and the rocks across to a guest', () => {
    const round = host(5)
    round.players[2].boost = 0.4
    round.players[2].charge = 0
    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, 'p1')
    expect(copy.players[2].boost).toBeCloseTo(0.4, 2)
    expect(copy.players[2].charge).toBe(0)
    expect(copy.rocks).toEqual(round.rocks)
  })

  it('cannot ask for more than full speed, and is refused when it is not one', () => {
    const fast = decodeIntent({ t: 'sc-in', r: 1, x: 30, y: 40 })!
    expect(Math.hypot(fast.intent.x, fast.intent.y)).toBeCloseTo(1)
    expect(decodeIntent({ t: 'sc-in', x: 0, y: 0 })).toBeNull()
    expect(decodeIntent({ t: 'sc-in', r: 1, x: 'a', y: 0 })).toBeNull()
  })
})

describe('eight players in one round', () => {
  it('agree on who has the crown and the scores, with some messages lost', () => {
    const round = host(8)
    const guests = round.players.slice(1).map((p) => ({ id: p.id, copy: waitingRound() }))
    const heard = new Map<string, Intent>()
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647

    for (let frame = 0; frame < ARENA.duration * 60 + 10 && !round.over; frame++) {
      for (const guest of guests) {
        const me = round.players.find((p) => p.id === guest.id)!
        const holder = round.players.find((p) => p.id === round.holder)
        const target = holder && holder !== me ? holder : { x: 0, y: 0 }
        const intent = { x: target.x - me.x, y: target.y - me.y }
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent(intent, round.id)))!
        if (said.round === round.id) heard.set(guest.id, said.intent)
      }
      stepRound(round, heard, 1 / 60)
      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(round))
        for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    const wire = relay(encodeSnapshot(round))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    expect(round.over).toBe(true)
    expect(round.players.filter((p) => p.takes > 0).length).toBeGreaterThan(1)
    const ranking = (r: Round) => placings(r).map((e) => [e.player.id, e.place])
    for (const guest of guests) {
      expect(guest.copy.holder).toBe(round.holder)
      expect(guest.copy.over).toBe(true)
      expect(ranking(guest.copy)).toEqual(ranking(round))
    }
  })
})

describe('the fixed camera', () => {
  it('keeps the whole arena in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
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
    expect(BOUNDS.maxX).toBeGreaterThan(ARENA.radius)
  })
})
