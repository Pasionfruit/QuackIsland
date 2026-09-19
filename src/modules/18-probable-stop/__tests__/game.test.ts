/**
 * The rules of Probable Stop.
 *
 * Six rounds, three paths, two safe then one; change your mind until time runs
 * out; fall and you are out. Every sentence of that is a test here.
 */
import { describe, expect, it } from 'vitest'
import { botIntent, botIntents } from '../internal/ai'
import {
  GAME,
  applyIntent,
  choose,
  confirm,
  createGame,
  decideSafe,
  placings,
  roundsSurvived,
  safeCount,
  step,
  stepGame,
  stillIn,
  type Game,
} from '../internal/game'
import { SOLO_PLAYERS, gameRoster, newGame, secret } from '../internal/setup'

const SEED = 20260916

function game(ids = ['a', 'b', 'c']): Game {
  return createGame(SEED, ids.map((id) => ({ id })))
}

/** Runs the clock down to the reveal, a tenth of a second at a time. */
function toReveal(g: Game): void {
  const round = g.round
  for (let i = 0; i < 400 && g.phase === 'choosing' && g.round === round; i++) stepGame(g, 0.1)
}

/** Runs the reveal out, into the next round or the end. */
function throughReveal(g: Game): void {
  for (let i = 0; i < 400 && g.phase === 'reveal'; i++) stepGame(g, 0.1)
}

const player = (g: Game, id: string) => g.players.find((p) => p.id === id)!

describe('the odds', () => {
  it('are six rounds of three paths: two safe in the first four, one in the last two', () => {
    expect(GAME.rounds).toBe(6)
    expect(GAME.paths).toBe(3)
    expect([0, 1, 2, 3, 4, 5].map(safeCount)).toEqual([2, 2, 2, 2, 1, 1])
  })

  it('decides exactly that many safe paths, all different, every time', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let round = 0; round < GAME.rounds; round++) {
        const safe = decideSafe(seed, round)
        expect(safe).toHaveLength(safeCount(round))
        expect(new Set(safe).size).toBe(safe.length)
        for (const path of safe) expect(path >= 0 && path < GAME.paths).toBe(true)
      }
    }
  })

  it('is fair: every path is safe about as often as the rules say', () => {
    const tries = 3000
    for (const round of [0, 5]) {
      const safeTimes = [0, 0, 0]
      for (let seed = 0; seed < tries; seed++) for (const p of decideSafe(seed, round)) safeTimes[p] += 1
      for (const count of safeTimes) {
        expect(count / tries).toBeGreaterThan(safeCount(round) / GAME.paths - 0.05)
        expect(count / tries).toBeLessThan(safeCount(round) / GAME.paths + 0.05)
      }
    }
  })

  it('is the same answer for the same game and round, and a different game can differ', () => {
    expect(decideSafe(SEED, 2)).toEqual(decideSafe(SEED, 2))
    const answers = new Set(Array.from({ length: 40 }, (_, s) => decideSafe(s, 0).join()))
    expect(answers.size).toBe(3)
  })
})

