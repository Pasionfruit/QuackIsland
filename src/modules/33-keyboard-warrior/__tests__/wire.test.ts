/**
 * One contest on the wire - eight players over a slow, lossy relay - and the camera.
 */
import { Frustum, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, POINTS, cameraFor, standPoint } from '../internal/camera'
import { LETTERS, ROUND, attempt, createGame, phase, stepGame, tick, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777003

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 51)
}

function untilUp(g: Game) {
  for (let i = 0; phase(g) !== 'up'; i++) {
    if (i > 10000) throw new Error('never came up')
    stepGame(g, 0.01)
  }
}

const hear = (game: Game, copy: Game, me: string) => applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, me)

describe('a snapshot', () => {
  it('carries the letter, the attempts and the scores, and a guest keeps its own attempt until the host decides', () => {
    const game = host(3)
    untilUp(game)
    attempt(game, 1, game.letter.char, 0.72)
    const copy = hear(game, waitingGame(), 'p3')
    expect(copy.letter).toMatchObject({ index: 0, char: game.letter.char, closedAt: null, winner: null })
    expect(copy.letter.appearsAt).toBeCloseTo(game.letter.appearsAt, 2)
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', false],
      ['p3', true],
    ])
    expect(copy.letter.attempts).toEqual([{ player: 1, key: game.letter.char, reaction: 0.72, heardAt: expect.closeTo(game.elapsed, 2) }])

    // The guest answers; the host has not heard yet.
    copy.elapsed = game.elapsed
    expect(attempt(copy, 2, 'q', 0.5)).not.toBeNull()
    hear(game, copy, 'p3')
    expect(copy.letter.attempts.map((a) => a.player)).toEqual([1, 2])

    // Decided without it: only what the host heard counts.
    for (let i = 0; i < 100 && phase(game) === 'up'; i++) stepGame(game, 0.05)
    hear(game, copy, 'p3')
    expect(copy.letter.closedAt).not.toBeNull()
    expect(copy.letter.winner).toBe(1)
    expect(copy.letter.attempts.map((a) => a.player)).toEqual([1])
    expect(copy.players.map((p) => p.score)).toEqual([0, 1, 0])
    expect(copy.players[1].best).toBeCloseTo(0.72, 3)

    // The next letter replaces it.
    for (let i = 0; i < 200 && game.letter.index === 0; i++) stepGame(game, 0.05)
    hear(game, copy, 'p3')
    expect(copy.letter.index).toBe(1)
    expect(copy.letter.char).toBe(game.letter.char)
    expect(copy.letter.attempts).toEqual([])
  })

  it('is refused whole rather than half-read', () => {
    const game = host()
    untilUp(game)
    attempt(game, 0, 'A', 0.5)
    const good = relay(encodeSnapshot(game))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'kw-in' })).toBeNull()
    expect(decodeSnapshot({ ...good, n: ROUND.letters })).toBeNull()
    expect(decodeSnapshot({ ...good, w: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', 99, -1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [[0, 'a', 500, 1]] })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [[5, 'A', 500, 1]] })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [[0, 'A', 99999, 1]] })).toBeNull()
  })

  it('fits in a relay message with eight in the arena, every one of them having tried', () => {
    const game = createGame(SEED, Array.from({ length: 8 }, (_, i) => ({ id: `player-${i}-with-a-long-name-for-an-id` })), 51)
    untilUp(game)
    for (let i = 0; i < 8; i++) attempt(game, i, LETTERS[i], 3.999)
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })

  it('starts a guest afresh when the host starts a new game, dropping an attempt at the old one', () => {
    const game = host(2)
    untilUp(game)
    const copy = hear(game, waitingGame(), 'p2')
    copy.elapsed = game.elapsed
    attempt(copy, 1, 'Z', 0.4)
    const next = createGame(SEED, [{ id: 'p1' }, { id: 'p2' }], 52)
    hear(next, copy, 'p2')
    expect(copy.id).toBe(52)
    expect(copy.letter.attempts).toEqual([])
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(51, 3, 'K', 0.61234)))).toEqual({ game: 51, index: 3, key: 'K', reaction: 0.612 })
    expect(decodeIntent({ t: 'kw-in', g: 51, n: 3, k: 'k', m: 600 })).toBeNull()
    expect(decodeIntent({ t: 'kw-in', g: 51, n: 3, k: 'KK', m: 600 })).toBeNull()
    expect(decodeIntent({ t: 'kw-in', g: 51, n: ROUND.letters, k: 'K', m: 600 })).toBeNull()
    expect(decodeIntent({ t: 'kw-in', g: 51, n: 3, k: 'K', m: -1 })).toBeNull()
  })
})

