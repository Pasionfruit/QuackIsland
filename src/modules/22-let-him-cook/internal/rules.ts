/**
 * The rules of Let Him Cook, as arithmetic.
 *
 * Six baskets, a basket per ingredient, three of it in every one. The chef takes
 * some of them, one at a time, into the pot, and everybody watches. Then the
 * baskets are filled again and rotated round the counter, and players take
 * turns, in a random order, picking an item they think was in the recipe.
 *
 * - An ingredient the chef **did not use**: out.
 * - An ingredient the chef used, but **every copy of it has already been
 *   claimed**: out. Two tomatoes went in and two have been picked; the third
 *   tomato in the basket is a trap.
 * - Otherwise the item is yours - it goes in the pot, and a chip in your colour
 *   goes by its basket - and you go to the back of the line.
 *
 * Last cook standing wins. If every copy in the recipe has been claimed and more
 * than one is still in, the chef cooks again - faster, with less time to pick -
 * and the line carries on. **Two recipes at most**: after the second, once every
 * copy is claimed, every pick is out, so a game always ends, however good
 * everybody's memory is.
 *
 * Everything here is pure. A game played from a seed plays out the same way.
 */
import { createRng, hashSeed } from '../../00-core'

/** The six ingredients, in the order their numbers mean. */
export const INGREDIENTS = [
  { id: 'tomato', one: 'tomato', many: 'tomatoes', icon: '🍅' },
  { id: 'carrot', one: 'carrot', many: 'carrots', icon: '🥕' },
  { id: 'mushroom', one: 'mushroom', many: 'mushrooms', icon: '🍄' },
  { id: 'cheese', one: 'cheese', many: 'cheeses', icon: '🧀' },
  { id: 'fish', one: 'fish', many: 'fish', icon: '🐟' },
  { id: 'egg', one: 'egg', many: 'eggs', icon: '🥚' },
] as const

export const KINDS = INGREDIENTS.length

export const KITCHEN = {
  /** Copies of every ingredient: the same in every basket. */
  copies: 3,
  /** Items on the counter, every copy of every ingredient. */
  items: 18,
  /** How many items the chef cooks with, least and most: four more than there are cooks, within these. */
  recipe: [6, 10] as readonly [number, number],

  /** Seconds before the chef takes the first item. */
  intro: 2.5,
  /** Seconds from one item to the next, in the first recipe. */
  perPick: 1.4,
  /** Each recipe after the first, the chef is this much quicker... */
  quicken: 0.8,
  /** ...down to this. */
  quickest: 0.6,
  /** How long the chef takes to get to an item before taking it. */
  reach: 0.6,
  /** How long an item is in the air on its way to the pot. */
  flight: 0.7,
  /** Seconds after the last item lands before the turns start. The baskets rotate in them. */
  outro: 3,
  /** How long the baskets take to rotate, ending a moment before the cooking does. */
  rotate: 2,
  /** Places round the counter a basket can be. The baskets rotate by at least one and fewer than this. */
  places: 6,

  /** How long the turn order is shown, before the first recipe's turns. */
  order: 3.5,
  /** How long a cook has to pick in the first recipe. Longer, and they are out. */
  turn: 10,
  /** A second less each recipe after the first, down to this. */
  turnFloor: 5,
  /** The most recipes the chef cooks. After the last, nothing is left to claim. */
  recipes: 2,
  /**
   * How long a pick's result is shown before the next turn: long enough to see
   * the item taken from its basket, tossed into the pot, and the chef's answer.
   */
  result: 2.5,
  /** How much faster the kitchen runs once only stand-ins are left in. */
  fastForward: 4,
} as const

export type Phase = 'cooking' | 'order' | 'turns' | 'result' | 'over'
export const PHASES: readonly Phase[] = ['cooking', 'order', 'turns', 'result', 'over']

/** Why somebody is out: not in the recipe, every copy gone, out of time, or left the lobby. */
export type Why = 'wrong' | 'gone' | 'time' | 'left'
export const WHYS: readonly Why[] = ['wrong', 'gone', 'time', 'left']

export interface Cook {
  id: string
  mine: boolean
  bot: boolean
  /** Out, why, and the how-manyth out they were - which is what places them. */
  out: { why: Why; order: number } | null
  /** Items claimed, across every recipe. */
  claims: number
}

/** What happened on a turn. `slot` and `kind` are null for a turn nobody picked on. */
export interface Pick {
  player: number
  slot: number | null
  kind: number | null
  ok: boolean
  why: Why | null
}

