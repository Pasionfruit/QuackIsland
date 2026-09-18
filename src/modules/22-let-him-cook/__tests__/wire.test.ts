/**
 * One kitchen on the wire - eight cooks through it - and the camera and clicks.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, LAYOUT, POINTS, basketAt, frameScene, itemAt, pickBasket } from '../internal/camera'
import { KINDS, KITCHEN, claimedOf, cookTime, createGame, pick, pickTime, stepGame, stillIn, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { LOOKAHEAD, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, shownPicks } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 20260916

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 41)
}

describe('a snapshot', () => {
  it('comes back as what everybody can see', () => {
    const game = host(4)
    while (game.phase !== 'turns') stepGame(game, 0.25)
    const slot = game.served.findIndex((k) => game.used[k] > 0)
    pick(game, game.queue[0], slot)

    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    for (const key of ['id', 'recipe', 'phase', 'counter', 'served', 'claimed', 'queue', 'turn', 'last'] as const) {
      expect(copy[key]).toEqual(game[key])
    }
    expect(copy.players.map((p) => [p.id, p.out, p.claims, p.mine])).toEqual(game.players.map((p) => [p.id, p.out, p.claims, p.id === 'p2']))
  })

  it('never carries the recipe', () => {
    const game = host()
    const at = (clock: number) => {
      game.clock = clock
      return relay(encodeSnapshot(game))
    }
    expect(JSON.stringify(at(0))).not.toContain(String(SEED))
    for (const message of [at(0), at(5), at(cookTime(game.picks.length) - 0.1)]) {
      expect(Object.keys(message).sort()).toEqual(['c', 'e', 'g', 'k', 'l', 'm', 'n', 'o', 'p', 'pl', 'q', 'r', 's', 't', 'x'])
    }
    while (game.phase !== 'turns') stepGame(game, 0.25)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    expect(copy.used).toEqual([])
    expect(copy.picks).toEqual([])
    // Where the baskets stand is not a secret: everybody watches them rotate.
    expect([copy.turned, copy.spin]).toEqual([game.turned, game.spin])
  })

  it("shows the chef's picks only as the chef reaches for them", () => {
    const game = host()
    game.clock = 0
    expect(shownPicks(game)).toEqual([])
    game.clock = pickTime(2)
    expect(shownPicks(game)).toEqual(game.picks.slice(0, 3))
    // Always a little ahead, so a guest has it before its moment - at every pace.
    for (const recipe of [0, 3, 5]) {
      game.recipe = recipe
      for (let n = 0; n < game.picks.length; n++) {
        game.clock = pickTime(n, recipe) - KITCHEN.reach
        expect(shownPicks(game)).toContain(game.picks[n])
        game.clock = pickTime(n, recipe) - KITCHEN.reach - LOOKAHEAD - 0.01
        expect(shownPicks(game)).not.toContain(game.picks[n])
      }
    }
  })

  it('keeps the picks a guest has been shown, until the next recipe', () => {
    const game = host()
    const copy = waitingGame()
    for (let t = 0; t < cookTime(game.picks.length) + 1; t += 0.1) {
      stepGame(game, 0.1)
      applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p1')
    }
    expect(game.phase).toBe('order')
    expect(copy.picks).toEqual(game.picks)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'sl' })).toBeNull()
    expect(decodeSnapshot({ ...good, k: '0123' })).toBeNull()
    expect(decodeSnapshot({ ...good, s: '999999999999999' })).toBeNull()
    expect(decodeSnapshot({ ...good, m: [7, ...(good.m as number[]).slice(1)] })).toBeNull()
    expect(decodeSnapshot({ ...good, q: [0, 9] })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [KITCHEN.items] })).toBeNull()
    expect(decodeSnapshot({ ...good, o: [0, KITCHEN.places] })).toBeNull()
    expect(decodeSnapshot({ ...good, o: [0] })).toBeNull()
    expect(decodeSnapshot({ ...good, pl: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, l: [0, 3, 2, 1] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: 9 })).toBeNull()
  })

  it('fits in a relay message with eight in the kitchen', () => {
    expect(JSON.stringify(encodeSnapshot(host(8))).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeIntent(relay(encodeIntent(41, 6, 14)))).toEqual({ game: 41, turn: 6, slot: 14 })
    expect(decodeIntent({ t: 'lhc-in', g: 41, n: 6, s: KITCHEN.items })).toBeNull()
    expect(decodeIntent({ t: 'lhc-in', g: 41, n: -1, s: 2 })).toBeNull()
    expect(decodeIntent({ t: 'lhc-in', n: 1, s: 2 })).toBeNull()
  })
})

describe('eight cooks in one kitchen', () => {
  it('agree on every claim, every out and the winner, with picks repeated and some lost', () => {
    const game = host(8)
    let seed = 5
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, i) => ({ id: p.id, index: i, copy: waitingGame() }))
    const dt = 0.1

    for (let frame = 0; frame < 30000 && game.phase !== 'over'; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        if (copy.players.length === 0) continue
        if (copy.phase !== 'turns' || copy.queue[0] !== guest.index) continue
        // What a guest remembers is what it was shown, counted up itself.
        const used = new Array(6).fill(0)
        for (const slot of copy.picks) used[copy.counter[slot]] += 1
        // A mostly careful cook: a copy it believes is left, or now and then any item.
        const open = copy.served.map((_, s) => s).filter((s) => copy.claimed[s] === null)
        const safe = open.filter((s) => used[copy.served[s]] > claimedOf(copy, copy.served[s]))
        const from = safe.length > 0 && random() > 0.15 ? safe : open
        const slot = from[Math.floor(random() * from.length)]
        // Said three times, and some of it lost.
        for (let n = 0; n < 3; n++) {
          if (random() < 0.3) continue
          const said = decodeIntent(relay(encodeIntent(copy.id, copy.turn, slot)))!
          if (said.game === game.id && said.turn === game.turn) pick(game, guest.index, said.slot)
        }
      }
      stepGame(game, dt)
      if (frame % 2 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) if (random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
    }
    const wire = relay(encodeSnapshot(game))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    expect(game.phase).toBe('over')
    expect(stillIn(game)).toHaveLength(1)
    expect(game.players.filter((p) => p.out?.why === 'wrong' || p.out?.why === 'gone').length).toBeGreaterThan(0)
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.out, p.claims])).toEqual(game.players.map((p) => [p.id, p.out, p.claims]))
      expect(guest.copy.phase).toBe('over')
    }
    // Nobody's pick counted twice: every turn was one claim or one out, never more.
    expect(game.players.reduce((n, p) => n + p.claims, 0) + game.outs).toBe(game.turn)
  })
})

describe('the fixed camera, and a click', () => {
  const aspects = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]
  const cameraFor = (aspect: number) => {
    const shot = frameScene(aspect)
    const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  it('keeps the whole kitchen in frame, and fills it, at every window shape', () => {
    for (const aspect of aspects) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const projected = points.map((p) => p.clone().project(camera))
      expect(Math.max(...projected.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))), `${aspect}`).toBeGreaterThan(FILL - 0.01)
      for (let kind = 0; kind < KINDS; kind++) {
        for (let n = 0; n < KITCHEN.copies; n++) {
          const at = itemAt(kind, n, KITCHEN.copies)
          expect(frustum.containsPoint(new Vector3(at.x, at.y + LAYOUT.item, at.z))).toBe(true)
        }
      }
    }
  })

  it('lands a click on a basket on that basket, anywhere on it, at every window shape and wherever it has turned to', () => {
    for (const aspect of aspects) {
      const camera = cameraFor(aspect)
      for (let turned = 0; turned < KITCHEN.places + 2; turned++) {
        for (let kind = 0; kind < KINDS; kind++) {
          const at = basketAt(kind, turned)
          for (const [dx, dy, dz] of [[0, 0, 0], [0.7, 0, 0], [-0.7, 0, 0], [0, LAYOUT.wall, 0.6], [0, 0.2, -0.6]]) {
            const screen = new Vector3(at.x + dx * LAYOUT.basket, at.y + dy, at.z + dz * LAYOUT.basket).project(camera)
            const direction = new Vector3(screen.x, screen.y, 0.5).unproject(camera).sub(camera.position)
            expect(pickBasket(camera.position, direction, undefined, turned), `${aspect} ${turned} ${kind}`).toBe(kind)
          }
        }
      }
    }
  })

  it('turns the baskets round the counter, every basket in its own place, all the way round in six', () => {
    for (let turned = 0; turned <= KITCHEN.places; turned++) {
      const places = Array.from({ length: KINDS }, (_, kind) => basketAt(kind, turned)).map((p) => `${p.x},${p.z}`)
      expect(new Set(places).size).toBe(KINDS)
    }
    for (let kind = 0; kind < KINDS; kind++) {
      expect(basketAt(kind, KITCHEN.places)).toEqual(basketAt(kind, 0))
      expect(basketAt(kind, 1)).not.toEqual(basketAt(kind, 0))
      // On the way: between one place and the next, never off the counter.
      const half = basketAt(kind, 0.5)
      expect(Math.abs(half.x)).toBeLessThanOrEqual(LAYOUT.spacing.x)
      expect(Math.abs(half.z)).toBeLessThanOrEqual(LAYOUT.spacing.z / 2)
    }
  })

  it('misses between baskets and passes through emptied ones', () => {
    const camera = cameraFor(1.6)
    const left = basketAt(0)
    const gap = new Vector3(left.x + LAYOUT.spacing.x / 2, LAYOUT.top, left.z).project(camera)
    const direction = new Vector3(gap.x, gap.y, 0.5).unproject(camera).sub(camera.position)
    expect(pickBasket(camera.position, direction)).toBeNull()
    const at = basketAt(4)
    const on = new Vector3(at.x, at.y, at.z).project(camera)
    const toBasket = new Vector3(on.x, on.y, 0.5).unproject(camera).sub(camera.position)
    expect(pickBasket(camera.position, toBasket)).toBe(4)
    expect(pickBasket(camera.position, toBasket, (kind) => kind === 4)).not.toBe(4)
  })
})
