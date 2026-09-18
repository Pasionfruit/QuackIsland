/**
 * The recipe, the turns, and the end.
 */
import { describe, expect, it } from 'vitest'
import { BOT_THINK, botMove, remembered } from '../internal/ai'
import {
  KINDS,
  KITCHEN,
  claimedOf,
  cookTime,
  createGame,
  dealRecipe,
  fastForwarding,
  leave,
  pace,
  pick,
  pickTime,
  placings,
  recipeSize,
  rotation,
  stepGame,
  stillIn,
  turnTime,
  unclaimed,
  whoseTurn,
  type Game,
} from '../internal/rules'

const SEED = 777

function cooks(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, bot: bots }))
}

function run(game: Game, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds && game.phase !== 'over'; t += dt) stepGame(game, dt)
}

/** Straight past the cooking and the order, to the first turn. */
function toTurns(game: Game): Game {
  while (game.phase !== 'turns') stepGame(game, 0.25)
  return game
}

/** A slot that is safe to pick right now, or one that is not. */
function slotWhere(game: Game, safe: boolean, how: 'wrong' | 'gone' = 'wrong'): number {
  for (let slot = 0; slot < KITCHEN.items; slot++) {
    if (game.claimed[slot] !== null) continue
    const kind = game.served[slot]
    const left = game.used[kind] - claimedOf(game, kind)
    if (safe && left > 0) return slot
    if (!safe && how === 'wrong' && game.used[kind] === 0) return slot
    if (!safe && how === 'gone' && game.used[kind] > 0 && left <= 0) return slot
  }
  return -1
}

/** A seed whose first recipe leaves out at least one ingredient altogether. */
function seedWithUnused(): number {
  for (let seed = 1; ; seed++) if (dealRecipe(seed, 0, 4).used.includes(0)) return seed
}

describe('a recipe', () => {
  it('is the same number of every one of six ingredients', () => {
    expect(KITCHEN.items).toBe(KINDS * KITCHEN.copies)
    for (let seed = 1; seed <= 50; seed++) {
      const { counter, served } = dealRecipe(seed, 0, 4)
      expect(counter).toHaveLength(KITCHEN.items)
      for (let kind = 0; kind < KINDS; kind++) expect(counter.filter((k) => k === kind)).toHaveLength(KITCHEN.copies)
      // Laid out again: the same items.
      expect([...served].sort()).toEqual([...counter].sort())
    }
  })

  it('rotates the baskets at least one place and never all the way round, once the chef is done', () => {
    const spins = new Set<number>()
    for (let seed = 1; seed <= 200; seed++) {
      const { spin } = dealRecipe(seed, 0, 4)
      expect(spin).toBeGreaterThanOrEqual(1)
      expect(spin).toBeLessThan(KITCHEN.places)
      spins.add(spin)
    }
    expect(spins.size).toBe(KITCHEN.places - 1)

    const game = createGame(9, [{ id: 'a' }, { id: 'b' }])
    const end = cookTime(game.picks.length, 0)
    const lastLands = pickTime(game.picks.length - 1, 0) + KITCHEN.flight
    game.clock = lastLands
    expect(rotation(game)).toBe(0)
    game.clock = end - 0.3 - KITCHEN.rotate / 2
    expect(rotation(game)).toBeCloseTo(game.spin / 2)
    game.clock = end - 0.2
    expect(rotation(game)).toBe(game.spin)
    game.phase = 'turns'
    expect(rotation(game)).toBe(game.spin)
  })

  it('takes different items each time, and counts what went in', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const cooksIn = 1 + (seed % 8)
      const { counter, picks, used } = dealRecipe(seed, 0, cooksIn)
      expect(picks).toHaveLength(recipeSize(cooksIn))
      expect(new Set(picks).size).toBe(picks.length)
      expect(used.reduce((a, b) => a + b, 0)).toBe(picks.length)
      for (let kind = 0; kind < KINDS; kind++) expect(used[kind]).toBe(picks.filter((s) => counter[s] === kind).length)
    }
    expect(recipeSize(2)).toBe(KITCHEN.recipe[0])
    expect(recipeSize(8)).toBe(KITCHEN.recipe[1])
  })

  it('is the same for the same seed and recipe number, and not for another', () => {
    expect(dealRecipe(SEED, 0, 4)).toEqual(dealRecipe(SEED, 0, 4))
    expect(dealRecipe(SEED, 1, 4)).not.toEqual(dealRecipe(SEED, 0, 4))
  })
})

describe('the start', () => {
  it('deals everybody into a random turn order', () => {
    const orders = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const game = createGame(seed, cooks(5))
      expect([...game.queue].sort()).toEqual([0, 1, 2, 3, 4])
      orders.add(game.queue.join())
    }
    expect(orders.size).toBeGreaterThan(10)
  })

  it('has the chef cook, then shows the order, then starts the turns', () => {
    const game = createGame(SEED, cooks(3))
    expect(game.phase).toBe('cooking')
    run(game, cookTime(game.picks.length) - 0.2)
    expect(game.phase).toBe('cooking')
    run(game, 0.3)
    expect(game.phase).toBe('order')
    run(game, KITCHEN.order + 0.1)
    expect(game.phase).toBe('turns')
    expect(whoseTurn(game)).toBe(game.queue[0])
  })
})