export interface Game {
  /** Decides every recipe and the turn order. The host's secret: it is never sent. */
  seed: number
  id: number
  players: Cook[]
  /** Which recipe this is, from 0. */
  recipe: number
  phase: Phase
  /** Seconds into the phase. */
  clock: number
  elapsed: number
  /** How many places round the counter the baskets stand from where they started, while the chef cooks. */
  turned: number
  /** How many places they rotate once the chef is done, for the turns. */
  spin: number
  /** What is on the counter while the chef cooks: an ingredient per slot. */
  counter: number[]
  /** The slots the chef takes, in the order they are taken. */
  picks: number[]
  /** How many of each ingredient went in. The answer. */
  used: number[]
  /** The counter laid out again for the turns: all fifteen, in new places. */
  served: number[]
  /** Per served slot, who claimed it, or null. */
  claimed: (number | null)[]
  /** Player indices, whoever's turn it is first. */
  queue: number[]
  /** Counts turns taken, so a pick can say which turn it is for. */
  turn: number
  last: Pick | null
  /** How many are out so far. */
  outs: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** How many items a recipe uses, for how many cooks are still in. */
export function recipeSize(cooks: number): number {
  return Math.min(KITCHEN.recipe[1], Math.max(KITCHEN.recipe[0], cooks + 4))
}

export interface Recipe {
  spin: number
  counter: number[]
  picks: number[]
  used: number[]
  served: number[]
}

/**
 * Deals recipe number `recipe`: the counter, what the chef takes, the counter
 * laid out again, and how far the baskets rotate once the chef is done.
 */
export function dealRecipe(seed: number, recipe: number, cooks: number): Recipe {
  const random = createRng(hashSeed(seed, `let-him-cook:recipe:${recipe}`))
  const counter = shuffle(
    Array.from({ length: KINDS }, (_, kind) => new Array<number>(KITCHEN.copies).fill(kind)).flat(),
    random,
  )
  const slots = shuffle(
    Array.from({ length: KITCHEN.items }, (_, i) => i),
    random,
  )
  const picks = slots.slice(0, recipeSize(cooks))
  const used = new Array<number>(KINDS).fill(0)
  for (const slot of picks) used[counter[slot]] += 1
  const served = shuffle([...counter], random)
  const spin = 1 + Math.floor(random() * (KITCHEN.places - 1))
  return { spin, counter, picks, used, served }
}

/** Seconds from one item to the next in recipe number `recipe`: quicker every recipe. */
export function pace(recipe: number): number {
  return Math.max(KITCHEN.quickest, KITCHEN.perPick * KITCHEN.quicken ** recipe)
}

/** How long a cook has to pick in recipe number `recipe`: less every recipe. */
export function turnTime(recipe: number): number {
  return Math.max(KITCHEN.turnFloor, KITCHEN.turn - recipe)
}

/** How long the chef takes over a recipe of this many items. */
export function cookTime(picks: number, recipe = 0): number {
  return pickTime(picks, recipe) + KITCHEN.outro
}

/** When the chef takes the nth item: it leaves the counter then and lands a flight later. */
export function pickTime(n: number, recipe = 0): number {
  return KITCHEN.intro + n * pace(recipe)
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const random = createRng(hashSeed(seed, 'let-him-cook:order'))
  const queue = shuffle(
    entrants.map((_, i) => i),
    random,
  )
  const recipe = dealRecipe(seed, 0, entrants.length)
  return {
    seed,
    id,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, out: null, claims: 0 })),
    recipe: 0,
    phase: entrants.length > 0 ? 'cooking' : 'over',
    clock: 0,
    elapsed: 0,
    turned: 0,
    ...recipe,
    claimed: new Array<number | null>(KITCHEN.items).fill(null),
    queue,
    turn: 0,
    last: null,
    outs: 0,
  }
}

/**
 * Whether only stand-ins are left in a game a person was playing. Nobody is
 * left to remember anything, so the kitchen runs at `KITCHEN.fastForward` to
 * the end rather than making the person who went out watch every turn.
 */
export function fastForwarding(game: Game): boolean {
  return game.players.some((p) => !p.bot) && game.players.every((p) => p.bot || p.out !== null)
}

/** Everybody still in. */
export function stillIn(game: Game): Cook[] {
  return game.players.filter((p) => !p.out)
}

/** How many of an ingredient have been claimed. */
export function claimedOf(game: Game, kind: number): number {
  let n = 0
  for (let slot = 0; slot < game.claimed.length; slot++) if (game.claimed[slot] !== null && game.served[slot] === kind) n += 1
  return n
}

/** Copies in the recipe nobody has claimed yet. */
export function unclaimed(game: Game): number {
  const total = game.used.reduce((sum, n) => sum + n, 0)
  return total - game.claimed.filter((c) => c !== null).length
}

