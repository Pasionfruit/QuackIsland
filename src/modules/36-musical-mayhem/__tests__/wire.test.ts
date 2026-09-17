/**
 * One floor on the wire: the host's snapshot, a guest's hands, and the thing
 * the snapshot must never give away - when the music is going to stop.
 */
import { Frustum, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, POINTS, cameraFor } from '../internal/camera'
import { BASS, MELODY, TEMPO, frequency, stepNotes } from '../internal/tune'
import { BODY, CHAIR, FLOOR, PUSH, ROUND, chairAt, createGame, leave, musicFor, phase, sit, stepGame, type Game } from '../internal/rules'
import { gameId, waitingGame } from '../internal/setup'
import { applySnapshot, decodeHands, decodeSnapshot, encodeHands, encodeSnapshot } from '../internal/wire'

const SEED = 4180211
/** Everything a message survives on its way through the relay, and no more. */
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 4): Game {
  return createGame(
    SEED,
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })),
    gameId(SEED),
  )
}

const hear = (game: Game, copy: Game, me: string) => applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, me)

/** Wrapped to -pi..pi, which is all the wire carries and all an angle means. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Puts player `i` right by chair `c`, just outside it, so they can sit on it. */
function byChair(g: Game, i: number, c: number) {
  const at = chairAt(g.chairs, c)
  g.players[i].x = at.x + Math.sin(at.facing) * (BODY.radius + CHAIR.radius + 0.05)
  g.players[i].z = at.z + Math.cos(at.facing) * (BODY.radius + CHAIR.radius + 0.05)
}

/** A step is capped at a tenth of a second, so seconds are waited out a frame at a time. */
function wait(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9 && !g.over; t += 1 / 60) stepGame(g, Math.min(1 / 60, seconds - t))
}

function until(g: Game, want: string, limit = 60) {
  for (let t = 0; phase(g) !== want; t += 1 / 60) {
    if (t > limit || g.over) throw new Error(`never got to ${want}: ${phase(g)}`)
    stepGame(g, 1 / 60)
  }
}

describe('a snapshot', () => {
  it('carries the round, the phase, the chairs and every body, and says which one is yours', () => {
    const game = host(4)
    until(game, 'scramble')
    byChair(game, 1, 0)
    expect(sit(game, 1)).toBe(0)
    game.players[2].stunned = 0.4
    const copy = hear(game, waitingGame(), 'p2')

    expect(copy).toMatchObject({ id: game.id, round: game.round, phase: 'scramble', chairs: 3, over: false })
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
      ['p4', false],
    ])
    for (const [i, p] of copy.players.entries()) {
      expect(p.x, `x ${i}`).toBeCloseTo(game.players[i].x, 1)
      expect(p.z, `z ${i}`).toBeCloseTo(game.players[i].z, 1)
      expect(p.facing, `facing ${i}`).toBeCloseTo(wrap(game.players[i].facing), 2)
    }
    expect(copy.players[1].seat).toBe(game.players[1].seat)
    expect(copy.players[2].stunned).toBeCloseTo(0.4, 2)
    expect(copy.hands).toHaveLength(4)
  })

  it('carries how long a sitter has sat, so a copy knows who is safe without being told', () => {
    const game = host(4)
    until(game, 'scramble')
    byChair(game, 0, 0)
    expect(sit(game, 0)).toBe(0)
    wait(game, ROUND.settle + 0.1)
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.elapsed - copy.players[0].seatedAt!).toBeGreaterThanOrEqual(ROUND.settle)
  })

  it('carries who is out and who has left, and the end of the game', () => {
    const game = host(3)
    until(game, 'scramble')
    leave(game, 2)
    byChair(game, 0, 0)
    expect(sit(game, 0)).toBe(0)
    for (let i = 0; i < 2400 && !game.over; i++) stepGame(game, 1 / 60)
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.over).toBe(true)
    expect(copy.players[2].left).toBe(true)
    expect(copy.players.map((p) => p.out)).toEqual(game.players.map((p) => p.out))
  })

  it('never carries the seed, so nobody but the host can work out when the music stops', () => {
    const game = host(4)
    const message = relay(encodeSnapshot(game))
    expect(Object.values(message)).not.toContain(SEED)
    // The id is on the wire, and it is a hash: it is not the seed and does not give it.
    expect(message.g).toBe(gameId(SEED))
    expect(message.g).not.toBe(SEED)
    // A guest's copy therefore has no seed at all, and no way to time the stop.
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.seed).toBe(0)
    expect(musicFor(SEED, 1)).not.toBe(musicFor(copy.seed, 1))
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host(4)))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'mm-in' })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 9 })).toBeNull()
    expect(decodeSnapshot({ ...good, e: -1 })).toBeNull()
    expect(decodeSnapshot({ ...good, o: 2 })).toBeNull()
    // More chairs than there are players to sit on them.
    expect(decodeSnapshot({ ...good, c: 4 })).toBeNull()
    expect(decodeSnapshot({ ...good, c: 0 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    // A body off the floor, a seat that is not a chair, a stun that never ends.
    const players = good.p as unknown[][]
    const bent = (i: number, at: number, to: unknown) => ({ ...good, p: players.map((row, j) => (j === i ? row.map((v, k) => (k === at ? to : v)) : row)) })
    expect(decodeSnapshot(bent(0, 1, Math.round(FLOOR.radius * 100) + 5000))).toBeNull()
    expect(decodeSnapshot(bent(0, 4, 3))).toBeNull()
    expect(decodeSnapshot(bent(0, 6, 5000))).toBeNull()
    expect(decodeSnapshot(bent(0, 0, ''))).toBeNull()
  })

  it('takes a copy from one game to the next without leaving the old bodies behind', () => {
    const first = host(4)
    const copy = hear(first, waitingGame(), 'p2')
    expect(copy.players).toHaveLength(4)
    const second = createGame(SEED + 1, [{ id: 'p1' }, { id: 'p2', mine: true }], gameId(SEED + 1))
    hear(second, copy, 'p2')
    expect(copy.id).toBe(second.id)
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.elapsed).toBeCloseTo(second.elapsed, 5)
  })
})

