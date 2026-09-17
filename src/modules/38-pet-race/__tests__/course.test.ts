/**
 * The course: the same for everybody, always runnable, and laid so that the
 * things on it are worth steering for or round.
 */
import { describe, expect, it } from 'vitest'
import { BAND, FINISH_Z, HEDGE, PUDDLE, TRACK, clearOf, courseFor, dragAt, layCourse, lineAt, progressOf, startAt } from '../internal/course'
import { PETS } from '../internal/pets'

const SEEDS = Array.from({ length: 60 }, (_, i) => (i + 1) * 104729)
const courses = SEEDS.map((seed) => layCourse(seed))
const half = TRACK.width / 2
/** The widest animal that has to fit through a gate. */
const WIDEST = Math.max(...PETS.map((pet) => pet.radius))

describe('a course', () => {
  it('is the same course every time it is laid from the same seed, and a different one from the next', () => {
    const a = layCourse(555_001)
    const b = layCourse(555_001)
    expect(a).toEqual(b)
    expect(layCourse(555_002).hedges).not.toEqual(a.hedges)
    // And it is laid once: two asks for the same seed are the same object.
    expect(courseFor(555_001)).toBe(courseFor(555_001))
  })

  it('fills the run with hedges and keeps every one of them inside the fences', () => {
    for (const course of courses) {
      expect(course.bands.length, `${course.seed} bands`).toBeGreaterThan(10)
      expect(course.hedges.length, `${course.seed} hedges`).toBeGreaterThan(20)
      for (const hedge of course.hedges) {
        expect(Math.abs(hedge.x), `${course.seed} across`).toBeLessThanOrEqual(half)
        expect(hedge.r).toBeGreaterThanOrEqual(HEDGE.min)
        expect(hedge.r).toBeLessThanOrEqual(HEDGE.max)
        // Nothing on the start line and nothing on the finish.
        expect(hedge.z, `${course.seed} near the start`).toBeLessThan(-BAND.first + BAND.wobble + 1)
        expect(hedge.z, `${course.seed} near the finish`).toBeGreaterThan(FINISH_Z)
      }
    }
  })

  it('leaves a gate in every band that the widest animal fits through', () => {
    // This is the claim the whole course rests on: there is always a way past.
    for (const course of courses) {
      for (const band of course.bands) {
        for (const hedge of course.hedges) {
          // Only hedges that could be met while going through this gate.
          if (Math.abs(hedge.z - band.z) > BAND.wobble + hedge.r + WIDEST) continue
          expect(Math.abs(hedge.x - band.gate), `${course.seed} band ${band.z}`).toBeGreaterThan(hedge.r + WIDEST)
        }
        expect(Math.abs(band.gate) + BAND.gate, `${course.seed} gate in the fence`).toBeLessThanOrEqual(half)
      }
    }
  })

  it('never jumps a gate further from the last one than a bus could get across', () => {
    for (const course of courses) {
      for (let i = 1; i < course.bands.length; i++) {
        expect(Math.abs(course.bands[i].gate - course.bands[i - 1].gate), `${course.seed}`).toBeLessThanOrEqual(BAND.drift + 1e-9)
      }
    }
  })

  it('puts treats where taking one costs you ground', () => {
    let total = 0
    for (const course of courses) {
      total += course.treats.length
      for (const [i, treat] of course.treats.entries()) {
        expect(Math.abs(treat.x), `${course.seed} treat ${i} across`).toBeLessThan(half)
        // Off the line the course itself suggests: a treat on your way is not a choice.
        expect(Math.abs(treat.x - lineAt(course, treat.z)), `${course.seed} treat ${i} on the line`).toBeGreaterThan(1.5)
        // And never inside a hedge, which would make it unreachable.
        for (const hedge of course.hedges) {
          expect(Math.hypot(hedge.x - treat.x, hedge.z - treat.z), `${course.seed} treat ${i} in a hedge`).toBeGreaterThan(hedge.r)
        }
      }
      // Never more than the wire can carry - see TREAT.max.
      expect(course.treats.length, `${course.seed}`).toBeLessThanOrEqual(31)
    }
    expect(total / courses.length).toBeGreaterThan(4)
  })
})

