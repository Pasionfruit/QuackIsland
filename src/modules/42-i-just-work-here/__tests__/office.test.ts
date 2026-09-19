/**
 * The office: the same for a seed, one open space, and everybody's pieces in reach.
 */
import { describe, expect, it } from 'vitest'
import { DESKS, OFFICE, blocked, cast, deskSlots, gapBetween, lineClear, officeFor, route, slide, walkClear } from '../internal/office'
import { BODY, PIECES_EACH, createGame } from '../internal/rules'

const SEEDS = [11, 2024, 777002, 90210, 31337]

describe('the office', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(officeFor(11)).toBe(officeFor(11))
    const again = JSON.stringify(officeFor(11).blocks)
    expect(JSON.stringify(officeFor(2024).blocks)).not.toBe(again)
    expect(officeFor(11).blocks.filter((b) => b.kind !== 'wall' && b.kind !== 'home').length).toBeGreaterThan(8)
  })

  it('keeps two groups of furniture touching or far enough apart to walk between', () => {
    for (const seed of SEEDS) {
      const blocks = officeFor(seed).blocks
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const gap = gapBetween(blocks[i], blocks[j])
          // Two desks either side of a pod's partition are one piece of furniture: both touch the partition.
          const joined = blocks.some((k) => gapBetween(k, blocks[i]) === 0 && gapBetween(k, blocks[j]) === 0)
          expect(gap === 0 || joined || gap >= BODY.radius * 2 + 0.1).toBe(true)
        }
      }
    }
  })

  it('has eight desks against the north and south walls, with room to stand in front', () => {
    expect(DESKS).toHaveLength(8)
    for (const d of DESKS) {
      expect(Math.abs(d.block.z0) === OFFICE.halfZ || Math.abs(d.block.z1) === OFFICE.halfZ).toBe(true)
      for (const seed of SEEDS) expect(blocked(officeFor(seed), d.spot, 0.9)).toBe(false)
    }
  })

  it('hands out desks as far apart as it can, each to one player', () => {
    for (let n = 1; n <= 8; n++) {
      const slots = deskSlots(5, n)
      expect(new Set(slots).size).toBe(n)
    }
    // Two players get opposite corners.
    const [a, b] = deskSlots(5, 2).map((s) => DESKS[s].spot)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(25)
  })

  it('lets every desk reach every piece and every other desk', () => {
    for (const seed of SEEDS) {
      const office = officeFor(seed)
      const game = createGame(seed, Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` })))
      expect(game.pieces).toHaveLength(8 * PIECES_EACH)
      const from = office.desks[0].spot
      for (const goal of [...game.pieces, ...office.desks.map((d) => d.spot)]) {
        const way = route(office, from, goal, BODY.radius)
        expect(way.length).toBeGreaterThan(0)
        // Walkable leg by leg, ending where it was asked to.
        let here = from
        for (const p of way) {
          expect(walkClear(office, here, p, BODY.radius - 0.05)).toBe(true)
          here = p
        }
        expect(Math.hypot(here.x - goal.x, here.z - goal.z)).toBeLessThan(1e-9)
      }
    }
  })

  it('never lets a body through anything, however far it walks into it', () => {
    const office = officeFor(2024)
    for (const d of office.desks) {
      const end = slide(office, d.spot, 0, d.spot.z < 0 ? -50 : 50, BODY.radius)
      expect(blocked(office, end, BODY.radius - 1e-6)).toBe(false)
      expect(Math.abs(end.z)).toBeLessThan(OFFICE.halfZ - 0.8)
    }
  })

  it('stops a line at the first thing in the way', () => {
    const office = officeFor(11)
    const desk = office.desks[0]
    // Straight at the desk from its spot, a metre away.
    expect(cast(office, desk.spot, { x: 0, z: -1 }, 10)).toBeCloseTo(desk.spot.z - desk.block.z1, 6)
    expect(lineClear(office, desk.spot, { x: desk.spot.x, z: desk.block.z1 - 0.1 })).toBe(false)
  })
})
