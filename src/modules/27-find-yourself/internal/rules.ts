/**
 * The rules of Find Yourself, as arithmetic.
 *
 * A row of cups on a table, and under each one somebody's face - every player's,
 * and an empty spare or two. The cups lift to show who is where, come down, and
 * shuffle: two at a time, trading places. Then everybody picks the cup they
 * think their own face is under. Three stages, each shuffle longer and faster
 * than the last, worth 1, 2 and 3 points. Most points wins.
 *
 * Everything here is pure. Where the faces start and how the cups move comes
 * from the game's seed, so every browser animates the same shuffle; who picked
 * what is the host's to say, and nobody else's until the cups come up.
 */
import { createRng, hashSeed } from '../../00-core'

export const TABLE = {
  /** Cups: one per player, at least one spare, and never fewer than this. */
  fewestCups: 5,
  /** Between cups in the row. */
  spacing: 2.1,
  /** A cup's radius at its mouth, for drawing and for clicking. */
  cup: 0.75,

  /** How many stages, and what each is worth. */
  points: [1, 2, 3] as readonly number[],
  /** Swaps in each stage's shuffle... */
  swaps: [7, 12, 18] as readonly number[],
  /** ...and how long each swap takes, seconds. */
  swapTime: [0.6, 0.42, 0.28] as readonly number[],

  /** Seconds the faces are shown before the cups come down. */
  show: 2.5,
  /** Seconds the cups take to come down. */
  cover: 0.7,
  /** Seconds between the last swap and picking. */
  settle: 0.4,
  /** Seconds to pick. Everybody picked early ends it early. */
  pick: 7,
  /** Seconds the cups stay up after a stage, showing who found themselves. */
  result: 3.2,
} as const

export type Phase = 'show' | 'cover' | 'shuffle' | 'pick' | 'result' | 'over'
export const PHASES: readonly Phase[] = ['show', 'cover', 'shuffle', 'pick', 'result', 'over']

/** How many cups for this many players. */
export function cupCount(players: number): number {
  return Math.max(TABLE.fewestCups, players + 1)
}

/** Where a slot in the row is, across. */
export function slotX(slot: number, cups: number): number {
  return (slot - (cups - 1) / 2) * TABLE.spacing
}

export interface Stage {
  /** Per cup, whose face is under it: a player index, or -1 for none. Cup `k` starts in slot `k`. */
  faces: number[]
  /** The swaps, in order: two slots whose cups trade places. */
  swaps: [number, number][]
}

/** Stage `stage`'s faces and shuffle. */
export function dealStage(seed: number, stage: number, players: number): Stage {
  const random = createRng(hashSeed(seed, `find-yourself:stage:${stage}`))
  const cups = cupCount(players)
  const faces = Array.from({ length: cups }, (_, i) => (i < players ? i : -1))
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[faces[i], faces[j]] = [faces[j], faces[i]]
  }
  const swaps: [number, number][] = []
  let last: [number, number] | null = null
  while (swaps.length < TABLE.swaps[stage]) {
    const a = Math.floor(random() * cups)
    const b = Math.floor(random() * cups)
    if (a === b) continue
    // Never the same pair twice running: it would look like nothing happened.
    if (last && ((last[0] === a && last[1] === b) || (last[0] === b && last[1] === a))) continue
    swaps.push([a, b])
    last = [a, b]
  }
  return { faces, swaps }
}

const stages = new Map<string, Stage>()
/** The same stage, dealt once. */
export function stageFor(seed: number, stage: number, players: number): Stage {
  const key = `${seed}:${stage}:${players}`
  let dealt = stages.get(key)
  if (!dealt) {
    dealt = dealStage(seed, stage, players)
    if (stages.size > 32) stages.clear()
    stages.set(key, dealt)
  }
  return dealt
}

/** Which slot each cup is in after the first `done` swaps: `at[cup] = slot`. */
export function slotsAfter(stage: Stage, done: number): number[] {
  const at = stage.faces.map((_, cup) => cup)
  for (const [a, b] of stage.swaps.slice(0, done)) {
    const ca = at.indexOf(a)
    const cb = at.indexOf(b)
    at[ca] = b
    at[cb] = a
  }
  return at
}

/** Whose face ends up under each slot once the shuffle is done: `faceAt[slot] = player or -1`. */
export function facesBySlot(stage: Stage): number[] {
  const at = slotsAfter(stage, stage.swaps.length)
  const out = new Array<number>(at.length).fill(-1)
  at.forEach((slot, cup) => (out[slot] = stage.faces[cup]))
  return out
}

/** How long a stage's shuffle takes. */
export function shuffleTime(stage: number): number {
  return TABLE.swaps[stage] * TABLE.swapTime[stage] + TABLE.settle
}

export interface Finder {
  id: string
  mine: boolean
  bot: boolean
  score: number
  /** Per stage, the slot picked, or null. */
  picks: (number | null)[]
  /** Left the lobby: not waited for. */
  left: boolean
}

