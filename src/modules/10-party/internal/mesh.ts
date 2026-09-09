/**
 * The shape of the party island, as plain arrays.
 *
 * Split out of the view for the same reason `01-terrain` splits its chunks
 * out: geometry built with no three.js in sight can be checked in Node, and
 * the thing worth checking here is not something you would think to check.
 *
 * The island was previously wound inside out. Nothing about that looks wrong
 * in the code - the indices are a tidy quad-to-two-triangles - but three.js
 * draws front faces only, front means anticlockwise seen from outside, and
 * `computeVertexNormals` takes its normals from the same winding. So every
 * triangle of the island faced the sea bed: from anywhere a player could
 * stand, the ground was not merely dark, it was **not there**, and you looked
 * straight through the island at the sea.
 *
 * That is exactly the kind of bug a test catches instantly and a person can
 * stare past for a week, so there is now a test.
 */
import { ISLAND, partyHeightLocal } from './island'

/** How finely the island is meshed, from the middle outwards. */
export const RINGS = 72
/**
 * How many segments go round.
 *
 * At the rim this is what decides whether the coastline reads as a circle or
 * as a polygon, and the rim is 2.4 km round.
 */
export const SEGMENTS = 144

export interface IslandMesh {
  positions: Float32Array
  indices: Uint32Array
}

/**
 * Where each ring of vertices sits.
 *
 * Squared rather than linear, so the rings crowd towards the middle where the
 * volcano is and spread out across the beach where the ground barely changes.
 */
export function ringRadius(ring: number): number {
  const t = ring / RINGS
  return ISLAND.foot * t * t
}

/**
 * The land, as a radial disc.
 *
 * Radial rather than a grid because the island is radial: rings of vertices
 * follow the contours exactly, so the volcano's cone and the beach both come
 * out smooth with far fewer triangles than a grid fine enough to do the same.
 */
export function buildIslandMesh(): IslandMesh {
  const stride = SEGMENTS + 1
  const positions = new Float32Array((RINGS + 1) * stride * 3)

  let p = 0
  for (let ring = 0; ring <= RINGS; ring++) {
    const radius = ringRadius(ring)
    const height = partyHeightLocal(radius)
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const angle = (seg / SEGMENTS) * Math.PI * 2
      positions[p++] = Math.cos(angle) * radius
      positions[p++] = height
      positions[p++] = Math.sin(angle) * radius
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
