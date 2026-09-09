import { describe, expect, it } from 'vitest'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { heightAt, slopeAt, worldBounds } from '../../01-terrain'
import {
  ROCKS,
  ROCK_COLOURS,
  scatterClass,
  scatterRocks,
  settleHeight,
  type Rock,
} from '../internal/rocks'

const ground = { heightAt, slopeAt }
const bounds = worldBounds()
const reach = Math.min(bounds.maxX, bounds.maxZ)

const seeded = (label = 'rocks') => ({
  reach,
  random: createRng(hashSeed(CONVENTIONS.worldSeed, label)),
})

let cached: Rock[] | null = null
const all = (): Rock[] => (cached ??= scatterRocks(ground, seeded()))

/** Flat ground, for checking a rule rather than the island. */
const flat = (h: number) => ({ heightAt: () => h, slopeAt: () => 0 })
/** A constant slope falling towards +x. */
const ramp = (grade: number) => ({
  heightAt: (x: number) => 4 - x * grade,
  slopeAt: () => Math.atan(grade),
})

describe('where a rock rests', () => {
  it('sits on flat ground exactly where the ground is', () => {
    expect(settleHeight(10, -4, 2, () => 7)).toBe(7)
  })

  it('rests on its lowest edge on a slope, not on its middle', () => {
    // Sampling the middle and putting the rock there is what you do for a
    // pebble, and it leaves a two-metre boulder hanging in the air on the
    // downhill side. This is the whole reason the function exists.
    const hill = (x: number) => -x
    const radius = 3
    expect(settleHeight(0, 0, radius, hill)).toBeCloseTo(-radius, 6)
    expect(settleHeight(0, 0, radius, hill)).toBeLessThan(hill(0))
  })

  it('leaves no rock floating above the ground under it', () => {
    // The property that matters: no gap under any edge, anywhere on the
    // island. Checked against twice as many points as the settle samples, and
    // against where the rock actually ends up rather than where it rested -
    // the bedding-in is part of how this is guaranteed, not a separate nicety.
    for (const rock of all()) {
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2
        const under = heightAt(
          rock.x + Math.cos(angle) * rock.radius,
          rock.z + Math.sin(angle) * rock.radius,
        )
        expect(rock.y).toBeLessThanOrEqual(under + 1e-9)
      }
    }
  })

  it('samples the ring, and the bedding-in always covers what it misses', () => {
    // Worth stating rather than pretending otherwise: the settle is eight
    // samples, so a narrow dip between two of them is not seen. What makes
    // that invisible - and what makes "nothing floats" true above - is that
    // the error is always smaller than how far the rock is pressed in. This
    // is that relation, checked per rock rather than as an absolute number,
    // because a boulder samples a much wider ring than a pebble.
    for (const rock of all()) {
      const rest = settleHeight(rock.x, rock.z, rock.radius, heightAt)
      let missed = 0
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2
        const under = heightAt(
          rock.x + Math.cos(angle) * rock.radius,
          rock.z + Math.sin(angle) * rock.radius,
        )
        missed = Math.max(missed, rest - under)
      }
      expect(missed).toBeLessThan(rock.radius * ROCKS.sink)
    }
  })

  it('beds every rock into the ground rather than balancing it on top', () => {
    for (const rock of all()) {
      const rest = settleHeight(rock.x, rock.z, rock.radius, heightAt)
      expect(rock.y).toBeLessThan(rest)
      // But never so far that a boulder becomes a pebble.
      expect(rest - rock.y).toBeLessThan(rock.radius * 0.5)
    }
  })

  it('is unaffected by how many points it samples on flat ground', () => {
    for (const probes of [3, 8, 32]) {
      expect(settleHeight(0, 0, 5, () => 2, probes)).toBe(2)
    }
  })
})