/**
 * How many places round the counter the baskets have turned from where they
 * started, at this moment: `turned` while the chef cooks, moving through the
 * `spin` in the last of the cooking once every item is in, `turned + spin` for
 * the turns. Fractional while they move; not wrapped.
 */
export function rotation(game: Game): number {
  if (game.phase !== 'cooking') return game.turned + game.spin
  const start = cookTime(game.picks.length, game.recipe) - 0.3 - KITCHEN.rotate
  return game.turned + game.spin * Math.min(1, Math.max(0, (game.clock - start) / KITCHEN.rotate))
}

/** Whose turn it is, or null. */
export function whoseTurn(game: Game): number | null {
  return game.phase === 'turns' && game.queue.length > 0 ? game.queue[0] : null
}

function knockOut(game: Game, player: number, why: Why): void {
  const cook = game.players[player]
  if (!cook || cook.out) return
  game.outs += 1
  cook.out = { why, order: game.outs }
  game.queue = game.queue.filter((p) => p !== player)
}

function endTurn(game: Game, last: Pick): void {
  game.last = last
  game.turn += 1
  game.phase = 'result'
  game.clock = 0
}

/**
 * A cook picks the item in `slot`. Only on their turn, only an item nobody has
 * claimed. Returns whether it counted.
 */
export function pick(game: Game, player: number, slot: number): boolean {
  if (whoseTurn(game) !== player) return false
  if (!Number.isInteger(slot) || slot < 0 || slot >= KITCHEN.items || game.claimed[slot] !== null) return false
  const kind = game.served[slot]
  const why: Why | null = game.used[kind] === 0 ? 'wrong' : claimedOf(game, kind) >= game.used[kind] ? 'gone' : null
  if (why) {
    knockOut(game, player, why)
  } else {
    game.claimed[slot] = player
    game.players[player].claims += 1
    game.queue = [...game.queue.slice(1), player]
  }
  endTurn(game, { player, slot, kind, ok: !why, why })
  return true
}

/** A cook who has left the lobby is out. If it was their turn, the turn ends there. */
export function leave(game: Game, player: number): void {
  const cook = game.players[player]
  if (!cook || cook.out || game.phase === 'over') return
  const theirTurn = whoseTurn(game) === player
  knockOut(game, player, 'left')
  if (theirTurn) endTurn(game, { player, slot: null, kind: null, ok: false, why: 'left' })
}

/**
 * The clock: the chef cooks, the order is shown, turns run out, results are
 * shown, the next turn - or the next recipe, or the end.
 */
export function stepGame(game: Game, dt: number): Game {
  if (game.phase === 'over') return game
  const step = Math.min(Math.max(dt, 0), 0.25) * (fastForwarding(game) ? KITCHEN.fastForward : 1)
  game.clock += step
  game.elapsed += step

  if (stillIn(game).length <= 1 && game.phase !== 'result') {
    game.phase = 'over'
    game.clock = 0
    return game
  }

  switch (game.phase) {
    case 'cooking':
      if (game.clock >= cookTime(game.picks.length, game.recipe)) {
        game.phase = game.recipe === 0 ? 'order' : 'turns'
        game.clock = 0
      }
      break
    case 'order':
      if (game.clock >= KITCHEN.order) {
        game.phase = 'turns'
        game.clock = 0
      }
      break
    case 'turns':
      if (game.clock >= turnTime(game.recipe)) {
        const player = game.queue[0]
        knockOut(game, player, 'time')
        endTurn(game, { player, slot: null, kind: null, ok: false, why: 'time' })
      }
      break
    case 'result':
      if (game.clock < KITCHEN.result) break
      game.clock = 0
      if (stillIn(game).length <= 1) {
        game.phase = 'over'
      } else if (unclaimed(game) <= 0 && game.recipe + 1 < KITCHEN.recipes) {
        // Every copy is claimed: the chef cooks again for whoever is left.
        // After the last recipe the turns just go on, and every pick is out.
        game.recipe += 1
        // The baskets stay where the last turns left them while the chef cooks.
        game.turned = (game.turned + game.spin) % KITCHEN.places
        Object.assign(game, dealRecipe(game.seed, game.recipe, stillIn(game).length))
        game.claimed = new Array<number | null>(KITCHEN.items).fill(null)
        game.last = null
        game.phase = 'cooking'
      } else {
        game.phase = 'turns'
      }
      break
  }
  return game
}

/**
 * Everybody, best first, with their place: whoever is still in, then everybody
 * out, the later out the better.
 */
export function placings(game: Game): { cook: Cook; index: number; place: number }[] {
  const score = (c: Cook) => (c.out ? c.out.order : Infinity)
  const ranked = game.players.map((cook, index) => ({ cook, index })).sort((a, b) => score(b.cook) - score(a.cook))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.cook) > score(entry.cook)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
