/**
 * The rules of Breaking the Ice, as arithmetic.
 *
 * Three square layers of ice tiles, stacked over the sea and centred on the
 * same spot. Wherever you walk, the tile under your feet cracks - the
 * instant you first stand on it, not before - and three seconds later it is
 * gone, whether you are still on it or not. Get pushed, or simply linger, on
 * a tile that gives way and you lose your footing - a short beat later
 * gravity takes you, and you fall until you land on a solid tile of the
 * layer below, or - off the bottom layer - into the sea. The iceberg keeps
 * shrinking as the round runs on, fastest and soonest on the layer nearest
 * the sea. Last one standing wins.
 *
 * No three.js, no React, no clock of its own. `stepRound` takes a round,
 * what everybody is pressing and how long since last time, and gives back
 * the round a moment later. Whose intent came from a keyboard, another
 * browser or the stand-ins is not something it knows.
 *
 * World axes as the rest of the island: +Y up, -Z north. Unlike the flat
 * arenas of the other minigames, this one actually climbs - a tile's height
 * is the world's own y, not stood up from a flat x/y the way Punch Buggy's is.
 */
import { PLAYER } from '../../02-player'

/** One tile address space, shared by every layer so they sit concentric. */
export const DIM = 9
/** A tile's edge, in metres. */
export const CELL = 2.4

/** The three layers, biggest and highest first. The last one sits at sea level. */
export const LAYERS = [
  { size: 9, y: 6 },
  { size: 7, y: 3 },
  { size: 5, y: 0 },
] as const

export const TILES_PER_LAYER = DIM * DIM
export const TILE_COUNT = TILES_PER_LAYER * LAYERS.length

/** How long a tile holds once somebody has stood on it, before it is gone. */
export const CRACK_TIME = 3

/**
 * When each layer's outer rings force-break, one ring at a time - a pure
 * function of the clock, so nobody has to send it over the wire. The bottom
 * layer starts soonest and finishes soonest, per the brief: lower floors are
 * smaller and frailer than the ones above.
 */
const SHRINK_AT: readonly (readonly number[])[] = [
  [26, 42, 56, 68],
  [18, 30, 40],
  [9, 17],
]

export const MOVE = {
  /** Ground speed, metres a second. */
  speed: 7.5,
  /** How much of it you keep while stunned by a push. */
  stunPace: 0.3,
  jumpSpeed: PLAYER.jumpSpeed,
  gravity: PLAYER.gravity,
  /** A body's radius, the island pill's own, so a push lands where it looks like it does. */
  body: PLAYER.radius,
  /**
   * Seconds a tile that has just given way under you still holds - not the
   * crack warning, which is much longer, but the last instant of coyote time
   * before gravity actually takes hold.
   */
  hang: 0.15,
  /** How far below the bottom layer's height counts as gone for good. */
  void: 1.6,
} as const

export const PUSH = {
  reach: 1.9,
  /** Half the angle, either side of where you face, that a push reaches. */
  cone: 0.6,
  impulse: 7,
  /** Seconds the person pushed cannot fully steer themselves. */
  stun: 0.3,
  /** How fast the knockback itself dies away. */
  decay: 8,
  cooldown: 0.6,
} as const

export const ROUND = {
  /** Safety net: however few have fallen, the round ends here. */
  limit: 150,
  /** Seconds after it is decided before the round is actually over - long enough to watch the last fall. */
  outro: 1.4,
} as const

/** Which way is "ahead" at a given yaw. Matches the camera: behind is the opposite. */
export function forward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

/** Ahead, turned a quarter turn clockwise seen from above - a strafe to the right. */
export function rightOf(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) }
}

export function tileIndex(layer: number, row: number, col: number): number {
  return layer * TILES_PER_LAYER + row * DIM + col
}

/** Whether `(row, col)` is inside the smaller, centred grid a given layer actually uses. */
export function inFootprint(layer: 0 | 1 | 2, row: number, col: number): boolean {
  const off = (DIM - LAYERS[layer].size) / 2
  return row >= off && row < DIM - off && col >= off && col < DIM - off
}

export function tileCentre(row: number, col: number): { x: number; z: number } {
  const mid = (DIM - 1) / 2
  return { x: (col - mid) * CELL, z: (row - mid) * CELL }
}

/** The tile nearest a world point - not necessarily one that exists on every layer. */
export function tileAt(x: number, z: number): { row: number; col: number } {
  const mid = (DIM - 1) / 2
  return { row: Math.round(z / CELL + mid), col: Math.round(x / CELL + mid) }
}

/** How many of a layer's outer rings are gone by `elapsed` - a pure function of the clock. */
export function ringsGoneAt(layer: 0 | 1 | 2, elapsed: number): number {
  let gone = 0
  for (const at of SHRINK_AT[layer]) if (elapsed >= at) gone += 1
  return gone
}

/** How far `(row, col)` sits from the centre of its own layer, in whole rings. */
export function ringOf(layer: 0 | 1 | 2, row: number, col: number): number {
  const off = (DIM - LAYERS[layer].size) / 2
  const mid = (LAYERS[layer].size - 1) / 2
  return Math.max(Math.abs(row - off - mid), Math.abs(col - off - mid))
}

