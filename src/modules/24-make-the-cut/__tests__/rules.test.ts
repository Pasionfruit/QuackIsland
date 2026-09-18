/**
 * The web, the turns, the cuts and the end.
 */
import { describe, expect, it } from 'vitest'
import { botCut, botIntents } from '../internal/ai'
import {
  TOWER,
  aimAt,
  createGame,
  cut,
  deadlyCount,
  deadlyLeft,
  distanceTo,
  inReach,
  layWeb,
  leave,
  nearestString,
  placings,
  rayToSegment,
  standing,
  stepGame,
  stringCount,
  walk,
  webFor,
  whoseTurn,
  type Game,
  type Intent,
} from '../internal/rules'

const SEED = 5150
const LUCK = 8086
const NONE = new Map<string, Intent>()

function cutters(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, bot: bots }))
}

function run(game: Game, seconds: number, intents: ReadonlyMap<string, Intent> = NONE, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepGame(game, intents, dt)
}

/** Straight to the first turn. */
function toTurn(game: Game): Game {
  while (game.phase !== 'turn') stepGame(game, NONE, 0.05)
  return game
}

/** Through the suspense after a cut, to the moment it snaps. */
function snap(game: Game): Game {
  while (game.phase === 'suspense') stepGame(game, NONE, 0.05)
  return game
}

/** Through a cut's suspense and result, to the next turn or the end. */
function onward(game: Game): Game {
  while (game.phase === 'suspense' || game.phase === 'result') stepGame(game, NONE, 0.05)
  return game
}

/** Puts the player whose turn it is next to a string, and returns that string. */
function standBy(game: Game, deadly: boolean): number {
  const player = whoseTurn(game)!
  const string = game.deadly.findIndex((d, s) => d === deadly && game.cut[s] === null)
  const rim = webFor(game.seed, game.count)[string].rim
  Object.assign(game.players[player], { x: rim.x * 0.85, y: rim.z * 0.85 })
  return string
}

