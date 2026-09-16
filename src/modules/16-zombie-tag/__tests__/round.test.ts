/**
 * The rules of Zombie Tag.
 *
 * Every one of these is a sentence from the brief turned into arithmetic: six
 * zombies, twice the speed, a three second cooldown, a second on the floor,
 * the last one running wins. The screen is a shell over this, so this is what
 * is worth pinning down.
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA,
  HALF_H,
  HALF_W,
  OBSTACLES,
  inObstacle,
  playerSpawns,
  pushOutOfBox,
  settle,
  zombieSpawns,
} from '../internal/arena'
import {
  NO_INTENT,
  createRound,
  placings,
  shove,
  speedOf,
  stepRound,
  survivedFor,
  survivors,
  zombies,
  type Intent,
  type Round,
  type Spawn,
} from '../internal/round'
import { DEFAULT_RUNNERS, ME, newRound } from '../internal/setup'
import { crowdIntents, runnerIntent, zombieIntent } from '../internal/ai'

const go = (x: number, y: number, push = false): Intent => ({ x, y, push })
const still = new Map<string, Intent>()

/** Runs a round at a steady sixty frames a second with nobody pressing anything. */
function run(round: Round, seconds: number, intents: Map<string, Intent> = still): Round {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) stepRound(round, intents, 1 / 60)
  return round
}

/** A round with the bodies exactly where a test wants them. */
function laid(spawns: Spawn[]): Round {
  return createRound(spawns)
}

/**
 * A zombie placed close enough to take whoever is standing at `at`, this frame.
 *
 * Worked out from `catchRange` rather than typed in, because it has to land in
 * the gap between "bodies are pushed apart to `radius * 2`" and "a catch needs
 * to be within `catchRange`" - a gap that only exists because of the reach,
 * and a hand-picked number would stop working the day either moves.
 */
function catcher(id: string, at: { x: number; y: number }): Spawn {
  const gap = (ARENA.radius * 2 + ARENA.catchRange) / 2
  return { id, at: { x: at.x, y: at.y + gap }, side: 'zombie' }
}

describe('the arena', () => {
  it('is enclosed - nothing gets out, however hard it runs', () => {
    const round = laid([{ id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true }])
    run(round, 6, new Map([['a', go(1, 0)]]))
    expect(round.bodies[0].x).toBeLessThanOrEqual(HALF_W - ARENA.radius + 1e-6)

    run(round, 6, new Map([['a', go(0, 1)]]))
    expect(round.bodies[0].y).toBeLessThanOrEqual(HALF_H - ARENA.radius + 1e-6)
  })

  it('keeps every body out of every crate', () => {
    const round = laid([{ id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true }])
    // Walk across the whole arena in eight directions and check every frame.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      round.bodies[0].x = 0
      round.bodies[0].y = 0
      const intents = new Map([['a', go(dx, dy)]])
      for (let i = 0; i < 300; i++) {
        stepRound(round, intents, 1 / 60)
        expect(inObstacle(round.bodies[0], ARENA.radius * 0.9)).toBe(false)
      }
    }
  })

  it('pushes a body out of a crate it somehow ended up inside', () => {
    // The fast-mover case: a body whose middle is in the box has no nearest
    // point to push away from, so it goes out through the closest wall.
    const box = OBSTACLES[0]
    const out = pushOutOfBox({ x: box.x, y: box.y + 0.1 }, ARENA.radius, box)
    expect(inObstacle(out, 0)).toBe(false)
  })

  it('leaves a body that is nowhere near a crate exactly where it was', () => {
    const box = { x: 0, y: 0, width: 2, height: 2 }
    const at = { x: 20, y: 20 }
    expect(pushOutOfBox(at, ARENA.radius, box)).toEqual(at)
  })

  it('starts the players in the middle, as asked', () => {
    for (const count of [1, 2, 4, 8]) {
      for (const at of playerSpawns(count)) {
        expect(Math.hypot(at.x, at.y)).toBeLessThanOrEqual(ARENA.spawnRing + 1e-9)
      }
    }
  })

  it('leaves the middle clear, so nobody spawns inside a crate', () => {
    for (const count of [1, 2, 4, 8]) {
      for (const at of playerSpawns(count)) {
        expect(inObstacle(at, ARENA.radius)).toBe(false)
        expect(settle(at, ARENA.radius)).toEqual(at)
      }
    }
  })

  it('starts the zombies around the outside, well clear of the middle', () => {
    for (const at of zombieSpawns(ARENA.zombies)) {
      expect(inObstacle(at, 0)).toBe(false)
      // Far enough out that nobody is caught in the first second.
      expect(Math.hypot(at.x, at.y)).toBeGreaterThan(ARENA.spawnRing + ARENA.catchRange)
    }
  })
})

