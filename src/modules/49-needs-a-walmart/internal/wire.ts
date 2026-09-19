/**
 * One game, on the wire.
 *
 * The host sends the clock and every player - where they are, which way they
 * face, what is in their trolley, when they got through, when they last rammed
 * and until when they are knocked silly - and where every item is. **The lists
 * and the shelves are not sent**: the seed and the headcount make them, on every
 * screen, and the items keep the order they were stocked in.
 *
 * A guest sends what its hands are doing: which way it walks, and its clicks and
 * its rams as running counts, so a repeated message never doubles one and a
 * lost one never loses one.
 */
import { MAX_PLAYERS } from './setup'
import { ROUND, freshItems, type Game, type Player } from './rules'
import { STORE, listsFor, stockFor } from './store'

export const SNAPSHOT_TAG = 'nw'
export const INTENT_TAG = 'nw-in'

/** `[id, x cm, z cm, yaw mrad, trolley by item, done at cs or -1, rammed at cs or -1, stunned until cs or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number[], number, number, number, number]
/** `[x cm, z cm, 1 on its shelf]` - where an item is when it is not in a trolley. */
export type WireItem = [number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
  items: WireItem[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const cs = (v: number) => (Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : -1)
const LATEST = (ROUND.limit + 5) * 100

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, cm(p.x), cm(p.z), Math.round(p.yaw * 1000), [...p.cart], p.doneAt === null ? -1 : cm(p.doneAt), cs(p.ramAt), cs(p.stunUntil), p.left ? 1 : 0]),
    i: game.items.map((it): WireItem => [cm(it.x), cm(it.z), it.shelf ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  const stocked = stockFor(message.s as number, count).length
  if (!Array.isArray(message.i) || message.i.length !== stocked) return null
  const inCarts = new Set<number>()
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 9) return null
    const [id, x, z, yaw, cart, doneAt, ramAt, stunUntil, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > STORE.halfX * 100 || !isInt(z) || Math.abs(z) > STORE.halfZ * 100 || !isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!Array.isArray(cart) || cart.length > 3 || !cart.every((i) => isCount(i) && i < stocked && !inCarts.has(i))) return null
    for (const i of cart) inCarts.add(i)
    for (const t of [doneAt, ramAt, stunUntil]) if (!isInt(t) || t < -1 || t > LATEST) return null
    if (flags !== 0 && flags !== 1) return null
    players.push([id, x, z, yaw, cart, doneAt, ramAt, stunUntil, flags])
  }
  const items: WireItem[] = []
  for (const raw of message.i) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [x, z, shelf] = raw
    if (!isInt(x) || Math.abs(x) > STORE.halfX * 100 || !isInt(z) || Math.abs(z) > STORE.halfZ * 100 || (shelf !== 0 && shelf !== 1)) return null
    items.push([x, z, shelf])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players, items }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. Everything is the host's; a guest's own player is eased towards
 * where the host has it by the caller, and its facing is its own.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  const fresh = game.id !== snap.id || game.items.length !== snap.items.length
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (fresh) game.items = freshItems(snap.seed, snap.players.length)
  const lists = listsFor(snap.seed, snap.players.length)
  game.players = snap.players.map(([id, x, z, yaw, cart, doneAt, ramAt, stunUntil, flags], index) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      x: 0,
      z: 0,
      yaw: 0,
      mx: 0,
      mz: 0,
      kx: 0,
      kz: 0,
      list: [],
      cart: [],
      doneAt: null,
      ramAt: -Infinity,
      stunUntil: -Infinity,
      hit: [],
      left: false,
      leftAt: null,
    }
    player.mine = id === me
    Object.assign(player, {
      x: x / 100,
      z: z / 100,
      list: lists[index],
      cart: [...cart],
      doneAt: doneAt < 0 ? null : doneAt / 100,
      ramAt: ramAt < 0 ? -Infinity : ramAt / 100,
      stunUntil: stunUntil < 0 ? -Infinity : stunUntil / 100,
      left: flags === 1,
    })
    if (!player.mine || !known) player.yaw = yaw / 1000
    return player
  })
  const holders = new Map<number, number>()
  game.players.forEach((p, index) => p.cart.forEach((i) => holders.set(i, index)))
  snap.items.forEach(([x, z, shelf], i) => {
    Object.assign(game.items[i], { x: x / 100, z: z / 100, shelf: shelf === 1, holder: holders.get(i) ?? null })
  })
  return game
}

export interface Intent {
  game: number
  mx: number
  mz: number
  /** Every click so far this game. */
  clicks: number
  /** Every ram so far this game. */
  rams: number
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, x: fixed(i.mx), z: fixed(i.mz), c: i.clicks, r: i.rams }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isCount(message.c) || !isCount(message.r)) return null
  if (Math.abs(message.x) > 1.01 || Math.abs(message.z) > 1.01) return null
  return { game: message.g as number, mx: message.x, mz: message.z, clicks: message.c, rams: message.r }
}
