/**
 * One round on the wire - and eight fighters playing through it.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOUNDS, FILL, FOV, frameScene } from '../internal/camera'
import { RING, createRound, stepRound, type Intent, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 321

function host(n = 3): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 77)
}

describe('a snapshot', () => {
  it('comes back as the round that went out, punches and all', () => {
    const round = host()
    const [a, b] = round.fighters
    Object.assign(a, { x: 0, y: 0, facing: 0 })
    // Its back to p1, so the punch lands.
    Object.assign(b, { x: 3, y: 0, facing: 0 })
    for (let i = 0; i < 30; i++) stepRound(round, new Map([['p1', { x: 0, y: 0, clicks: 1 }]]), 1 / 60)
    expect(b.alive).toBe(false)

    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.id).toBe(77)
    for (const f of round.fighters) {
      const c = copy.fighters.find((x) => x.id === f.id)!
      expect([c.alive, c.how, c.by, c.punch, c.clicks]).toEqual([f.alive, f.how, f.by, f.punch, f.clicks])
      expect(c.x).toBeCloseTo(f.x, 1)
      expect(c.reach).toBeCloseTo(f.reach, 1)
    }
    expect(copy.fighters.filter((f) => f.mine).map((f) => f.id)).toEqual(['p2'])
  })

  it('updates the fighters a guest already has, and deals a new round on a new id', () => {
    const round = host()
    const copy = applySnapshot(waitingRound(), decodeSnapshot(encodeSnapshot(round))!, 'p1')
    const before = [...copy.fighters]
    round.fighters[0].x += 1
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(round))!, 'p1')
    copy.fighters.forEach((f, i) => expect(f).toBe(before[i]))

    const next = createRound(1, [{ id: 'p1' }, { id: 'p2' }], 78)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(next))!, 'p1')
    expect(copy.fighters.map((f) => f.id)).toEqual(['p1', 'p2'])
    expect(copy.fighters.every((f) => f.alive)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const f = good.f as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, f: [f[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot({ ...good, t: 'dh' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot(withField(4, 2))).toBeNull()
    expect(decodeSnapshot(withField(6, 5))).toBeNull()
    expect(decodeSnapshot(withField(8, 9))).toBeNull()
    expect(decodeSnapshot(withField(9, -1))).toBeNull()
    expect(decodeSnapshot(withField(10, 1.5))).toBeNull()
  })

  it('fits in a relay message with eight on the platform', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its round', () => {
    expect(decodeIntent(relay(encodeIntent({ x: 0.5, y: -0.5, clicks: 7 }, 12)))).toEqual({
      round: 12,
      intent: { x: 0.5, y: -0.5, clicks: 7 },
    })
  })

  it('carries the aim, when there is one', () => {
    expect(decodeIntent(relay(encodeIntent({ x: 0, y: 1, clicks: 2, aim: 1.25 }, 3)))!.intent.aim).toBeCloseTo(1.25)
    expect(decodeIntent({ t: 'pb-in', r: 1, x: 0, y: 0, n: 0, a: 'left' })).toBeNull()
  })

  it('cannot ask for more than full speed, and is refused when it is not one', () => {
    const fast = decodeIntent({ t: 'pb-in', r: 1, x: 30, y: 40, n: 0 })!
    expect(Math.hypot(fast.intent.x, fast.intent.y)).toBeCloseTo(1)
    expect(decodeIntent({ t: 'pb-in', r: 1, x: 0, y: 0, n: -1 })).toBeNull()
    expect(decodeIntent({ t: 'pb-in', x: 0, y: 0, n: 1 })).toBeNull()
  })
})

describe('eight fighters in one round', () => {
  it('agree on who went out and how, with messages repeated and some lost', () => {
    const round = host(8)
    const guests = round.fighters.slice(1).map((f) => ({ id: f.id, copy: waitingRound(), clicks: 0 }))
    const heard = new Map<string, Intent>()
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

    for (let frame = 0; frame < 30 * 60 && !round.over; frame++) {
      for (const guest of guests) {
        const me = round.fighters.find((f) => f.id === guest.id)!
        if (!me.alive) continue
        // Walk towards the middle, and throw a punch every second or so.
        if (frame % 70 === guests.indexOf(guest) * 9) guest.clicks += 1
        const intent = { x: -me.x, y: -me.y, clicks: guest.clicks }
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

    expect(round.fighters.some((f) => !f.alive)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.fighters.map((f) => [f.id, f.alive, f.how, f.by])).toEqual(round.fighters.map((f) => [f.id, f.alive, f.how, f.by]))
    }
    // A click said many times was dealt with once: nobody's count ran ahead of what they clicked.
    for (const guest of guests) {
      expect(round.fighters.find((f) => f.id === guest.id)!.clicks).toBeLessThanOrEqual(guest.clicks)
    }
  })
})

describe('the fixed camera', () => {
  it('keeps the whole platform in frame, and fills it, at every window shape', () => {
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
    expect(BOUNDS.maxX).toBeGreaterThan(RING.radius)
  })
})
