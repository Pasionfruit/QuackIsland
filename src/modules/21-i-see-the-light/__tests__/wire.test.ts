/**
 * One race on the wire - eight racers running it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, TRACK, frameScene, laneX, trackZ } from '../internal/camera'
import {
  LIGHT,
  circleAt,
  checkPointer,
  createRace,
  lightAt,
  pressSpace,
  report,
  stepRace,
  type Race,
  type Self,
} from '../internal/rules'
import { waitingRace } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 918273

function host(n = 3): Race {
  return createRace(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 55)
}

describe('a snapshot', () => {
  it('comes back as the race that went out', () => {
    const race = host(4)
    for (let i = 0; i < 90; i++) stepRace(race, 1 / 10)
    report(race, 'p2', { steps: LIGHT.steps, out: null })
    report(race, 'p3', { steps: 12, out: { why: 'pointer', at: 7.25 } })
    report(race, 'p4', { steps: 3, out: { why: 'left', at: 2 } })
    stepRace(race, 0.1)

    const copy = applySnapshot(waitingRace(), decodeSnapshot(relay(encodeSnapshot(race)))!, 'p3')
    expect([copy.id, copy.seed, copy.over]).toEqual([55, SEED, false])
    expect(copy.elapsed).toBeCloseTo(race.elapsed, 1)
    expect(copy.racers).toEqual(race.racers.map((r) => ({ ...r, finishedAt: r.finishedAt === null ? null : Math.round(r.finishedAt * 100) / 100, mine: r.id === 'p3' })))
  })

  it('updates the racers a guest already has, and deals a new race on a new id', () => {
    const race = host()
    const copy = applySnapshot(waitingRace(), decodeSnapshot(encodeSnapshot(race))!, 'p1')
    const before = [...copy.racers]
    race.racers[0].steps = 4
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(race))!, 'p1')
    copy.racers.forEach((r, i) => expect(r).toBe(before[i]))
    expect(copy.racers[0].steps).toBe(4)

    applySnapshot(copy, decodeSnapshot(encodeSnapshot(createRace(1, [{ id: 'p1' }, { id: 'p2' }], 56)))!, 'p1')
    expect(copy.racers.map((r) => [r.id, r.steps])).toEqual([['p1', 0], ['p2', 0]])
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot({ ...good, t: 'pb' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, s: -1 })).toBeNull()
    expect(decodeSnapshot(withField(0, ''))).toBeNull()
    expect(decodeSnapshot(withField(1, 1.5))).toBeNull()
    expect(decodeSnapshot(withField(2, 3))).toBeNull()
    expect(decodeSnapshot(withField(5, -1))).toBeNull()
  })

  it('fits in a relay message with eight racing', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its race', () => {
    const self: Self = { steps: 33, out: { why: 'space', at: 14.5 } }
    expect(decodeIntent(relay(encodeIntent(self, 12)))).toEqual({ race: 12, self })
    expect(decodeIntent(relay(encodeIntent({ steps: 2, out: null }, 12)))).toEqual({ race: 12, self: { steps: 2, out: null } })
  })

  it('is refused when it is not one', () => {
    expect(decodeIntent({ t: 'sl-in', r: 1, n: -1, w: -1, a: 0 })).toBeNull()
    expect(decodeIntent({ t: 'sl-in', r: 1, n: 1, w: 7, a: 0 })).toBeNull()
    expect(decodeIntent({ t: 'sl-in', n: 1, w: -1, a: 0 })).toBeNull()
  })
})

describe('eight racers in one race', () => {
  it('agree on who got where, who went out and why, with messages repeated and some lost', () => {
    const race = host(8)
    const W = 1280
    const H = 640
    let seed = 11
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // Each guest judges itself against its own copy's clock, as a browser does.
    const guests = race.racers.slice(1).map((r, i) => ({
      id: r.id,
      copy: waitingRace(),
      self: { steps: 0, out: null } as Self,
      presses: 5 + i,
      careless: i === 2,
      follows: i !== 4,
    }))
    const heard = new Map<string, Self>()
    const dt = 1 / 30

    for (let frame = 0; frame < LIGHT.timeLimit * 30 && !race.over; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        if (copy.racers.length === 0) continue
        const t = copy.elapsed
        const light = lightAt(copy.seed, t)
        // Mash on green; the careless one keeps mashing a moment into red.
        const mashing = light.colour === 'green' || (guest.careless && light.since < 0.6)
        if (mashing && random() < (guest.presses * dt)) guest.self = pressSpace(copy.seed, t, guest.self)
        const c = light.colour === 'red' ? circleAt(copy.seed, light.red, light.since) : { x: 0.5, y: 0.5 }
        const pointer = guest.follows ? { x: c.x * W, y: c.y * H } : { x: W / 2, y: H / 2 }
        guest.self = checkPointer(copy.seed, t, pointer, W, H, guest.self)
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent(guest.self, copy.id)))!
        if (said.race === race.id) heard.set(guest.id, said.self)
      }
      for (const [id, self] of heard) report(race, id, self)
      stepRace(race, dt)
      const wire = relay(encodeSnapshot(race))
      for (const guest of guests) {
        if (frame % 3 !== 0 && guest.copy.racers.length > 0) {
          guest.copy.elapsed += dt
          continue
        }
        applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    // Anybody still going stops; the rest is said until it is heard.
    for (const guest of guests) report(race, guest.id, guest.self)
    const wire = relay(encodeSnapshot(race))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    expect(race.racers.find((r) => r.id === 'p4')!.out?.why).toBe('space')
    expect(race.racers.find((r) => r.id === 'p6')!.out?.why).toBe('pointer')
    expect(race.racers.some((r) => r.place === 1)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.racers.map((r) => [r.id, r.steps, r.out?.why, r.place])).toEqual(
        race.racers.map((r) => [r.id, r.steps, r.out?.why, r.place]),
      )
      // What the host has for a guest is what that guest judged for itself.
      const theirs = race.racers.find((r) => r.id === guest.id)!
      expect(theirs.out?.why).toBe(guest.self.out?.why)
      if (theirs.place === null) expect(theirs.steps).toBe(guest.self.steps)
    }
  })
})

describe('the track and the fixed camera', () => {
  it('puts lanes side by side about the middle, and the line at the far end', () => {
    expect(laneX(0, 1)).toBe(0)
    expect(laneX(0, 8)).toBeCloseTo(-laneX(7, 8))
    expect(laneX(1, 8) - laneX(0, 8)).toBeCloseTo(TRACK.lane)
    expect(trackZ(0, LIGHT.steps)).toBeCloseTo(0)
    expect(trackZ(LIGHT.steps, LIGHT.steps)).toBe(-TRACK.length)
    expect(trackZ(LIGHT.steps * 2, LIGHT.steps)).toBe(-TRACK.length)
  })

  it('keeps the whole track and the light in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const shot = frameScene(aspect)
      const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const projected = points.map((p) => p.clone().project(camera))
      const reach = Math.max(...projected.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
      // Centred up and down.
      const ys = projected.map((p) => p.y)
      expect(Math.max(...ys) + Math.min(...ys), `${aspect}`).toBeCloseTo(0, 2)
      // The camera is behind the start, looking down the track.
      expect(shot.z).toBeGreaterThan(0)
    }
    expect(Math.max(...POINTS.map((p) => Math.abs(p[0])))).toBeGreaterThan(Math.abs(laneX(0, 8)))
  })
})
