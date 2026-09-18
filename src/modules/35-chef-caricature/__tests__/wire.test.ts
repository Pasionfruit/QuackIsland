/**
 * The drawing on the wire - a drawer's pen replayed by the host and everybody
 * watching - the stand-ins, and the camera square on to the board.
 */
import { Frustum, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { botDraw } from '../internal/ai'
import { BOARD, FILL, POINTS, boardPoint, boardToScreen, cameraFor } from '../internal/camera'
import { pointAlong } from '../internal/outlines'
import { TURN, createGame, currentOutline, drawer, penDown, penMove, penUp, phase, stepGame, tick, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { MAX_POINTS, applyInk, applySnapshot, decodeInk, decodeSnapshot, encodeInk, encodeSnapshot, type Ink } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777005

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 61)
}

function toDrawing(g: Game) {
  for (let i = 0; phase(g) !== 'drawing'; i++) {
    if (i > 100000 || g.over) throw new Error('never got to drawing')
    stepGame(g, 0.05)
  }
}

const hear = (game: Game, copy: Game, me: string) => applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, me)

describe('a snapshot', () => {
  it('carries the turn, the outline and the scores, and a copy a dish ahead keeps its lead', () => {
    const game = host(3)
    toDrawing(game)
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy).toMatchObject({ id: 61, seed: SEED, turn: 0, outline: 0, order: game.order })
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    // The copy has heard the pen and fed the duck; the host has not yet.
    const d = drawer(game)
    copy.elapsed = game.elapsed
    copy.outline = 1
    copy.players[d].score = 1
    hear(game, copy, 'p2')
    expect(copy.outline).toBe(1)
    expect(copy.players[d].score).toBe(1)
    // The host moves on to the next turn: the copy follows, drawing and all.
    while (game.turn === 0) stepGame(game, 0.1)
    hear(game, copy, 'p2')
    expect(copy).toMatchObject({ turn: 1, outline: 0, stroke: null, dish: null })
    expect(copy.players[d].score).toBe(0)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host(3)))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'cc-ink' })).toBeNull()
    expect(decodeSnapshot({ ...good, q: [0, 1, 1] })).toBeNull()
    expect(decodeSnapshot({ ...good, q: [0, 1] })).toBeNull()
    expect(decodeSnapshot({ ...good, n: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(JSON.stringify(encodeSnapshot(createGame(SEED, Array.from({ length: 8 }, (_, i) => ({ id: `player-${i}-with-a-long-id-for-a-name` }))))).length).toBeLessThan(4096)
  })
})

describe('ink', () => {
  it('comes back as what was sent, and is refused when it is not ink', () => {
    const ink: Ink = { game: 61, turn: 2, outline: 3, stroke: 4, points: [100, -200, 1080, -1080], up: true }
    expect(decodeInk(relay(encodeInk(ink)))).toEqual(ink)
    expect(decodeInk({ ...relay(encodeInk(ink)), p: [1, 2, 3] })).toBeNull()
    expect(decodeInk({ ...relay(encodeInk(ink)), p: [2000, 0] })).toBeNull()
    expect(decodeInk({ ...relay(encodeInk(ink)), p: [1.5, 0] })).toBeNull()
    expect(decodeInk({ ...relay(encodeInk(ink)), u: 2 })).toBeNull()
    expect(JSON.stringify(encodeInk({ ...ink, points: Array.from({ length: MAX_POINTS * 2 }, () => -1080) })).length).toBeLessThan(4096)
  })

  it('from anybody but the drawer, for another turn, or for another outline, changes nothing', () => {
    const game = host(3)
    toDrawing(game)
    const d = drawer(game)
    const ink: Ink = { game: 61, turn: 0, outline: 0, stroke: 1, points: [0, 0, 100, 0], up: false }
    applyInk(game, (d + 1) % 3, ink)
    applyInk(game, d, { ...ink, turn: 1 })
    applyInk(game, d, { ...ink, outline: 1 })
    applyInk(game, d, { ...ink, game: 62 })
    expect(game.stroke).toBeNull()
    applyInk(game, d, ink)
    expect(game.stroke?.points).toEqual([0, 0, 0.1, 0])
  })
})