/** Whether the shrink alone has claimed this tile by `elapsed` - never sent over the wire. */
export function shrunk(layer: 0 | 1 | 2, row: number, col: number, elapsed: number): boolean {
  const maxRing = Math.floor(LAYERS[layer].size / 2)
  const gone = ringsGoneAt(layer, elapsed)
  return ringOf(layer, row, col) > maxRing - gone
}

/** Per-tile state the rules keep beyond the shrink: only what a player has actually done to it. */
export interface Tiles {
  /** Round-seconds a tile first had somebody stand on it, or `null`. Fixes its fuse. */
  crackedAt: (number | null)[]
}

export function createTiles(): Tiles {
  return { crackedAt: new Array(TILE_COUNT).fill(null) }
}

/** Whether `(layer, row, col)` is broken - by the shrink, or by its own crack running out. */
export function broken(tiles: Tiles, layer: 0 | 1 | 2, row: number, col: number, elapsed: number): boolean {
  if (!inFootprint(layer, row, col)) return true
  if (shrunk(layer, row, col, elapsed)) return true
  const at = tiles.crackedAt[tileIndex(layer, row, col)]
  return at !== null && elapsed >= at + CRACK_TIME
}

/** Whether `(layer, row, col)` is cracked but not yet broken - a warning to get off it. */
export function cracked(tiles: Tiles, layer: 0 | 1 | 2, row: number, col: number, elapsed: number): boolean {
  const i = tileIndex(layer, row, col)
  return tiles.crackedAt[i] !== null && !broken(tiles, layer, row, col, elapsed)
}

export interface Player {
  id: string
  x: number
  z: number
  y: number
  vy: number
  yaw: number
  layer: 0 | 1 | 2
  grounded: boolean
  /** Coyote time left once a tile has given way under a grounded player. */
  hang: number
  alive: boolean
  eliminatedAt: number | null
  knockX: number
  knockZ: number
  stunUntil: number
  /** How many jump/push intents have been dealt with - see `Intent`. */
  jumps: number
  pushes: number
  pushAt: number
  mine: boolean
  bot: boolean
}

export interface Round {
  /** For the stand-ins' timing. */
  seed: number
  /** Tells one round from the next on the wire. */
  id: number
  tiles: Tiles
  players: Player[]
  elapsed: number
  /** When it came down to one standing, or `null` - the round runs on for `ROUND.outro` after, to watch the last fall. */
  decidedAt: number | null
  over: boolean
}

/**
 * What somebody wants this frame.
 *
 * `jumps` and `pushes` are **running counts**, not "pressed this frame" -
 * the same idea as every other minigame's click count, so a message the
 * network drops or repeats never loses or doubles an action.
 */
export interface Intent {
  /** Desired movement, already turned to face the way the camera does. */
  x: number
  z: number
  yaw: number
  jumps: number
  pushes: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/** Where everybody starts: spread round the middle of the top layer, facing outward. */
export function spawns(count: number): { x: number; z: number; yaw: number }[] {
  const ring = LAYERS[0].size * CELL * 0.28
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count
    const x = Math.sin(angle) * ring
    const z = Math.cos(angle) * ring
    return { x, z, yaw: angle + Math.PI }
  })
}

