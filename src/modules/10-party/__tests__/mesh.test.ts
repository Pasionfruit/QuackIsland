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
import {
  ISLAND,
  angleFromIsland,
  islandReach,
  localRadius,
  outlineAt,
  partyHeightLocalAt,
} from '../internal/island'
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
    // and the ring of flat round its foot should leave them straight up.
    const upAt = (radius: number) => {
      const ring = Math.round(Math.sqrt(radius / ISLAND.foot) * RINGS)
      const stride = SEGMENTS + 1
      const a = ring * stride
      const n = faceNormal(a, a + 1, a + stride)
      const length = Math.hypot(n[0], n[1], n[2])
      return n[1] / length
    }
    const onPlateau = (ISLAND.volcano + ISLAND.plateauOuter) / 2
    expect(upAt(onPlateau)).toBeCloseTo(1, 2)
    expect(upAt((ISLAND.crater + ISLAND.volcano) / 2)).toBeLessThan(0.85)
  })

  it('reaches exactly as far as the warped outline says, and no further', () => {
    // The rings are laid out in *local* radius, so the outermost is `foot`
    // everywhere - but the world distance it lands at is `foot` times the
    // outline warp, which is what `islandReach` promises. Anything sizing the
    // world around this island trusts that number.
    expect(ringRadius(0)).toBe(0)
    expect(ringRadius(RINGS)).toBeCloseTo(ISLAND.foot, 9)
    let furthest = 0
    let nearest = Infinity
    const stride = SEGMENTS + 1
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const i = (RINGS * stride + seg) * 3
      const out = Math.hypot(positions[i], positions[i + 2])
      furthest = Math.max(furthest, out)
      nearest = Math.min(nearest, out)
    }
    expect(furthest).toBeLessThanOrEqual(islandReach() + 1e-6)
    // And it is genuinely out of round: the long side is a good deal longer
    // than the short one, or the warp is doing nothing.
    expect(furthest / nearest).toBeGreaterThan(1.3)
  })

  it('puts every vertex at the height the ground function says', () => {
    // The mesh and the ground the player walks on are the same island, or a
    // duck stands in the air. Checked through the *world* conversion rather
    // than against a local radius, because that conversion is exactly where
    // the two could drift apart: the mesh warps the outline outwards and the
    // ground function divides it back out again.
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]
      const local = localRadius(x + ISLAND.centreX, z + ISLAND.centreZ)
      const angle = angleFromIsland(x + ISLAND.centreX, z + ISLAND.centreZ)
      if (Math.hypot(x, z) < 1e-6) continue
      expect(positions[i + 1]).toBeCloseTo(partyHeightLocalAt(local, angle), 3)
    }
  })

  it('crowds its rings towards the middle rather than spreading them evenly', () => {
    // Squared spacing, so the crater and the steep upper cone - where all the
    // shape is - get far more rings than the beach, which is nearly a plane.
    const radii = Array.from({ length: RINGS + 1 }, (_, r) => ringRadius(r))
    const innerHalf = radii.filter((r) => r <= ISLAND.foot / 2).length
    expect(innerHalf / RINGS).toBeGreaterThan(0.6)
    // The first ring out from the middle is a stride, and the last is a street.
    expect(radii[1] - radii[0]).toBeLessThan(0.5)
    expect(radii[RINGS] - radii[RINGS - 1]).toBeGreaterThan(5)
  })

  it('carves the horseshoe out of one side of the crater only', () => {
    // Round the rim, one stretch should be well below the rest and the rest
    // should be level. That is what makes it a horseshoe rather than a bowl.
    const rim = ISLAND.crater * 1.1
    const heights: number[] = []
    for (let i = 0; i < 360; i++) {
      const angle = (i / 360) * Math.PI * 2
      heights.push(partyHeightLocalAt(rim, angle))
    }
    const high = Math.max(...heights)
    const low = Math.min(...heights)
    expect(high - low).toBeGreaterThan(20)
    // And most of the rim is untouched: a bite, not a bowl.
    const cut = heights.filter((h) => h < high - 1).length
    expect(cut).toBeGreaterThan(20)
    expect(cut).toBeLessThan(heights.length / 2)
  })

  it('is out of round everywhere, not just at the coast', () => {
    let lo = Infinity
    let hi = 0
    for (let i = 0; i < 720; i++) {
      const s = outlineAt((i / 720) * Math.PI * 2)
      lo = Math.min(lo, s)
      hi = Math.max(hi, s)
    }
    expect(lo).toBeGreaterThan(0.5)
    expect(hi / lo).toBeGreaterThan(1.3)
  })
})