describe('what ends up on the island', () => {
  it('places a good number of them', () => {
    // Every rule here is a rejection, and enough of them together place
    // nothing at all while still passing every other test.
    expect(all().length).toBeGreaterThan(300)
  })

  it('has rocks of every size', () => {
    for (const rockClass of ROCKS.classes) {
      expect(all().filter((r) => r.size === rockClass.size).length).toBeGreaterThan(10)
    }
  })

  it('has many small ones and few large ones', () => {
    // A field of identical boulders is a chessboard, not an island.
    const count = (size: string) => all().filter((r) => r.size === size).length
    expect(count('small')).toBeGreaterThan(count('medium'))
    expect(count('medium')).toBeGreaterThan(count('boulder'))
  })

  it('covers a wide spread of actual sizes, not three of them', () => {
    // Each class varies within itself, so "various size" is a range rather
    // than three discrete choices - which is the difference between a rock
    // field and three kinds of prop.
    const radii = all().map((r) => r.radius)
    expect(Math.min(...radii)).toBeLessThan(0.4)
    expect(Math.max(...radii)).toBeGreaterThan(4)
    // Better than a factor of ten between the smallest and the largest.
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(10)

    // And no class is one size repeated. Not asking for every rock to be
    // unique - three hundred rocks drawn from a range a third of a metre wide
    // will collide at millimetre precision, and that is fine - only that the
    // class really is a range.
    for (const rockClass of ROCKS.classes) {
      const within = all().filter((r) => r.size === rockClass.size).map((r) => r.radius)
      expect(new Set(within.map((r) => r.toFixed(3))).size).toBeGreaterThan(within.length * 0.4)
      expect(Math.max(...within) / Math.min(...within)).toBeGreaterThan(1.8)
    }
  })

  it('keeps them out of deep water and off the peaks', () => {
    for (const rock of all()) {
      const centre = heightAt(rock.x, rock.z)
      expect(centre).toBeGreaterThanOrEqual(ROCKS.fromHeight)
      expect(centre).toBeLessThanOrEqual(ROCKS.toHeight)
    }
  })

  it('keeps them off ground they would slide down', () => {
    for (const rock of all()) {
      expect(slopeAt(rock.x, rock.z)).toBeLessThanOrEqual(ROCKS.maxSlope)
    }
  })

  it('leaves the middle of the island clear', () => {
    // The player starts at the origin, and arriving inside a boulder is a poor
    // introduction.
    for (const rock of all()) {
      expect(Math.hypot(rock.x, rock.z)).toBeGreaterThanOrEqual(ROCKS.clearRadius)
    }
  })

  it('stays inside the meshed world', () => {
    for (const rock of all()) {
      expect(Math.abs(rock.x)).toBeLessThanOrEqual(bounds.maxX)
      expect(Math.abs(rock.z)).toBeLessThanOrEqual(bounds.maxZ)
    }
  })

  it('never puts two rocks inside each other', () => {
    const rocks = all()
    for (let i = 0; i < rocks.length; i++) {
      for (let j = i + 1; j < rocks.length; j++) {
        const apart = Math.hypot(rocks[i].x - rocks[j].x, rocks[i].z - rocks[j].z)
        // Comfortably clear, not merely not-overlapping.
        expect(apart).toBeGreaterThan(Math.max(rocks[i].radius, rocks[j].radius))
      }
    }
  })

  it('spreads them all round the island rather than down one side', () => {
    const rocks = all()
    const quadrants = [0, 0, 0, 0]
    for (const r of rocks) quadrants[(r.x > 0 ? 1 : 0) + (r.z > 0 ? 2 : 0)]++
    for (const n of quadrants) expect(n).toBeGreaterThan(rocks.length * 0.12)
  })

  it('puts the big ones down first, so they can find somewhere to go', () => {
    // Scattering small first fills the island and leaves the boulders with
    // nowhere, and a boulder that could not be placed is far more missed than
    // a pebble that could not be.
    const boulders = ROCKS.classes.find((c) => c.size === 'boulder')!
    expect(all().filter((r) => r.size === 'boulder').length).toBeGreaterThan(boulders.count * 0.6)
  })
})

describe('how each one looks', () => {
  it('tumbles every rock on all three axes', () => {
    // A rock has no up. Turning only about Y leaves a field of things all
    // sitting the same way.
    const rocks = all()
    for (const axis of ['turnX', 'turnY', 'turnZ'] as const) {
      const turns = new Set(rocks.map((r) => r[axis].toFixed(3)))
      expect(turns.size).toBeGreaterThan(rocks.length * 0.85)
      for (const r of rocks) {
        expect(r[axis]).toBeGreaterThanOrEqual(0)
        expect(r[axis]).toBeLessThan(Math.PI * 2)
      }
    }
  })

  it('stretches every rock differently, without flattening it to a disc', () => {
    for (const rock of all()) {
      for (const s of [rock.scaleX, rock.scaleY, rock.scaleZ]) {
        expect(s).toBeGreaterThan(0)
      }
      const biggest = Math.max(rock.scaleX, rock.scaleY, rock.scaleZ)
      const smallest = Math.min(rock.scaleX, rock.scaleY, rock.scaleZ)
      expect(biggest / smallest).toBeLessThan(3)
    }
  })

  it('uses the whole palette', () => {
    expect(new Set(all().map((r) => r.tint)).size).toBe(ROCK_COLOURS.length)
    for (const rock of all()) {
      expect(rock.tint).toBeGreaterThanOrEqual(0)
      expect(rock.tint).toBeLessThan(ROCK_COLOURS.length)
    }
  })

  it('keeps the colours to stone rather than to a paint box', () => {
    // A boulder is the island showing through, not something washed up.
    for (const hex of ROCK_COLOURS) {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)
      expect(saturation).toBeLessThan(0.25)
    }
  })
})

describe('the scatter itself', () => {
  it('is the same island every time', () => {
    expect(scatterRocks(ground, seeded())).toEqual(scatterRocks(ground, seeded()))
  })

  it('gives a different island from a different seed', () => {
    expect(scatterRocks(ground, seeded('one'))).not.toEqual(scatterRocks(ground, seeded('two')))
  })

  it('gives up rather than looping on ground it cannot use', () => {
    // This runs on the first frame, so it has to return.
    const small = ROCKS.classes[0]
    expect(scatterClass(small, flat(-500), seeded())).toEqual([])
    expect(scatterClass(small, flat(9000), seeded())).toEqual([])
    expect(scatterClass(small, ramp(4), seeded())).toEqual([])
  })

  it('fills usable ground without needing luck', () => {
    const small = ROCKS.classes[0]
    expect(scatterClass(small, flat(6), seeded()).length).toBe(small.count)
  })

  it('will not place a rock on top of one already there', () => {
    const small = ROCKS.classes[0]
    const already: Rock[] = [
      {
        size: 'boulder',
        x: 0,
        z: 0,
        y: 0,
        radius: 200,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        turnX: 0,
        turnY: 0,
        turnZ: 0,
        tint: 0,
      },
    ]
    // One enormous rock covering everything leaves nowhere at all.
    expect(scatterClass(small, flat(6), { reach: 100, random: seeded().random }, already)).toEqual([])
  })
})