describe('choosing', () => {
  it('starts everybody on the middle path, not confirmed, with the clock running', () => {
    const g = game()
    expect(g.phase).toBe('choosing')
    expect(g.clock).toBe(GAME.chooseTime)
    expect(g.safe).toEqual([])
    for (const p of g.players) expect([p.pick, p.confirmed, p.alive]).toEqual([GAME.startPath, false, true])
  })

  it('moves one path at a time and stops at the ends', () => {
    const g = game()
    step(g, 'a', -1)
    expect(player(g, 'a').pick).toBe(0)
    step(g, 'a', -1)
    expect(player(g, 'a').pick).toBe(0)
    step(g, 'a', 1)
    step(g, 'a', 1)
    step(g, 'a', 1)
    expect(player(g, 'a').pick).toBe(2)
  })

  it('lets you change your mind as often as you like before time runs out', () => {
    const g = game()
    for (const path of [0, 2, 1, 2, 0]) {
      choose(g, 'a', path)
      stepGame(g, 0.5)
    }
    expect(player(g, 'a').pick).toBe(0)
    expect(g.phase).toBe('choosing')
  })

  it('clears a confirm when you move, but not when you stay where you are', () => {
    const g = game()
    confirm(g, 'a')
    choose(g, 'a', 1)
    expect(player(g, 'a').confirmed).toBe(true)
    choose(g, 'a', 2)
    expect(player(g, 'a').confirmed).toBe(false)
  })

  it('cuts the countdown short once everybody still in has confirmed', () => {
    const g = game()
    for (const p of g.players) confirm(g, p.id)
    stepGame(g, 0.1)
    expect(g.clock).toBeLessThanOrEqual(GAME.allInTime)
    expect(g.phase).toBe('choosing')
  })

  it('does not cut it short while anybody is still deciding', () => {
    const g = game()
    confirm(g, 'a')
    confirm(g, 'b')
    stepGame(g, 0.1)
    expect(g.clock).toBeGreaterThan(GAME.allInTime)
  })

  it('counts where you stand when time runs out, confirmed or not', () => {
    const g = game(['a'])
    choose(g, 'a', 0)
    toReveal(g)
    expect(player(g, 'a').alive).toBe(g.safe.includes(0))
  })

  it('takes a wish only for the round it was made in', () => {
    const g = game()
    applyIntent(g, 'a', { round: 0, pick: 2, confirmed: true })
    expect([player(g, 'a').pick, player(g, 'a').confirmed]).toEqual([2, true])

    // A confirm from round one, arriving once round two has begun, does nothing.
    g.round = 1
    applyIntent(g, 'b', { round: 0, pick: 0, confirmed: true })
    expect([player(g, 'b').pick, player(g, 'b').confirmed]).toEqual([GAME.startPath, false])
  })
})

describe('the reveal', () => {
  it('happens when the countdown ends, and not before', () => {
    const g = game()
    stepGame(g, GAME.chooseTime - 0.2)
    expect(g.phase).toBe('choosing')
    expect(g.safe).toEqual([])
    toReveal(g)
    expect(g.phase).toBe('reveal')
    expect(g.safe).toEqual(decideSafe(SEED, 0))
  })

  it('drops everybody on a path that did not hold, and nobody else', () => {
    const g = game(['on0', 'on1', 'on2'])
    ;['on0', 'on1', 'on2'].forEach((id, path) => choose(g, id, path))
    toReveal(g)
    for (const [path, id] of ['on0', 'on1', 'on2'].entries()) {
      const safe = g.safe.includes(path)
      expect(player(g, id).alive, id).toBe(safe)
      expect(player(g, id).outIn).toBe(safe ? null : 0)
    }
    expect(stillIn(g)).toHaveLength(2)
  })

  it('lets nobody change anything once it has started', () => {
    const g = game()
    toReveal(g)
    const before = g.players.map((p) => p.pick)
    for (const p of g.players) choose(g, p.id, (p.pick + 1) % 3)
    expect(g.players.map((p) => p.pick)).toEqual(before)
  })

  it('then starts the next round, with everybody left unconfirmed and a full clock', () => {
    const g = game()
    for (const p of g.players) confirm(g, p.id)
    toReveal(g)
    const survivors = stillIn(g).length
    throughReveal(g)
    if (survivors === 0) return expect(g.phase).toBe('over')
    expect(g.round).toBe(1)
    expect(g.phase).toBe('choosing')
    expect(g.clock).toBe(GAME.chooseTime)
    expect(g.safe).toEqual([])
    for (const p of g.players) expect(p.confirmed).toBe(false)
  })

  it('never lets a fallen player back in', () => {
    const g = game(['a', 'b', 'c', 'd', 'e', 'f'])
    g.players.forEach((p, i) => choose(g, p.id, i % 3))
    toReveal(g)
    const fallen = g.players.filter((p) => !p.alive).map((p) => p.id)
    expect(fallen.length).toBeGreaterThan(0)
    for (let r = 0; r < 12 && g.phase !== 'over'; r++) {
      throughReveal(g)
      for (const id of fallen) {
        choose(g, id, 0)
        confirm(g, id)
      }
      toReveal(g)
    }
    for (const id of fallen) expect(player(g, id).alive).toBe(false)
  })
})

