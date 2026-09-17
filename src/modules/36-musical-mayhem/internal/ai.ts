/**
 * The stand-ins.
 *
 * While the music plays, a stand-in jogs round the ring of chairs, a little way
 * out, the way it happens to be going - and now and then shoves whoever it runs
 * up behind. When the music stops it takes a moment to notice, then makes for
 * the nearest empty chair - round the outside of the ring, not through it - and
 * sits. If every chair is taken, it goes for the nearest one whose sitter is not
 * yet safe, pushes them off, and sits there itself.
 *
 * Its own randomness comes from the seed. Only ever runs on the host, through
 * the same hands and the same push and sit as everybody else.
 */
import { createRng, hashSeed } from '../../00-core'
import { CHAIR, PUSH, chairAt, chairInReach, isIn, isSafe, push, ringRadius, sit, sitter, type Game } from './rules'

export const BOT = {
  /** How long it takes to notice the music has stopped, seconds, quickest and slowest. */
  notice: [0.2, 0.65] as readonly [number, number],
  /** How far out from the ring it jogs while the music plays. */
  jog: 1.9,
  /** Its pace while jogging, as a share of a run. */
  pace: 0.7,
  /** The chance, each time it could, that it shoves whoever is in front while the music plays. */
  rude: 0.02,
} as const

interface Mind {
  way: number
  notice: number
  random: () => number
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, id: string): Mind {
  const key = `${game.id}:${game.seed}:${id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `musical-mayhem:bot:${id}`))
    mind = { way: random() < 0.5 ? 1 : -1, notice: BOT.notice[0] + random() * (BOT.notice[1] - BOT.notice[0]), random, at: game.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** Someone still in, standing or sitting, within a push and in front of player `i`. */
function inFront(game: Game, i: number): boolean {
  const p = game.players[i]
  return game.players.some((q, j) => {
    if (j === i || !isIn(q)) return false
    const dx = q.x - p.x
    const dz = q.z - p.z
    const d = Math.hypot(dx, dz)
    return d > 1e-6 && d < PUSH.reach * 0.9 && Math.acos(Math.max(-1, Math.min(1, (dx * Math.sin(p.facing) + dz * Math.cos(p.facing)) / d))) < PUSH.arc * 0.8
  })
}

/**
 * Which way to go for chair `c`: round the outside of the ring until level with
 * it, then straight in to it from outside - the ring is too tight to cut across.
 */
function towardsChair(game: Game, i: number, c: number): { x: number; z: number } {
  const p = game.players[i]
  const at = chairAt(game.chairs, c)
  const ring = game.chairs <= 1 ? 0 : ringRadius(game.chairs)
  const r = Math.hypot(p.x, p.z)
  const mine = Math.atan2(p.x, p.z)
  const off = Math.atan2(Math.sin(at.facing - mine), Math.cos(at.facing - mine))
  let hx: number
  let hz: number
  if (Math.abs(off) > 0.3 && game.chairs > 1) {
    // Round: along the circle towards the chair's side, and out to the running line.
    const way = Math.sign(off)
    const ur = r < 1e-6 ? { x: 0, z: 1 } : { x: p.x / r, z: p.z / r }
    const out = ring + 1.3 - r
    hx = ur.z * way + ur.x * out * 0.8
    hz = -ur.x * way + ur.z * out * 0.8
  } else {
    hx = at.x - p.x
    hz = at.z - p.z
  }
  const l = Math.hypot(hx, hz) || 1
  return { x: hx / l, z: hz / l }
}

/** Sets every stand-in's hands, and has it sit and push, for this frame. */
export function botPlay(game: Game): void {
  if (game.over || (game.phase !== 'music' && game.phase !== 'scramble')) return
  game.players.forEach((p, i) => {
    if (!p.bot || !isIn(p) || p.seat !== null) {
      if (p.bot) game.hands[i] = { x: 0, z: 0 }
      return
    }
    const mind = mindFor(game, p.id)
    const since = game.elapsed - game.phaseAt

    if (game.phase === 'music') {
      // Round and round, a little way out.
      const r = Math.hypot(p.x, p.z) || 1
      const want = ringRadius(game.chairs) + BOT.jog
      const tx = (p.z / r) * mind.way
      const tz = (-p.x / r) * mind.way
      const pull = (want - r) * 0.6
      const hx = tx + (p.x / r) * pull
      const hz = tz + (p.z / r) * pull
      const l = Math.hypot(hx, hz) || 1
      game.hands[i] = { x: (hx / l) * BOT.pace, z: (hz / l) * BOT.pace }
      if (inFront(game, i) && mind.random() < BOT.rude) push(game, i)
      return
    }

    if (since < mind.notice) return
    if (chairInReach(game, i) >= 0) {
      sit(game, i)
      game.hands[i] = { x: 0, z: 0 }
      return
    }
    // The nearest empty chair; failing that, the nearest whose sitter can still be pushed off.
    const chairs = Array.from({ length: game.chairs }, (_, c) => c)
    const empty = chairs.filter((c) => sitter(game, c) < 0)
    const pool = empty.length > 0 ? empty : chairs.filter((c) => !isSafe(game, game.players[sitter(game, c)]))
    let target = -1
    let best = Infinity
    for (const c of pool) {
      const at = chairAt(game.chairs, c)
      const d = Math.hypot(at.x - p.x, at.z - p.z)
      if (d < best) {
        best = d
        target = c
      }
    }
    if (target < 0) {
      game.hands[i] = { x: 0, z: 0 }
      return
    }
    game.hands[i] = towardsChair(game, i, target)
    const at = chairAt(game.chairs, target)
    if (sitter(game, target) >= 0 && Math.hypot(at.x - p.x, at.z - p.z) < CHAIR.reach + 0.2) push(game, i)
  })
}
