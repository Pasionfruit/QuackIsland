/**
 * The rules of This Place Needs A Walmart, as arithmetic.
 *
 * Everybody against everybody in a supermarket, each pushing a trolley with a
 * grocery list of three things. **Sprint round the aisles, pick your three
 * things up and get through a checkout** - first through wins.
 *
 * - **A click picks up** the nearest thing in reach, off a shelf or off the
 *   floor, into your trolley. **A trolley holds three.** With nothing in reach -
 *   or a full trolley - a click **puts something back**: the newest thing in it
 *   you do not need, or failing that the newest, on the floor in front of you.
 * - **Space rams your trolley forward.** Hit somebody with it and they are
 *   knocked flying and **the newest thing in their trolley spills out** onto the
 *   floor, for anybody to grab.
 * - **Down a checkout lane with all three things on your list** and you are
 *   through, in that order. It ends when three are through, when all but one
 *   are, 25 seconds after the first, or at three minutes; after those through,
 *   whoever has more of their list places higher, then whoever is nearer a till.
 *
 * Everything here is pure.
 */
import { LANES, LIST_SIZE, SLOTS, collide, floorSpot, inLane, listsFor, spawnPoint, stockFor } from './store'

export const BODY = {
  /** A shopper and their trolley, as one round body. */
  radius: 0.55,
  /** Metres a second: a sprint. */
  speed: 5.5,
} as const

export const CART = {
  /** How many things a trolley holds. */
  size: LIST_SIZE,
  /** How far away a thing can be picked up from, middle to middle. */
  reach: 1.5,
  /** How far in front of you a thing is put down. */
  put: 1.1,
} as const

export const RAM = {
  /** How hard Space shoves the trolley forward, metres a second. */
  impulse: 11,
  /** How long after the shove it still knocks into people, seconds. */
  window: 0.45,
  /** Seconds between rams. */
  cooldown: 1.6,
  /** How hard it knocks whoever it hits, and for how long they cannot do anything. */
  knock: 9,
  stun: 0.9,
  /** How quickly a knock wears off, per second. */
  drag: 4,
} as const

export const ROUND = {
  /** It ends when this many are through. */
  podium: 3,
  /** Or this long after the first is through. */
  after: 25,
  /** Or at this. */
  limit: 180,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Radians, facing (-sin yaw, -cos yaw): the way they last walked. */
  yaw: number
  mx: number
  mz: number
  /** Knocked, or ramming: velocity wearing off. */
  kx: number
  kz: number
  /** Their grocery list: three kinds. */
  list: number[]
  /** What is in their trolley, by item, oldest first. */
  cart: number[]
  /** When they got through the checkout, or null. */
  doneAt: number | null
  /** When they last rammed, and until when they are knocked silly. */
  ramAt: number
  stunUntil: number
  /** Who they have hit with the ram they are on, by index. */
  hit: number[]
  left: boolean
  leftAt: number | null
}

/** One thing in the store: what it is, and where - on its shelf, on the floor, or in somebody's trolley. */
export interface Item {
  kind: number
  x: number
  z: number
  shelf: boolean
  /** Whose trolley it is in, by player index, or null. */
  holder: number | null
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
  items: Item[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The items as they are at the start, stocked on their shelves. */
export function freshItems(seed: number, count: number): Item[] {
  return stockFor(seed, count).map((s) => ({ kind: s.kind, x: SLOTS[s.slot].x, z: SLOTS[s.slot].z, shelf: true, holder: null }))
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const lists = listsFor(seed, entrants.length)
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    items: freshItems(seed, entrants.length),
    players: entrants.map((e, index) => {
      const at = spawnPoint(index, entrants.length)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        yaw: at.yaw,
        mx: 0,
        mz: 0,
        kx: 0,
        kz: 0,
        list: lists[index],
        cart: [],
        doneAt: null,
        ramAt: -RAM.cooldown,
        stunUntil: -Infinity,
        hit: [],
        left: false,
        leftAt: null,
      }
    }),
  }
}

/** Still shopping: not through, not gone. */
export function isShopping(p: Player): boolean {
  return p.doneAt === null && !p.left
}

