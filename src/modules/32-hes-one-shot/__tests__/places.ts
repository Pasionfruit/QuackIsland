/**
 * Finding places in a seeded arena for a test to stand people: cover can be
 * anywhere, so nothing can be assumed open.
 */
import { arenaFor, blocked, slide } from '../internal/arena'

/** A z where a wide lane runs clear from x = -7 to x = 7: room for a body and more either side. */
export function lane(seed: number): number {
  const arena = arenaFor(seed)
  for (let z = -13; z <= 13; z += 0.25) {
    const end = slide(arena, { x: -7, z }, 14, 0, 1)
    if (Math.abs(end.x - 7) < 1e-9 && Math.abs(end.z - z) < 1e-9 && !blocked(arena, { x: -7, z }, 1)) return z
  }
  throw new Error(`no open lane in arena ${seed}`)
}

/** A piece of cover with open ground two metres off either side of it along x. */
export function across(seed: number) {
  const arena = arenaFor(seed)
  for (const cover of arena.blocks.filter((b) => !b.wall)) {
    const cz = (cover.z0 + cover.z1) / 2
    const west = { x: cover.x0 - 2, z: cz }
    const east = { x: cover.x1 + 2, z: cz }
    if (!blocked(arena, west, 0.6) && !blocked(arena, east, 0.6)) return { cover, west, east }
  }
  throw new Error(`no cover to shoot across in arena ${seed}`)
}