describe('the chase', () => {
  it('opens with six zombies and everybody else running', () => {
    const round = newRound()
    expect(zombies(round)).toHaveLength(ARENA.zombies)
    expect(survivors(round)).toHaveLength(DEFAULT_RUNNERS)
    expect(round.bodies.filter((b) => b.mine)).toHaveLength(1)
    expect(round.bodies.find((b) => b.mine)?.id).toBe(ME)
  })

  it('moves a player at exactly twice a zombie', () => {
    // The rule, as a rule rather than as two numbers that can drift apart.
    const round = laid([
      { id: 'p', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 0, y: 6 }, side: 'zombie' },
    ])
    const [player, zombie] = round.bodies
    expect(speedOf(player)).toBeCloseTo(speedOf(zombie) * 2, 9)
    expect(ARENA.playerSpeed).toBeCloseTo(ARENA.zombieSpeed * 2, 9)
  })

  it('actually covers twice the ground in the same time', () => {
    // Both in clear lanes, checked rather than assumed - a start inside a
    // crate gets shoved out and measures the push instead of the pace.
    const from = { player: { x: -2, y: -4.5 }, zombie: { x: -2, y: 4.5 } }
    expect(inObstacle(from.player, ARENA.radius)).toBe(false)
    expect(inObstacle(from.zombie, ARENA.radius)).toBe(false)

    const round = laid([
      { id: 'p', at: from.player, side: 'player' },
      { id: 'z', at: from.zombie, side: 'zombie' },
    ])
    const intents = new Map([
      ['p', go(1, 0)],
      ['z', go(1, 0)],
    ])
    run(round, 0.5, intents)
    const [player, zombie] = round.bodies
    expect(player.x - from.player.x).toBeCloseTo((zombie.x - from.zombie.x) * 2, 1)
  })

  it('turns a player who is caught into a zombie', () => {
    const round = laid([
      { id: 'p', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'other', at: { x: 10, y: 8 }, side: 'player' },
      { id: 'z', at: { x: ARENA.catchRange * 0.9, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    const caught = round.bodies.find((b) => b.id === 'p')
    expect(caught?.side).toBe('zombie')
    expect(caught?.caughtAt).not.toBeNull()
  })

  it('does not catch anybody who is still out of reach', () => {
    const round = laid([
      { id: 'p', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'other', at: { x: 10, y: 8 }, side: 'player' },
      { id: 'z', at: { x: ARENA.catchRange + 0.4, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    expect(round.bodies.find((b) => b.id === 'p')?.side).toBe('player')
  })

  it('lets a freshly turned player join the chase', () => {
    const round = laid([
      { id: 'p', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'other', at: { x: 12, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 1, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    expect(zombies(round)).toHaveLength(2)
    // And it hunts: its intent now points at whoever is left.
    const turned = round.bodies.find((b) => b.id === 'p')
    expect(turned && zombieIntent(round, turned).x).toBeGreaterThan(0)
  })

  it('keeps bodies out of each other', () => {
    const round = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'zombie' },
      { id: 'b', at: { x: 0.1, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    const [a, b] = round.bodies
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ARENA.radius * 2 - 1e-6)
  })

  it('separates two bodies standing in exactly the same spot', () => {
    const round = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'zombie' },
      { id: 'b', at: { x: 0, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    const [a, b] = round.bodies
    expect(Number.isFinite(a.x)).toBe(true)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0)
  })
})

describe('the push', () => {
  const two = () =>
    laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'b', at: { x: 1.4, y: 0 }, side: 'player' },
      { id: 'c', at: { x: 14, y: 8 }, side: 'player' },
    ])

  it('puts whoever it lands on down for a second', () => {
    const round = two()
    stepRound(round, new Map([['a', go(0, 0, true)]]), 1 / 60)
    expect(round.bodies[1].stun).toBeCloseTo(ARENA.pushStun, 2)
    expect(ARENA.pushStun).toBe(1)
  })

  it('stops a stunned player moving at all, and then gives them back', () => {
    const round = two()
    stepRound(round, new Map([['a', go(0, 0, true)]]), 1 / 60)
    const was = round.bodies[1].x

    run(round, 0.5, new Map([['b', go(1, 0)]]))
    expect(round.bodies[1].x).toBeCloseTo(was, 6)

    run(round, 1, new Map([['b', go(1, 0)]]))
    expect(round.bodies[1].x).toBeGreaterThan(was)
  })

  it('costs three seconds, whether or not it hit anything', () => {
    const round = two()
    stepRound(round, new Map([['a', go(0, 0, true)]]), 1 / 60)
    expect(round.bodies[0].cooldown).toBeCloseTo(ARENA.pushCooldown, 1)
    expect(ARENA.pushCooldown).toBe(3)

    // A miss is the same price. A push that is free when it misses is a
    // button you hold down rather than a decision.
    const missed = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'b', at: { x: 15, y: 0 }, side: 'player' },
    ])
    stepRound(missed, new Map([['a', go(0, 0, true)]]), 1 / 60)
    expect(missed.bodies[0].cooldown).toBeCloseTo(ARENA.pushCooldown, 1)
    expect(missed.bodies[1].stun).toBe(0)
  })

  it('refuses a second push until the cooldown is up', () => {
    const round = two()
    expect(shove(round, round.bodies[0])).toBe(true)
    round.bodies[1].stun = 0
    expect(shove(round, round.bodies[0])).toBe(false)
    expect(round.bodies[1].stun).toBe(0)

    run(round, ARENA.pushCooldown + 0.1)
    expect(round.bodies[0].cooldown).toBe(0)
    expect(shove(round, round.bodies[0])).toBe(true)
  })

  it('reaches everybody in range and nobody out of it', () => {
    const round = two()
    shove(round, round.bodies[0])
    expect(round.bodies[1].stun).toBeGreaterThan(0)
    expect(round.bodies[2].stun).toBe(0)
  })

  it('does nothing to a zombie - it is for disrupting runners', () => {
    const round = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'other', at: { x: 14, y: 8 }, side: 'player' },
      { id: 'z', at: { x: 1.4, y: 0 }, side: 'zombie' },
    ])
    shove(round, round.bodies[0])
    expect(round.bodies[2].stun).toBe(0)
  })

  it('cannot be thrown by a zombie, or by somebody on the floor', () => {
    const round = two()
    round.bodies[0].side = 'zombie'
    expect(shove(round, round.bodies[0])).toBe(false)

    const floored = two()
    floored.bodies[0].stun = 0.5
    expect(shove(floored, floored.bodies[0])).toBe(false)
  })

  it('leaves a stunned player catchable', () => {
    // Being down is a disadvantage, not a shield. This is the whole reason
    // pushing somebody is worth doing.
    const round = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true },
      { id: 'b', at: { x: 1.4, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 4, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, new Map([['a', go(0, 0, true)]]), 1 / 60)
    expect(round.bodies[1].stun).toBeGreaterThan(0)

    round.bodies[2].x = 1.4 + ARENA.catchRange * 0.9
    stepRound(round, still, 1 / 60)
    expect(round.bodies[1].side).toBe('zombie')
  })
})

describe('the end of a round', () => {
  it('is not over while two are still running', () => {
    const round = newRound()
    expect(round.over).toBe(false)
    expect(survivors(round).length).toBeGreaterThan(1)
  })

  it('ends the moment one player is left, and crowns them', () => {
    const round = laid([
      { id: 'winner', at: { x: -18, y: -12 }, side: 'player' },
      { id: 'doomed', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 0.5, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    expect(round.over).toBe(true)
    expect(round.winner).toBe('winner')
  })

  it('still finds a winner when the last two are taken together', () => {
    // Nobody is left standing to crown, so it falls to whoever lasted longest -
    // and since these two went on the same frame, either is a fair answer. The
    // thing that must not happen is a finished round with no winner at all.
    const round = laid([
      { id: 'a', at: { x: 0, y: -4.5 }, side: 'player' },
      { id: 'b', at: { x: 5, y: -4.5 }, side: 'player' },
      catcher('z1', { x: 0, y: -4.5 }),
      catcher('z2', { x: 5, y: -4.5 }),
    ])
    stepRound(round, still, 1 / 60)

    expect(survivors(round)).toHaveLength(0)
    expect(round.over).toBe(true)
    expect(['a', 'b']).toContain(round.winner)
  })

  it('crowns the one who lasted longer when they go one after the other', () => {
    const round = laid([
      { id: 'early', at: { x: 0, y: -4.5 }, side: 'player' },
      { id: 'late', at: { x: 9, y: -4.5 }, side: 'player' },
      { id: 'spare', at: { x: -19, y: 11.5 }, side: 'player' },
      catcher('z1', { x: 0, y: -4.5 }),
      { id: 'z2', at: { x: 19, y: -11.5 }, side: 'zombie' },
    ])
    // The first goes now; two are still running, so the round carries on.
    stepRound(round, still, 1 / 60)
    expect(round.bodies[0].side).toBe('zombie')
    expect(round.over).toBe(false)

    run(round, 0.5)
    // Now take the spare, leaving one - which ends it on the survivor.
    const reach = (ARENA.radius * 2 + ARENA.catchRange) / 2
    round.bodies[4].x = round.bodies[2].x
    round.bodies[4].y = round.bodies[2].y + reach
    stepRound(round, still, 1 / 60)
    expect(round.over).toBe(true)
    expect(round.winner).toBe('late')
  })

  it('stops running once it is over', () => {
    const round = laid([
      { id: 'a', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 0.5, y: 0 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    expect(round.over).toBe(true)
    const frozen = round.elapsed
    run(round, 2, new Map([['z', go(1, 0)]]))
    expect(round.elapsed).toBe(frozen)
  })

  it('places the players by how long they lasted, longest first', () => {
    const round = laid([
      { id: 'first-out', at: { x: 0, y: -4.5 }, side: 'player' },
      { id: 'second-out', at: { x: 9, y: -4.5 }, side: 'player' },
      { id: 'survivor', at: { x: -19, y: 11.5 }, side: 'player' },
      catcher('z1', { x: 0, y: -4.5 }),
      { id: 'z2', at: { x: 19, y: -11.5 }, side: 'zombie' },
    ])
    stepRound(round, still, 1 / 60)
    run(round, 0.5)
    const reach = (ARENA.radius * 2 + ARENA.catchRange) / 2
    round.bodies[4].x = 9
    round.bodies[4].y = -4.5 + reach
    stepRound(round, still, 1 / 60)

    // The six the round started with never ran, so they are not on it at all.
    const order = placings(round).map((b) => b.id)
    expect(order).toEqual(['survivor', 'second-out', 'first-out'])
    expect(survivedFor(round.bodies[2], round)).toBe(round.elapsed)
  })

  it('keeps the original zombies off the scoreboard entirely', () => {
    // They were never running, and an uncaught body sorts as having lasted
    // forever - so left in, the six would take the top six places.
    const round = newRound()
    run(round, 0.2)
    expect(placings(round).map((b) => b.id)).not.toContain('zombie 1')
    expect(placings(round)).toHaveLength(DEFAULT_RUNNERS)
  })

  it('survives a whole round played out by itself', () => {
    // The zombies are slower, so this is not guaranteed to finish - what it
    // checks is that nothing blows up, nobody escapes the walls, and nobody
    // ends up inside a crate over thirty simulated seconds.
    const round = newRound()
    for (let i = 0; i < 1800; i++) {
      stepRound(round, crowdIntents(round), 1 / 60)
      if (round.over) break
    }
    for (const body of round.bodies) {
      expect(Number.isFinite(body.x)).toBe(true)
      expect(Math.abs(body.x)).toBeLessThanOrEqual(HALF_W)
      expect(Math.abs(body.y)).toBeLessThanOrEqual(HALF_H)
      expect(inObstacle(body, ARENA.radius * 0.9)).toBe(false)
    }
  })
})

describe('the bodies nobody is driving', () => {
  it('sends a zombie at the nearest runner', () => {
    const round = laid([
      { id: 'near', at: { x: 5, y: 0 }, side: 'player' },
      { id: 'far', at: { x: -16, y: 0 }, side: 'player' },
      { id: 'z', at: { x: 0, y: 0 }, side: 'zombie' },
    ])
    expect(zombieIntent(round, round.bodies[2]).x).toBeGreaterThan(0)
  })

  it('sends a runner away from the nearest zombie', () => {
    const round = laid([
      { id: 'p', at: { x: 0, y: 0 }, side: 'player' },
      { id: 'other', at: { x: 14, y: 8 }, side: 'player' },
      { id: 'z', at: { x: -4, y: 0 }, side: 'zombie' },
    ])
    expect(runnerIntent(round, round.bodies[0]).x).toBeGreaterThan(0)
  })

  it('leaves the body this browser is driving alone', () => {
    const round = newRound()
    const intents = crowdIntents(round)
    expect(intents.has(ME)).toBe(false)
    expect(intents.size).toBe(round.bodies.length - 1)
  })

  it('never asks anybody to push', () => {
    const round = newRound()
    for (const intent of crowdIntents(round).values()) expect(intent.push).toBe(false)
  })

  it('stands still when there is nobody to chase or run from', () => {
    const lonely = laid([{ id: 'z', at: { x: 0, y: 0 }, side: 'zombie' }])
    expect(zombieIntent(lonely, lonely.bodies[0])).toEqual(NO_INTENT)

    const safe = laid([{ id: 'p', at: { x: 0, y: 0 }, side: 'player' }])
    expect(runnerIntent(safe, safe.bodies[0])).toEqual(NO_INTENT)
  })
})

describe('stepping', () => {
  it('clamps a huge delta rather than teleporting through a crate', () => {
    const round = laid([{ id: 'a', at: { x: 0, y: 0 }, side: 'player', mine: true }])
    stepRound(round, new Map([['a', go(1, 0)]]), 30)
    expect(round.elapsed).toBeLessThanOrEqual(0.05)
    expect(inObstacle(round.bodies[0], ARENA.radius * 0.9)).toBe(false)
  })

  it('ignores a delta that goes backwards', () => {
    const round = newRound()
    const was = round.elapsed
    stepRound(round, still, -5)
    expect(round.elapsed).toBe(was)
  })

  it('does not make a diagonal faster than a straight line', () => {
    const straight = laid([{ id: 'a', at: { x: -18, y: 0 }, side: 'player' }])
    const diagonal = laid([{ id: 'a', at: { x: -18, y: 0 }, side: 'player' }])
    run(straight, 0.5, new Map([['a', go(1, 0)]]))
    run(diagonal, 0.5, new Map([['a', go(1, 1)]]))

    const one = Math.hypot(straight.bodies[0].x + 18, straight.bodies[0].y)
    const two = Math.hypot(diagonal.bodies[0].x + 18, diagonal.bodies[0].y)
    expect(two).toBeCloseTo(one, 1)
  })

  it('gives a body with no orders nothing to do', () => {
    const round = newRound()
    const was = { ...round.bodies[0] }
    stepRound(round, still, 1 / 60)
    expect(round.bodies[0].x).toBeCloseTo(was.x, 6)
    expect(round.bodies[0].y).toBeCloseTo(was.y, 6)
  })
})
