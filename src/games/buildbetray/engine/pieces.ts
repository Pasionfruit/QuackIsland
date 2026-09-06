/**
 * Build & Betray's building pieces: a small, data-driven pool. Every piece is
 * pure data - the engine switches on `behavior` during placement and physics,
 * so a new piece never needs a new state-machine code path. Keep this list
 * short; the fun comes from interactions between a few pieces, not from
 * having a hundred of them.
 */

export type PieceCategory = 'platform' | 'hazard' | 'movement' | 'trap' | 'utility'
export type Rarity = 'common' | 'uncommon' | 'rare'
export type Collision = 'solid' | 'oneway' | 'lethal' | 'trigger'

export type Behavior =
  | 'static' // just sits there (small/long platform, wall)
  | 'oneway' // solid from above; drop through with down+jump
  | 'breakable' // solid until stood on, then gives way after a short delay
  | 'fake' // looks solid, vanishes the instant it's touched
  | 'moving' // patrols between two points, carries riders
  | 'spikes' // lethal on touch
  | 'saw' // lethal on touch, spins in place
  | 'fire' // lethal only while flared, on a fixed rhythm
  | 'bounce' // big upward impulse on touch
  | 'conveyor' // solid surface that pushes riders sideways
  | 'launch' // solid surface, one big diagonal impulse the instant you land
  | 'triggerTrap' // looks like a normal step; pops lethal a moment after being stepped on
  | 'checkpoint' // non-solid; sets the toucher's respawn point

export interface PieceParams {
  /** Upward or launch impulse, in world units/frame. */
  power?: number
  /** Patrol or conveyor speed. */
  speed?: number
  /** Patrol distance, in cells. */
  range?: number
  /** Flare rhythm, in frames. */
  period?: number
  /** Frames between trigger and effect (breakable giving way, trap popping). */
  delay?: number
}

export interface PieceDef {
  id: string
  category: PieceCategory
  name: string
  description: string
  /** Footprint in grid cells. */
  w: number
  h: number
  /** Can be flipped left/right at placement - a patrol or push direction, not a full rotation. */
  rotatable: boolean
  collision: Collision
  behavior: Behavior
  rarity: Rarity
  /** 1 (safe utility) to 3 (nasty) - shown to players, not enforced by the engine. */
  riskLevel: 1 | 2 | 3
  /** Must sit directly above a solid cell - spikes and fire, not free-floating things like a saw. */
  requiresSupportBelow: boolean
  /** How many of this piece one player may place in a single build phase. */
  maxPerPlayer: number
  color: string
  params?: PieceParams
  /** Blocks horizontal passage rather than just being something you land on. Only the wall. */
  blocksHorizontal?: boolean
}

export const CELL_W = 20
export const CELL_H = 18

