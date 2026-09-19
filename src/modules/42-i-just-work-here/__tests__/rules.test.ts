/**
 * The rules: pieces, the desk, the bazooka, and the blast that does not care who fired it.
 */
import { describe, expect, it } from 'vitest'
import { blocked, distanceTo, officeFor } from '../internal/office'
import {
  BLAST,
  BODY,
  CARRIED,
  LOOSE,
  PIECES_EACH,
  PLACED,
  REACH,
  ROCKET,
  ROUND,
  act,
  aimDirection,
  atDesk,
  canFire,
  claimAct,
  claimFire,
  createGame,
  deskOf,
  drop,
  explode,
  fire,
  isArmed,
  judgeEnd,
  leave,
  pickUp,
  piecesOf,
  place,
  placedCount,
  placings,
  rocketTouch,
  stepGame,
  walk,
  yawTowards,
  type Game,
} from '../internal/rules'
import { EAST, arm, away, clearing, lane, stand } from './places'

const SEED = 777002

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 7)
}

/** Flies every rocket until none are left. */
function settle(g: Game): void {
  for (let i = 0; i < 200 && g.rockets.length > 0; i++) stepGame(g, 1 / 30)
}

/** A player at their own desk's front edge, or a metre off it, aiming straight at it. */
function facingDesk(g: Game, player: number, off: number): void {
  const home = deskOf(g, player)
  const north = home.spot.z > home.block.z1
  const z = north ? home.block.z1 + off : home.block.z0 - off
  stand(g, player, home.spot.x, z, yawTowards({ x: home.spot.x, z }, { x: home.spot.x, z: (home.block.z0 + home.block.z1) / 2 }))
}

