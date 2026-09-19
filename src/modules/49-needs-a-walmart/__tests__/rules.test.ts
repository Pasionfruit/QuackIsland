/**
 * The rules: walking, picking up and putting back, ramming, the checkout, and who placed where.
 */
import { describe, expect, it } from 'vitest'
import { LANES, SOLIDS, inRect } from '../internal/store'
import { BODY, CART, RAM, ROUND, click, createGame, gotten, judgeEnd, leave, move, placings, ram, reachable, steer, stepGame, stillNeeds, tick, toPutBack, type Game } from '../internal/rules'

const SEED = 4321

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 3)
}

/** Stands a player on the floor at `x`, `z`, facing `yaw`, still. */
function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, mx: 0, mz: 0, kx: 0, kz: 0 })
}

/** Puts an item on the floor at `x`, `z`. */
function lay(g: Game, item: number, x: number, z: number): void {
  Object.assign(g.items[item], { x, z, shelf: false, holder: null })
}

/** Puts items in a player's trolley. */
function load(g: Game, p: number, items: number[]): void {
  g.players[p].cart = [...items]
  for (const i of items) g.items[i].holder = p
}

/** The first item of each kind on a player's list. */
function wanted(g: Game, p: number): number[] {
  return g.players[p].list.map((kind) => g.items.findIndex((it) => it.kind === kind))
}

/** The open floor between the last shelves and the tills. */
const OPEN = { x: 0, z: 5 }

describe('walking', () => {
  it('goes where it is steered, faces that way, and never through a shelf', () => {
    const g = game()
    stand(g, 0, OPEN.x, OPEN.z)
    steer(g, 0, 1, 0)
    move(g, 0.1)
    expect(g.players[0].x).toBeCloseTo(BODY.speed * 0.1, 5)
    expect(g.players[0].yaw).toBeCloseTo(-Math.PI / 2, 6)
    steer(g, 0, 0, -1)
    for (let i = 0; i < 100; i++) move(g, 0.05)
    expect(SOLIDS.some((r) => inRect(r, g.players[0].x, g.players[0].z, BODY.radius - 0.01))).toBe(false)
  })
})

describe('a click', () => {
  it('picks up the nearest thing in reach into the trolley, and nothing out of reach', () => {
    const g = game()
    const [a, b] = wanted(g, 0)
    stand(g, 0, OPEN.x, OPEN.z)
    lay(g, a, OPEN.x + 1, OPEN.z)
    lay(g, b, OPEN.x + CART.reach + 0.5, OPEN.z)
    expect(reachable(g, 0)).toBe(a)
    expect(click(g, 0)).toEqual({ took: a })
    expect(g.players[0].cart).toEqual([a])
    expect(g.items[a].holder).toBe(0)
    expect(reachable(g, 0)).toBe(-1)
  })

  it('puts back the newest thing not on your list when the trolley is full, rather than taking more', () => {
    const g = game()
    const mine = wanted(g, 0)
    const spare = g.items.findIndex((it) => !g.players[0].list.includes(it.kind))
    stand(g, 0, OPEN.x, OPEN.z, 0)
    for (const i of [mine[0], spare, mine[1]]) {
      lay(g, i, OPEN.x + 0.5, OPEN.z)
      click(g, 0)
    }
    expect(g.players[0].cart).toEqual([mine[0], spare, mine[1]])
    expect(g.players[0].cart[toPutBack(g, g.players[0])]).toBe(spare)
    lay(g, mine[2], OPEN.x + 0.5, OPEN.z)
    expect(click(g, 0)).toEqual({ put: spare })
    expect(g.items[spare]).toMatchObject({ holder: null, shelf: false })
    // Put down in front: facing north, so further north.
    expect(g.items[spare].z).toBeLessThan(OPEN.z)
    // The spare is now nearer than the third thing: step round it.
    lay(g, spare, OPEN.x + 5, OPEN.z)
    expect(click(g, 0)).toEqual({ took: mine[2] })
    expect(stillNeeds(g, g.players[0])).toEqual([])
  })

  it('puts something back with nothing in reach, and does nothing with an empty trolley', () => {
    const g = game()
    const [a] = wanted(g, 0)
    stand(g, 0, OPEN.x, OPEN.z)
    expect(click(g, 0)).toBe(null)
    load(g, 0, [a])
    expect(click(g, 0)).toEqual({ put: a })
    expect(g.players[0].cart).toEqual([])
  })

  it('takes a thing somebody else needs as readily as one you need', () => {
    const g = game(2)
    const theirs = g.items.findIndex((it) => g.players[1].list.includes(it.kind) && !g.players[0].list.includes(it.kind))
    stand(g, 0, OPEN.x, OPEN.z)
    lay(g, theirs, OPEN.x, OPEN.z - 1)
    expect(click(g, 0)).toEqual({ took: theirs })
  })
})

