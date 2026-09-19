/**
 * One game, on the wire.
 *
 * The host sends the clock; every player - where they are, which way they aim,
 * what is in their arms, when they were eliminated and by whom, how many they
 * have eliminated, whether they have left; every piece - where it is and whether
 * it is loose, carried or on a desk; every rocket in the air; and the last
 * second of blasts. The office is not sent: the seed makes it.
 *
 * A guest sends where it is and which way it aims, twenty times a second, and
 * each thing it does the moment it does it - picks up, puts down, places, fires -
 * with where it stood. The host decides whether that happened.
 */
import { OFFICE } from './office'
import { MAX_PLAYERS } from './setup'
import { BLAST_LIFE, PIECES_EACH, ROCKET, ROUND, type Blast, type FireClaim, type Game, type Piece, type PieceState, type Player, type Rocket } from './rules'

export const SNAPSHOT_TAG = 'ijw'
export const MOVE_TAG = 'ijw-mv'
export const ACT_TAG = 'ijw-act'

/** `[id, x cm, z cm, yaw mrad, out cs or -1, by or -1, kills, flags: 1 left, carrying or -1, desk slot]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number]
/** `[x cm, z cm, state]`, in piece order. */
export type WirePiece = [number, number, number]
/** `[seq, by, x cm, z cm, yaw mrad, range left cm]`. */
export type WireRocket = [number, number, number, number, number, number]
/** `[seq, by, x cm, z cm, who it took as bits]`. */
export type WireBlast = [number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
  pieces: WirePiece[]
  rockets: WireRocket[]
  blasts: WireBlast[]
}

