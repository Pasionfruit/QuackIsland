/**
 * The push, the slipperier ice, and the last fall being watched before the game is over.
 */
import { describe, expect, it } from 'vitest'
import { PHASES, dealFor, panelCentre } from '../internal/arena'
import { PUSH, ROUND, SLIDE, BODY, createGame, decided, isStanding, judgeEnd, lastFall, move, placings, push, slide, speedOf, steer, stepGame, yawTowards, type Game } from '../internal/rules'
import { applySnapshot, decodeSnapshot, encodeSnapshot } from '../internal/wire'
import { waitingGame } from '../internal/setup'

const SEED = 8080
const EAST = -Math.PI / 2

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5)
}

function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, vx: 0, vz: 0, mx: 0, mz: 0, run: false, knockedBy: null, knockedAt: -Infinity, pushedAt: -Infinity })
}

function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(1 / 30, until - g.elapsed))
}

describe('a push', () => {
  it('sends whoever is in front and close sliding away from you, and not whoever is behind or out of reach', () => {
    const g = game(4)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.4, 0)
    stand(g, 2, -1.4, 0)
    stand(g, 3, PUSH.reach + 1, 0)
    expect(push(g, 0)).toBe(true)
    expect(g.players[1].vx).toBeGreaterThan(PUSH.impulse - 0.01)
    expect(Math.abs(g.players[1].vz)).toBeLessThan(1e-9)
    expect(g.players[2]).toMatchObject({ vx: 0, vz: 0, knockedBy: null })
    expect(g.players[3]).toMatchObject({ vx: 0, vz: 0, knockedBy: null })
    // Credited to the pusher, and the pusher goes back a little.
    expect(g.players[1].knockedBy).toBe(0)
    expect(g.players[0].vx).toBeLessThan(0)
    expect(g.players[0].vx).toBeGreaterThan(-PUSH.impulse * PUSH.recoil - 0.01)
  })

  it('goes off to one side too, within the cone, and not past it', () => {
    const g = game(3)
    stand(g, 0, 0, 0, EAST)
    // Forty degrees off, and eighty.
    stand(g, 1, Math.cos((40 * Math.PI) / 180) * 1.5, Math.sin((40 * Math.PI) / 180) * 1.5)
    stand(g, 2, Math.cos((80 * Math.PI) / 180) * 1.5, -Math.sin((80 * Math.PI) / 180) * 1.5)
    push(g, 0)
    expect(speedOf(g.players[1])).toBeGreaterThan(PUSH.impulse - 0.01)
    expect(speedOf(g.players[2])).toBe(0)
  })

  it('has to wait for its cooldown, and a push at nobody still uses it up', () => {
    const g = game(2)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 8, 8)
    expect(push(g, 0)).toBe(true)
    expect(push(g, 0)).toBe(false)
    g.elapsed += PUSH.cooldown - 0.05
    expect(push(g, 0)).toBe(false)
    g.elapsed += 0.1
    expect(push(g, 0)).toBe(true)
  })

  it('cannot be done by somebody who has fallen, before the start, or after the end', () => {
    const g = game(2)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.4, 0)
    g.elapsed = -1
    expect(push(g, 0)).toBe(false)
    g.elapsed = 1
    g.players[0].out = 0.5
    expect(push(g, 0)).toBe(false)
    g.players[0].out = null
    g.over = true
    expect(push(g, 0)).toBe(false)
    expect(g.players[1].vx).toBe(0)
  })

  it('does not push anybody who has fallen', () => {
    const g = game(2)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.4, 0)
    g.players[1].out = 0.5
    push(g, 0)
    expect(g.players[1].vx).toBe(0)
  })

  it('never sends anybody faster than the speed limit, however hard they were going already', () => {
    const g = game(2)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.4, 0)
    g.players[1].vx = SLIDE.cap
    push(g, 0)
    expect(speedOf(g.players[1])).toBeLessThanOrEqual(SLIDE.cap + 1e-9)
  })

  it('knocks somebody off the edge, and it is credited to the pusher', () => {
    const g = game(2)
    const edge = panelCentre(0)
    // The corner panel, pushed out past the corner of the arena from the middle side of it.
    stand(g, 0, edge.x + 1.2, edge.z + 1.2)
    stand(g, 1, edge.x, edge.z)
    g.players[0].yaw = yawTowards(g.players[0], g.players[1])
    push(g, 0)
    runTo(g, g.elapsed + 4)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(0)
    expect(g.players[0].kills).toBe(1)
  })

  it('shows on the wire for a moment, so everybody sees the shove', () => {
    const g = game(2)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.4, 0)
    g.elapsed = 3
    push(g, 0)
    g.elapsed = 3.1
    const shown = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!
    expect(shown.players[0][10] & 4).toBe(4)
    expect(shown.players[1][10] & 4).toBe(0)
    const copy = applySnapshot(waitingGame(), shown, 'p2')
    copy.elapsed = 3.1
    expect(copy.elapsed - copy.players[0].pushedAt).toBeLessThan(PUSH.show)
    // A moment later it is over, on the host and so on the wire.
    g.elapsed = 3 + PUSH.show + 0.1
    const later = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(g))))!
    expect(later.players[0][10] & 4).toBe(0)
  })
})

