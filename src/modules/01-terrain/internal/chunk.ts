/**
 * Turning the height function into triangles.
 *
 * Pure: takes a chunk coordinate and a level of detail, returns typed arrays.
 * No three.js, so the geometry can be checked in Node - including the check
 * that matters most, that a vertex sits exactly where heightAt says the ground
 * is. If that ever drifts, everything later placed on the ground floats.
 *
 * Seams between chunks need no stitching. Two chunks sharing an edge compute
 * that edge from the same pure function with the same inputs, so the vertices
 * are bit-identical by construction rather than by careful bookkeeping.
 */
import { TERRAIN } from './island'
import { heightAt, normalComponents } from './island'

/** How far the apron hangs below the rim, in metres. */
export const SKIRT_DEPTH = 2.5

export interface ChunkGeometryData {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  vertexCount: number
  triangleCount: number
  /** Grid vertices only, excluding the skirt. */
  gridVertexCount: number
}

export function chunkOrigin(cx: number, cz: number): { x0: number; z0: number } {
  const half = (TERRAIN.chunkSize * TERRAIN.chunksPerSide) / 2
  return { x0: -half + cx * TERRAIN.chunkSize, z0: -half + cz * TERRAIN.chunkSize }
}

export function segmentsForLod(lod: number): number {
  const s = TERRAIN.lodSegments
  return s[Math.min(Math.max(lod, 0), s.length - 1)]
}

/**
 * Builds one chunk.
 *
 * Positions are world-space metres. Normals come from the height function
 * rather than from the triangles: mesh normals differ between levels of detail
 * and leave a visible lighting seam where two levels meet, which is a bug that
 * only shows up once you are moving and is very awkward to fix after a freeze.
 */
export function buildChunkGeometry(cx: number, cz: number, lod: number): ChunkGeometryData {
  const seg = segmentsForLod(lod)
  const n = seg + 1
  const { x0, z0 } = chunkOrigin(cx, cz)
  const step = TERRAIN.chunkSize / seg

  const perimeter = 4 * seg
  const gridVertexCount = n * n
  const vertexCount = gridVertexCount + perimeter

  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const gridTris = seg * seg * 2
  const skirtTris = perimeter * 2
  const indices = new Uint32Array((gridTris + skirtTris) * 3)

  const nrm: [number, number, number] = [0, 1, 0]

  for (let j = 0; j < n; j++) {
    const z = z0 + j * step
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step
      const v = j * n + i
      const h = heightAt(x, z)
      normalComponents(x, z, nrm)
      positions[v * 3] = x
      positions[v * 3 + 1] = h
      positions[v * 3 + 2] = z
      normals[v * 3] = nrm[0]
      normals[v * 3 + 1] = nrm[1]
      normals[v * 3 + 2] = nrm[2]
      uvs[v * 2] = i / seg
      uvs[v * 2 + 1] = j / seg
    }
  }

  let t = 0
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[t++] = a
      indices[t++] = c
      indices[t++] = b
      indices[t++] = b
      indices[t++] = c
      indices[t++] = d
    }
  }

  // The apron. Levels of detail sample the ground at different spacings, so a
  // coarse chunk beside a fine one leaves a hairline crack you can see the sky
  // through. Hanging a short skirt from every rim hides it for a handful of
  // triangles - far less code than stitching index buffers, and invisible
  // because the terrain is opaque and uniformly shaded.
  const rim: number[] = []
  for (let i = 0; i < seg; i++) rim.push(i) // top edge, left to right
  for (let j = 0; j < seg; j++) rim.push(j * n + seg) // right edge, top to bottom
  for (let i = seg; i > 0; i--) rim.push(seg * n + i) // bottom edge, right to left
  for (let j = seg; j > 0; j--) rim.push(j * n) // left edge, bottom to top

  for (let k = 0; k < rim.length; k++) {
    const src = rim[k]
    const v = gridVertexCount + k
    positions[v * 3] = positions[src * 3]
    positions[v * 3 + 1] = positions[src * 3 + 1] - SKIRT_DEPTH
    positions[v * 3 + 2] = positions[src * 3 + 2]
    normals[v * 3] = normals[src * 3]
    normals[v * 3 + 1] = normals[src * 3 + 1]
    normals[v * 3 + 2] = normals[src * 3 + 2]
    uvs[v * 2] = uvs[src * 2]
    uvs[v * 2 + 1] = uvs[src * 2 + 1]
  }

  for (let k = 0; k < rim.length; k++) {
    const k2 = (k + 1) % rim.length
    const topA = rim[k]
    const topB = rim[k2]
    const botA = gridVertexCount + k
    const botB = gridVertexCount + k2
    indices[t++] = topA
    indices[t++] = botA
    indices[t++] = topB
    indices[t++] = topB
    indices[t++] = botA
    indices[t++] = botB
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    vertexCount,
    triangleCount: indices.length / 3,
    gridVertexCount,
  }
}

/** Which level of detail a chunk should use, given how far its middle is from the camera. */
export function lodForDistance(distance: number): number {
  const d = TERRAIN.lodDistances
  for (let i = 0; i < d.length; i++) if (distance < d[i]) return i
  return d.length
}

export function chunkCentre(cx: number, cz: number): { x: number; z: number } {
  const { x0, z0 } = chunkOrigin(cx, cz)
  return { x: x0 + TERRAIN.chunkSize / 2, z: z0 + TERRAIN.chunkSize / 2 }
}
