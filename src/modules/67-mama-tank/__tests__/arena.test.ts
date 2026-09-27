/**
 * The field: cover, the middle kept clear, the spawn ring, and lines of sight.
 */
import { describe, expect, it } from 'vitest'
import { FIELD, arenaFor, blocked, hillHeightAt, lineClear, mamaSpawn, miniSpawn } from '../internal/arena'

describe('the field for a seed', () => {
  it('is the same field every time it is asked for', () => {
    const a = arenaFor(20260927)
    const b = arenaFor(20260927)
    expect(b.blocks).toEqual(a.blocks)
  })

  it('grows a different field for a different seed', () => {
    const a = arenaFor(1)
    const b = arenaFor(2)
    expect(a.blocks).not.toEqual(b.blocks)
  })

  it('keeps every piece of cover clear of the middle, where Mama Tank starts', () => {
    for (const seed of [1, 2, 3, 4]) {
      const arena = arenaFor(seed)
      for (const b of arena.blocks) {
        if (b.wall) continue
        const cx = (b.x0 + b.x1) / 2
        const cz = (b.z0 + b.z1) / 2
        expect(Math.hypot(cx, cz)).toBeGreaterThanOrEqual(FIELD.centreClear - 0.1)
      }
    }
  })

  it("keeps the middle itself clear, so Mama Tank's own spawn is never blocked", () => {
    for (const seed of [1, 2, 3, 4]) {
      const arena = arenaFor(seed)
      const spawn = mamaSpawn(seed)
      expect(blocked(arena, spawn, 2.4)).toBe(false)
    }
  })
})

describe("the cosmetic hill's own surface height", () => {
  it('stands at full height at the middle, tapers to nothing at its own outer radius, and never collides', () => {
    expect(hillHeightAt(0, 0)).toBe(FIELD.hillHeight)
    expect(hillHeightAt(FIELD.hillRadius, 0)).toBe(0)
    expect(hillHeightAt(FIELD.hillRadius + 5, 0)).toBe(0)
    const mid = hillHeightAt(FIELD.hillRadius * 0.7, 0)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(FIELD.hillHeight)
    // Never collided with: a body at the very middle, where the mound stands tallest, is never blocked.
    const arena = arenaFor(3)
    expect(blocked(arena, { x: 0, z: 0 }, 2.4)).toBe(false)
  })
})

describe('lines of sight', () => {
  it('is blocked straight through a rock, and clear round the open', () => {
    const arena = arenaFor(5)
    const rock = arena.blocks.find((b) => !b.wall)!
    const cx = (rock.x0 + rock.x1) / 2
    const cz = (rock.z0 + rock.z1) / 2
    const through = lineClear(arena, { x: cx - 30, y: 1, z: cz }, { x: cx + 30, y: 1, z: cz })
    expect(through).toBe(false)
    const round = lineClear(arena, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0.01 })
    expect(round).toBe(true)
  })
})

describe('the spawn ring', () => {
  it('spreads mini tanks evenly round the ring, and clear of cover', () => {
    const seed = 7
    const count = 6
    const spots = Array.from({ length: count }, (_, i) => miniSpawn(seed, count, i))
    const arena = arenaFor(seed)
    for (const p of spots) {
      expect(blocked(arena, p, 1)).toBe(false)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(FIELD.spawnRing - 3)
    }
    // Evenly spread: no two spawns bunched together.
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)
        expect(d).toBeGreaterThan(3)
      }
    }
  })

  it('faces every mini tank towards the middle, where Mama Tank starts', () => {
    const p = miniSpawn(9, 4, 0)
    const facing = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) }
    const toMiddle = { x: -p.x / Math.hypot(p.x, p.z), z: -p.z / Math.hypot(p.x, p.z) }
    expect(facing.x).toBeCloseTo(toMiddle.x, 1)
    expect(facing.z).toBeCloseTo(toMiddle.z, 1)
  })
})
