/**
 * The arena.
 *
 * Smash is played looking down on a floating disc: there is no gravity and no
 * jumping, and the only way out is over the edge. The floor is an ellipse
 * rather than a circle because the camera is tilted - a disc seen at an angle
 * is exactly that - so every distance across the floor is measured in
 * normalised arena space, where the rim is at radius 1 in both axes.
 */

export const VIEW_W = 480
export const VIEW_H = 270

export interface Arena {
  id: string
  name: string
  /** Centre of the floor, in view units. */
  cx: number
  cy: number
  /** Half-width and half-depth of the floor. */
  rx: number
  ry: number
  /** How thick the slab under the floor looks. */
  depth: number
  /** Where the two fighters start. */
  spawns: { x: number; y: number }[]
}

export const LAKESIDE_BLUFF: Arena = {
  id: 'lakeside-bluff',
  name: 'Lakeside Bluff',
  cx: 240,
  cy: 138,
  rx: 150,
  ry: 86,
  depth: 26,
  spawns: [
    { x: 178, y: 138 },
    { x: 302, y: 138 },
  ],
}

/**
 * How far out a point is, as a fraction of the way to the rim.
 *
 * Below 1 is on the floor, above 1 is over the edge. Working in this space
 * keeps every check - knockback, the CPU's sense of danger, the ring-out -
 * independent of the arena's shape.
 */
export function rimDistance(a: Arena, x: number, y: number): number {
  const dx = (x - a.cx) / a.rx
  const dy = (y - a.cy) / a.ry
  return Math.sqrt(dx * dx + dy * dy)
}

/** The point on the rim nearest a position, for dust and edge effects. */
export function rimPoint(a: Arena, x: number, y: number): { x: number; y: number } {
  const d = rimDistance(a, x, y) || 1
  return { x: a.cx + (x - a.cx) / d, y: a.cy + (y - a.cy) / d }
}

/** Pushes a point back inside the floor, used to keep spawns honest. */
export function clampToFloor(a: Arena, x: number, y: number, inset = 0.94): { x: number; y: number } {
  const d = rimDistance(a, x, y)
  if (d <= inset) return { x, y }
  const k = inset / (d || 1)
  return { x: a.cx + (x - a.cx) * k, y: a.cy + (y - a.cy) * k }
}