describe('eight players over a slow relay', () => {
  it('give every point to the quickest reaction on its own screen, whatever the lag, and every screen agrees', () => {
    const game = host(8)
    const dt = 1 / 60
    let seed = 3
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    // Each guest has its own lag each way, up to 120 ms, and loses a fifth of the snapshots.
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), lag: 0.02 + (index / 8) * 0.1, shownAt: null as number | null, shownFor: -1, tried: -1 }))
    // Reactions on each player's own screen: player 7 - the laggiest - is the quickest.
    const reactionOf = (index: number, letter: number) => 0.5 + ((7 - index) * 0.03 + ((letter * 7 + index * 3) % 5) * 0.004)
    const toHost: { at: number; from: number; message: Record<string, unknown> }[] = []
    const toGuests: { at: number; to: number; message: Record<string, unknown> }[] = []
    let now = 0
    const winners: number[] = []
    let lastIndex = -1

    for (let frame = 0; !game.over && frame < 60 * 200; frame++) {
      now += dt
      // The host's own screen - player 1 - and its own reaction.
      const hostSees = phase(game) === 'up'
      if (hostSees && guests[0].shownFor !== game.letter.index) {
        guests[0].shownFor = game.letter.index
        guests[0].shownAt = now
      }
      if (hostSees && guests[0].tried !== game.letter.index && now - guests[0].shownAt! >= reactionOf(0, game.letter.index)) {
        guests[0].tried = game.letter.index
        attempt(game, 0, game.letter.char, reactionOf(0, game.letter.index))
      }
      for (const m of toHost.filter((m) => m.at <= now)) {
        toHost.splice(toHost.indexOf(m), 1)
        const said = decodeIntent(relay(m.message))!
        if (said.game === game.id && said.index === game.letter.index) attempt(game, m.from, said.key, said.reaction)
      }
      if (game.letter.index !== lastIndex) {
        lastIndex = game.letter.index
      }
      const before = game.letter.closedAt
      stepGame(game, dt)
      if (before === null && game.letter.closedAt !== null) winners.push(game.letter.winner ?? -1)
      if (frame % 6 === 0) {
        const wire = encodeSnapshot(game)
        for (const g of guests.slice(1)) if (random() > 0.2) toGuests.push({ at: now + g.lag, to: g.index, message: wire })
      }

      for (const g of guests.slice(1)) {
        for (const m of toGuests.filter((m) => m.to === g.index && m.at <= now)) {
          toGuests.splice(toGuests.indexOf(m), 1)
          applySnapshot(g.copy, decodeSnapshot(relay(m.message))!, g.id)
        }
        if (g.copy.players.length === 0) continue
        tick(g.copy, dt)
        const letter = g.copy.letter
        if (phase(g.copy) !== 'up') continue
        if (g.shownFor !== letter.index) {
          g.shownFor = letter.index
          g.shownAt = now
        }
        if (g.tried !== letter.index && now - g.shownAt! >= reactionOf(g.index, letter.index)) {
          g.tried = letter.index
          const reaction = reactionOf(g.index, letter.index)
          if (attempt(g.copy, g.index, letter.char, reaction)) toHost.push({ at: now + g.lag, from: g.index, message: encodeIntent(g.copy.id, letter.index, letter.char, reaction) })
        }
      }
    }

    expect(game.over).toBe(true)
    // Player 8 reacts quickest every time, and its lag - the worst - never costs it a letter.
    expect(winners).toEqual(Array.from({ length: ROUND.letters }, () => 7))
    expect(game.players[7].score).toBe(ROUND.letters)
    for (const g of guests.slice(1)) {
      hear(game, g.copy, g.id)
      expect(g.copy.players.map((p) => p.score)).toEqual(game.players.map((p) => p.score))
      expect(g.copy.over).toBe(true)
    }
  })
})

describe('the fixed camera', () => {
  it('keeps everybody and every place a letter can float in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('stands everybody apart, in order, left to right', () => {
    for (let count = 2; count <= 8; count++) {
      const xs = Array.from({ length: count }, (_, i) => standPoint(count, i).x)
      for (let i = 1; i < count; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(1)
    }
    expect(standPoint(1, 0).x).toBe(0)
  })
})