describe('the start', () => {
  it('puts everybody at their own desk, and their four pieces well away from it', () => {
    for (const seed of [SEED, 11, 90210]) {
      const g = createGame(seed, Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` })))
      const office = officeFor(seed)
      g.players.forEach((p, i) => {
        expect(atDesk(g, i)).toBe(true)
        expect(blocked(office, p, BODY.radius)).toBe(false)
        const mine = piecesOf(g, i)
        expect(mine).toHaveLength(PIECES_EACH)
        expect(mine.map((k) => g.pieces[k].part)).toEqual([0, 1, 2, 3])
        for (const k of mine) {
          const it = g.pieces[k]
          expect(it.owner).toBe(i)
          expect(it.state).toBe(LOOSE)
          expect(blocked(office, it, 0.5)).toBe(false)
          expect(Math.hypot(it.x - p.x, it.z - p.z)).toBeGreaterThanOrEqual(9)
        }
        expect(isArmed(g, i)).toBe(false)
      })
    }
  })

  it('deals the same office and pieces for the same seed', () => {
    expect(JSON.stringify(game())).toBe(JSON.stringify(game()))
  })
})

describe('the pieces', () => {
  it('picks up only your own, only within reach, and only one at a time', () => {
    const g = game()
    const [a, b] = piecesOf(g, 0)
    const theirs = piecesOf(g, 1)[0]
    const it = g.pieces[a]
    stand(g, 0, it.x + REACH.piece + 0.2, it.z)
    expect(pickUp(g, 0, a)).toBe(false)
    stand(g, 0, it.x + 0.5, it.z)
    Object.assign(g.pieces[theirs], { x: it.x, z: it.z + 0.3 })
    Object.assign(g.pieces[b], { x: it.x + 0.4, z: it.z - 0.3 })
    expect(pickUp(g, 0, theirs)).toBe(false)
    expect(act(g, 0)).toBe('pick')
    const held = g.players[0].carrying
    expect([a, b]).toContain(held)
    expect(g.pieces[held].state).toBe(CARRIED)
    // Arms full: the other stays where it is.
    const other = held === a ? b : a
    expect(pickUp(g, 0, other)).toBe(false)
    expect(g.pieces[other].state).toBe(LOOSE)
  })

  it('slows you down while you carry, and the piece goes where you go', () => {
    const g = game()
    const { x, z } = lane(SEED)
    stand(g, 0, x, z)
    walk(g, 0, { x: 1, z: 0 }, 0.2)
    const empty = g.players[0].x - x
    expect(empty).toBeCloseTo(BODY.speed * 0.2, 5)
    const k = piecesOf(g, 0)[0]
    Object.assign(g.pieces[k], { x: g.players[0].x, z })
    expect(pickUp(g, 0, k)).toBe(true)
    const from = g.players[0].x
    walk(g, 0, { x: 1, z: 0 }, 0.2)
    expect(g.players[0].x - from).toBeCloseTo(BODY.carrying * 0.2, 5)
    expect(g.pieces[k]).toMatchObject({ x: g.players[0].x, z: g.players[0].z })
  })

  it('goes on your desk only at your desk; four there and you are armed', () => {
    const g = game()
    const home = deskOf(g, 0).spot
    for (const [n, k] of piecesOf(g, 0).entries()) {
      stand(g, 0, g.pieces[k].x, g.pieces[k].z)
      expect(act(g, 0)).toBe('pick')
      // Not at the desk: the left click does nothing.
      expect(atDesk(g, 0)).toBe(false)
      expect(act(g, 0)).toBe(null)
      // Nor at somebody else's.
      stand(g, 0, deskOf(g, 1).spot.x, deskOf(g, 1).spot.z)
      expect(place(g, 0)).toBe(false)
      stand(g, 0, home.x, home.z)
      expect(isArmed(g, 0)).toBe(false)
      expect(act(g, 0)).toBe('place')
      expect(g.pieces[k].state).toBe(PLACED)
      expect(distanceTo(deskOf(g, 0).block, g.pieces[k])).toBe(0)
      expect(placedCount(g, 0)).toBe(n + 1)
    }
    expect(isArmed(g, 0)).toBe(true)
  })

  it('drops where you stand, loose again, for picking up later', () => {
    const g = game()
    const k = piecesOf(g, 0)[2]
    stand(g, 0, g.pieces[k].x, g.pieces[k].z)
    pickUp(g, 0, k)
    const { x, z } = lane(SEED)
    stand(g, 0, x + 3, z)
    expect(drop(g, 0)).toBe(true)
    expect(g.pieces[k]).toMatchObject({ state: LOOSE, x: x + 3, z })
    expect(g.players[0].carrying).toBe(-1)
    expect(drop(g, 0)).toBe(false)
    expect(pickUp(g, 0, k)).toBe(true)
  })
})

describe('the bazooka', () => {
  it('fires only once armed, and not again until it has reloaded', () => {
    const g = game()
    const { x, z } = lane(SEED)
    stand(g, 0, x, z, EAST)
    away(g, 1, { x, z }, { x: x + 12, z })
    away(g, 2, { x, z }, { x: x + 12, z })
    expect(fire(g, 0)).toBe(null)
    arm(g, 0)
    expect(canFire(g, 0)).toBe(true)
    expect(fire(g, 0)).not.toBe(null)
    expect(fire(g, 0)).toBe(null)
    for (let i = 0; i < 20; i++) stepGame(g, (ROCKET.cooldown - 0.1) / 20)
    expect(canFire(g, 0)).toBe(false)
    stepGame(g, 0.15)
    expect(canFire(g, 0)).toBe(true)
  })

  it('eliminates whoever the rocket meets, and credits whoever fired it', () => {
    const g = arm(game(), 0)
    const { x, z } = lane(SEED)
    stand(g, 0, x, z, EAST)
    stand(g, 1, x + 8, z)
    away(g, 2, { x, z }, { x: x + 8, z })
    fire(g, 0)
    settle(g)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(0)
    expect(g.players[0]).toMatchObject({ out: null, kills: 1 })
    expect(g.players[2].out).toBe(null)
    expect(g.blasts).toHaveLength(1)
    expect(g.blasts[0].victims).toEqual([1])
  })

  it('takes everybody near where it bursts, and they go together', () => {
    const g = arm(game(4), 0)
    const { x, z } = clearing(SEED)
    away(g, 0, { x, z })
    stand(g, 1, x, z)
    stand(g, 2, x, z + BLAST.radius - 0.3)
    // Just outside it.
    stand(g, 3, x, z - BLAST.radius - 0.3)
    explode(g, 0, { x, z })
    expect(g.players.map((p) => p.out !== null)).toEqual([false, true, true, false])
    expect(g.players[0].kills).toBe(2)
    expect(g.players[1].out).toBe(g.players[2].out)
  })

  it('does not reach through furniture', () => {
    const g = arm(game(), 0)
    const desk = deskOf(g, 1)
    const cz = (desk.block.z0 + desk.block.z1) / 2
    // Somebody tucked in beside a desk, the blast on the far side of it.
    stand(g, 1, desk.block.x0 - 0.5, cz)
    away(g, 0, desk.spot)
    explode(g, 0, { x: desk.block.x1 + 0.3, z: cz })
    expect(g.players[1].out).toBe(null)
  })

  it('takes you too, if you fire at a wall you are standing next to', () => {
    const g = arm(game(), 0)
    facingDesk(g, 0, 1)
    const { t } = rocketTouch(g, 0, g.players[0], aimDirection(g.players[0].yaw), ROCKET.range)
    expect(t).toBeLessThan(BLAST.radius)
    expect(fire(g, 0)).not.toBe(null)
    settle(g)
    expect(g.players[0].out).not.toBe(null)
    expect(g.players[0].by).toBe(0)
    expect(g.players[0].kills).toBe(0)
  })

  it('bursts in your face if something is nearer than the barrel', () => {
    const g = arm(game(), 0)
    facingDesk(g, 0, BODY.radius + 0.01)
    const shot = fire(g, 0)
    expect(shot !== null && 'victims' in shot).toBe(true)
    expect(g.rockets).toHaveLength(0)
    expect(g.players[0].out).not.toBe(null)
  })

  it('is safe far enough from what it hits', () => {
    const g = arm(game(), 0)
    const { x, z } = lane(SEED)
    stand(g, 0, x, z, EAST)
    away(g, 1, { x, z })
    away(g, 2, { x, z })
    const { t } = rocketTouch(g, 0, g.players[0], aimDirection(EAST), ROCKET.range)
    expect(t).toBeGreaterThan(BLAST.radius)
    fire(g, 0)
    settle(g)
    expect(g.blasts).toHaveLength(1)
    expect(g.players[0].out).toBe(null)
  })

  it('knocks what you were carrying out of your arms', () => {
    const g = arm(game(), 0)
    const k = piecesOf(g, 1)[0]
    const { x, z } = clearing(SEED)
    away(g, 0, { x, z })
    stand(g, 1, x, z)
    Object.assign(g.pieces[k], { x, z })
    expect(pickUp(g, 1, k)).toBe(true)
    explode(g, 0, { x: x + 0.5, z })
    expect(g.players[1].carrying).toBe(-1)
    expect(g.pieces[k]).toMatchObject({ state: LOOSE, x, z })
  })
})

describe('the end', () => {
  it('is over when one is left standing, and they win', () => {
    const g = arm(game(), 0)
    const { x, z } = clearing(SEED)
    stand(g, 1, x, z - 0.5)
    stand(g, 2, x, z + 0.5)
    away(g, 0, { x, z })
    explode(g, 0, { x, z })
    expect(judgeEnd(g)).toBe(true)
    const order = placings(g)
    expect(order[0]).toMatchObject({ index: 0, place: 1 })
    expect(order.slice(1).map((e) => e.place)).toEqual([2, 2])
  })

  it('is over when a blast leaves nobody standing, and the last to go share first', () => {
    const g = arm(game(2), 0)
    const { x, z } = clearing(SEED)
    stand(g, 0, x, z)
    stand(g, 1, x + 1, z)
    stepGame(g, 1)
    explode(g, 0, { x: x + 0.5, z })
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1])
  })

  it('at the time limit puts those still standing first, most pieces on their desk first', () => {
    const g = game(4)
    for (const [player, n] of [
      [0, 1],
      [1, 3],
      [2, 3],
      [3, 0],
    ] as const) {
      for (const k of piecesOf(g, player).slice(0, n)) g.pieces[k].state = PLACED
    }
    stepGame(g, 0.25)
    const { x, z } = clearing(SEED)
    for (const p of [0, 1, 2]) away(g, p, { x, z })
    stand(g, 0, deskOf(g, 0).spot.x, deskOf(g, 0).spot.z)
    stand(g, 1, deskOf(g, 1).spot.x, deskOf(g, 1).spot.z)
    stand(g, 2, deskOf(g, 2).spot.x, deskOf(g, 2).spot.z)
    stand(g, 3, x, z)
    explode(g, 0, { x, z })
    while (!g.over) stepGame(g, 0.25)
    expect(g.elapsed).toBeGreaterThanOrEqual(ROUND.limit)
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [1, 1],
      [2, 1],
      [0, 3],
      [3, 4],
    ])
  })

  it('puts anybody who left standing last, and what they carried falls where they stood', () => {
    const g = game(3)
    const k = piecesOf(g, 1)[0]
    stand(g, 1, g.pieces[k].x, g.pieces[k].z)
    pickUp(g, 1, k)
    stepGame(g, 0.25)
    leave(g, 1)
    expect(g.pieces[k].state).toBe(LOOSE)
    expect(judgeEnd(g)).toBe(false)
    stepGame(g, 0.25)
    leave(g, 2)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 2, 1])
  })
})

describe('a guest, checked by the host', () => {
  it('fires only armed, not too soon, and from where it really is', () => {
    const g = game()
    const { x, z } = lane(SEED)
    stand(g, 1, x, z)
    away(g, 0, { x, z }, { x: x + 12, z })
    away(g, 2, { x, z }, { x: x + 12, z })
    stepGame(g, 0.25)
    expect(claimFire(g, 1, { x, z, yaw: EAST })).toBe(null)
    arm(g, 1)
    const first = claimFire(g, 1, { x: x + 0.5, z, yaw: EAST })
    expect(first !== null && 'left' in first ? first.x : NaN).toBeCloseTo(x + 0.5 + ROCKET.muzzle, 5)
    stepGame(g, 0.5)
    expect(claimFire(g, 1, { x: x + 0.5, z, yaw: EAST })).toBe(null)
    for (let i = 0; i < 8; i++) stepGame(g, ROCKET.cooldown / 8)
    // Claiming to be somewhere far off: fired from where the host has it instead.
    const far = claimFire(g, 1, { x: x + 8, z, yaw: EAST })
    expect(far !== null && 'left' in far ? far.x : NaN).toBeCloseTo(g.players[1].x + ROCKET.muzzle, 5)
  })

  it("picks up and places with a little slack, but never somebody else's", () => {
    const g = game()
    stepGame(g, 0.25)
    const k = piecesOf(g, 1)[1]
    const theirs = piecesOf(g, 2)[1]
    const it = g.pieces[k]
    stand(g, 1, it.x + REACH.piece + 1, it.z)
    Object.assign(g.pieces[theirs], { x: it.x, z: it.z })
    expect(claimAct(g, 1, 'pick', theirs, g.players[1])).toBe(false)
    // Its own screen had it a little nearer than the host does.
    expect(claimAct(g, 1, 'pick', k, { x: it.x + 1, z: it.z })).toBe(true)
    expect(g.players[1].carrying).toBe(k)
    const home = deskOf(g, 1).spot
    stand(g, 1, home.x, home.z)
    expect(claimAct(g, 1, 'place', -1, home)).toBe(true)
    expect(g.pieces[k].state).toBe(PLACED)
  })
})
