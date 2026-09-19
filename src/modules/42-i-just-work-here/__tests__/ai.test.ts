/**
 * The stand-ins: they search, carry, arm up and hunt - and they do it the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { botSteer, wouldHitSelf } from '../internal/ai'
import { blocked, officeFor } from '../internal/office'
import { BODY, ROUND, createGame, deskOf, isArmed, placings, stepGame, yawTowards, type Game } from '../internal/rules'
import { EAST, arm, lane, stand } from './places'

function play(seed: number, n: number): { game: Game; armed: number } {
  const game = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  const office = officeFor(seed)
  let armed = 0
  for (let step = 0; step < ROUND.limit * 30 && !game.over; step++) {
    botSteer(game, 1 / 30)
    stepGame(game, 1 / 30)
    for (const p of game.players) if (blocked(office, p, BODY.radius - 1e-6)) throw new Error(`${p.id} is inside something at ${game.elapsed}`)
  }
  game.players.forEach((_, i) => (armed += isArmed(game, i) ? 1 : 0))
  return { game, armed }
}

describe('the stand-ins', () => {
  it('play a whole game: find their pieces, arm up, and leave one standing', () => {
    let early = 0
    for (let seed = 1; seed <= 12; seed++) {
      const { game } = play(seed * 7919, 5)
      expect(game.over).toBe(true)
      // Somebody got a bazooka together, or nobody would have gone.
      expect(game.players.some((p) => p.out !== null)).toBe(true)
      if (game.elapsed < ROUND.limit) early += 1
    }
    expect(early).toBeGreaterThanOrEqual(11)
    // Twelve whole games: seconds, not milliseconds.
  }, 60000)

  it('play the same way every time', () => {
    const a = play(4242, 5).game
    const b = play(4242, 5).game
    expect(JSON.stringify(placings(a).map((e) => [e.player.id, e.player.out]))).toBe(JSON.stringify(placings(b).map((e) => [e.player.id, e.player.out])))
  }, 30000)

  it('will not fire at a wall they are standing next to', () => {
    const game = arm(createGame(11, [{ id: 'a', bot: true }, { id: 'b', bot: true }]), 0)
    const home = deskOf(game, 0)
    const toDesk = yawTowards(home.spot, { x: home.spot.x, z: (home.block.z0 + home.block.z1) / 2 })
    expect(wouldHitSelf(game, 0, toDesk)).toBe(true)
    // Down a long clear line, it will.
    const { x, z } = lane(11)
    stand(game, 0, x, z)
    expect(wouldHitSelf(game, 0, EAST)).toBe(false)
  })
})