describe("a drawer's pen, sent to everybody", () => {
  it('draws the same drawings and feeds the duck the same dishes on every screen, the host deciding', () => {
    const game = host(4)
    toDrawing(game)
    const d = drawer(game)
    const ids = game.players.map((p) => p.id)
    // Every player's own copy; the drawer's is where the pen really is.
    const copies = ids.map((id) => hear(game, waitingGame(), id))
    const drawerCopy = copies[d]
    const sent: { at: number; message: Record<string, unknown> }[] = []
    let pending: Ink | null = null
    let now = 0
    let wobbleSeed = 11
    const random = () => (wobbleSeed = (wobbleSeed * 16807) % 2147483647) / 2147483647
    const flush = () => {
      if (pending && (pending.points.length > 0 || pending.up)) sent.push({ at: now, message: encodeInk(pending) })
      pending = pending && !pending.up ? { ...pending, points: [] } : null
    }
    const recorded = (g: Game) => [Math.round(g.stroke!.points[g.stroke!.points.length - 2] * 1000), Math.round(g.stroke!.points[g.stroke!.points.length - 1] * 1000)]

    let drawn = 0
    let attempt = 0
    const dt = 1 / 60
    for (let frame = 0; phase(game) !== 'result' && frame < 60 * 60; frame++) {
      now += dt
      // The drawer's hand, on its own screen: trace, slip every third attempt.
      tick(drawerCopy, dt)
      drawerCopy.elapsed = game.elapsed
      if (phase(drawerCopy) === 'drawing') {
        if (!drawerCopy.stroke) {
          if (drawerCopy.lift) {
            penUp(drawerCopy, d)
            pending = { game: 61, turn: 0, outline: drawerCopy.outline, stroke: drawerCopy.strokes, points: [], up: true }
            flush()
          }
          const start = pointAlong(currentOutline(drawerCopy), attempt * 0.7)
          if (penDown(drawerCopy, d, start.x, start.y)) {
            flush()
            pending = { game: 61, turn: 0, outline: drawerCopy.outline, stroke: drawerCopy.stroke!.id, points: recorded(drawerCopy), up: false }
            drawn = 0
          }
        } else {
          for (let s = 0; s < 3 && drawerCopy.stroke; s++) {
            drawn += 0.025
            const outline = currentOutline(drawerCopy)
            const p = pointAlong(outline, attempt * 0.7 + drawn)
            const stroke = drawerCopy.stroke
            const had = stroke.points.length
            const said = penMove(drawerCopy, d, p.x + (random() - 0.5) * 0.04, p.y + (random() - 0.5) * 0.04)
            if (stroke.points.length > had) pending!.points.push(...[Math.round(stroke.points[stroke.points.length - 2] * 1000), Math.round(stroke.points[stroke.points.length - 1] * 1000)])
            if (said === 'accepted') {
              flush()
              attempt += 1
            } else if (attempt % 3 === 2 && drawn > outline.length * 0.4) {
              penUp(drawerCopy, d)
              pending!.up = true
              flush()
              attempt += 1
            }
          }
        }
      }
      if (frame % 3 === 0) flush()

      // The relay: everybody else gets the drawer's ink 40 ms later, in order.
      for (const m of sent.filter((m) => m.at <= now - 0.04)) {
        sent.splice(sent.indexOf(m), 1)
        const ink = decodeInk(relay(m.message))!
        applyInk(game, d, ink)
        copies.forEach((copy, i) => {
          if (i !== d) applyInk(copy, d, ink)
        })
      }
      stepGame(game, dt)
      copies.forEach((copy, i) => {
        if (i === d) return
        tick(copy, dt)
        copy.elapsed = game.elapsed
      })
      if (frame % 6 === 0) copies.forEach((copy, i) => hear(game, copy, ids[i]))
    }

    expect(game.players[d].score).toBeGreaterThanOrEqual(5)
    // The host fed the duck exactly what the drawer's own screen did.
    expect(game.players[d].score).toBe(drawerCopy.players[d].score)
    for (const [i, copy] of copies.entries()) {
      hear(game, copy, ids[i])
      expect(copy.players.map((p) => p.score)).toEqual(game.players.map((p) => p.score))
    }
  })
})

describe('the stand-ins', () => {
  it('trace outline after outline in their turn, now and then slipping, the same way every time', () => {
    const runs = [1, 2].map(() => {
      const g = createGame(SEED, Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, bot: true })), 1)
      let wiped = 0
      let last: number | null = null
      for (let i = 0; i < 60 * 200 && !g.over; i++) {
        botDraw(g, 1 / 60)
        stepGame(g, 1 / 60)
        if (g.erasedAt !== last && g.erasedAt !== null) wiped += 1
        last = g.erasedAt
      }
      return { g, wiped }
    })
    const [{ g, wiped }] = runs
    expect(g.over).toBe(true)
    for (const p of g.players) {
      expect(p.score).toBeGreaterThanOrEqual(5)
      expect(p.score).toBeLessThanOrEqual(16)
    }
    expect(wiped).toBeGreaterThan(0)
    expect(runs[1].g.players.map((p) => p.score)).toEqual(g.players.map((p) => p.score))
    expect(TURN.length).toBe(30)
  })
})

describe('the fixed camera', () => {
  it('keeps the easel, the duck and the chef in frame, and fills it, at every window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.02)
    }
  })

  it('sees the board square on: a square on the screen, and the mouse exactly where it points', () => {
    for (const aspect of [0.75, 1.78, 2.35]) {
      const a = boardToScreen({ x: -1, y: -1 }, aspect)
      const b = boardToScreen({ x: 1, y: 1 }, aspect)
      // Width and height on the screen in the same units: NDC x is stretched by the aspect.
      expect(((b.x - a.x) * aspect) / (b.y - a.y)).toBeCloseTo(1, 6)
      for (const p of [
        { x: 0, y: 0 },
        { x: -0.9, y: 0.7 },
        { x: 0.55, y: -0.95 },
      ]) {
        const at = boardPoint(boardToScreen(p, aspect), aspect)!
        expect(at.x).toBeCloseTo(p.x, 6)
        expect(at.y).toBeCloseTo(p.y, 6)
      }
      // Halfway across the screen between two board points is halfway across the board: no perspective.
      const mid = boardPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, aspect)!
      expect(mid.x).toBeCloseTo(0, 6)
      expect(mid.y).toBeCloseTo(0, 6)
    }
    expect(BOARD.half).toBeGreaterThan(2)
  })
})