describe('the end', () => {
  it('is after six rounds for anybody who survives them all', () => {
    const g = game(['lucky'])
    let rounds = 0
    while (g.phase !== 'over') {
      // Cheat: stand on whichever path will hold. The test is of the rounds,
      // not of luck.
      choose(g, 'lucky', decideSafe(SEED, g.round)[0])
      toReveal(g)
      rounds += 1
      throughReveal(g)
    }
    expect(rounds).toBe(6)
    expect(player(g, 'lucky').alive).toBe(true)
    expect(roundsSurvived(player(g, 'lucky'))).toBe(6)
  })

  it('comes early if everybody has fallen', () => {
    const g = game(['a', 'b'])
    for (const p of g.players) choose(g, p.id, [0, 1, 2].find((path) => !decideSafe(SEED, 0).includes(path))!)
    toReveal(g)
    throughReveal(g)
    expect(g.phase).toBe('over')
    expect(g.round).toBe(0)
  })

  it('comes early once only one is left, who has won', () => {
    const g = game(['a', 'b', 'c'])
    const safe = decideSafe(SEED, 0)
    const unsafe = [0, 1, 2].find((path) => !safe.includes(path))!
    choose(g, 'a', safe[0])
    choose(g, 'b', unsafe)
    choose(g, 'c', unsafe)
    toReveal(g)
    throughReveal(g)
    expect(g.phase).toBe('over')
    expect(g.round).toBe(0)
    expect(placings(g)[0]).toEqual({ player: player(g, 'a'), place: 1 })
  })

  it('goes on while two are left', () => {
    const g = game(['a', 'b', 'c'])
    const safe = decideSafe(SEED, 0)
    const unsafe = [0, 1, 2].find((path) => !safe.includes(path))!
    choose(g, 'a', safe[0])
    choose(g, 'b', safe[1])
    choose(g, 'c', unsafe)
    toReveal(g)
    throughReveal(g)
    expect(g.phase).toBe('choosing')
    expect(g.round).toBe(1)
  })

  it('ranks survivors first, then by how late people fell, sharing places', () => {
    const g = game(['won', 'r4', 'r4b', 'r1'])
    g.phase = 'over'
    player(g, 'r4').alive = false
    player(g, 'r4').outIn = 3
    player(g, 'r4b').alive = false
    player(g, 'r4b').outIn = 3
    player(g, 'r1').alive = false
    player(g, 'r1').outIn = 0
    expect(placings(g).map((x) => [x.player.id, x.place])).toEqual([
      ['won', 1],
      ['r4', 2],
      ['r4b', 2],
      ['r1', 4],
    ])
  })

  it('clamps a huge frame, so a backgrounded tab does not skip a round', () => {
    const g = game()
    stepGame(g, 60)
    expect(g.phase).toBe('choosing')
    expect(g.clock).toBeGreaterThan(GAME.chooseTime - 1)
  })
})

describe('the stand-ins', () => {
  it('always want a real path, for this round', () => {
    const g = game()
    for (const p of g.players) p.bot = true
    for (let t = 0; t < 100; t++) {
      stepGame(g, 0.1)
      for (const [id, intent] of botIntents(g)) {
        expect(intent.round).toBe(g.round)
        expect(intent.pick >= 0 && intent.pick < 3).toBe(true)
        applyIntent(g, id, intent)
      }
    }
  })

  it('confirm before time runs out, and do not all pick the same path', () => {
    const many = createGame(SEED, Array.from({ length: 30 }, (_, i) => ({ id: `bot${i}`, bot: true })))
    many.clock = 0.01
    const final = many.players.map((p) => botIntent(many, p))
    expect(final.every((i) => i.confirmed)).toBe(true)
    expect(new Set(final.map((i) => i.pick)).size).toBe(3)
  })

  it('play a whole game out without anybody pressing anything', () => {
    const g = createGame(SEED, ['a', 'b', 'c', 'd'].map((id) => ({ id, bot: true })))
    for (let i = 0; i < 2000 && g.phase !== 'over'; i++) {
      for (const [id, intent] of botIntents(g)) applyIntent(g, id, intent)
      stepGame(g, 0.1)
    }
    expect(g.phase).toBe('over')
  })
})

describe('dealing a game', () => {
  it('fills the other seats when you are alone', () => {
    expect(gameRoster()).toHaveLength(SOLO_PLAYERS)
    expect(newGame().players.filter((p) => p.mine)).toHaveLength(1)
  })

  it('never deals the same seed or id twice, and never makes one from the other', () => {
    const a = newGame()
    const b = newGame()
    expect(a.seed).not.toBe(b.seed)
    expect(a.id).not.toBe(b.id)
    expect(a.id).not.toBe(a.seed)
    expect(typeof secret()).toBe('number')
  })
})