export interface Game {
  /** Faces and shuffles. Not a secret: every browser has to animate the shuffle. */
  seed: number
  id: number
  players: Finder[]
  stage: number
  phase: Phase
  /** Seconds into the phase. */
  clock: number
  elapsed: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      score: 0,
      picks: TABLE.points.map(() => null),
      left: false,
    })),
    stage: 0,
    phase: entrants.length > 0 ? 'show' : 'over',
    clock: 0,
    elapsed: 0,
  }
}

/** The current stage's faces and shuffle. */
export function currentStage(game: Game): Stage {
  return stageFor(game.seed, game.stage, game.players.length)
}

/** How long the current phase lasts. */
export function phaseLength(game: Game): number {
  switch (game.phase) {
    case 'show':
      return TABLE.show
    case 'cover':
      return TABLE.cover
    case 'shuffle':
      return shuffleTime(game.stage)
    case 'pick':
      return TABLE.pick
    case 'result':
      return TABLE.result
    default:
      return Infinity
  }
}

/** Whether a player has found themselves in a stage. */
export function found(game: Game, player: number, stage: number): boolean {
  const slot = game.players[player]?.picks[stage]
  if (slot === null || slot === undefined) return false
  return facesBySlot(stageFor(game.seed, stage, game.players.length))[slot] === player
}

/** A player picks a cup, by slot. Only while picking, only once a stage. Returns whether it counted. */
export function pick(game: Game, player: number, slot: number, stage = game.stage): boolean {
  const finder = game.players[player]
  if (!finder || finder.left || game.phase !== 'pick' || stage !== game.stage) return false
  if (!Number.isInteger(slot) || slot < 0 || slot >= cupCount(game.players.length)) return false
  if (finder.picks[game.stage] !== null) return false
  finder.picks[game.stage] = slot
  return true
}

/** A player who has left the lobby is not waited for. */
export function leave(game: Game, player: number): void {
  const finder = game.players[player]
  if (finder) finder.left = true
}

/** Whether everybody still here has picked this stage. */
export function allPicked(game: Game): boolean {
  return game.players.every((p) => p.left || p.picks[game.stage] !== null)
}

/** The clock through the phases: show, cover, shuffle, pick, result - three times - and over. */
export function stepGame(game: Game, dt: number): Game {
  if (game.phase === 'over') return game
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed += step
  game.clock += step
  if (game.phase === 'pick' && allPicked(game)) game.clock = Math.max(game.clock, TABLE.pick)
  if (game.clock < phaseLength(game)) return game

  game.clock = 0
  switch (game.phase) {
    case 'show':
      game.phase = 'cover'
      break
    case 'cover':
      game.phase = 'shuffle'
      break
    case 'shuffle':
      game.phase = 'pick'
      break
    case 'pick':
      game.phase = 'result'
      game.players.forEach((finder, player) => {
        if (found(game, player, game.stage)) finder.score += TABLE.points[game.stage]
      })
      break
    case 'result':
      if (game.stage + 1 >= TABLE.points.length) {
        game.phase = 'over'
      } else {
        game.stage += 1
        game.phase = 'show'
      }
      break
  }
  return game
}

/**
 * Where each cup is drawn this moment, as slots with fractions: a cup in a swap
 * is partway between its two slots, and `lift` is how far off the table it is
 * (1 up, 0 down). `arc` is how far in front of or behind the row a swapping cup
 * is - one goes each way, so they pass.
 */
export function cupsAt(game: Game): { cup: number; x: number; arc: number; lift: number }[] {
  const stage = currentStage(game)
  const cups = stage.faces.length
  const lift = game.phase === 'show' || game.phase === 'result' || game.phase === 'over' ? 1 : game.phase === 'cover' ? 1 - Math.min(1, game.clock / TABLE.cover) : 0
  if (game.phase !== 'shuffle') {
    const done = game.phase === 'show' || game.phase === 'cover' ? 0 : stage.swaps.length
    const at = slotsAfter(stage, done)
    return at.map((slot, cup) => ({ cup, x: slotX(slot, cups), arc: 0, lift }))
  }
  const time = TABLE.swapTime[game.stage]
  const done = Math.min(stage.swaps.length, Math.floor(game.clock / time))
  const at = slotsAfter(stage, done)
  const out = at.map((slot, cup) => ({ cup, x: slotX(slot, cups), arc: 0, lift: 0 }))
  if (done < stage.swaps.length) {
    const [a, b] = stage.swaps[done]
    const t = (game.clock - done * time) / time
    const ease = t * t * (3 - 2 * t)
    const ca = at.indexOf(a)
    const cb = at.indexOf(b)
    out[ca].x = slotX(a, cups) + (slotX(b, cups) - slotX(a, cups)) * ease
    out[cb].x = slotX(b, cups) + (slotX(a, cups) - slotX(b, cups)) * ease
    const bow = Math.sin(t * Math.PI) * Math.min(1.1, 0.4 + Math.abs(a - b) * 0.25)
    out[ca].arc = bow
    out[cb].arc = -bow
  }
  return out
}

/** Everybody, best first, with their place. Level scores share a place. */
export function placings(game: Game): { finder: Finder; index: number; place: number }[] {
  const ranked = game.players.map((finder, index) => ({ finder, index })).sort((a, b) => b.finder.score - a.finder.score)
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => other.finder.score > entry.finder.score).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
