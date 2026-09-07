import { describe, expect, it } from 'vitest'
import { SKIRT_DEPTH, buildChunkGeometry, chunkCentre, chunkOrigin, lodForDistance, segmentsForLod } from '../internal/chunk'
import { TERRAIN, heightAt } from '../internal/island'

const LAST = TERRAIN.chunksPerSide - 1

describe('chunk geometry', () => {
  it('puts every vertex exactly where the height function says the ground is', () => {
    // The test that stops everything placed on the ground from floating. If
    // the mesh and heightAt ever disagree, a tree planted at heightAt sinks
    // into or hovers over the surface the player can actually see.
    for (let lod = 0; lod < TERRAIN.lodSegments.length; lod++) {
      const g = buildChunkGeometry(2, 3, lod)
      for (let v = 0; v < g.gridVertexCount; v++) {
        const x = g.positions[v * 3]
        const y = g.positions[v * 3 + 1]
        const z = g.positions[v * 3 + 2]
        expect(Math.abs(y - heightAt(x, z))).toBeLessThan(1e-4)
      }
    }
  })

  it('covers exactly its own square metre for metre', () => {
    const g = buildChunkGeometry(1, 4, 0)
    const { x0, z0 } = chunkOrigin(1, 4)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let v = 0; v < g.gridVertexCount; v++) {
      minX = Math.min(minX, g.positions[v * 3])
      maxX = Math.max(maxX, g.positions[v * 3])
      minZ = Math.min(minZ, g.positions[v * 3 + 2])
      maxZ = Math.max(maxZ, g.positions[v * 3 + 2])
    }
    expect(minX).toBeCloseTo(x0, 4)
    expect(maxX).toBeCloseTo(x0 + TERRAIN.chunkSize, 4)
    expect(minZ).toBeCloseTo(z0, 4)
    expect(maxZ).toBeCloseTo(z0 + TERRAIN.chunkSize, 4)
  })

  it('produces identical vertices along a shared edge', () => {
    // Seams are watertight by construction: both chunks ask the same pure
    // function for the same coordinates. This proves the construction holds
    // rather than relying on it.
    const left = buildChunkGeometry(2, 2, 0)
    const right = buildChunkGeometry(3, 2, 0)
    const seg = segmentsForLod(0)
    const n = seg + 1
    for (let j = 0; j < n; j++) {
      const l = j * n + seg // right column of the left chunk
      const r = j * n // left column of the right chunk
      expect(left.positions[l * 3]).toBe(right.positions[r * 3])
      expect(left.positions[l * 3 + 1]).toBe(right.positions[r * 3 + 1])
      expect(left.positions[l * 3 + 2]).toBe(right.positions[r * 3 + 2])
    }
  })

  it('hangs a skirt below every rim, at every level of detail', () => {
    for (let lod = 0; lod < TERRAIN.lodSegments.length; lod++) {
      const g = buildChunkGeometry(1, 1, lod)
      const skirtCount = g.vertexCount - g.gridVertexCount
      expect(skirtCount).toBe(4 * segmentsForLod(lod))
      for (let v = g.gridVertexCount; v < g.vertexCount; v++) {
        const x = g.positions[v * 3]
        const y = g.positions[v * 3 + 1]
        const z = g.positions[v * 3 + 2]
        // Each skirt vertex hangs directly under a rim vertex.
        expect(y).toBeCloseTo(heightAt(x, z) - SKIRT_DEPTH, 3)
      }
    }
  })

  it('indexes only vertices that exist', () => {
    for (let lod = 0; lod < TERRAIN.lodSegments.length; lod++) {
      const g = buildChunkGeometry(0, 0, lod)
      for (let i = 0; i < g.indices.length; i++) {
        expect(g.indices[i]).toBeLessThan(g.vertexCount)
      }
      expect(g.indices.length % 3).toBe(0)
    }
  })

  it('emits unit normals everywhere', () => {
    const g = buildChunkGeometry(4, 2, 1)
    for (let v = 0; v < g.vertexCount; v++) {
      const len = Math.hypot(g.normals[v * 3], g.normals[v * 3 + 1], g.normals[v * 3 + 2])
      expect(len).toBeCloseTo(1, 4)
    }
  })

  it('gets cheaper at every step out', () => {
    let prev = Infinity
    for (let lod = 0; lod < TERRAIN.lodSegments.length; lod++) {
      const g = buildChunkGeometry(2, 2, lod)
      expect(g.triangleCount).toBeLessThan(prev)
      prev = g.triangleCount
    }
  })

  it('clamps a level of detail beyond the last one', () => {
    expect(segmentsForLod(99)).toBe(TERRAIN.lodSegments[TERRAIN.lodSegments.length - 1])
    expect(segmentsForLod(-5)).toBe(TERRAIN.lodSegments[0])
  })
})

describe('the whole island fits its budget', () => {
  it('stays under the triangle budget even with everything at full detail', () => {
    // Worst case: the camera close enough that nothing is simplified. Pure
    // arithmetic, no rendering, so it is honest and instant.
    const perChunk = buildChunkGeometry(0, 0, 0).triangleCount
    const total = perChunk * TERRAIN.chunksPerSide * TERRAIN.chunksPerSide
    expect(total).toBeLessThan(400_000)
  })

  it('draws one call per chunk and no more', () => {
    expect(TERRAIN.chunksPerSide * TERRAIN.chunksPerSide).toBeLessThanOrEqual(64)
  })
})

describe('level of detail selection', () => {
  it('uses full detail up close and coarser further out', () => {
    expect(lodForDistance(0)).toBe(0)
    expect(lodForDistance(TERRAIN.lodDistances[0] - 1)).toBe(0)
    expect(lodForDistance(TERRAIN.lodDistances[0] + 1)).toBe(1)
    expect(lodForDistance(99999)).toBe(TERRAIN.lodDistances.length)
  })

  it('never picks a level that has no mesh resolution defined', () => {
    expect(lodForDistance(99999)).toBeLessThan(TERRAIN.lodSegments.length)
  })

  it('centres a chunk half a chunk from its own corner', () => {
    const { x0, z0 } = chunkOrigin(LAST, 0)
    const c = chunkCentre(LAST, 0)
    expect(c.x).toBeCloseTo(x0 + TERRAIN.chunkSize / 2, 6)
    expect(c.z).toBeCloseTo(z0 + TERRAIN.chunkSize / 2, 6)
  })
})
