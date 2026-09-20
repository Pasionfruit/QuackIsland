/**
 * A shield's cooldown: once one has broken on a player they cannot pick up another for a while.
 */
import { describe, expect, it } from 'vitest'
import { arenaFor } from '../internal/arena'
import { PICKUP, ROUND, SHIELD, clock, collect, createGame, eliminate, pickupReady, shieldCooldown, stepGame, type Game } from '../internal/rules'

const SEED = 20260917

function started(): Game {
  const g = createGame(SEED, Array.from({ length: 3 }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 7)
  while (clock(g) < ROUND.guard) stepGame(g, 0.25)
  return g
}

function onSpot(g: Game, player: number, k: number): void {
  const at = arenaFor(SEED).pickups[k]
  g.players[player].x = at.x
  g.players[player].z = at.z
}

describe('a shield', () => {
  it('has no cooldown until one has broken', () => {
    const g = started()
    expect(shieldCooldown(g, g.players[0])).toBe(0)
    onSpot(g, 0, 0)
    collect(g)
    expect(g.players[0].shield).toBe(true)
    // Having taken one is not a cooldown; only its breaking is.
    expect(shieldCooldown(g, g.players[0])).toBe(0)
  })

  it('starts a cooldown when it breaks on a hit, and the hit eliminates nobody', () => {
    const g = started()
    g.players[1].shield = true
    expect(eliminate(g, 1, 0)).toBe(false)
    expect(g.players[1]).toMatchObject({ shield: false, out: null })
    expect(shieldCooldown(g, g.players[1])).toBeCloseTo(SHIELD.cooldown, 9)
  })

  it('stops another being picked up until it is over, and then it is: the spot is left alone meanwhile', () => {
    const g = started()
    g.players[0].shield = true
    eliminate(g, 0, 1)
    onSpot(g, 0, 1)
    collect(g)
    expect(g.players[0].shield).toBe(false)
    expect(pickupReady(g, 1)).toBe(true)
    // Nearly over: still nothing.
    g.elapsed += SHIELD.cooldown - 0.5
    collect(g)
    expect(g.players[0].shield).toBe(false)
    expect(shieldCooldown(g, g.players[0])).toBeCloseTo(0.5, 9)
    // Over: it is picked up, and the spot empties as it always did.
    g.elapsed += 0.6
    collect(g)
    expect(g.players[0].shield).toBe(true)
    expect(pickupReady(g, 1)).toBe(false)
    expect(g.pickups[1]).toBeCloseTo(g.elapsed + PICKUP.respawn, 9)
  })

  it('is one player’s own: somebody else can pick one up meanwhile', () => {
    const g = started()
    g.players[0].shield = true
    eliminate(g, 0, 1)
    onSpot(g, 1, 2)
    collect(g)
    expect(g.players[1].shield).toBe(true)
  })

  it('counts down by the game’s clock', () => {
    const g = started()
    g.players[0].shield = true
    eliminate(g, 0, 1)
    const before = shieldCooldown(g, g.players[0])
    stepGame(g, 0.25)
    expect(shieldCooldown(g, g.players[0])).toBeCloseTo(before - 0.25, 9)
  })
})