export const PIECES: PieceDef[] = [
  // ---------------------------------------------------------------- platforms
  {
    id: 'platform-small',
    category: 'platform',
    name: 'Small Platform',
    description: 'One solid step. The bread and butter of getting anywhere.',
    w: 2,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'static',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 5,
    color: '#a97e52',
  },
  {
    id: 'platform-long',
    category: 'platform',
    name: 'Long Platform',
    description: 'A wide, safe run. Good for closing a gap - or blocking one.',
    w: 4,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'static',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 3,
    color: '#a97e52',
  },
  {
    id: 'platform-oneway',
    category: 'platform',
    name: 'One-Way Platform',
    description: 'Jump up through it from below - solid the moment you land on top.',
    w: 3,
    h: 1,
    rotatable: false,
    collision: 'oneway',
    behavior: 'oneway',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 3,
    color: '#c7a06a',
  },
  {
    id: 'platform-breakable',
    category: 'platform',
    name: 'Breakable Platform',
    description: 'Holds for a heartbeat, then gives way. Fine if you keep moving.',
    w: 2,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'breakable',
    rarity: 'uncommon',
    riskLevel: 2,
    requiresSupportBelow: false,
    maxPerPlayer: 3,
    color: '#c98f5c',
    params: { delay: 22 },
  },
  {
    id: 'platform-moving',
    category: 'platform',
    name: 'Moving Platform',
    description: 'Patrols back and forth and carries whoever is standing on it.',
    w: 2,
    h: 1,
    rotatable: true,
    collision: 'solid',
    behavior: 'moving',
    rarity: 'uncommon',
    riskLevel: 2,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#8fae6a',
    params: { speed: 0.9, range: 3 },
  },
  // ------------------------------------------------------------------ hazards
  {
    id: 'spikes',
    category: 'hazard',
    name: 'Spikes',
    description: 'Touch them from any side and you are out for this run.',
    w: 1,
    h: 1,
    rotatable: false,
    collision: 'lethal',
    behavior: 'spikes',
    rarity: 'common',
    riskLevel: 3,
    requiresSupportBelow: true,
    maxPerPlayer: 3,
    color: '#8a8f96',
  },
  {
    id: 'saw',
    category: 'hazard',
    name: 'Saw',
    description: 'Mounted in place, always spinning, always lethal.',
    w: 1,
    h: 1,
    rotatable: false,
    collision: 'lethal',
    behavior: 'saw',
    rarity: 'uncommon',
    riskLevel: 3,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#9aa2a8',
  },
  {
    id: 'fire',
    category: 'hazard',
    name: 'Fire',
    description: 'Flares on a rhythm - lethal while lit, harmless while out.',
    w: 1,
    h: 1,
    rotatable: false,
    collision: 'lethal',
    behavior: 'fire',
    rarity: 'uncommon',
    riskLevel: 2,
    requiresSupportBelow: true,
    maxPerPlayer: 2,
    color: '#e8703a',
    params: { period: 90 },
  },
  // ----------------------------------------------------------------- movement
  {
    id: 'bounce',
    category: 'movement',
    name: 'Bounce Pad',
    description: 'Launches anyone who lands on it straight up.',
    w: 2,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'bounce',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#c85f96',
    params: { power: 9.6 },
  },
  {
    id: 'conveyor',
    category: 'movement',
    name: 'Conveyor Belt',
    description: 'A solid surface that quietly carries you sideways.',
    w: 3,
    h: 1,
    rotatable: true,
    collision: 'solid',
    behavior: 'conveyor',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#7fb069',
    params: { speed: 1.5 },
  },
  {
    id: 'launch',
    category: 'movement',
    name: 'Launch Pad',
    description: 'One big diagonal shove in the direction it is facing.',
    w: 2,
    h: 1,
    rotatable: true,
    collision: 'solid',
    behavior: 'launch',
    rarity: 'uncommon',
    riskLevel: 2,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#d9a05b',
    params: { power: 8.8 },
  },
  // -------------------------------------------------------------------- traps
  {
    id: 'fake-platform',
    category: 'trap',
    name: 'Fake Platform',
    description: 'Looks exactly like a real one. Vanishes the instant it is touched.',
    w: 2,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'fake',
    rarity: 'uncommon',
    riskLevel: 3,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#a97e52',
  },
  {
    id: 'trigger-trap',
    category: 'trap',
    name: 'Triggered Spikes',
    description: 'A normal-looking step - until someone lands on it and spikes pop up.',
    w: 2,
    h: 1,
    rotatable: false,
    collision: 'solid',
    behavior: 'triggerTrap',
    rarity: 'rare',
    riskLevel: 3,
    requiresSupportBelow: false,
    maxPerPlayer: 1,
    color: '#a97e52',
    params: { delay: 16 },
  },
  // ----------------------------------------------------------------- utility
  {
    id: 'checkpoint',
    category: 'utility',
    name: 'Checkpoint',
    description: 'Whoever touches it respawns here instead of back at the start.',
    w: 1,
    h: 2,
    rotatable: false,
    collision: 'trigger',
    behavior: 'checkpoint',
    rarity: 'uncommon',
    riskLevel: 1,
    requiresSupportBelow: true,
    maxPerPlayer: 1,
    color: '#4fb0a5',
  },
  {
    id: 'wall',
    category: 'utility',
    name: 'Wall',
    description: 'Solid top to bottom. Blocks a route rather than extending one.',
    w: 1,
    h: 3,
    rotatable: false,
    collision: 'solid',
    behavior: 'static',
    rarity: 'common',
    riskLevel: 1,
    requiresSupportBelow: false,
    maxPerPlayer: 2,
    color: '#8d8578',
    blocksHorizontal: true,
  },
]

const BY_ID = new Map(PIECES.map((p) => [p.id, p]))

export function pieceById(id: string): PieceDef {
  const p = BY_ID.get(id)
  if (!p) throw new Error(`unknown piece ${id}`)
  return p
}

/**
 * Deals a player the piece *types* they may build with this round - not
 * consumable cards, just an unlocked palette. `maxPerPlayer` on each piece
 * still caps how many of it they can actually place. Every hand guarantees at
 * least a small platform, so nobody is ever stuck holding only hazards.
 */
export function draftHand(rand: () => number, size = 6, chaos = false): string[] {
  const ids = new Set<string>(['platform-small'])
  const weight = (p: PieceDef) =>
    (p.rarity === 'common' ? 5 : p.rarity === 'uncommon' ? 3 : 1) * (chaos && p.rarity !== 'common' ? 1.7 : 1)
  let guard = 0
  while (ids.size < Math.min(size, PIECES.length) && guard++ < 200) {
    const total = PIECES.reduce((s, p) => s + weight(p), 0)
    let r = rand() * total
    let picked = PIECES[PIECES.length - 1]
    for (const p of PIECES) {
      r -= weight(p)
      if (r <= 0) {
        picked = p
        break
      }
    }
    ids.add(picked.id)
  }
  return [...ids]
}
