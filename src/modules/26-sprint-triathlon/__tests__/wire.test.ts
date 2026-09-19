/**
 * One race on the wire - eight racers through it - and the camera.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FINISH_X, FOV, POINTS, START_X, courseX, frameScene, laneZ } from '../internal/camera'
import { COURSE, FRESH, click, createRace, legOf, pedal, report, sentenceFor, stepRace, type, type Race, type Self } from '../internal/rules'
import { waitingRace } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 271828

function host(n = 3): Race {
  return createRace(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 91)
}

describe('a snapshot', () => {
  it('comes back as the race that went out', () => {
    const race = host(3)
    while (race.elapsed < COURSE.start + 10) stepRace(race, 0.25)
    report(race, 'p2', { ...FRESH, strokes: COURSE.strokes, pedals: 12, mistakes: 1 })
    race.racers[2].left = true
    const copy = applySnapshot(waitingRace(), decodeSnapshot(relay(encodeSnapshot(race)))!, 'p2')
    expect([copy.id, copy.seed, copy.over]).toEqual([91, SEED, false])
    expect(copy.elapsed).toBeCloseTo(race.elapsed, 1)
    expect(copy.racers).toEqual(race.racers.map((r) => ({ ...r, mine: r.id === 'p2' })))
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'sl' })).toBeNull()
    expect(decodeSnapshot({ ...good, r: [] })).toBeNull()
    const r = good.r as unknown[][]
    expect(decodeSnapshot({ ...good, r: [r[0].map((v, i) => (i === 1 ? -1 : v))] })).toBeNull()
    expect(decodeSnapshot({ ...good, r: [r[0].map((v, i) => (i === 5 ? -2 : v))] })).toBeNull()
    expect(decodeSnapshot({ ...good, r: [r[0].map((v, i) => (i === 9 ? 2 : v))] })).toBeNull()
  })

  it('fits in a relay message with eight racing', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its race, and is refused when it is not one', () => {
    const self: Self = { strokes: 60, pedals: 33, typed: 0, mistakes: 0, stumbling: 0 }
    expect(decodeIntent(relay(encodeIntent(self, 91)))).toEqual({ race: 91, self })
    expect(decodeIntent({ t: 'tri-in', g: 91, a: -1, b: 0, c: 0, m: 0 })).toBeNull()
    expect(decodeIntent({ t: 'tri-in', a: 1, b: 0, c: 0, m: 0 })).toBeNull()
  })
})

describe('eight racers in one race', () => {
  it('agree on every split and place, each counting its own race, with messages lost', () => {
    const race = host(8)
    let seed = 17
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const sentence = sentenceFor(SEED)
    const guests = race.racers.map((r, i) => ({ id: r.id, copy: waitingRace(), self: FRESH as Self, rate: 5 + i * 0.4 }))
    const dt = 1 / 30

    for (let frame = 0; !race.over; frame++) {
      for (const guest of guests) {
        const t = guest.copy.elapsed
        if (guest.copy.racers.length > 0 && random() < guest.rate * dt) {
          const leg = legOf(guest.self, sentence)
          if (leg === 'swim') guest.self = click(guest.self, sentence, t)
          else if (leg === 'bike') guest.self = pedal(guest.self, sentence, t)
          else if (leg === 'run') guest.self = type(guest.self, sentence, random() < 0.05 ? '#' : sentence[guest.self.typed], t)
        }
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent(guest.self, guest.copy.id || race.id)))!
        if (said.race === race.id) report(race, guest.id, said.self)
      }
      stepRace(race, dt)
      const wire = relay(encodeSnapshot(race))
      for (const guest of guests) {
        if (guest.copy.racers.length > 0 && (frame % 3 !== 0 || random() < 0.2)) {
          guest.copy.elapsed += dt
          continue
        }
        applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(race)))!, guest.id)

    // Over once three are home: they are placed, and nobody else is.
    const home = race.racers.filter((r) => r.finishAt !== null)
    expect(home.length).toBeGreaterThanOrEqual(COURSE.podium)
    expect(home.map((r) => r.place).sort()).toEqual(home.map((_, i) => i + 1))
    expect(race.racers.filter((r) => r.finishAt === null).every((r) => r.place === null)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.racers.map((r) => [r.id, r.swimAt, r.bikeAt, r.finishAt, r.place, r.mistakes])).toEqual(
        race.racers.map((r) => [r.id, r.swimAt, r.bikeAt, r.finishAt, r.place, r.mistakes].map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))),
      )
      // What the host has is what the guest counted.
      const theirs = race.racers.find((r) => r.id === guest.id)!
      expect([theirs.strokes, theirs.pedals, theirs.typed]).toEqual([guest.self.strokes, guest.self.pedals, guest.self.typed])
    }
  })
})

describe('the course and the fixed camera', () => {
  it('runs the legs end to end, a lane each about the middle', () => {
    expect(courseX(0)).toBe(START_X)
    expect(courseX(1)).toBe(FINISH_X)
    expect(courseX(2)).toBe(FINISH_X)
    expect(laneZ(0, 8)).toBeCloseTo(-laneZ(7, 8))
    expect(laneZ(0, 1)).toBe(0)
  })

  it('keeps the whole course in frame, and fills it, at every window shape', () => {
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
