import { CONVENTIONS, TIDE_MAX, createRng } from '../../00-core'

export const FLORA = { palms: 72, grass: 420, coconuts: 120, spawnClear: 9, palmSpacing: 10 } as const
export interface GroundSample { height: number; slope: number; normalX: number; normalY: number; normalZ: number }
export interface Occupied { x: number; z: number; radius: number }
export interface Planting {
  x: number; y: number; z: number; nx: number; ny: number; nz: number; yaw: number; scale: number
}
export interface FloraField { palms: Planting[]; grass: Planting[]; coconuts: Planting[] }
export interface ScatterOptions {
  radius: number; occupied?: readonly Occupied[]; palms?: number; grass?: number; coconuts?: number
}

/** Rejection sampling is bounded, including when no part of the ground is plantable. */
export function scatterFlora(ground: (x: number, z: number) => GroundSample, options: ScatterOptions,
  seed: number = CONVENTIONS.worldSeed): FloraField {
  const rng = createRng(seed ^ 0x50414c4d)
  const field: FloraField = { palms: [], grass: [], coconuts: [] }
  const occupied = options.occupied ?? []
  const radius = Math.max(0, options.radius)
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo)
  const away = (x: number, z: number, points: readonly { x: number; z: number }[], gap: number) =>
    points.every(p => Math.hypot(p.x - x, p.z - z) >= gap)
  const point = (reach = radius): [number, number] => {
    const angle = rng() * Math.PI * 2, r = Math.sqrt(rng()) * reach
    return [Math.cos(angle) * r, Math.sin(angle) * r]
  }
  const site = (x: number, z: number, margin: number, maxSlope: number): Planting | null => {
    const distance = Math.hypot(x, z)
    if (distance < FLORA.spawnClear + margin || distance > radius ||
      occupied.some(p => Math.hypot(x - p.x, z - p.z) < p.radius + margin)) return null
    const g = ground(x, z)
    if (![g.height, g.slope, g.normalX, g.normalY, g.normalZ].every(Number.isFinite) ||
      g.height < TIDE_MAX + .5 || g.slope > maxSlope || g.normalY <= 0) return null
    return { x, y: g.height, z, nx: g.normalX, ny: g.normalY, nz: g.normalZ,
      yaw: rng() * Math.PI * 2, scale: 1 }
  }
  const populate = (count: number, make: () => Planting | null, out: Planting[]) => {
    const target = Math.max(0, Math.min(2000, Math.floor(count)))
    for (let attempt = 0; out.length < target && attempt < target * 100; attempt++) {
      const plant = make()
      if (plant) out.push(plant)
    }
  }
  const palms = options.palms ?? FLORA.palms
  populate(palms, () => {
    // A few groves near the lobby make the vegetation visible on first arrival.
    const [x,z] = point(field.palms.length < palms * .35 ? Math.min(radius, 65) : radius)
    if (!away(x,z,field.palms,FLORA.palmSpacing)) return null
    const p = site(x,z,3,.35)
    if (p) p.scale = between(.8,1.28)
    return p
  }, field.palms)
  const nearPalm = (lo: number, hi: number): [number, number] => {
    if (!field.palms.length) return point()
    const palm = field.palms[Math.floor(rng() * field.palms.length)]
    const angle = rng() * Math.PI * 2, r = between(lo, hi)
    return [palm.x + Math.cos(angle) * r, palm.z + Math.sin(angle) * r]
  }
  populate(options.grass ?? FLORA.grass, () => {
    const [x,z] = rng() < .7 ? nearPalm(2.8,9) : point()
    if (!away(x,z,field.grass,2.2) || !away(x,z,field.palms,2.2)) return null
    const p = site(x,z,1.5,.28)
    if (p) { p.scale = between(.8,1.35); p.y += .015 }
    return p
  }, field.grass)
  populate(options.coconuts ?? FLORA.coconuts, () => {
    const [x,z] = nearPalm(1.6,5)
    if (!away(x,z,field.coconuts,.65) || !away(x,z,field.palms,1.2)) return null
    const p = site(x,z,.35,.32)
    if (p) p.scale = between(.85,1.25)
    return p
  }, field.coconuts)
  return field
}
