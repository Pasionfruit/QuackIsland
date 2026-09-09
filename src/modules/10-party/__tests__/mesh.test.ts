/**
 * The shape of the island, and which way it faces.
 *
 * The facing test is the one that matters. The island was wound inside out,
 * which meant three.js culled every triangle of it and the ground simply was
 * not there - you looked through the island at the sea. Nothing in the code
 * looked wrong, and no other test in this module noticed, because every one of
 * them asked about heights and positions rather than about surfaces.
 */
import { describe, expect, it } from 'vitest'
import { ISLAND, partyHeightLocal } from '../internal/island'
import { RINGS, SEGMENTS, buildIslandMesh, ringRadius } from '../internal/mesh'

const { positions, indices } = buildIslandMesh()

function vertex(i: number): [number, number, number] {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
}

/** The geometric normal of a triangle, by the same right-hand rule three uses. */
function faceNormal(a: number, b: number, c: number): [number, number, number] {
  const p = vertex(a)
  const q = vertex(b)
  const r = vertex(c)
  const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
  const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]
  return [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]
}

describe('the island mesh', () => {
  it('faces the sky, every single triangle of it', () => {
    // Wound the other way, three culls the lot and the island is invisible
    // from anywhere a player can stand. This is the whole test.
    let checked = 0
    for (let t = 0; t < indices.length; t += 3) {
      const n = faceNormal(indices[t], indices[t + 1], indices[t + 2])
      const length = Math.hypot(n[0], n[1], n[2])
      // The rings at the very middle collapse to a point, so their triangles
      // have no area and no direction to face. Nothing draws them either.
      if (length < 1e-9) continue
      checked++
      expect(n[1] / length).toBeGreaterThan(0)
    }
    // And most of them are real triangles, so the loop above tested something.
    expect(checked).toBeGreaterThan(RINGS * SEGMENTS)
  })

  it('is steepest on the volcano and flattest on the plateau', () => {
    // A sanity check on the same normals: the cone should tip them well over
    // and the board should leave them straight up.
    const upAt = (radius: number) => {
      const ring = Math.round(Math.sqrt(radius / ISLAND.foot) * RINGS)
      const stride = SEGMENTS + 1
      const a = ring * stride
      const n = faceNormal(a, a + 1, a + stride)
      const length = Math.hypot(n[0], n[1], n[2])
      return n[1] / length
    }
    expect(upAt(ISLAND.plateauOuter * 0.7)).toBeCloseTo(1, 3)
    expect(upAt((ISLAND.crater + ISLAND.volcano) / 2)).toBeLessThan(0.75)
  })

  it('covers the island out to its foot, and no further', () => {
    expect(ringRadius(0)).toBe(0)
    expect(ringRadius(RINGS)).toBeCloseTo(ISLAND.foot, 9)
    let furthest = 0
    for (let i = 0; i < positions.length; i += 3) {
      furthest = Math.max(furthest, Math.hypot(positions[i], positions[i + 2]))
    }
    expect(furthest).toBeCloseTo(ISLAND.foot, 4)
  })

  it('puts every vertex at the height the island function says', () => {
    // The mesh and the ground the player walks on are the same island, or a
    // duck stands in the air.
    for (let i = 0; i < positions.length; i += 3) {
      const radius = Math.hypot(positions[i], positions[i + 2])
      expect(positions[i + 1]).toBeCloseTo(partyHeightLocal(radius), 4)
    }
  })

  it('crowds its rings onto the volcano rather than spreading them evenly', () => {
    // Squared spacing: the cone is a third of the rings and a twelfth of the
    // radius, which is what keeps it smooth without paving the beach.
    const onCone = Array.from({ length: RINGS + 1 }, (_, r) => ringRadius(r)).filter(
      (r) => r <= ISLAND.volcano,
    ).length
    expect(onCone).toBeGreaterThan(RINGS * 0.2)
    expect(ISLAND.volcano / ISLAND.foot).toBeLessThan(0.15)
  })
})
