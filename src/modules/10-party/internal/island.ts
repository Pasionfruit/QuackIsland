/**
 * The party island: where it is, and what shape it is.
 *
 * A real island in the same sea as the spawn island, a good way off across the
 * water. Not the floating slab this replaces - "another island like the
 * player's spawn" means one you could swim to, with a beach, standing in the
 * same water under the same sky.
 *
 * It sits **inside the sea plane** on purpose. The water is 1800 m across and
 * baked once from a height function, so anything outside it has no sea at all,
 * and an island in open nothing is worse than one you can see the mainland
 * from. Seven hundred metres out is past the mainland's beach, past the edge
 * of its mesh - which is already below the waterline and so invisible - and
 * still comfortably inside the water.
 *
 * All pure. The mesh, the board and the sea's depth are all built from
 * `partyHeightAt`, so there is exactly one answer to where the ground is.
 */

export const ISLAND = {
  /** Where the middle of it sits in the world. */
  centreX: 700,
  centreZ: 0,

  /** The flat top of the volcano, where the treasure is. */
  summit: 31,
  /** How wide that flat top is. */
  crater: 3.6,
  /** The foot of the cone. The board runs up to here. */
  volcano: 15,

  /** The board sits on this, and it is flat, because a board should be. */
  plateau: 5,
  /** How far the flat part reaches before the beach starts. */
  plateauOuter: 56,
  /** Where the sand meets the water. */
  shore: 70,
  /** Where it has finished sinking to the sea bed. */
  foot: 92,
  /** How deep the sea bed is around it. Matches the mainland's. */
  seaBed: -22,
} as const

/** Distance from the middle of the party island, in metres. */
export function distanceFromIsland(x: number, z: number): number {
  return Math.hypot(x - ISLAND.centreX, z - ISLAND.centreZ)
}

/** Whether a point is anywhere on or around the party island. */
export function onPartyIsland(x: number, z: number): boolean {
  return distanceFromIsland(x, z) <= ISLAND.foot
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * The height of the party island, as a function of distance from its middle.
 *
 * Four parts: a flat summit to stand the treasure on, a cone down to the foot
 * of the volcano, a flat plateau for the board, and a beach into the sea.
 *
 * The plateau is genuinely flat. A gently domed island would look better empty
 * and worse with a board on it - a race track that runs uphill and down for no
 * reason reads as a mistake rather than as terrain.
 */
export function partyHeightLocal(d: number): number {
  if (d <= ISLAND.crater) return ISLAND.summit

  if (d <= ISLAND.volcano) {
    // Cone. Eased at both ends so the summit has a rim rather than a spike and
    // the foot meets the plateau without a crease you could trip on.
    return ISLAND.plateau + (ISLAND.summit - ISLAND.plateau) * (1 - smoothstep(ISLAND.crater, ISLAND.volcano, d))
  }

  if (d <= ISLAND.plateauOuter) return ISLAND.plateau

  if (d <= ISLAND.shore) {
    return ISLAND.plateau * (1 - smoothstep(ISLAND.plateauOuter, ISLAND.shore, d))
  }

  return ISLAND.seaBed * smoothstep(ISLAND.shore, ISLAND.foot, d)
}

/** The height of the party island at a world position. */
export function partyHeightAt(x: number, z: number): number {
  return partyHeightLocal(distanceFromIsland(x, z))
}

/**
 * The whole world's ground: the party island where it is, and whatever was
 * there before everywhere else.
 *
 * The composition root hands this to the player, the footprints and the sea,
 * so all three agree about where the ground is - which is what stops the water
 * being drawn over the top of an island it has never heard of.
 */
export function groundWithIsland(
  x: number,
  z: number,
  elsewhere: (x: number, z: number) => number,
): number {
  if (!onPartyIsland(x, z)) return elsewhere(x, z)
  // Past the beach the island has already reached the sea bed, so taking the
  // higher of the two blends it into whatever the mainland says is down there
  // rather than cutting a circular hole in the sea floor.
  return Math.max(partyHeightAt(x, z), elsewhere(x, z))
}