describe('a turn', () => {
  it('claims an item that was in the recipe and sends you to the back of the line', () => {
    const game = toTurns(createGame(SEED, cooks(3)))
    const first = game.queue[0]
    const slot = slotWhere(game, true)
    expect(pick(game, first, slot)).toBe(true)
    expect(game.claimed[slot]).toBe(first)
    expect(game.players[first]).toMatchObject({ out: null, claims: 1 })
    expect(game.queue[game.queue.length - 1]).toBe(first)
    expect(game.last).toMatchObject({ player: first, slot, kind: game.served[slot], ok: true, why: null })
    expect(game.phase).toBe('result')
    run(game, KITCHEN.result + 0.05)
    expect(game.phase).toBe('turns')
    expect(whoseTurn(game)).not.toBe(first)
  })

  it('puts you out for an ingredient that was not in the recipe', () => {
    const game = toTurns(createGame(seedWithUnused(), cooks(3)))
    const first = game.queue[0]
    const slot = slotWhere(game, false, 'wrong')
    pick(game, first, slot)
    expect(game.players[first].out?.why).toBe('wrong')
    expect(game.queue).not.toContain(first)
    expect(game.claimed[slot]).toBeNull()
  })

  it('puts you out for an ingredient whose copies have all been claimed', () => {
    const game = toTurns(createGame(SEED, cooks(3)))
    // Claim every copy of one ingredient that is also on the counter spare.
    const kind = game.used.findIndex((n, k) => n > 0 && game.served.filter((s) => s === k).length > n)
    expect(kind).toBeGreaterThanOrEqual(0)
    for (let n = 0; n < game.used[kind]; n++) {
      const slot = game.served.findIndex((k, s) => k === kind && game.claimed[s] === null)
      pick(game, game.queue[0], slot)
      run(game, KITCHEN.result + 0.05)
    }
    const next = game.queue[0]
    const trap = game.served.findIndex((k, s) => k === kind && game.claimed[s] === null)
    pick(game, next, trap)
    expect(game.players[next].out?.why).toBe('gone')
  })

  it('is refused off your turn, on a claimed item, or outside the turns', () => {
    const game = createGame(SEED, cooks(3))
    expect(pick(game, game.queue[0], 0)).toBe(false)
    toTurns(game)
    expect(pick(game, game.queue[1], slotWhere(game, true))).toBe(false)
    const slot = slotWhere(game, true)
    pick(game, game.queue[0], slot)
    run(game, KITCHEN.result + 0.05)
    expect(pick(game, game.queue[0], slot)).toBe(false)
    expect(pick(game, game.queue[0], KITCHEN.items)).toBe(false)
    expect(pick(game, game.queue[0], 1.5)).toBe(false)
  })

  it('puts you out when the time runs out', () => {
    const game = toTurns(createGame(SEED, cooks(3)))
    const first = game.queue[0]
    run(game, KITCHEN.turn + 0.05)
    expect(game.players[first].out?.why).toBe('time')
    expect(game.last).toMatchObject({ player: first, slot: null, ok: false, why: 'time' })
  })
})

