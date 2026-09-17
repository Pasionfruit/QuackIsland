/**
 * One game on the wire - eight cutters through it - and the camera and aim.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, POINTS, frameScene } from '../internal/camera'
import { TOWER, aimAt, createGame, cut, nearestString, standing, stepGame, webFor, whoseTurn, type Game, type Intent } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 424242
const LUCK = 717171
const NONE = new Map<string, Intent>()

function host(n = 3): Game {
  return createGame(SEED, LUCK, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 63)
}

function toTurn(game: Game): Game {
  while (game.phase !== 'turn') stepGame(game, NONE, 0.05)
  return game
}

describe('a snapshot', () => {
  it('comes back as the game that went out', () => {
    const game = toTurn(host(4))
    const player = game.turn
    const string = game.deadly.indexOf(true)
    const rim = webFor(game.seed, game.count)[string].rim
    Object.assign(game.players[player], { x: rim.x * 0.85, y: rim.z * 0.85 })
    cut(game, player, string)

    const copy = waitingGame()
    const at = applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    for (const key of ['id', 'seed', 'count', 'phase', 'turn', 'turns', 'last'] as const) expect(copy[key]).toEqual(game[key])
    expect(copy.cut.map((c) => (c ? [c.player, c.deadly] : null))).toEqual(game.cut.map((c) => (c ? [c.player, c.deadly] : null)))
    expect(copy.players.map((p) => [p.id, p.out?.order ?? 0, p.out?.string ?? -1, p.cuts, p.seq, p.mine])).toEqual(
      game.players.map((p) => [p.id, p.out?.order ?? 0, p.out?.string ?? -1, p.cuts, p.seq, p.id === 'p2']),
    )
    for (const p of game.players) expect(at.get(p.id)!.x).toBeCloseTo(p.x, 1)
  })

  it('never says which uncut strings eliminate', () => {
    const game = toTurn(host(8))
    const message = relay(encodeSnapshot(game))
    expect(JSON.stringify(message)).not.toContain(String(LUCK))
    const copy = waitingGame()
    applySnapshot(copy, decodeSnapshot(message)!, 'p1')
    expect(copy.deadly).toEqual([])
    expect(copy.luck).toBe(0)
    expect(copy.cut.every((c) => c === null)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'll' })).toBeNull()
    expect(decodeSnapshot({ ...good, f: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, k: 40 })).toBeNull()
    expect(decodeSnapshot({ ...good, u: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [[99, 0, 1, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, x: [[1, 0, 2, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, l: [0, 1, 0] })).toBeNull()
    const f = good.f as unknown[][]
    expect(decodeSnapshot({ ...good, f: [f[0].map((v, i) => (i === 5 ? 99 : v))] })).toBeNull()
  })

  it('fits in a relay message with eight on the tower and every string cut', () => {
    const game = host(8)
    game.cut = game.cut.map((_, i) => ({ player: i % 8, deadly: i % 5 === 0, at: 123.45 }))
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, with the walk clamped', () => {
    const intent = { game: 63, walk: { x: 0.5, y: -0.5 }, cut: { seq: 3, turn: 7, string: 12 } }
    expect(decodeIntent(relay(encodeIntent(intent)))).toEqual(intent)
    expect(decodeIntent(relay(encodeIntent({ game: 63, walk: { x: 0, y: 1 }, cut: null })))).toEqual({ game: 63, walk: { x: 0, y: 1 }, cut: null })
    const fast = decodeIntent({ t: 'mc-in', g: 1, x: 30, y: 40, q: 0, n: 0, s: -1 })!
    expect(Math.hypot(fast.walk.x, fast.walk.y)).toBeCloseTo(1)
    expect(decodeIntent({ t: 'mc-in', g: 1, x: 0, y: 0, q: -1, n: 0, s: -1 })).toBeNull()
  })
})

describe('eight cutters on one tower', () => {
  it('agree on every cut and who went out, with cuts said again and some lost', () => {
    const game = host(8)
    let seed = 9
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: waitingGame(), seq: 0, asked: null as { seq: number; turn: number; string: number } | null }))
    const heard = new Map<string, Intent>()
    const dt = 0.05

    for (let frame = 0; frame < 60000 && game.phase !== 'over'; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        const me = copy.players[guest.index]
        if (!me || me.out) continue
        let walk: Intent = { x: 0, y: 0 }
        if (whoseTurn(copy) === guest.index && copy.clock > 0.3) {
          // Walk to the nearest string on our own copy, and cut it once in reach.
          const hostMe = game.players[guest.index]
          const string = nearestString(game, guest.index)
          const rim = webFor(copy.seed, copy.count)[string].rim
          const dx = rim.x - hostMe.x
          const dy = rim.z - hostMe.y
          const far = Math.hypot(dx, dy)
          if (far > TOWER.reach * 0.6) walk = { x: dx / far, y: dy / far }
          else if (!guest.asked || guest.asked.turn !== copy.turns) guest.asked = { seq: ++guest.seq, turn: copy.turns, string }
        }
        heard.set(guest.id, walk)
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent({ game: copy.id, walk, cut: guest.asked })))!
        heard.set(guest.id, said.walk)
        const cutter = game.players[guest.index]
        if (said.cut && said.cut.seq > cutter.seq) {
          cutter.seq = said.cut.seq
          cut(game, guest.index, said.cut.string, { turn: said.cut.turn, grace: TOWER.reachGrace })
        }
      }
      stepGame(game, heard, dt)
      if (frame % 2 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests) {
          if (random() < 0.2) continue
          const copy = guest.copy
          const at = applySnapshot(copy, decodeSnapshot(wire)!, guest.id)
          for (const p of copy.players) Object.assign(p, at.get(p.id))
          copy.clock = game.clock
        }
      }
    }
    const wire = relay(encodeSnapshot(game))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    expect(game.phase).toBe('over')
    expect(standing(game)).toHaveLength(1)
    expect(game.cut.filter((c) => c?.deadly)).toHaveLength(7)
    // Every turn was one cut: no cut counted twice.
    expect(game.cut.filter(Boolean)).toHaveLength(game.turns)
    for (const guest of guests) {
      expect(guest.copy.cut.map((c) => (c ? [c.player, c.deadly] : null))).toEqual(game.cut.map((c) => (c ? [c.player, c.deadly] : null)))
      expect(guest.copy.players.map((p) => [p.id, p.out?.order ?? 0])).toEqual(game.players.map((p) => [p.id, p.out?.order ?? 0]))
    }
  })
})

describe('the fixed camera, and aiming through it', () => {
  const aspects = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]
  const cameraFor = (aspect: number) => {
    const shot = frameScene(aspect)
    const camera = new PerspectiveCamera(FOV, aspect, 0.5, 400)
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  it('keeps the tower and the whole web in frame, and fills it, at every window shape', () => {
    for (const aspect of aspects) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const points = POINTS.map(([x, y, z]) => new Vector3(x, y, z))
      for (const p of points) expect(frustum.containsPoint(p), `${aspect}`).toBe(true)
      const reach = Math.max(...points.map((p) => p.clone().project(camera)).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('lands the aim on the string under the pointer, near the rim and further down, at every window shape', () => {
    for (const players of [2, 4, 8]) {
      const game = host(players)
      const web = webFor(game.seed, game.count)
      for (const aspect of aspects) {
        const camera = cameraFor(aspect)
        web.forEach((strand, string) => {
          for (const along of [0.15, 0.5]) {
            const point = new Vector3(
              strand.rim.x + (strand.end.x - strand.rim.x) * along,
              strand.rim.y + (strand.end.y - strand.rim.y) * along,
              strand.rim.z + (strand.end.z - strand.rim.z) * along,
            )
            const screen = point.project(camera)
            const direction = new Vector3(screen.x, screen.y, 0.5).unproject(camera).sub(camera.position)
            expect(aimAt(game, camera.position, direction), `${players} ${aspect} ${string} ${along}`).toBe(string)
          }
        })
      }
    }
  })
})