describe('a guest saying what its hands are doing', () => {
  it('carries where the keys point and a count of presses, so none is lost or counted twice', () => {
    const said = { game: 77, x: -1, z: 0.5, sits: 3, pushes: 2 }
    expect(decodeHands(relay(encodeHands(said)))).toEqual(said)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeHands({ game: 1, x: 0, z: 0, sits: 0, pushes: 0 }))
    expect(decodeHands(good)).not.toBeNull()
    expect(decodeHands({ ...good, t: 'mm' })).toBeNull()
    expect(decodeHands({ ...good, x: 400 })).toBeNull()
    expect(decodeHands({ ...good, s: -1 })).toBeNull()
    expect(decodeHands({ ...good, p: 1.5 })).toBeNull()
  })
})

describe('the tune', () => {
  it('is a loop of whole bars, in a range a square wave can carry', () => {
    expect(MELODY.length % 8).toBe(0)
    expect(BASS.length % 4).toBe(0)
    for (const note of [...MELODY, ...BASS]) {
      if (note === 0) continue
      expect(note).toBeGreaterThan(36)
      expect(note).toBeLessThan(96)
    }
    expect(TEMPO).toBeGreaterThan(100)
  })

  it('puts a bass note under every other melody step and never between them', () => {
    expect(frequency(69)).toBeCloseTo(440, 6)
    expect(frequency(81)).toBeCloseTo(880, 6)
    for (let step = 0; step < MELODY.length * 2; step++) {
      const { melody, bass } = stepNotes(step)
      expect(melody).toBe(MELODY[step % MELODY.length])
      if (step % 2 === 1) expect(bass).toBe(0)
    }
    expect(stepNotes(-2).melody).toBe(MELODY[MELODY.length - 2])
  })
})

describe('the camera over the floor', () => {
  it('holds the whole floor - and a body standing on its rim - in frame at any shape of window', () => {
    for (const aspect of [0.55, 1, 16 / 9, 2.4]) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      const point = new Vector3()
      for (const [x, y, z] of POINTS) {
        expect(frustum.containsPoint(point.set(x, y, z)), `${aspect} ${x},${y},${z}`).toBe(true)
        point.set(x, y, z).project(camera)
        expect(Math.abs(point.x), `${aspect} across`).toBeLessThanOrEqual(FILL + 1e-6)
        expect(Math.abs(point.y), `${aspect} down`).toBeLessThanOrEqual(FILL + 1e-6)
      }
      // Square on to the middle of the floor, and above it: W runs up the screen.
      expect(camera.position.x).toBeCloseTo(0, 6)
      expect(camera.position.y).toBeGreaterThan(0)
      expect(camera.position.z).toBeGreaterThan(0)
    }
  })

  it('pulls back for a narrow window rather than cropping the floor', () => {
    expect(cameraFor(0.6).position.length()).toBeGreaterThan(cameraFor(1.8).position.length())
  })

  it('is the same camera for the same window, so nothing is rebuilt each frame', () => {
    expect(cameraFor(1.5)).toBe(cameraFor(1.5))
  })
})

describe('the ring, on the wire and off it', () => {
  it('never puts two chairs where a body could stand between them, at any size', () => {
    for (let n = 2; n <= 7; n++) {
      const a = chairAt(n, 0)
      const b = chairAt(n, 1)
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${n}`).toBeGreaterThan(CHAIR.radius * 2)
    }
  })

  it('keeps every chair well inside the floor, so nobody is pushed off the edge sitting down', () => {
    for (let n = 1; n <= 7; n++) {
      for (let i = 0; i < n; i++) {
        const at = chairAt(n, i)
        expect(Math.hypot(at.x, at.z) + CHAIR.radius + PUSH.reach).toBeLessThan(FLOOR.radius)
      }
    }
  })
})