/** Whether two segments on the ground cross. */
function cross(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }, d: { x: number; z: number }): boolean {
  const side = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

describe('the web', () => {
  it('has three strings a player, and one eliminating string fewer than players', () => {
    for (let n = 2; n <= 8; n++) {
      const game = createGame(SEED, LUCK, cutters(n))
      expect(game.count).toBe(3 * n + n - 1)
      expect(stringCount(n)).toBe(game.count)
      expect(game.deadly.filter(Boolean)).toHaveLength(n - 1)
      expect(deadlyCount(n)).toBe(n - 1)
      expect(deadlyLeft(game)).toBe(n - 1)
    }
  })

  it('runs from the rim up to the poles, and no two strings cross', () => {
    for (let n = 2; n <= 8; n++) {
      const web = layWeb(SEED + n, stringCount(n))
      for (const s of web) {
        expect(Math.hypot(s.rim.x, s.rim.z)).toBeCloseTo(TOWER.radius)
        expect(s.rim.y).toBe(TOWER.height)
        expect(Math.hypot(s.end.x, s.end.z)).toBeGreaterThanOrEqual(TOWER.far[0])
        // Up, never down behind the tower where nobody can see it.
        expect(s.end.y).toBeGreaterThan(TOWER.height)
      }
      for (let i = 0; i < web.length; i++) {
        for (let j = i + 1; j < web.length; j++) {
          expect(cross({ x: web[i].rim.x, z: web[i].rim.z }, web[i].end, { x: web[j].rim.x, z: web[j].rim.z }, web[j].end), `${n}: ${i} ${j}`).toBe(false)
        }
      }
    }
  })

  it('hides the eliminating strings somewhere different for different luck, and picks a random first cutter', () => {
    const deadly = new Set<string>()
    const firsts = new Set<number>()
    for (let luck = 1; luck <= 30; luck++) {
      const game = createGame(SEED, luck, cutters(5))
      deadly.add(game.deadly.map(Number).join(''))
      firsts.add(game.turn)
    }
    expect(deadly.size).toBeGreaterThan(20)
    expect(firsts.size).toBe(5)
  })
})

describe('the turns', () => {
  it('start after the draw with the first cutter, and pass round the group', () => {
    const game = createGame(SEED, LUCK, cutters(4))
    const first = game.turn
    expect(whoseTurn(game)).toBeNull()
    toTurn(game)
    expect(whoseTurn(game)).toBe(first)
    cut(game, first, standBy(game, false))
    onward(game)
    expect(whoseTurn(game)).toBe((first + 1) % 4)
  })

  it('a normal string: cut, and nothing happens', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const player = game.turn
    const string = standBy(game, false)
    expect(cut(game, player, string)).toBe(true)
    snap(game)
    expect(game.cut[string]).toEqual({ player, deadly: false, at: game.elapsed })
    expect(game.players[player]).toMatchObject({ out: null, cuts: 1 })
    expect(game.last).toEqual({ player, string, deadly: false, auto: false })
    expect(game.phase).toBe('result')
  })

  it('an eliminating string: launched off and out, and the turn skips them after', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const player = game.turn
    const string = standBy(game, true)
    cut(game, player, string)
    snap(game)
    expect(game.players[player].out).toEqual({ order: 1, at: game.elapsed, string })
    expect(deadlyLeft(game)).toBe(1)
    onward(game)
    expect(whoseTurn(game)).toBe((player + 1) % 3)
    for (let n = 0; n < 6; n++) {
      if (game.phase !== 'turn') break
      expect(whoseTurn(game)).not.toBe(player)
      cut(game, game.turn, standBy(game, false))
      onward(game)
    }
  })

  it('keeps a cut in suspense before it snaps, and says nothing of it until then', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const player = game.turn
    const string = standBy(game, true)
    expect(cut(game, player, string)).toBe(true)
    expect(game.phase).toBe('suspense')
    expect(game.pending).toEqual({ player, string, auto: false })
    expect(whoseTurn(game)).toBeNull()
    // No second cut while waiting.
    expect(cut(game, player, (string + 1) % game.count, { auto: true })).toBe(false)
    run(game, TOWER.suspense - 0.1)
    expect(game.phase).toBe('suspense')
    expect(game.cut[string]).toBeNull()
    expect(game.last).toBeNull()
    expect(game.players[player].out).toBeNull()
    expect(deadlyLeft(game)).toBe(2)
    run(game, 0.15)
    expect(game.phase).toBe('result')
    expect(game.pending).toBeNull()
    expect(game.players[player].out?.string).toBe(string)
  })

  it('refuses a cut off your turn, out of reach, on a cut string, or for another turn', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const player = game.turn
    const string = standBy(game, false)
    expect(cut(game, (player + 1) % 3, string)).toBe(false)
    expect(cut(game, player, string, { turn: 5 })).toBe(false)
    const far = webFor(game.seed, game.count).findIndex((s) => Math.hypot(s.rim.x - game.players[player].x, s.rim.z - game.players[player].y) > TOWER.reach + 1)
    expect(inReach(game, player, far)).toBe(false)
    expect(cut(game, player, far)).toBe(false)
    // Just out of reach, with the host's allowance for a guest: counts.
    const near = { x: game.players[player].x, y: game.players[player].y }
    const rim = webFor(game.seed, game.count)[string].rim
    const back = (TOWER.reach + TOWER.reachGrace * 0.5) / Math.hypot(rim.x - near.x, rim.z - near.y)
    Object.assign(game.players[player], { x: rim.x + (near.x - rim.x) * back, y: rim.z + (near.y - rim.z) * back })
    expect(cut(game, player, string)).toBe(false)
    expect(cut(game, player, string, { grace: TOWER.reachGrace, turn: 0 })).toBe(true)
    onward(game)
    expect(cut(game, game.turn, string, { grace: 100 })).toBe(false)
  })

  it('cuts the nearest string for you when your time runs out', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const player = game.turn
    const nearest = nearestString(game, player)
    run(game, TOWER.turn + 0.05)
    snap(game)
    expect(game.last).toMatchObject({ player, string: nearest, auto: true })
    expect(game.cut[nearest]?.player).toBe(player)
  })
})

describe('the end', () => {
  it('is the last one standing, and there are always exactly enough eliminating strings', () => {
    for (let luck = 1; luck <= 20; luck++) {
      const n = 2 + (luck % 7)
      const game = createGame(SEED, luck, cutters(n))
      let frames = 0
      while (game.phase !== 'over' && frames++ < 200000) {
        if (game.phase === 'turn' && game.clock > 0.1) {
          // Cut whatever is nearest, standing right by it.
          const string = nearestString(game, game.turn)
          const rim = webFor(game.seed, game.count)[string].rim
          Object.assign(game.players[game.turn], { x: rim.x * 0.85, y: rim.z * 0.85 })
          cut(game, game.turn, string)
        }
        stepGame(game, NONE, 0.05)
      }
      expect(game.phase).toBe('over')
      expect(standing(game)).toHaveLength(1)
      expect(game.cut.filter((c) => c?.deadly)).toHaveLength(n - 1)
      expect(deadlyLeft(game)).toBe(0)
    }
  })

  it('places the last one standing first, then by how long everybody lasted', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(3)))
    const a = game.turn
    cut(game, a, standBy(game, true))
    onward(game)
    const b = game.turn
    cut(game, b, standBy(game, true))
    onward(game)
    expect(game.phase).toBe('over')
    const c = [0, 1, 2].find((i) => i !== a && i !== b)!
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [c, 1],
      [b, 2],
      [a, 3],
    ])
  })

  it('takes out somebody who leaves, passing their turn on', () => {
    const game = toTurn(createGame(SEED, LUCK, cutters(4)))
    const player = game.turn
    leave(game, player)
    expect(game.players[player].out?.string).toBe(-1)
    expect(whoseTurn(game)).toBe((player + 1) % 4)
    leave(game, (player + 2) % 4)
    leave(game, (player + 3) % 4)
    expect(game.phase).toBe('over')
  })
})