describe('the end', () => {
  it('is the last cook standing, and the rest are placed by how long they lasted', () => {
    const game = toTurns(createGame(seedWithUnused(), cooks(3)))
    const [a, b, c] = game.queue
    pick(game, a, slotWhere(game, false))
    run(game, KITCHEN.result + 0.05)
    pick(game, b, slotWhere(game, false))
    expect(game.phase).toBe('result')
    run(game, KITCHEN.result + 0.05)
    expect(game.phase).toBe('over')
    expect(stillIn(game).map((p) => p.id)).toEqual([game.players[c].id])
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [c, 1],
      [b, 2],
      [a, 3],
    ])
  })

  it('cooks each recipe quicker, with less time to pick, within limits', () => {
    expect(pace(0)).toBe(KITCHEN.perPick)
    expect(turnTime(0)).toBe(KITCHEN.turn)
    for (let recipe = 1; recipe < KITCHEN.recipes; recipe++) {
      expect(pace(recipe)).toBeLessThanOrEqual(pace(recipe - 1))
      expect(pace(recipe)).toBeGreaterThanOrEqual(KITCHEN.quickest)
      expect(turnTime(recipe)).toBeLessThan(turnTime(recipe - 1))
      expect(turnTime(recipe)).toBeGreaterThanOrEqual(KITCHEN.turnFloor)
    }
    expect(pickTime(3, 2) - pickTime(2, 2)).toBeCloseTo(pace(2))
    expect(cookTime(8, 3)).toBeLessThan(cookTime(8, 0))
  })

  it('ends even when nobody ever picks wrong: after the last recipe, every pick is out', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = createGame(seed, cooks(2 + (seed % 3)))
      for (let frame = 0; frame < 100000 && game.phase !== 'over'; frame++) {
        if (game.phase === 'turns' && game.clock > 0.5) {
          const safe = slotWhere(game, true)
          const any = game.claimed.findIndex((c) => c === null)
          pick(game, game.queue[0], safe >= 0 ? safe : any)
        }
        stepGame(game, 0.1)
      }
      expect(game.phase).toBe('over')
      expect(game.recipe).toBe(KITCHEN.recipes - 1)
      expect(stillIn(game)).toHaveLength(1)
      // Nobody slipped: every out came after the last recipe ran dry, forced.
      expect(game.players.every((p) => !p.out || p.out.why === 'gone' || p.out.why === 'wrong')).toBe(true)
      expect(unclaimed(game)).toBe(0)
    }
  })

  it('cooks again when every copy is claimed, keeping the line', () => {
    const game = toTurns(createGame(SEED, cooks(2)))
    const total = unclaimed(game)
    for (let n = 0; n < total; n++) {
      pick(game, game.queue[0], slotWhere(game, true))
      if (n < total - 1) run(game, KITCHEN.result + 0.05)
    }
    const line = [...game.queue]
    run(game, KITCHEN.result + 0.05)
    expect(game.phase).toBe('cooking')
    expect(game.recipe).toBe(1)
    expect(game.claimed.every((c) => c === null)).toBe(true)
    expect(game.queue).toEqual(line)
    // No turn order the second time: straight to the turns.
    run(game, cookTime(game.picks.length, game.recipe) + 0.05)
    expect(game.phase).toBe('turns')
  })

  it('takes out somebody who leaves, ending their turn if it was theirs', () => {
    const game = toTurns(createGame(SEED, cooks(4)))
    const [first, second] = game.queue
    leave(game, second)
    expect(game.players[second].out?.why).toBe('left')
    expect(game.phase).toBe('turns')
    leave(game, first)
    expect(game.phase).toBe('result')
    expect(game.last).toMatchObject({ player: first, why: 'left' })
    expect(stillIn(game)).toHaveLength(2)
  })
})

describe('the stand-ins', () => {
  it('play on at fast-forward once no person is left in, and never otherwise', () => {
    const game = toTurns(createGame(seedWithUnused(), [{ id: 'me' }, { id: 'b1', bot: true }, { id: 'b2', bot: true }]))
    expect(fastForwarding(game)).toBe(false)
    expect(fastForwarding(createGame(SEED, cooks(3, true)))).toBe(false)
    expect(fastForwarding(createGame(SEED, cooks(3)))).toBe(false)
    const clock = game.clock
    stepGame(game, 0.1)
    expect(game.clock - clock).toBeCloseTo(0.1)

    // The person goes out: from here the kitchen runs at fast-forward.
    while (whoseTurn(game) !== 0) {
      const move = botMove(game)
      if (move) pick(game, move.player, move.slot)
      stepGame(game, 0.05)
    }
    expect(pick(game, 0, slotWhere(game, false, 'wrong'))).toBe(true)
    expect(fastForwarding(game)).toBe(true)
    const before = game.elapsed
    stepGame(game, 0.1)
    expect(game.elapsed - before).toBeCloseTo(0.1 * KITCHEN.fastForward)
  })

  it('think before they pick, and only on their own turn', () => {
    const game = toTurns(createGame(SEED, cooks(3, true)))
    expect(botMove(game)).toBeNull()
    run(game, BOT_THINK[1] - 0.05)
    // Somewhere in the thinking window they have made up their mind.
    for (let t = 0; t < 0.2 && !botMove(game); t += 0.05) stepGame(game, 0.05)
    const move = botMove(game)
    expect(move?.player).toBe(game.queue[0])
    expect(game.claimed[move!.slot]).toBeNull()
  })

  it('remember most of the recipe', () => {
    let right = 0
    let total = 0
    for (let seed = 1; seed <= 60; seed++) {
      const game = createGame(seed, cooks(4, true))
      for (const bot of game.players) {
        remembered(game, bot).forEach((n, k) => {
          total += 1
          if (n === game.used[k]) right += 1
        })
      }
    }
    expect(right / total).toBeGreaterThan(0.7)
    expect(right / total).toBeLessThan(0.95)
  })

  it('play whole games to a single winner', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = createGame(seed, cooks(1 + (seed % 7) + 1, true))
      for (let frame = 0; frame < 20000 && game.phase !== 'over'; frame++) {
        const move = botMove(game)
        if (move) pick(game, move.player, move.slot)
        stepGame(game, 0.1)
      }
      expect(game.phase).toBe('over')
      expect(stillIn(game)).toHaveLength(1)
      expect(placings(game).filter((e) => e.place === 1)).toHaveLength(1)
      // Nobody ran out of time: the stand-ins always pick.
      expect(game.players.some((p) => p.out?.why === 'time')).toBe(false)
    }
  })
})
