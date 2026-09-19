/**
 * The stand-ins.
 *
 * A stand-in knows what you would know: only what its own scans have shown it,
 * and only for as long as a scan stays on the screen. It finds its way to the
 * hole square by square, through squares it knows are clear where it can, and
 * when the next square is one it has not seen, it scans - or, if its scan is
 * not ready, waits for it. Some stand-ins have less patience than others, and
 * now and then walk on without looking.
 *
 * It shoves whoever is in its way, and - more readily - anybody standing next to
 * a bomb it knows about. Its own randomness comes from the seed. Only ever runs
 * on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { COLS, ROOM, ROWS, cellAt, cellMiddle, roomFor, scan, type Point } from './room'
import { BOMB, PUSH, SCAN, canAct, clock, cooldownLeft, inRoom, live, push, steer, wrapAngle, yawTowards, type Game, type Player } from './rules'

export const BOT = {
  /** Chance of walking on without looking, per square, the most careful stand-in and the least. */
  nerve: [0.02, 0.12] as readonly [number, number],
  /** How often it thinks about shoving, seconds, and how likely it is to. */
  think: 0.4,
  temper: [0.15, 0.4] as readonly [number, number],
  /** A moment before it starts. */
  start: [0.3, 1] as readonly [number, number],
} as const

interface Mind {
  random: () => number
  nerve: number
  temper: number
  startAt: number
  scannedAt: number
  /** Squares it has seen, and when: key `row:col`. */
  seen: Map<string, number>
  /** Bombs it has seen, by index, and when. */
  bombs: Map<number, number>
  thoughtAt: number
  /** The unseen square it last decided about, and whether it chances it. */
  decided: string | null
  chancing: boolean
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `youre-the-bomb:bot:${bot.id}`))
    mind = {
      random,
      nerve: BOT.nerve[0] + random() * (BOT.nerve[1] - BOT.nerve[0]),
      temper: BOT.temper[0] + random() * (BOT.temper[1] - BOT.temper[0]),
      startAt: BOT.start[0] + random() * (BOT.start[1] - BOT.start[0]),
      scannedAt: -Infinity,
      seen: new Map(),
      bombs: new Map(),
      thoughtAt: 0,
      decided: null,
      chancing: false,
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

const key = (row: number, col: number) => `${row}:${col}`

/** A stand-in scans where it stands: every square whose middle it can see, and every bomb. */
function look(game: Game, mind: Mind, at: Point): void {
  const t = clock(game)
  mind.scannedAt = t
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const m = cellMiddle(row, col)
      if (Math.hypot(m.x - at.x, m.z - at.z) <= SCAN.radius) mind.seen.set(key(row, col), t)
    }
  }
  for (const i of scan(roomFor(game.seed), at, SCAN.radius + ROOM.cell)) mind.bombs.set(i, t)
}

/**
 * The next square on the way to the hole, by what the stand-in knows: squares
 * with a bomb it has seen are walls, squares it has seen clear are cheap, and
 * squares it has not seen cost more.
 */
export function nextSquare(game: Game, index: number, mind: Mind): { row: number; col: number } | null {
  const bot = game.players[index]
  const from = cellAt(bot.x, bot.z)
  const goal = cellAt(ROOM.hole.x, ROOM.hole.z)
  if (!from || !goal) return null
  const t = clock(game)
  const n = ROWS * COLS
  const at = (r: number, c: number) => r * COLS + c
  // What each square costs, worked out once.
  const cost = new Float64Array(n).fill(5)
  for (const [k, when] of mind.seen) {
    if (when <= t - SCAN.show) continue
    const [r, c] = k.split(':').map(Number)
    cost[at(r, c)] = 1
  }
  const bombs = roomFor(game.seed).bombs
  const armed = live(game)
  for (const [i, when] of mind.bombs) {
    if (when > t - SCAN.show && armed.has(i)) cost[at(bombs[i].row, bombs[i].col)] = Infinity
  }
  // Dijkstra back from the hole, on a small grid.
  const dist = new Float64Array(n).fill(Infinity)
  const next = new Int32Array(n).fill(-1)
  const open = [at(goal.row, goal.col)]
  dist[open[0]] = 0
  while (open.length > 0) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i
    const cur = open[bi]
    open[bi] = open[open.length - 1]
    open.pop()
    const r = Math.floor(cur / COLS)
    const c = cur % COLS
    for (const [dr, dc] of STEPS) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue
      const idx = at(nr, nc)
      const through = dist[cur] + cost[idx]
      if (through < dist[idx]) {
        if (dist[idx] === Infinity) open.push(idx)
        dist[idx] = through
        next[idx] = cur
      }
    }
  }
  const step = next[at(from.row, from.col)]
  if (step < 0) return null
  return { row: Math.floor(step / COLS), col: step % COLS }
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Every stand-in scans, finds its way, shoves, walks. */
export function botSteer(game: Game): void {
  const t = clock(game)
  const bombs = roomFor(game.seed).bombs
  const armed = live(game)
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)
    if (t < mind.startAt) return steer(game, index, 0, 0)
    if (t - mind.scannedAt >= SCAN.cooldown && (t - mind.scannedAt >= SCAN.show - 0.5 || mind.scannedAt === -Infinity)) look(game, mind, bot)

    const here = cellAt(bot.x, bot.z)
    const square = nextSquare(game, index, mind)
    let mx = 0
    let mz = 0
    if (here && square) {
      const k = key(square.row, square.col)
      const known = (mind.seen.get(k) ?? -Infinity) > t - SCAN.show
      const ready = t - mind.scannedAt >= SCAN.cooldown
      if (!known && ready) look(game, mind, bot)
      // An unseen square it cannot scan yet: wait for the scan - or, once in a while, chance it.
      if (!known && mind.decided !== k) {
        mind.decided = k
        mind.chancing = mind.random() < mind.nerve
      }
      const go = known || mind.chancing
      // Steer for the middle of our own square first if we are off it, then on.
      const own = cellMiddle(here.row, here.col)
      const target = go || Math.hypot(own.x - bot.x, own.z - bot.z) > 0.25 ? (go ? cellMiddle(square.row, square.col) : own) : null
      if (target) {
        const dx = target.x - bot.x
        const dz = target.z - bot.z
        const d = Math.hypot(dx, dz)
        if (d > 0.05) {
          mx = dx / Math.max(d, 0.4)
          mz = dz / Math.max(d, 0.4)
        }
      }
    }
    steer(game, index, mx, mz)

    // A shove: whoever is close in front, more readily if a bomb it knows is just past them.
    if (game.elapsed - mind.thoughtAt >= BOT.think && cooldownLeft(game, bot) <= 0) {
      mind.thoughtAt = game.elapsed
      let target: Player | null = null
      let best = Infinity
      for (const p of game.players) {
        if (p === bot || !inRoom(p)) continue
        const d = Math.hypot(p.x - bot.x, p.z - bot.z)
        if (d < PUSH.reach * 0.95 && d < best) {
          target = p
          best = d
        }
      }
      if (target) {
        const beyond = { x: target.x + ((target.x - bot.x) / best) * 1.2, z: target.z + ((target.z - bot.z) / best) * 1.2 }
        const trap = [...mind.bombs.keys()].some((i) => armed.has(i) && Math.hypot(bombs[i].x - beyond.x, bombs[i].z - beyond.z) < BOMB.trigger + 0.8)
        if (mind.random() < mind.temper * (trap ? 2.5 : 0.7)) {
          bot.yaw = wrapAngle(yawTowards(bot, target))
          push(game, index)
        }
      }
    }
  })
}
