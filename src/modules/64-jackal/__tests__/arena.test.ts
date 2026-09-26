/**
 * The lane: cover, the tower, the base, a ray against a block, and vaulting.
 */
import { describe, expect, it } from 'vitest'
import { FIELD, SPAWN_Z, TOWER_Z, arenaFor, atBase, blocked, clampToPlatform, collide, lineClear, rayHit, runnerSpawn, sniperSpawn, type Block } from '../internal/arena'
import { JUMP } from '../internal/rules'

const SEED = 20260925

function findKind(seed: number, kind: Block['kind']): Block {
  const found = arenaFor(seed).blocks.find((b) => b.kind === kind)
  if (!found) throw new Error(`no ${kind} in seed ${seed}`)
  return found
}

describe('the lane', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(arenaFor(SEED).blocks).toEqual(arenaFor(SEED).blocks)
    expect(arenaFor(SEED + 1).blocks).not.toEqual(arenaFor(SEED).blocks)
  })

  it('scatters cover with room to walk between any two pieces, clear of the spawn line and the tower foot', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const cover = arenaFor(seed).blocks.filter((b) => b.kind !== 'wall' && b.kind !== 'tower')
      expect(cover.length).toBeGreaterThan(20)
      for (const b of cover) {
        const cx = (b.x0 + b.x1) / 2
        const cz = (b.z0 + b.z1) / 2
        expect(Math.abs(cz - SPAWN_Z)).toBeGreaterThanOrEqual(FIELD.spawnClear - 1e-9)
        expect(Math.hypot(cx, cz - TOWER_Z)).toBeGreaterThanOrEqual(FIELD.towerClear + FIELD.towerFootHalf - 1e-9)
        for (const other of cover) {
          if (other === b) continue
          const dx = Math.max(b.x0 - other.x1, other.x0 - b.x1, 0)
          const dz = Math.max(b.z0 - other.z1, other.z0 - b.z1, 0)
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(FIELD.gap - 1e-9)
        }
      }
    }
  })

  it('is short for a crate or a barrel and tall for a tree', () => {
    expect(findKind(SEED, 'crate').height).toBeLessThan(JUMP.max)
    expect(findKind(SEED, 'barrel').height).toBeLessThan(JUMP.max)
    expect(findKind(SEED, 'tree').height).toBeGreaterThan(JUMP.max + 1)
  })

  it('starts every runner clear of cover, spread along the spawn line, facing the tower', () => {
    for (const seed of [1, 2, SEED]) {
      for (let count = 1; count <= 7; count++) {
        const arena = arenaFor(seed)
        for (let i = 0; i < count; i++) {
          const at = runnerSpawn(seed, count, i)
          expect(blocked(arena, at, 0.9)).toBe(false)
          expect(at.yaw).toBe(0)
          expect(at.z).toBeGreaterThan(0)
        }
      }
    }
    expect(runnerSpawn(SEED, 4, 1)).toEqual(runnerSpawn(SEED, 4, 1))
  })

  it('puts the sniper on the tower, looking down the lane at the runners', () => {
    const at = sniperSpawn()
    expect(at.y).toBe(FIELD.towerHeight)
    expect(at.z).toBe(TOWER_Z)
    expect(clampToPlatform({ x: 40, z: 40 })).toEqual({ x: FIELD.platformHalf, z: TOWER_Z + FIELD.platformHalf })
  })

  it('reaches base within the tower foot radius and not outside it', () => {
    expect(atBase(0, TOWER_Z)).toBe(true)
    expect(atBase(0, TOWER_Z + FIELD.baseRadius - 0.1)).toBe(true)
    expect(atBase(0, TOWER_Z + FIELD.baseRadius + 2)).toBe(false)
  })

  it('stops a ray at a block in the way, and lets one through the open', () => {
    const arena = arenaFor(SEED)
    const crate = findKind(SEED, 'crate')
    const cx = (crate.x0 + crate.x1) / 2
    const cz = (crate.z0 + crate.z1) / 2
    const from = { x: cx, y: crate.height / 2, z: cz + 6 }
    const halfDepth = (crate.z1 - crate.z0) / 2
    expect(rayHit(arena, from, { x: 0, y: 0, z: -1 }, 100)).toBeCloseTo(6 - halfDepth, 6)
    expect(lineClear(arena, from, { x: cx, y: crate.height / 2, z: cz })).toBe(false)
    expect(lineClear(arena, { x: cx, y: 20, z: cz + 6 }, { x: cx, y: 20, z: cz - 6 })).toBe(true)
  })

  it('vaults a crate or a barrel above its own height, but never a tree', () => {
    const arena = arenaFor(SEED)
    for (const kind of ['crate', 'barrel'] as const) {
      const b = findKind(SEED, kind)
      const at = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }
      expect(blocked(arena, at, 0.4, 0)).toBe(true)
      expect(blocked(arena, at, 0.4, JUMP.max)).toBe(false)
    }
    const tree = findKind(SEED, 'tree')
    const at = { x: (tree.x0 + tree.x1) / 2, z: (tree.z0 + tree.z1) / 2 }
    expect(blocked(arena, at, 0.4, 0)).toBe(true)
    expect(blocked(arena, at, 0.4, JUMP.max)).toBe(true)
  })

  it('pushes a body out of a box the short way, and clamps to the field', () => {
    const arena = arenaFor(SEED)
    const crate = findKind(SEED, 'crate')
    const inside = collide(arena, { x: crate.x0 + 0.02, z: (crate.z0 + crate.z1) / 2 }, 0.4, 0)
    expect(inside.x).toBeCloseTo(crate.x0 - 0.4, 6)
    expect(blocked(arena, inside, 0.4, 0)).toBe(false)
    const out = collide(arena, { x: 500, z: 500 }, 0.4, 0)
    expect(Math.abs(out.x)).toBeLessThanOrEqual(FIELD.halfWidth)
  })
})
