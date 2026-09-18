/**
 * The cups, the stages, the picks, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_TRACKS, botPicks } from '../internal/ai'
import {
  TABLE,
  createGame,
  cupCount,
  cupsAt,
  currentStage,
  dealStage,
  facesBySlot,
  found,
  leave,
  phaseLength,
  pick,
  placings,
  shuffleTime,
  slotX,
  slotsAfter,
  stepGame,
  type Game,
} from '../internal/rules'

const SEED = 8080

function players(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `f${i + 1}`, bot: bots }))
}

/** Straight to the given phase of the current stage. */
function toPhase(game: Game, phase: Game['phase']) {
  while (game.phase !== phase) stepGame(game, 0.05)
}

describe('the cups', () => {
  it('are one per player and at least one spare, never fewer than five', () => {
    expect(cupCount(1)).toBe(5)
    expect(cupCount(4)).toBe(5)
    expect(cupCount(5)).toBe(6)
    expect(cupCount(8)).toBe(9)
  })

  it('start each stage with the faces where the last one left them', () => {
    for (let s = 1; s < TABLE.points.length; s++) {
      expect(dealStage(SEED, s, 4).faces).toEqual(facesBySlot(dealStage(SEED, s - 1, 4)))
    }
  })

  it('hide every player once and the rest nothing, shuffled differently each stage', () => {
    for (let n = 1; n <= 8; n++) {
      const stage = dealStage(SEED, 0, n)
      expect(stage.faces).toHaveLength(cupCount(n))
      expect([...stage.faces].filter((f) => f >= 0).sort()).toEqual(Array.from({ length: n }, (_, i) => i))
    }
    expect(dealStage(SEED, 1, 4)).not.toEqual(dealStage(SEED, 0, 4))
    expect(dealStage(SEED, 0, 4)).toEqual(dealStage(SEED, 0, 4))
  })

  it('shuffle longer and faster each stage, never the same pair twice running', () => {
    for (let s = 0; s < 3; s++) {
      const stage = dealStage(SEED, s, 6)
      expect(stage.swaps).toHaveLength(TABLE.swaps[s])
      stage.swaps.forEach(([a, b], i) => {
        expect(a).not.toBe(b)
        if (i > 0) expect(new Set([a, b])).not.toEqual(new Set(stage.swaps[i - 1]))
      })
      if (s > 0) {
        expect(TABLE.swaps[s]).toBeGreaterThan(TABLE.swaps[s - 1])
        expect(TABLE.swapTime[s]).toBeLessThan(TABLE.swapTime[s - 1])
      }
    }
    expect(TABLE.points).toEqual([1, 2, 3])
  })

  it('end up where the swaps take them', () => {
    const stage = { faces: [0, 1, -1, 2, -1], swaps: [[0, 1], [1, 4], [2, 3]] as [number, number][] }
    // Cup 0 goes slot 0 → 1 → 4; cup 1 goes 1 → 0; cup 4 goes 4 → 1; cups 2 and 3 trade.
    expect(slotsAfter(stage, 3)).toEqual([4, 0, 3, 2, 1])
    expect(facesBySlot(stage)).toEqual([1, -1, 2, -1, 0])
  })

  it('are drawn sliding between slots mid-swap, passing on either side, and lifted to show', () => {
    const game = createGame(SEED, players(4))
    const cups = cupCount(4)
    expect(cupsAt(game).every((c) => c.lift === 1)).toBe(true)
    toPhase(game, 'shuffle')
    const stage = currentStage(game)
    game.clock = TABLE.swapTime[0] * 0.5
    const [a, b] = stage.swaps[0]
    const moving = cupsAt(game).filter((c) => c.arc !== 0)
    expect(moving).toHaveLength(2)
    expect(moving[0].arc).toBeCloseTo(-moving[1].arc)
    for (const c of moving) expect(c.x).toBeCloseTo((slotX(a, cups) + slotX(b, cups)) / 2, 5)
    expect(cupsAt(game).every((c) => c.lift === 0)).toBe(true)
  })
})

describe('a stage', () => {
  it('goes show, cover, shuffle, pick, result, and on to the next', () => {
    const game = createGame(SEED, players(3))
    const seen: string[] = []
    let last = ''
    while (game.phase !== 'over') {
      const key = `${game.stage}:${game.phase}`
      if (key !== last) seen.push(key)
      last = key
      stepGame(game, 0.05)
    }
    expect(seen).toEqual([0, 1, 2].flatMap((s) => ['show', 'cover', 'shuffle', 'pick', 'result'].map((p) => `${s}:${p}`)))
    expect(shuffleTime(2)).toBeCloseTo(TABLE.swaps[2] * TABLE.swapTime[2] + TABLE.settle)
  })

  it('takes one pick a player, only while picking, and scores the stage worth for finding yourself', () => {
    const game = createGame(SEED, players(3))
    expect(pick(game, 0, 1)).toBe(false)
    toPhase(game, 'pick')
    const bySlot = facesBySlot(currentStage(game))
    expect(pick(game, 0, bySlot.indexOf(0))).toBe(true)
    expect(pick(game, 0, 0)).toBe(false)
    expect(pick(game, 1, (bySlot.indexOf(1) + 1) % bySlot.length)).toBe(true)
    expect(pick(game, 2, 99)).toBe(false)
    expect(pick(game, 2, 0, 1)).toBe(false)
    toPhase(game, 'result')
    expect(found(game, 0, 0)).toBe(true)
    expect(found(game, 1, 0)).toBe(false)
    expect(game.players.map((p) => p.score)).toEqual([1, 0, 0])
  })

  it('ends picking early once everybody still here has picked', () => {
    const game = createGame(SEED, players(3))
    toPhase(game, 'pick')
    pick(game, 0, 0)
    pick(game, 1, 1)
    stepGame(game, 0.05)
    expect(game.phase).toBe('pick')
    leave(game, 2)
    stepGame(game, 0.05)
    expect(game.phase).toBe('result')
  })

  it('adds up 1, 2 and 3 across the stages', () => {
    const game = createGame(SEED, players(2))
    while (game.phase !== 'over') {
      if (game.phase === 'pick' && game.players[0].picks[game.stage] === null) {
        pick(game, 0, facesBySlot(currentStage(game)).indexOf(0))
      }
      stepGame(game, 0.05)
    }
    expect(game.players[0].score).toBe(6)
    expect(game.players[1].score).toBe(0)
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [1, 2],
    ])
    expect(phaseLength(game)).toBe(Infinity)
  })
})

describe('the stand-ins', () => {
  it('pick after a moment, and find themselves less often each stage', () => {
    const hits = [0, 0, 0]
    const runs = 60
    for (let seed = 1; seed <= runs; seed++) {
      const game = createGame(seed, [{ id: 'me' }, ...players(3, true)])
      while (game.phase !== 'over') {
        if (game.phase === 'pick') {
          const early = game.clock
          for (const move of botPicks(game)) {
            expect(early).toBeGreaterThan(1)
            pick(game, move.player, move.slot)
          }
        }
        if (game.phase === 'result' && game.clock === 0) {
          for (let b = 1; b <= 3; b++) if (found(game, b, game.stage)) hits[game.stage] += 1
        }
        stepGame(game, 0.05)
      }
      for (const bot of game.players.slice(1)) expect(bot.picks.every((p) => p !== null)).toBe(true)
    }
    const rates = hits.map((h) => h / (runs * 3))
    rates.forEach((r, s) => expect(Math.abs(r - BOT_TRACKS[s])).toBeLessThan(0.15))
    expect(rates[0]).toBeGreaterThan(rates[2])
  })
})