export function stunned(game: Game, p: Player): boolean {
  return game.elapsed < p.stunUntil
}

export function canAct(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && isShopping(p) && !stunned(game, p)
}

/** Which kinds on a player's list are not in their trolley yet. */
export function stillNeeds(game: Game, p: Player): number[] {
  const have = p.cart.map((i) => game.items[i].kind)
  const needs: number[] = []
  for (const kind of p.list) {
    const at = have.indexOf(kind)
    if (at >= 0) have.splice(at, 1)
    else needs.push(kind)
  }
  return needs
}

/** How many things on their list a player has in their trolley. */
export function gotten(game: Game, p: Player): number {
  return LIST_SIZE - stillNeeds(game, p).length
}

/** Which way a player wants to walk: `mx`, `mz` east and south, a length of at most one. They face it. */
export function steer(game: Game, player: number, mx: number, mz: number): void {
  const p = game.players[player]
  if (!p || !isShopping(p)) return
  let x = clamp(mx, -1, 1)
  let z = clamp(mz, -1, 1)
  const length = Math.hypot(x, z)
  if (length > 1) {
    x /= length
    z /= length
  }
  p.mx = x
  p.mz = z
  if (length > 1e-6 && !stunned(game, p)) p.yaw = Math.atan2(-x, -z)
}

