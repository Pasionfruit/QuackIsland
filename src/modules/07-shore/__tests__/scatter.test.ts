import { describe, expect, it } from 'vitest'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { SEA_LEVEL, heightAt, slopeAt, worldBounds } from '../../01-terrain'
import { PALETTES, SHORE, scatterKind, scatterShore, type Placement } from '../internal/scatter'

/** The real island, which is a pure function and so usable straight from Node. */
const ground = { heightAt, slopeAt }
const reach = Math.min(worldBounds().maxX, worldBounds().maxZ)

const seeded = (label = 'shore') => ({
  reach,
  random: createRng(hashSeed(CONVENTIONS.worldSeed, label)),
})

/** Flat ground at a height, for checking the rules rather than the island. */
const flat = (h: number) => ({ heightAt: () => h, slopeAt: () => 0 })

let cached: Placement[] | null = null
function all(): Placement[] {
  if (!cached) cached = scatterShore(ground, seeded())
  return cached
}

describe('what ends up on the beach', () => {
  it('puts a decent amount of it there', () => {
    // A scatter that quietly places nothing is the failure mode here: every
    // rule is a rejection, and enough of them together reject everything.
    const placed = all()
    expect(placed.length).toBeGreaterThan(500)
    for (const kind of ['pebble', 'clam', 'cone'] as const) {
      expect(placed.filter((p) => p.kind === kind).length).toBeGreaterThan(60)
    }
  })

  it('never places anything out at sea', () => {
    // Anything below the lowest the tide goes is permanently underwater, and a
    // shell bobbing about out there is very hard to spot from the beach.
    for (const p of all()) expect(p.y).toBeGreaterThanOrEqual(SHORE.fromHeight)
  })

  it('never places anything up the dunes', () => {
    for (const p of all()) expect(p.y).toBeLessThanOrEqual(SHORE.toHeight)
  })

  it('never places anything on a slope it would roll off', () => {
    for (const p of all()) expect(slopeAt(p.x, p.z)).toBeLessThanOrEqual(SHORE.maxSlope)
  })

  it('sits everything on the ground it recorded, to the millimetre', () => {
    // The view trusts `y` rather than sampling again, so a stale height here
    // is a shell hovering or buried, and nothing else would catch it.
    for (const p of all()) expect(p.y).toBeCloseTo(heightAt(p.x, p.z), 9)
  })

  it('stays inside the meshed world', () => {
    const b = worldBounds()
    for (const p of all()) {
      expect(p.x).toBeGreaterThanOrEqual(b.minX)
      expect(p.x).toBeLessThanOrEqual(b.maxX)
      expect(p.z).toBeGreaterThanOrEqual(b.minZ)
      expect(p.z).toBeLessThanOrEqual(b.maxZ)
    }
  })

  it('keeps things off each other', () => {
    // Two shells in the same spot read as one broken shell.
    const placed = all()
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[i].x - placed[j].x
        const dz = placed[i].z - placed[j].z
        // Only within a kind: the kinds are scattered independently, so two of
        // different kinds may legitimately be near each other.
        if (placed[i].kind !== placed[j].kind) continue
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(SHORE.spacing - 1e-9)
      }
    }
  })

  it('follows the coast rather than clustering in one place', () => {
    // Rejection sampling over a square could in principle find one wide flat
    // and fill it. The shore is a ring, so the scatter should be one too.
    const placed = all()
    const quadrants = [0, 0, 0, 0]
    for (const p of placed) {
      quadrants[(p.x > 0 ? 1 : 0) + (p.z > 0 ? 2 : 0)]++
    }
    for (const n of quadrants) expect(n).toBeGreaterThan(placed.length * 0.1)

    // And they are out at the coast, not in the middle of the island.
    const radii = placed.map((p) => Math.hypot(p.x, p.z))
    expect(Math.min(...radii)).toBeGreaterThan(80)
  })

  it('is denser near the water than at the top of the beach', () => {
    // Things wash up; they do not walk up the beach on their own.
    const placed = all()
    const mid = (SHORE.fromHeight + SHORE.toHeight) / 2
    const low = placed.filter((p) => p.y < mid).length
    const high = placed.length - low
    expect(low).toBeGreaterThan(high)
  })
})