describe('a ram', () => {
  it('knocks whoever it hits flying, stuns them, and spills their newest thing', () => {
    const g = game(2)
    const [a, b] = wanted(g, 1)
    stand(g, 0, OPEN.x, OPEN.z + 1.6, 0)
    stand(g, 1, OPEN.x, OPEN.z)
    load(g, 1, [a, b])
    expect(ram(g, 0)).toBe(true)
    for (let i = 0; i < 6; i++) stepGame(g, 1 / 60)
    expect(g.players[1].cart).toEqual([a])
    expect(g.items[b]).toMatchObject({ holder: null, shelf: false })
    expect(g.players[1].stunUntil).toBeGreaterThan(g.elapsed)
    expect(click(g, 1)).toBe(null)
    expect(ram(g, 0)).toBe(false)
  })

  it('misses anybody behind, and is ready again after the cooldown', () => {
    const g = game(2)
    stand(g, 0, OPEN.x, OPEN.z, 0)
    stand(g, 1, OPEN.x, OPEN.z + 1.3)
    ram(g, 0)
    for (let i = 0; i < 30; i++) stepGame(g, 1 / 60)
    expect(g.players[1].stunUntil).toBe(-Infinity)
    expect(ram(g, 0)).toBe(false)
    g.elapsed = g.players[0].ramAt + RAM.cooldown
    expect(ram(g, 0)).toBe(true)
  })
})

describe('the checkout', () => {
  it('lets you through down a lane with your whole list, and not before', () => {
    const g = game(3)
    const lane = LANES[1]
    stand(g, 0, (lane.x0 + lane.x1) / 2, (lane.z0 + lane.z1) / 2)
    const mine = wanted(g, 0)
    load(g, 0, mine.slice(0, 2))
    move(g, 0.02)
    expect(g.players[0].doneAt).toBe(null)
    load(g, 0, mine)
    g.elapsed = 12
    move(g, 0.02)
    expect(g.players[0].doneAt).toBe(12)
    expect(gotten(g, g.players[0])).toBe(3)
  })
})

describe('the end', () => {
  it('ends when three are through, first through first', () => {
    const g = game(5)
    ;[30, 20, 25].forEach((t, i) => (g.players[i].doneAt = t))
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).slice(0, 3).map((e) => e.index)).toEqual([1, 2, 0])
  })

  it('ends a while after the first, the rest by how much of their list they have, then how near a till', () => {
    const g = game(4)
    g.players[0].doneAt = 10
    load(g, 2, wanted(g, 2).slice(0, 2))
    stand(g, 1, 0, -12)
    stand(g, 3, 0, 5)
    g.elapsed = 10 + ROUND.after - 0.01
    expect(judgeEnd(g)).toBe(false)
    tick(g, 0.02)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 2, 3, 1])
  })

  it('ends at the limit with nobody through, and puts anybody who left last with their shopping on the floor', () => {
    const g = game(3)
    const [a] = wanted(g, 1)
    load(g, 1, [a])
    leave(g, 1)
    expect(g.items[a].holder).toBe(null)
    g.elapsed = ROUND.limit - 0.01
    expect(judgeEnd(g)).toBe(false)
    tick(g, 0.02)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g)[2].index).toBe(1)
  })
})