/** The nearest thing a player can reach that is not in anybody's trolley, by index, or -1. */
export function reachable(game: Game, player: number): number {
  const p = game.players[player]
  let best = -1
  let bestD: number = CART.reach
  game.items.forEach((item, i) => {
    if (item.holder !== null) return
    const d = Math.hypot(item.x - p.x, item.z - p.z)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Which of a player's trolley to put back: the newest they do not need, or the newest. By position in the trolley. */
export function toPutBack(game: Game, p: Player): number {
  const list = [...p.list]
  const spare: number[] = []
  p.cart.forEach((i, k) => {
    const at = list.indexOf(game.items[i].kind)
    if (at >= 0) list.splice(at, 1)
    else spare.push(k)
  })
  return spare.length ? spare[spare.length - 1] : p.cart.length - 1
}

/** Puts an item down on the floor near `x`, `z`. */
function drop(game: Game, item: number, x: number, z: number): void {
  const spot = floorSpot(x, z)
  Object.assign(game.items[item], { x: spot.x, z: spot.z, shelf: false, holder: null })
}

/**
 * A click: picks up the nearest thing in reach if there is room in the
 * trolley; otherwise puts something back. What it did, or null if nothing.
 */
export function click(game: Game, player: number): { took: number } | { put: number } | null {
  const p = game.players[player]
  if (!canAct(game, p)) return null
  const near = reachable(game, player)
  if (near >= 0 && p.cart.length < CART.size) {
    game.items[near].holder = player
    p.cart.push(near)
    return { took: near }
  }
  if (p.cart.length === 0) return null
  const [item] = p.cart.splice(toPutBack(game, p), 1)
  drop(game, item, p.x - Math.sin(p.yaw) * CART.put, p.z - Math.cos(p.yaw) * CART.put)
  return { put: item }
}

export function ramLeft(game: Game, p: Player): number {
  return Math.max(0, RAM.cooldown - (game.elapsed - p.ramAt))
}

/** Space: the trolley rammed forward the way you face. Whether it went. */
export function ram(game: Game, player: number): boolean {
  const p = game.players[player]
  if (!canAct(game, p) || ramLeft(game, p) > 1e-9) return false
  p.ramAt = game.elapsed
  p.hit = []
  p.kx += -Math.sin(p.yaw) * RAM.impulse
  p.kz += -Math.cos(p.yaw) * RAM.impulse
  return true
}

/** Whether a player's ram is still live. */
export function ramming(game: Game, p: Player): boolean {
  return game.elapsed - p.ramAt < RAM.window
}

/** `a` rams into `b`: knocked flying and stunned, and the newest thing in their trolley spills out. */
function rammed(game: Game, a: number, b: number): void {
  const p = game.players[a]
  const q = game.players[b]
  p.hit.push(b)
  const dx = q.x - p.x
  const dz = q.z - p.z
  const d = Math.max(Math.hypot(dx, dz), 1e-6)
  q.kx = (dx / d) * RAM.knock
  q.kz = (dz / d) * RAM.knock
  q.stunUntil = game.elapsed + RAM.stun
  // The rammer stops short.
  p.kx *= 0.3
  p.kz *= 0.3
  const spilt = q.cart.pop()
  if (spilt !== undefined) drop(game, spilt, q.x + (dx / d) * 1.2, q.z + (dz / d) * 1.2)
}

/**
 * Everybody moves on by `dt`: walking, knocked, kept apart and out of the
 * shelves; rams land; and anybody down a lane with their whole list is
 * through. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  const r = BODY.radius
  for (const p of game.players) {
    if (!isShopping(p)) continue
    const own = stunned(game, p) ? 0 : BODY.speed * (Math.hypot(p.kx, p.kz) > 4 ? 0.4 : 1)
    p.x += (p.mx * own + p.kx) * step
    p.z += (p.mz * own + p.kz) * step
    const wear = Math.exp(-RAM.drag * step)
    p.kx *= wear
    p.kz *= wear
    collide(p, r)
  }
  const here = game.players.map((p, i) => ({ p, i })).filter(({ p }) => isShopping(p))
  for (let a = 0; a < here.length; a++) {
    for (let b = a + 1; b < here.length; b++) {
      const A = here[a].p
      const B = here[b].p
      const dx = B.x - A.x
      const dz = B.z - A.z
      const d = Math.hypot(dx, dz)
      // A ram lands a little before the bodies touch.
      for (const [x, y] of [
        [here[a].i, here[b].i],
        [here[b].i, here[a].i],
      ]) {
        const P = game.players[x]
        if (d < r * 2 + 0.25 && ramming(game, P) && !P.hit.includes(y) && !stunned(game, game.players[y])) rammed(game, x, y)
      }
      if (d >= r * 2) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = (r * 2 - d) / 2
      A.x -= nx * over
      A.z -= nz * over
      B.x += nx * over
      B.z += nz * over
      collide(A, r)
      collide(B, r)
    }
  }
  for (const p of game.players) {
    if (isShopping(p) && inLane(p.x, p.z) && stillNeeds(game, p).length === 0) p.doneAt = round2(game.elapsed)
  }
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** When the first got through, or null. */
export function firstDone(game: Game): number | null {
  const done = game.players.map((p) => p.doneAt).filter((t): t is number => t !== null)
  return done.length ? Math.min(...done) : null
}

/** Whether it is over. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const through = game.players.filter((p) => p.doneAt !== null).length
  const shopping = game.players.filter(isShopping).length
  const first = firstDone(game)
  const everybody = game.players.filter((p) => !p.left).length
  if (
    through >= ROUND.podium ||
    (through > 0 && shopping <= 1 && everybody > 1) ||
    shopping === 0 ||
    (first !== null && game.elapsed >= first + ROUND.after) ||
    game.elapsed >= ROUND.limit
  )
    game.over = true
  return game.over
}

/** One step: the clock, everybody moving, the end. For the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  move(game, dt)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby: gone, and their trolley emptied onto the floor where they stood. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.doneAt === null) {
    p.leftAt = round2(game.elapsed)
    for (const item of p.cart) drop(game, item, p.x, p.z)
    p.cart = []
  }
  p.left = true
}

/** How far a point is from the nearest checkout lane, straight. */
export function toTill(x: number, z: number): number {
  return Math.min(...LANES.map((l) => Math.hypot(x - clamp(x, l.x0, l.x1), z - clamp(z, l.z0, l.z1))))
}

/**
 * Everybody, best first, with their place: those through, first through first;
 * then those still shopping, the more of their list in their trolley the
 * better, then the nearer a till; then anybody who left, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number, number] =>
    p.doneAt !== null ? [0, p.doneAt, 0] : p.left ? [2, -(p.leftAt ?? 0), 0] : [1, -gotten(game, p), Math.round(toTill(p.x, p.z) * 10)]
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < 3; i++) if (Math.abs(ka[i] - kb[i]) > 1e-9) return ka[i] < kb[i]
    return false
  }
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.player, b.player) ? -1 : better(b.player, a.player) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.player, entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const

