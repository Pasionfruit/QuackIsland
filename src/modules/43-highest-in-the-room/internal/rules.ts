/**
 * The rules of Highest In The Room, as arithmetic.
 *
 * Everybody against everybody, each on a tower of their own. **An arrow is on
 * the screen: press it.** Right, and another block goes in under you - one
 * higher. Wrong, and you are **knocked down four blocks** (never below the
 * floor), and the arrow stays until you get it. **Fall ten blocks behind
 * whoever is highest and you are out.** The last one left wins.
 *
 * Everybody types the same arrows in the same order - the seed deals them -
 * so a tower is only ever as tall as its owner's hands made it.
 *
 * At a minute and a half it stops anyway, and whoever is left is placed by how
 * high they got.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

/** Up, down, left, right. */
export const ARROWS = ['up', 'down', 'left', 'right'] as const
export type Arrow = 0 | 1 | 2 | 3

export const CLIMB = {
  /** How far a mistake knocks you down, blocks. */
  knock: 4,
  /** How far behind the highest you can fall before you are out, blocks. */
  behind: 10,
} as const

export const ROUND = {
  /** None: the minigame screen's own three-two-one runs first. */
  countdown: 0,
  /** Seconds from the start to the end, a minute and a half. */
  limit: 90,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** How many blocks high. */
  height: number
  /** How many arrows they have got right: which arrow they are on. */
  typed: number
  /** Every key they have pressed, right or wrong: how a guest and the host tell they agree. */
  inputs: number
  misses: number
  /** The highest they have ever been. */
  best: number
  /** When they were knocked out, seconds since the start, or null while in. */
  out: number | null
  left: boolean
  /** When they left, if they left while in. */
  leftAt: number | null
  /** When they last pressed, and whether it was right - for the screen. */
  pressedAt: number
  wrongAt: number
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt. */
  elapsed: number
  over: boolean
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

const dealt = new Map<number, Arrow[]>()

/**
 * The `index`th arrow of a seed's sequence - the same for everybody. Never the
 * same arrow three times running.
 */
export function arrowAt(seed: number, index: number): Arrow {
  let list = dealt.get(seed)
  if (!list) {
    list = []
    dealt.set(seed, list)
    if (dealt.size > 16) dealt.delete(dealt.keys().next().value!)
  }
  if (list.length <= index) {
    // Grown from the start every time it is short, so it is the same however it is asked for.
    const random = createRng(hashSeed(seed, 'highest-in-the-room:arrows'))
    const grown: Arrow[] = []
    const want = Math.max(index + 1, list.length * 2, 256)
    while (grown.length < want) {
      const a = Math.floor(random() * 4) as Arrow
      const n = grown.length
      if (n >= 2 && grown[n - 1] === a && grown[n - 2] === a) continue
      grown.push(a)
    }
    list.splice(0, list.length, ...grown)
  }
  return list[Math.max(0, index)]
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      height: 0,
      typed: 0,
      inputs: 0,
      misses: 0,
      best: 0,
      out: null,
      left: false,
      leftAt: null,
      pressedAt: -Infinity,
      wrongAt: -Infinity,
    })),
  }
}

/** Seconds since the start. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** Still climbing. */
export function isIn(p: Player): boolean {
  return p.out === null && !p.left
}

export function canPress(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && clock(game) >= 0 && isIn(p)
}

/** The arrow a player has to press next. */
export function arrowFor(game: Game, p: Player): Arrow {
  return arrowAt(game.seed, p.typed)
}

/** How high the highest player still in is. */
export function leaderHeight(game: Game): number {
  let top = 0
  for (const p of game.players) if (isIn(p)) top = Math.max(top, p.height)
  return top
}

/** Who is highest of those still in - the first of them, if level - or -1. */
export function leader(game: Game): number {
  let best = -1
  game.players.forEach((p, i) => {
    if (isIn(p) && (best < 0 || p.height > game.players[best].height)) best = i
  })
  return best
}

/** How far below the leader a player is, blocks. */
export function behind(game: Game, p: Player): number {
  return Math.max(0, leaderHeight(game) - p.height)
}

/**
 * A player presses an arrow key. Right: a block higher, and on to the next
 * arrow. Wrong: four blocks down, and the same arrow again. Nothing if they
 * cannot press just now. Whether it was right, or null if it did not count.
 */
export function press(game: Game, player: number, arrow: Arrow): boolean | null {
  const p = game.players[player]
  if (!canPress(game, p)) return null
  p.inputs += 1
  p.pressedAt = game.elapsed
  if (arrow === arrowFor(game, p)) {
    p.typed += 1
    p.height += 1
    p.best = Math.max(p.best, p.height)
    return true
  }
  p.misses += 1
  p.height = Math.max(0, p.height - CLIMB.knock)
  p.wrongAt = game.elapsed
  return false
}

/**
 * Everybody ten or more blocks below the highest is out, at the same moment.
 * Only the host decides. Who went, by index.
 */
export function knockOut(game: Game): number[] {
  if (game.over) return []
  const top = leaderHeight(game)
  const gone: number[] = []
  game.players.forEach((p, i) => {
    if (isIn(p) && top - p.height >= CLIMB.behind) gone.push(i)
  })
  for (const i of gone) game.players[i].out = round2(Math.max(0, clock(game)))
  return gone
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Whether it is over: one or nobody left, or time is up. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const left = game.players.filter(isIn).length
  if (left <= 1 || clock(game) >= ROUND.limit) game.over = true
  return game.over
}

/** One step: the clock, the knock-outs, the end - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  knockOut(game)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.out === null) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/**
 * Everybody, best first, with their place. Whoever is still in comes first -
 * more than one only if time ran out, when the higher comes first. Then the
 * knocked out, the last to go first; those who went together share a place.
 * Then anybody who left while in, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, -p.height])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1] - 1e-9
  }
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.player, b.player) ? -1 : better(b.player, a.player) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.player, entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
