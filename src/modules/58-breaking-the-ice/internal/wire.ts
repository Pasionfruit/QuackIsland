/**
 * One round, on the wire.
 *
 * The host runs the round and sends where everybody is; a guest sends its
 * camera-relative movement and yaw, plus **how many times it has broken,
 * jumped and pushed, ever** - running counts, the same idea as every other
 * minigame's click count, so a dropped or repeated message never loses or
 * doubles an action.
 *
 * Tile damage is separate from player position, and sent far less often: the
 * shrink is a pure function of the clock, so it is never sent at all - only
 * the **sparse set of tiles a player has actually cracked or broken** goes
 * over the wire, and only the ones the shrink has not already claimed on its
 * own, since every client works that part out for itself. The set only ever
 * shrinks as the round goes on. See `useIceNet.ts` for when each goes out.
 */
import { DIM, LAYERS, shrunk, tileIndex, type Intent, type Player, type Round } from './rules'

export const SNAPSHOT_TAG = 'bti'
export const TILE_TAG = 'bti-t'
export const INTENT_TAG = 'bti-in'

/** `[id, x cm, z cm, y cm, yaw mrad, layer, grounded, alive, eliminatedAt cs]`. */
export type WirePlayer = [string, number, number, number, number, 0 | 1 | 2, 0 | 1, 0 | 1, number]

/** `[tileIndex, code(1 cracked, 2 broken), at cs]`. */
export type WireTile = [number, 1 | 2, number]

export interface Snapshot {
  id: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
}

export interface TileSync {
  id: number
  tiles: WireTile[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const cm = (n: number) => Math.round(n * 100)
const mrad = (n: number) => Math.round(n * 1000)
const cs = (n: number) => Math.round(n * 100)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    e: r2(round.elapsed),
    o: round.over ? 1 : 0,
    p: round.players.map(
      (p): WirePlayer => [
        p.id,
        cm(p.x),
        cm(p.z),
        cm(p.y),
        mrad(p.yaw),
        p.layer,
        p.grounded ? 1 : 0,
        p.alive ? 1 : 0,
        p.eliminatedAt === null ? -1 : cs(p.eliminatedAt),
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 9) return null
    const [id, x, z, y, yaw, layer, grounded, alive, eliminatedAt] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, z, y, yaw, eliminatedAt].every(isNumber)) return null
    if (layer !== 0 && layer !== 1 && layer !== 2) return null
    if (grounded !== 0 && grounded !== 1) return null
    if (alive !== 0 && alive !== 1) return null
    players.push([id, x, z, y, yaw, layer, grounded, alive, eliminatedAt])
  }
  return { id: message.g as number, elapsed: message.e, over: message.o === 1, players }
}

/** Every tile a player has marked that the shrink has not already independently claimed. */
export function sparseDamage(round: Round): WireTile[] {
  const out: WireTile[] = []
  for (let layer = 0; layer < LAYERS.length; layer++) {
    const l = layer as 0 | 1 | 2
    for (let row = 0; row < DIM; row++) {
      for (let col = 0; col < DIM; col++) {
        const i = tileIndex(l, row, col)
        const instant = round.tiles.instantAt[i]
        const crackedAt = round.tiles.crackedAt[i]
        if (instant === null && crackedAt === null) continue
        if (shrunk(l, row, col, round.elapsed)) continue
        if (instant !== null) out.push([i, 2, cs(instant)])
        else out.push([i, 1, cs(crackedAt as number)])
      }
    }
  }
  return out
}

export function encodeTiles(round: Round): Record<string, unknown> {
  return { t: TILE_TAG, g: round.id, d: sparseDamage(round) }
}

export function decodeTiles(message: Record<string, unknown>): TileSync | null {
  if (message.t !== TILE_TAG) return null
  if (!isCount(message.g)) return null
  if (!Array.isArray(message.d) || message.d.length > 243) return null
  const tiles: WireTile[] = []
  for (const raw of message.d) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [index, code, at] = raw
    if (!isCount(index) || index >= 243) return null
    if (code !== 1 && code !== 2) return null
    if (!isCount(at)) return null
    tiles.push([index, code, at])
  }
  return { id: message.g as number, tiles }
}

/** Applies a tile sync onto a round's own tile state - a monotonic merge, never a full replace. */
export function applyTiles(round: Round, sync: TileSync): Round {
  if (round.id !== sync.id) return round
  for (const [index, code, at] of sync.tiles) {
    const seconds = at / 100
    if (code === 2) round.tiles.instantAt[index] = seconds
    else round.tiles.crackedAt[index] = seconds
  }
  return round
}

/**
 * A guest's intent, for one round.
 *
 * The round is part of it because every count starts again at zero every
 * round: a guest still repeating last round's count of five breaks, as the
 * next round starts, must not throw five breaks into it.
 */
export function encodeIntent(intent: Intent, round: number): Record<string, unknown> {
  return {
    t: INTENT_TAG,
    r: round,
    x: r2(intent.x),
    z: r2(intent.z),
    w: mrad(intent.yaw),
    b: intent.breaks,
    j: intent.jumps,
    u: intent.pushes,
  }
}

export function decodeIntent(message: Record<string, unknown>): { round: number; intent: Intent } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.r) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.w)) return null
  if (!isCount(message.b) || !isCount(message.j) || !isCount(message.u)) return null
  const length = Math.hypot(message.x, message.z)
  const scale = length > 1 ? 1 / length : 1
  const yaw = Math.atan2(Math.sin(message.w / 1000), Math.cos(message.w / 1000))
  const intent: Intent = { x: message.x * scale, z: message.z * scale, yaw, breaks: message.b, jumps: message.j, pushes: message.u }
  return { round: message.r as number, intent }
}

/**
 * Brings a guest's copy of the players into line with the host's. Players are
 * updated in place - the scene keeps a body per player - and a new id is a
 * new round, which also clears everybody's marks off the ice.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) {
    round.players = []
    round.tiles.crackedAt.fill(null)
    round.tiles.instantAt.fill(null)
  }
  round.id = snap.id
  round.elapsed = snap.elapsed
  round.over = snap.over
  const seen = new Set<string>()
  for (const [id, x, z, y, yaw, layer, grounded, alive, eliminatedAt] of snap.players) {
    seen.add(id)
    let p: Player | undefined = round.players.find((each) => each.id === id)
    if (!p) {
      p = {
        id, x, z, y, vy: 0, yaw, layer, grounded: true, hang: 0, alive: true, eliminatedAt: null,
        knockX: 0, knockZ: 0, stunUntil: 0, breaks: 0, jumps: 0, pushes: 0, breakAt: -Infinity, pushAt: -Infinity,
        mine: false, bot: false,
      }
      round.players.push(p)
    }
    Object.assign(p, {
      x: x / 100,
      z: z / 100,
      y: y / 100,
      yaw: yaw / 1000,
      layer,
      grounded: grounded === 1,
      alive: alive === 1,
      eliminatedAt: eliminatedAt < 0 ? null : eliminatedAt / 100,
      mine: id === me,
    })
  }
  round.players = round.players.filter((p) => seen.has(p.id))
  return round
}