const MAX_ROCKETS = 24
const MAX_BLASTS = 16

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
/** How far from the middle anything can be, centimetres: the wall's outer face. */
const REACH_X = (OFFICE.halfX + OFFICE.wallThickness) * 100
const REACH_Z = (OFFICE.halfZ + OFFICE.wallThickness) * 100
const cm = (v: number) => Math.round(v * 100)
const onFloor = (x: unknown, z: unknown) => isInt(x) && Math.abs(x) <= REACH_X && isInt(z) && Math.abs(z) <= REACH_Z

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map(
      (p): WirePlayer => [p.id, cm(p.x), cm(p.z), Math.round(p.yaw * 1000), p.out === null ? -1 : cm(p.out), p.by ?? -1, p.kills, p.left ? 1 : 0, p.carrying, p.slot],
    ),
    k: game.pieces.map((it): WirePiece => [cm(it.x), cm(it.z), it.state]),
    r: game.rockets.slice(-MAX_ROCKETS).map((r): WireRocket => [r.seq, r.by, cm(r.x), cm(r.z), Math.round(r.yaw * 1000), cm(r.left)]),
    b: game.blasts
      .filter((b) => game.elapsed - b.at <= BLAST_LIFE)
      .slice(-MAX_BLASTS)
      .map((b): WireBlast => [b.seq, b.by, cm(b.x), cm(b.z), b.victims.reduce((bits, v) => bits | (1 << v), 0)]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  if (!Array.isArray(message.k) || message.k.length !== count * PIECES_EACH) return null
  if (!Array.isArray(message.r) || message.r.length > MAX_ROCKETS) return null
  if (!Array.isArray(message.b) || message.b.length > MAX_BLASTS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 10) return null
    const [id, x, z, yaw, out, by, kills, flags, carrying, slot] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!onFloor(x, z) || !isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!(out === -1 || (isCount(out) && out <= (ROUND.limit + 1) * 100))) return null
    if (!isInt(by) || by < -1 || by >= count || !isCount(kills) || kills > MAX_PLAYERS || (flags !== 0 && flags !== 1)) return null
    if (!isInt(carrying) || carrying < -1 || carrying >= count * PIECES_EACH || !isCount(slot) || slot >= 8) return null
    players.push([id, x, z, yaw, out, by, kills, flags, carrying, slot])
  }
  const pieces: WirePiece[] = []
  for (const raw of message.k) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [x, z, state] = raw
    if (!onFloor(x, z) || (state !== 0 && state !== 1 && state !== 2)) return null
    pieces.push([x, z, state])
  }
  const rockets: WireRocket[] = []
  for (const raw of message.r) {
    if (!Array.isArray(raw) || raw.length !== 6 || !raw.every(isInt)) return null
    const [seq, by, x, z, yaw, left] = raw as WireRocket
    if (seq <= 0 || by < 0 || by >= count || !onFloor(x, z) || Math.abs(yaw) > 3200 || left < 0 || left > ROCKET.range * 100) return null
    rockets.push(raw as WireRocket)
  }
  const blasts: WireBlast[] = []
  for (const raw of message.b) {
    if (!Array.isArray(raw) || raw.length !== 5 || !raw.every(isInt)) return null
    const [seq, by, x, z, bits] = raw as WireBlast
    if (seq <= 0 || by < 0 || by >= count || !onFloor(x, z) || bits < 0 || bits >= 1 << count) return null
    blasts.push(raw as WireBlast)
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players, pieces, rockets, blasts }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. While the game is on, a guest's own player stays where its own
 * screen has it and takes from the host only being eliminated, kills and
 * leaving. With `hold` - just after it picked something up, put it down or
 * placed it, before the host can have heard - its own pieces and what is in its
 * arms stay as its screen has them too. Rockets are the host's; a guest's own,
 * drawn the moment it fired, is let go of once the host's arrives.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string, hold = false): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.pieces = []
    game.rockets = []
    game.blasts = []
    game.seq = 0
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  const heardUpTo = game.seq

  const next: Player[] = []
  for (const [id, x, z, yaw, out, by, kills, flags, carrying, slot] of snap.players) {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      slot,
      x: x / 100,
      z: z / 100,
      yaw: yaw / 1000,
      carrying: -1,
      out: null,
      by: null,
      kills: 0,
      firedAt: -Infinity,
      left: false,
      leftAt: null,
    }
    player.mine = id === me
    player.slot = slot
    const shared = { out: out < 0 ? null : out / 100, by: by < 0 ? null : by, kills, left: flags === 1 }
    const stillMine = player.mine && !!known && !snap.over
    if (stillMine) Object.assign(player, shared, hold && player.out === null && shared.out === null ? {} : { carrying })
    else Object.assign(player, shared, { x: x / 100, z: z / 100, yaw: yaw / 1000, carrying })
    next.push(player)
  }
  game.players = next
  const mine = next.findIndex((p) => p.mine)

  const old = game.pieces
  game.pieces = snap.pieces.map(([x, z, state], i): Piece => {
    const owner = Math.floor(i / PIECES_EACH)
    const kept = old[i]
    if (hold && owner === mine && kept && !snap.over) return kept
    return { owner, part: i % PIECES_EACH, x: x / 100, z: z / 100, state: state as PieceState }
  })

  let mineHeard = false
  const rockets: Rocket[] = snap.rockets.map(([seq, by, x, z, yaw, left]) => {
    if (by === mine && seq > heardUpTo) mineHeard = true
    return { seq, by, x: x / 100, z: z / 100, yaw: yaw / 1000, left: left / 100, at: game.rockets.find((r) => r.seq === seq)?.at ?? game.elapsed }
  })
  for (const [seq, by, x, z, bits] of snap.blasts) {
    if (seq <= heardUpTo) continue
    if (by === mine) mineHeard = true
    const victims = snap.players.map((_, i) => i).filter((i) => (bits >> i) & 1)
    const blast: Blast = { seq, by, x: x / 100, z: z / 100, victims, at: game.elapsed }
    game.blasts.push(blast)
  }
  const ownDrawn = game.rockets.filter((r) => r.seq === 0 && !mineHeard)
  game.rockets = [...rockets, ...ownDrawn]
  game.seq = Math.max(heardUpTo, ...snap.rockets.map((r) => r[0]), ...snap.blasts.map((b) => b[0]))
  return game
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeMove(game: number, p: Pick<Player, 'x' | 'z' | 'yaw'>): Record<string, unknown> {
  return { t: MOVE_TAG, g: game, x: fixed(p.x), z: fixed(p.z), y: fixed(p.yaw) }
}

export function decodeMove(message: Record<string, unknown>): { game: number; x: number; z: number; yaw: number } | null {
  if (message.t !== MOVE_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y)) return null
  if (Math.abs(message.x) > OFFICE.halfX || Math.abs(message.z) > OFFICE.halfZ || Math.abs(message.y) > 4) return null
  return { game: message.g as number, x: message.x, z: message.z, yaw: message.y }
}

export type ActKind = 'pick' | 'place' | 'drop' | 'fire'
const ACTS: readonly ActKind[] = ['pick', 'place', 'drop', 'fire']

export interface Act extends FireClaim {
  game: number
  kind: ActKind
  /** The piece picked up, or -1. */
  piece: number
}

export function encodeAct(a: Act): Record<string, unknown> {
  return { t: ACT_TAG, g: a.game, k: a.kind, n: a.piece, x: fixed(a.x), z: fixed(a.z), y: fixed(a.yaw) }
}

export function decodeAct(message: Record<string, unknown>): Act | null {
  if (message.t !== ACT_TAG) return null
  const move = decodeMove({ ...message, t: MOVE_TAG })
  if (!move || !ACTS.includes(message.k as ActKind) || !isInt(message.n) || message.n < -1 || message.n >= MAX_PLAYERS * PIECES_EACH) return null
  return { game: move.game, kind: message.k as ActKind, piece: message.n, x: move.x, z: move.z, yaw: move.yaw }
}