describe('the tower top', () => {
  it('keeps bodies on it and out of each other', () => {
    const game = createGame(SEED, LUCK, cutters(4))
    const out = new Map(game.players.map((p) => [p.id, { x: p.x, y: p.y }]))
    run(game, 5, out)
    for (const p of game.players) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(TOWER.radius - TOWER.margin + 1e-6)
    const inward = new Map(game.players.map((p) => [p.id, { x: -p.x, y: -p.y }]))
    run(game, 3, inward)
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(Math.hypot(game.players[i].x - game.players[j].x, game.players[i].y - game.players[j].y)).toBeGreaterThan(TOWER.body * 2 - 0.05)
      }
    }
  })

  it('walks at its pace, facing the way it walks', () => {
    const game = createGame(SEED, LUCK, cutters(2))
    const body = { ...game.players[0], x: 0, y: 0 }
    walk(body, { x: 0, y: 1 }, 0.25)
    expect(body.y).toBeCloseTo(TOWER.speed * 0.25)
    expect(body.facing).toBeCloseTo(Math.PI / 2)
  })
})

describe('aiming', () => {
  it('finds the closest a ray passes to a string', () => {
    const hit = rayToSegment({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, { x: -5, y: 2, z: 1 }, { x: 5, y: 2, z: 1 })
    expect(hit.distance).toBeCloseTo(1)
    expect(hit.along).toBeCloseTo(8)
  })

  it('picks the string aimed at, and not a cut one', () => {
    const game = createGame(SEED, LUCK, cutters(4))
    const web = webFor(game.seed, game.count)
    const s = web[5]
    const mid = { x: (s.rim.x + s.end.x) / 2, y: (s.rim.y + s.end.y) / 2, z: (s.rim.z + s.end.z) / 2 }
    const eye = { x: 0, y: 40, z: 25 }
    const toward = { x: mid.x - eye.x, y: mid.y - eye.y, z: mid.z - eye.z }
    expect(aimAt(game, eye, toward)).toBe(5)
    game.cut[5] = { player: 0, deadly: false, at: 0 }
    expect(aimAt(game, eye, toward)).not.toBe(5)
    expect(aimAt(game, eye, { x: 0, y: 1, z: 0 })).toBeNull()
  })
})

describe('the stand-ins', () => {
  it('walk to a string on their turn, cut it, and play whole games to one winner', () => {
    for (let luck = 1; luck <= 12; luck++) {
      const game = createGame(SEED, luck, [{ id: 'me', bot: false }, ...cutters(3, true)])
      // "me" cuts whatever is nearest, from right by it.
      for (let frame = 0; frame < 100000 && game.phase !== 'over'; frame++) {
        if (whoseTurn(game) === 0 && game.clock > 0.5) {
          const string = nearestString(game, 0)
          const rim = webFor(game.seed, game.count)[string].rim
          Object.assign(game.players[0], { x: rim.x * 0.85, y: rim.z * 0.85 })
          cut(game, 0, string)
        }
        const move = botCut(game)
        if (move) cut(game, move.player, move.string)
        stepGame(game, botIntents(game), 0.05)
      }
      expect(game.phase).toBe('over')
      expect(standing(game)).toHaveLength(1)
      // The stand-ins made their own cuts, walking to them: none of theirs ran out of time.
      expect(game.players.filter((p) => p.bot).every((p) => p.cuts > 0 || p.out)).toBe(true)
    }
  })

  it('stand still off their turn and do not cut out of reach', () => {
    const game = toTurn(createGame(SEED, LUCK, [{ id: 'me' }, ...cutters(3, true)]))
    const intents = botIntents(game)
    game.players.forEach((p, i) => {
      if (p.bot && i !== game.turn) expect(intents.get(p.id)).toEqual({ x: 0, y: 0 })
    })
    if (game.players[game.turn].bot) {
      run(game, 3)
      const move = botCut(game)
      if (move) expect(distanceTo(game, move.player, move.string)).toBeLessThanOrEqual(TOWER.reach)
    }
  })
})