describe('the line the course suggests', () => {
  it('runs gate to gate, and holds still before the first and after the last', () => {
    const course = courses[0]
    const first = course.bands[0]
    const last = course.bands[course.bands.length - 1]
    expect(lineAt(course, 0)).toBeCloseTo(first.gate, 9)
    expect(lineAt(course, first.z)).toBeCloseTo(first.gate, 9)
    expect(lineAt(course, last.z - 50)).toBeCloseTo(last.gate, 9)
    // Half way between two bands is half way between their gates.
    const a = course.bands[2]
    const b = course.bands[3]
    expect(lineAt(course, (a.z + b.z) / 2)).toBeCloseTo((a.gate + b.gate) / 2, 9)
  })

  it('never leaves the track', () => {
    for (const course of courses) {
      for (let z = TRACK.runUp; z > FINISH_Z - TRACK.runOff; z -= 2) {
        expect(Math.abs(lineAt(course, z)), `${course.seed} at ${z}`).toBeLessThan(half)
      }
    }
  })
})

describe('what the ground does to you', () => {
  it('drags in a puddle and nowhere else', () => {
    const course = courses.find((c) => c.puddles.length > 0)!
    const puddle = course.puddles[0]
    expect(dragAt(course, puddle.x, puddle.z)).toBe(PUDDLE.drag)
    expect(dragAt(course, puddle.x, puddle.z + puddle.r - 0.05)).toBe(PUDDLE.drag)
    expect(dragAt(course, puddle.x, puddle.z + puddle.r + 0.5)).toBe(1)
    expect(dragAt(course, 0, TRACK.runUp)).toBe(1)
  })

  it('pushes a body out of a hedge rather than letting it through', () => {
    const course = courses[0]
    const hedge = course.hedges[0]
    const inside = clearOf(course, hedge.x, hedge.z, 0.5)
    expect(inside.hit).toBe(true)
    expect(Math.hypot(inside.x - hedge.x, inside.z - hedge.z)).toBeCloseTo(hedge.r + 0.5, 6)
    // Standing clear of everything is left alone.
    const clear = clearOf(course, 0, TRACK.runUp - 1, 0.5)
    expect(clear.hit).toBe(false)
    expect(clear.x).toBe(0)
  })

  it('holds everybody between the fences and between the two ends', () => {
    const course = courses[0]
    expect(clearOf(course, 999, 5, 0.5).x).toBeCloseTo(half - 0.5, 6)
    expect(clearOf(course, -999, 5, 0.5).x).toBeCloseTo(-half + 0.5, 6)
    expect(clearOf(course, 0, 999, 0.5).z).toBe(TRACK.runUp)
    expect(clearOf(course, 0, -9999, 0.5).z).toBeCloseTo(FINISH_Z - TRACK.runOff + 0.5, 6)
  })
})

describe('the start line', () => {
  it('gives everybody a lane inside the fences, and nobody the same spot', () => {
    for (const count of [1, 2, 5, 8]) {
      const spots = Array.from({ length: count }, (_, i) => startAt(count, i))
      for (const spot of spots) {
        expect(Math.abs(spot.x), `${count}`).toBeLessThan(half - 1)
        expect(spot.z, `${count}`).toBeGreaterThan(0)
        expect(spot.z, `${count}`).toBeLessThanOrEqual(TRACK.runUp)
      }
      for (let a = 0; a < count; a++) {
        for (let b = a + 1; b < count; b++) {
          expect(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z), `${count} ${a},${b}`).toBeGreaterThan(1)
        }
      }
    }
  })

  it('measures how far down the course you have got from the line, not from where you stood', () => {
    expect(progressOf(0)).toBe(0)
    expect(progressOf(5)).toBe(0)
    expect(progressOf(-40)).toBe(40)
    expect(progressOf(FINISH_Z - 10)).toBe(TRACK.length)
  })
})