describe('how each one looks', () => {
  it('gives everything a colour from its own palette', () => {
    for (const p of all()) {
      expect(p.tint).toBeGreaterThanOrEqual(0)
      expect(p.tint).toBeLessThan(PALETTES[p.kind].length)
      expect(Number.isInteger(p.tint)).toBe(true)
    }
  })

  it('actually uses the whole palette rather than one colour', () => {
    // "Various colour rocks" is the requirement, and a palette that is never
    // reached is the quiet way to not meet it.
    const used = new Set(all().filter((p) => p.kind === 'pebble').map((p) => p.tint))
    expect(used.size).toBe(PALETTES.pebble.length)
  })

  it('gives the pebbles the wide spread and the shells a narrow one', () => {
    // A bright green shell reads as a bug rather than as variety.
    expect(PALETTES.pebble.length).toBeGreaterThan(PALETTES.clam.length)
    expect(PALETTES.pebble.length).toBeGreaterThan(PALETTES.cone.length)
    for (const kind of ['clam', 'cone'] as const) {
      for (const hex of PALETTES[kind]) {
        const r = Number.parseInt(hex.slice(1, 3), 16)
        const g = Number.parseInt(hex.slice(3, 5), 16)
        const b = Number.parseInt(hex.slice(5, 7), 16)
        // Pale, and never far from neutral. Measured as saturation rather
        // than as a raw channel spread, because the spread that reads as
        // "washed-out tan" on a light colour would read as lurid on a dark
        // one - it is the ratio that the eye actually judges.
        const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)
        expect(Math.min(r, g, b)).toBeGreaterThan(130)
        expect(saturation).toBeLessThan(0.4)
      }
    }
  })

  it('turns everything a different way and sizes it differently', () => {
    const placed = all()
    const turns = new Set(placed.map((p) => p.turn.toFixed(3)))
    expect(turns.size).toBeGreaterThan(placed.length * 0.9)
    for (const p of placed) {
      expect(p.turn).toBeGreaterThanOrEqual(0)
      expect(p.turn).toBeLessThan(Math.PI * 2)
      expect(p.scale).toBeGreaterThan(0.5)
      expect(p.scale).toBeLessThan(1.5)
    }
  })

  it('presses everything into the sand rather than balancing it on top', () => {
    for (const p of all()) {
      expect(p.sink).toBeGreaterThan(0)
      // Never so far that it vanishes.
      expect(p.sink).toBeLessThan(0.7)
    }
  })
})

describe('the scatter itself', () => {
  it('is the same beach every time', () => {
    // Seeded, so a shell in the wrong place can be found twice.
    const a = scatterShore(ground, seeded())
    const b = scatterShore(ground, seeded())
    expect(a).toEqual(b)
  })

  it('gives a different beach from a different seed', () => {
    const a = scatterKind('pebble', 60, ground, seeded('one'))
    const b = scatterKind('pebble', 60, ground, seeded('two'))
    expect(a).not.toEqual(b)
  })

  it('never asks for more than it was told to place', () => {
    const some = scatterKind('pebble', 40, ground, seeded())
    expect(some.length).toBeLessThanOrEqual(40)
  })

  it('gives up rather than looping forever on ground it cannot use', () => {
    // A world with no shore at all: every candidate is rejected. This has to
    // return, not spin, because it runs on the first frame.
    const ocean = scatterKind('pebble', 50, flat(-40), seeded())
    expect(ocean).toEqual([])
    const mountain = scatterKind('pebble', 50, flat(400), seeded())
    expect(mountain).toEqual([])
  })

  it('places on ground that is entirely beach, without needing luck', () => {
    const beach = scatterKind('clam', 40, flat(0.4), seeded())
    expect(beach.length).toBe(40)
  })

  it('refuses ground that is flat but too steep', () => {
    const cliff = { heightAt: () => 1, slopeAt: () => SHORE.maxSlope + 0.01 }
    expect(scatterKind('pebble', 30, cliff, seeded())).toEqual([])
  })

  it('puts the band across the waterline, not beside it', () => {
    // The tide moves the water through this band, so things spend part of the
    // day wet and part dry. A band entirely above the water would never be
    // reached by it.
    expect(SHORE.fromHeight).toBeLessThan(SEA_LEVEL)
    expect(SHORE.toHeight).toBeGreaterThan(SEA_LEVEL)
  })
})