export function createRound(seed: number, entrants: readonly Entrant[], id = 1): Round {
  const starts = spawns(entrants.length)
  return {
    seed,
    id,
    tiles: createTiles(),
    elapsed: 0,
    decidedAt: null,
    over: false,
    players: entrants.map((e, i) => ({
      id: e.id,
      x: starts[i].x,
      z: starts[i].z,
      y: LAYERS[0].y,
      vy: 0,
      yaw: starts[i].yaw,
      layer: 0,
      grounded: true,
      hang: MOVE.hang,
      alive: true,
      eliminatedAt: null,
      knockX: 0,
      knockZ: 0,
      stunUntil: 0,
      jumps: 0,
      pushes: 0,
      pushAt: -Infinity,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

export function standing(round: Round): Player[] {
  return round.players.filter((p) => p.alive)
}

/** The tile under a grounded player cracks the instant they first stand on it - never twice. */
function crackUnderfoot(round: Round, p: Player): void {
  const { row, col } = tileAt(p.x, p.z)
  if (!inFootprint(p.layer, row, col)) return
  const i = tileIndex(p.layer, row, col)
  if (round.tiles.crackedAt[i] === null && !shrunk(p.layer, row, col, round.elapsed)) {
    round.tiles.crackedAt[i] = round.elapsed
  }
}

function tryPush(round: Round, p: Player): void {
  const f = forward(p.yaw)
  for (const other of round.players) {
    if (other === p || !other.alive || other.layer !== p.layer) continue
    const dx = other.x - p.x
    const dz = other.z - p.z
    const distance = Math.hypot(dx, dz)
    if (distance === 0 || distance > PUSH.reach) continue
    const along = (dx * f.x + dz * f.z) / distance
    if (along < Math.cos(PUSH.cone)) continue
    other.knockX += f.x * PUSH.impulse
    other.knockZ += f.z * PUSH.impulse
    other.stunUntil = round.elapsed + PUSH.stun
  }
}

/** Where the layer below `layer` would hold you up, if any tile of it is there and whole. */
/**
 * Where a whole tile would catch a fall from `layer` at `(x, z)` - starting
 * with `layer` itself, so a jump off solid ground lands you back on the same
 * tile you left rather than skipping straight to the one below it.
 */
function landingBelow(round: Round, x: number, z: number, layer: 0 | 1 | 2): 0 | 1 | 2 | null {
  for (let candidate = layer; candidate < LAYERS.length; candidate++) {
    const l = candidate as 0 | 1 | 2
    const { row, col } = tileAt(x, z)
    if (inFootprint(l, row, col) && !broken(round.tiles, l, row, col, round.elapsed)) return l
  }
  return null
}

function eliminate(round: Round, p: Player): void {
  p.alive = false
  p.eliminatedAt = round.elapsed
}

/**
 * One step of the round.
 *
 * Mutates and returns the same round. `dt` is clamped, so a tab back from the
 * background does not carry anybody through a floor they never touched.
 *
 * In order: jumps and pushes, each a running count dealt with one at a time,
 * pushes gated by their own cooldown; movement, camera-relative and already
 * turned before it gets here; knockback easing off; gravity and landing,
 * where standing on a whole tile cracks it and a broken one actually costs
 * you your footing; falling through the bottom layer, into the sea. The
 * round ends `ROUND.outro` after one is left standing, or at `ROUND.limit`.
 */
export function stepRound(round: Round, intents: ReadonlyMap<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05)
  round.elapsed += step

  if (round.decidedAt !== null) {
    if (round.elapsed - round.decidedAt >= ROUND.outro) round.over = true
    return round
  }

  for (const p of round.players) {
    const intent = intents.get(p.id)
    if (!intent || !p.alive) continue
    while (p.pushes < intent.pushes && round.elapsed - p.pushAt >= PUSH.cooldown) {
      p.pushes += 1
      p.pushAt = round.elapsed
      tryPush(round, p)
    }
    while (p.jumps < intent.jumps) {
      p.jumps += 1
      if (p.grounded) {
        p.grounded = false
        p.vy = MOVE.jumpSpeed
      }
    }
  }

  for (const p of round.players) {
    const intent = intents.get(p.id)
    if (!p.alive) continue
    if (intent) p.yaw = intent.yaw
    const stunned = round.elapsed < p.stunUntil
    if (intent) {
      const length = Math.hypot(intent.x, intent.z)
      const pace = MOVE.speed * (stunned ? MOVE.stunPace : 1) * step
      if (length > 0) {
        p.x += (intent.x / length) * pace
        p.z += (intent.z / length) * pace
      }
    }
    const decay = Math.exp(-PUSH.decay * step)
    p.x += p.knockX * step
    p.z += p.knockZ * step
    p.knockX *= decay
    p.knockZ *= decay
  }

  for (const p of round.players) {
    if (!p.alive) continue
    if (p.grounded) {
      crackUnderfoot(round, p)
      const { row, col } = tileAt(p.x, p.z)
      if (inFootprint(p.layer, row, col) && !broken(round.tiles, p.layer, row, col, round.elapsed)) {
        p.hang = MOVE.hang
        continue
      }
      if (p.hang > 0) {
        p.hang -= step
        continue
      }
      p.grounded = false
      p.vy = 0
    }
    p.vy += MOVE.gravity * step
    p.y += p.vy * step
    if (p.vy > 0) continue
    const landing = landingBelow(round, p.x, p.z, p.layer)
    if (landing !== null && p.y <= LAYERS[landing].y) {
      p.layer = landing
      p.y = LAYERS[landing].y
      p.vy = 0
      p.grounded = true
      p.hang = MOVE.hang
    } else if (p.y <= LAYERS[LAYERS.length - 1].y - MOVE.void) {
      eliminate(round, p)
    }
  }

  const left = standing(round).length
  if ((round.players.length > 1 && left <= 1) || left === 0) {
    round.decidedAt = round.elapsed
  } else if (round.elapsed >= ROUND.limit) {
    round.over = true
    round.elapsed = ROUND.limit
  }
  return round
}

export function timeLeft(round: Round): number {
  return Math.max(0, ROUND.limit - round.elapsed)
}

/**
 * Everybody, best first, with their place.
 *
 * Whoever is still standing shares first. Everybody else is ranked by how
 * long they lasted, and anyone who never fell outranks anyone who did, even
 * if the clock catches both at the same layer.
 */
export function placings(round: Round): { player: Player; index: number; place: number }[] {
  const score = (p: Player) => (p.alive ? Infinity : (p.eliminatedAt ?? 0))
  const ranked = round.players.map((player, index) => ({ player, index })).sort((a, b) => score(b.player) - score(a.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.player) > score(entry.player)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
