/**
 * The shape of the party island, as plain arrays.
 *
 * Split out of the view for the same reason `01-terrain` splits its chunks
 * out: geometry built with no three.js in sight can be checked in Node, and
 * the thing worth checking here is not something you would think to check.
 *
 * The island was once wound inside out. Nothing about that looks wrong in the
 * code - the indices are a tidy quad-to-two-triangles - but three.js draws
 * front faces only, front means anticlockwise seen from outside, and
 * `computeVertexNormals` takes its normals from the same winding. So every
 * triangle faced the sea bed: from anywhere a player could stand, the ground
 * was not merely dark, it was **not there**, and you looked straight through
 * the island at the water.
 *
 * That is exactly the kind of bug a test catches instantly and a person can
 * stare past for a week, so there is a test.
 */
import { ISLAND, outlineAt, partyHeightLocalAt } from './island'

/** How finely the island is meshed, from the middle outwards. */
export const RINGS = 96
/**
 * How many segments go round.
 *
 * This decides three separate things now, which is why it is generous: whether
 * the coastline reads as a curve or a polygon, how cleanly the out-of-round
 * outline is resolved, and - the demanding one - how sharp the edges of the
 * horseshoe are. The breach falls off over about half a radian, so it wants a
 * good handful of segments across that.
 */
export const SEGMENTS = 192

export interface IslandMesh {
  positions: Float32Array
  indices: Uint32Array
}

/**
 * Where each ring of vertices sits, as a **local** radius.
 *
 * Squared rather than linear, so the rings crowd towards the middle where the
 * volcano and its crater are, and spread out across the beach where the ground
 * barely changes.
 */
export function ringRadius(ring: number): number {
  const t = ring / RINGS
  return ISLAND.foot * t * t
}

/**
 * The land, as a radial disc.
 *
 * Radial rather than a grid because the island is radial: rings of vertices
 * follow the contours exactly, so the cone and the beach both come out smooth
 * with far fewer triangles than a grid fine enough to do the same.
 *
 * The rings are laid out in **local** radius and pushed out to world distance
 * by the outline warp, which is what keeps the mesh and `partyHeightAt` the
 * same island. Build the rings at world radius instead and the two disagree
 * everywhere the island is out of round - the mesh would say one thing and the
 * ground the player walks on another.
 */
export function buildIslandMesh(): IslandMesh {
  const stride = SEGMENTS + 1
  const positions = new Float32Array((RINGS + 1) * stride * 3)

  let p = 0
  for (let ring = 0; ring <= RINGS; ring++) {
    const local = ringRadius(ring)
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const angle = (seg / SEGMENTS) * Math.PI * 2
      const out = local * outlineAt(angle)
      positions[p++] = Math.cos(angle) * out
      positions[p++] = partyHeightLocalAt(local, angle)
      positions[p++] = Math.sin(angle) * out
    }
  }

  const indices = new Uint32Array(RINGS * SEGMENTS * 6)
  let i = 0
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const a = ring * stride + seg
      const b = a + stride
      // Anticlockwise seen from above, so the ground faces the sky. Reversing
      // either triangle here makes the island invisible from every direction a
      // player can look at it from.
      indices[i++] = a
      indices[i++] = a + 1
      indices[i++] = b
      indices[i++] = a + 1
      indices[i++] = b + 1
      indices[i++] = b
    }
  }

  return { positions, indices }
}