describe('the ice, more slippery than it was', () => {
  it('lets a walker who lets go slide more than ten metres, and takes about a second to swing round', () => {
    let v: { vx: number; vz: number } = { vx: BODY.walk, vz: 0 }
    let far = 0
    for (let t = 0; t < 30; t += 1 / 60) {
      v = slide(v.vx, v.vz, 0, 0, false, 1 / 60)
      far += v.vx / 60
    }
    expect(far).toBeGreaterThan(10)
    // Holding the other way from a walk: after half a second it is still going the first way, or barely round.
    let w: { vx: number; vz: number } = { vx: BODY.walk, vz: 0 }
    for (let t = 0; t < 0.5 - 1e-9; t += 1 / 60) w = slide(w.vx, w.vz, -1, 0, false, 1 / 60)
    expect(w.vx).toBeGreaterThan(-BODY.walk * 0.5)
  })

  it('has looser grip than the ice it was: a half second of holding gets a walker no more than two thirds of the way to a walk', () => {
    let v = { vx: 0, vz: 0 }
    for (let t = 0; t < 0.5 - 1e-9; t += 1 / 60) v = slide(v.vx, v.vz, 1, 0, false, 1 / 60)
    expect(v.vx).toBeLessThan(BODY.walk * 0.7)
  })
})

describe('the last fall', () => {
  /** Three on the field at the drop: one on the colour, two not. Run until both have fallen. */
  function decidedGame(): Game {
    const g = game(3)
    const deal = dealFor(SEED, 1)
    const right = panelCentre(deal.panels.findIndex((c) => c === deal.colour))
    const wrongs = deal.panels.map((c, i) => (c === deal.colour ? -1 : i)).filter((i) => i >= 0)
    stand(g, 0, right.x, right.z)
    for (const k of [1, 2]) {
      const w = panelCentre(wrongs[k * 3])
      stand(g, k, w.x, w.z)
    }
    runTo(g, PHASES.spin + PHASES.reveal + 0.2)
    return g
  }

  it('decides the game when the last of the others goes, and is not over for a couple of seconds after', () => {
    const g = decidedGame()
    expect(g.players.filter(isStanding).length).toBe(1)
    expect(decided(g)).toBe(true)
    expect(g.over).toBe(false)
    const last = lastFall(g)!
    expect(last).toBe(Math.max(g.players[1].out!, g.players[2].out!))
    runTo(g, last + ROUND.finish - 0.1)
    expect(g.over).toBe(false)
    runTo(g, last + ROUND.finish + 0.1)
    expect(g.over).toBe(true)
  })

  it('keeps the fall going while it is watched: the last body is still dropping, and further down as the seconds go', () => {
    const g = decidedGame()
    const last = lastFall(g)!
    const who = g.players[1].out === last ? 1 : 2
    runTo(g, last + 0.3)
    const early = g.players[who].y
    runTo(g, last + 1.2)
    expect(g.players[who].y).toBeLessThan(early - 1)
    expect(g.over).toBe(false)
  })

  it('stands the one who is left where they are, so they cannot fall and lose it: they win whatever they do', () => {
    const g = decidedGame()
    const at = { x: g.players[0].x, z: g.players[0].z }
    // Running straight at the edge, for the whole of the watching.
    const end = lastFall(g)! + ROUND.finish - 0.05
    while (g.elapsed < end && !g.over) {
      steer(g, 0, 1, 0, EAST, true)
      stepGame(g, 1 / 30)
    }
    expect(g.players[0]).toMatchObject({ ...at, out: null, vx: 0, vz: 0 })
    runTo(g, end + 0.2)
    expect(g.over).toBe(true)
    expect(placings(g)[0]).toMatchObject({ index: 0, place: 1 })
  })

  it('is not held up when nobody fell: one player left with nobody having fallen is over at once', () => {
    const g = game(3)
    stepGame(g, 0.5)
    g.players[1].left = true
    g.players[2].left = true
    expect(decided(g)).toBe(false)
    expect(judgeEnd(g)).toBe(true)
  })

  it('does not hold up the time limit', () => {
    const g = game(3)
    g.elapsed = ROUND.limit - 0.01
    stepGame(g, 0.02)
    expect(g.over).toBe(true)
  })

  it('moves everybody who is still falling on with the clock even though the game is decided', () => {
    const g = decidedGame()
    const before = g.elapsed
    move(g, 0.05)
    stepGame(g, 0.05)
    expect(g.elapsed).toBeGreaterThan(before)
  })
})
