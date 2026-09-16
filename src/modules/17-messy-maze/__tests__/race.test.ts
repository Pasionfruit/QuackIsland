/**
 * The rules of Messy Maze: the letters, the spins, and the finish.
 *
 * Every sentence of the brief is in here as arithmetic - start in a corner,
 * two spinning platforms that change your letters, placed in the order you
 * reach the middle.
 */
import { describe, expect, it } from 'vitest'
import { botDirections } from '../internal/ai'
import {
  LETTERS,
  START_BINDING,
  directionFor,
  heldLetters,
  isBinding,
  rebind,
} from '../internal/bindings'
import {
  MAZE,
  MAZES,
  cellAt,
  cellCentre,
  exits,
  mazeFor,
  quarterOf,
  stepsFrom,
  stepsTo,
  type Point,
} from '../internal/maze'
import {
  GOAL,
  RACE,
  createRace,
  goalOpen,
  placings,
  platformsTouched,
  spinnerActive,
  stepRace,
  type Race,
  type Racer,
} from '../internal/race'
import { SOLO_RACERS, newRace, raceRoster } from '../internal/setup'

const SEED = 4242
/** The maze a race with that seed is in, unless told otherwise. */
const LAYOUT = SEED % MAZES.length
const still = new Map<string, Point>()

function twoRacers(): Race {
  return createRace(SEED, [{ id: 'a', mine: true }, { id: 'b' }])
}

/** Puts a racer on a spot, as if it had walked there, and lets one frame run. */
function standAt(race: Race, racer: Racer, at: Point): void {
  racer.x = at.x
  racer.y = at.y
  stepRace(race, still, 1 / 60)
}

const away = (racer: Racer): Point => {
  // A cell next door, in whichever direction is not a platform.
  const maze = mazeFor(LAYOUT)
  const here = cellAt(racer)
  for (const step of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const next = { x: here.x + step.x, y: here.y + step.y }
    if (next.x < 0 || next.y < 0 || next.x >= MAZE.size || next.y >= MAZE.size) continue
    const at = cellCentre(next)
    if (maze.platforms.every((p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) > MAZE.platformRadius)) {
      return at
    }
  }
  throw new Error('no clear cell next door')
}

describe('letters', () => {
  it('starts everybody on WASD, in up-left-down-right order', () => {
    expect(START_BINDING).toBe('WASD')
    expect(directionFor('WASD', 'W')).toEqual({ x: 0, y: -1 })
    expect(directionFor('WASD', 'A')).toEqual({ x: -1, y: 0 })
    expect(directionFor('WASD', 'S')).toEqual({ x: 0, y: 1 })
    expect(directionFor('WASD', 'D')).toEqual({ x: 1, y: 0 })
  })

  it('goes diagonally for two keys and nowhere for opposite ones', () => {
    expect(directionFor('WASD', 'DW')).toEqual({ x: 1, y: -1 })
    expect(directionFor('WASD', 'AD')).toEqual({ x: 0, y: 0 })
  })

  it('ignores letters that are not in the binding', () => {
    expect(directionFor('QMTJ', 'WASD')).toEqual({ x: 0, y: 0 })
    expect(directionFor('QMTJ', 'Q')).toEqual({ x: 0, y: -1 })
  })

  it('tidies what is held into one canonical string', () => {
    expect(heldLetters(['d', 'W', 'Shift', '1', 'w'])).toBe('DW')
    expect(heldLetters('ZYXWVUTSRQPONMLKJ')).toHaveLength(8)
  })

  it('knows four different letters from anything else', () => {
    expect(isBinding('WASD')).toBe(true)
    expect(isBinding('WAWD')).toBe(false)
    expect(isBinding('WAS')).toBe(false)
    expect(isBinding('wasd')).toBe(false)
    expect(isBinding(1234)).toBe(false)
  })
})

describe('a spin', () => {
  it('deals four different letters, none of which were in the old binding', () => {
    let binding = START_BINDING
    for (let spins = 1; spins <= 200; spins++) {
      const next = rebind(SEED, 'a', spins, binding)
      expect(isBinding(next)).toBe(true)
      for (const letter of next) expect(binding).not.toContain(letter)
      binding = next
    }
  })

  it('is the same deal for the same race, racer and spin', () => {
    expect(rebind(SEED, 'a', 3, 'WASD')).toBe(rebind(SEED, 'a', 3, 'WASD'))
  })

  it('reaches the whole alphabet, not a corner of it', () => {
    const seen = new Set<string>()
    for (let spins = 1; spins <= 300; spins++) {
      for (const letter of rebind(SEED, 'a', spins, START_BINDING)) seen.add(letter)
    }
    expect(seen.size).toBe(LETTERS.length - START_BINDING.length)
  })
})

describe('the start', () => {
  it('puts two racers in opposite corners', () => {
    const race = twoRacers()
    const [a, b] = race.racers
    expect(quarterOf(cellAt(a))).toBe(0)
    expect(quarterOf(cellAt(b))).toBe(2)
    expect(a.x).toBeCloseTo(-b.x)
    expect(a.y).toBeCloseTo(-b.y)
  })

  it('gives four racers a corner each', () => {
    const race = createRace(SEED, ['a', 'b', 'c', 'd'].map((id) => ({ id })))
    expect(new Set(race.racers.map((r) => quarterOf(cellAt(r)))).size).toBe(4)
  })

  it('fills the other three corners when you are on your own', () => {
    const roster = raceRoster()
    expect(roster).toHaveLength(SOLO_RACERS)
    expect(roster.filter((r) => r.bot)).toHaveLength(SOLO_RACERS - 1)
    const race = newRace({ seed: SEED })
    expect(race.racers.filter((r) => r.mine)).toHaveLength(1)
  })

  it('deals a different maze each race, round all three', () => {
    const layouts = [newRace(), newRace(), newRace()].map((r) => r.layout)
    expect(new Set(layouts).size).toBe(MAZES.length)
    const [first, second] = [newRace(), newRace()]
    expect(first.layout).not.toBe(second.layout)
    expect(first.seed).not.toBe(second.seed)
  })
})

describe('moving', () => {
  it('goes at the same pace in a straight line and on a diagonal', () => {
    const straight = twoRacers()
    const diagonal = twoRacers()
    const [s] = straight.racers
    const [d] = diagonal.racers
    const s0 = { x: s.x, y: s.y }
    const d0 = { x: d.x, y: d.y }
    // One frame, which is too short to reach a wall from the middle of a cell.
    stepRace(straight, new Map([['a', { x: 1, y: 0 }]]), 0.02)
    stepRace(diagonal, new Map([['a', { x: 1, y: 1 }]]), 0.02)
    expect(Math.hypot(s.x - s0.x, s.y - s0.y)).toBeCloseTo(Math.hypot(d.x - d0.x, d.y - d0.y), 6)
  })

  it('clamps a huge frame, so nobody is carried through a wall', () => {
    const race = twoRacers()
    const [a] = race.racers
    const before = { x: a.x, y: a.y }
    stepRace(race, new Map([['a', { x: 1, y: 0 }]]), 10)
    expect(Math.hypot(a.x - before.x, a.y - before.y)).toBeLessThanOrEqual(MAZE.speed * 0.05 + 1e-9)
  })

  it('lets racers pass through each other', () => {
    const race = twoRacers()
    const [a, b] = race.racers
    b.x = a.x
    b.y = a.y
    stepRace(race, still, 1 / 60)
    expect(a.x).toBe(b.x)
    expect(a.y).toBe(b.y)
  })
})

describe('the spinning platforms', () => {
  it('spin you and change your letters when you step on one', () => {
    const race = twoRacers()
    const [a] = race.racers
    const platform = mazeFor(LAYOUT).platforms[0]
    standAt(race, a, platform.at)

    expect(a.spins).toBe(1)
    expect(a.binding).not.toBe(START_BINDING)
    expect(isBinding(a.binding)).toBe(true)
    expect(a.spin).toBeGreaterThan(0)
    expect(a.touched).toBe(1 << platform.id)
  })

  it('hold you still while you spin', () => {
    const race = twoRacers()
    const [a] = race.racers
    standAt(race, a, mazeFor(LAYOUT).platforms[0].at)
    const before = { x: a.x, y: a.y }
    stepRace(race, new Map([['a', { x: 1, y: 0 }]]), 0.05)
    expect({ x: a.x, y: a.y }).toEqual(before)
  })

  it('spin you once for standing on one, not once a frame', () => {
    const race = twoRacers()
    const [a] = race.racers
    const platform = mazeFor(LAYOUT).platforms[0]
    standAt(race, a, platform.at)
    for (let i = 0; i < 120; i++) stepRace(race, still, 1 / 60)
    expect(a.spins).toBe(1)
  })

  it('go inactive for you once they have spun you', () => {
    const race = twoRacers()
    const [a, b] = race.racers
    const platform = mazeFor(LAYOUT).platforms[0]
    standAt(race, a, platform.at)
    const first = a.binding
    expect(spinnerActive(a, platform.id)).toBe(false)

    for (let i = 0; i < 40; i++) stepRace(race, still, 1 / 60)
    standAt(race, a, away(a))
    standAt(race, a, platform.at)
    expect(a.spins).toBe(1)
    expect(a.binding).toBe(first)
    expect(a.spin).toBe(0)
    expect(platformsTouched(a)).toBe(1)

    // Spent for one racer, not for anybody else.
    expect(spinnerActive(b, platform.id)).toBe(true)
    standAt(race, b, platform.at)
    expect(b.spins).toBe(1)
  })

  it('cannot be stood on twice to open the middle', () => {
    const race = twoRacers()
    const [a] = race.racers
    const platform = mazeFor(LAYOUT).platforms[0]
    for (let visit = 0; visit < 5; visit++) {
      standAt(race, a, platform.at)
      for (let i = 0; i < 40; i++) stepRace(race, still, 1 / 60)
      standAt(race, a, away(a))
    }
    standAt(race, a, { x: 0, y: 0 })
    expect(goalOpen(a)).toBe(false)
    expect(a.finishedAt).toBeNull()
  })

  it('still spin you on a third platform, once you have had your two', () => {
    const race = twoRacers()
    const [a] = race.racers
    const { platforms } = mazeFor(LAYOUT)
    for (const p of [platforms[0], platforms[1], platforms[4]]) {
      standAt(race, a, p.at)
      for (let i = 0; i < 40; i++) stepRace(race, still, 1 / 60)
    }
    expect(a.spins).toBe(3)
    expect(a.spins).toBe(platformsTouched(a))
  })

  it('make WASD stop working and the new letters start', () => {
    const race = twoRacers()
    const [a] = race.racers
    standAt(race, a, mazeFor(LAYOUT).platforms[0].at)
    expect(directionFor(a.binding, 'WASD')).toEqual({ x: 0, y: 0 })
    expect(directionFor(a.binding, a.binding[3])).toEqual({ x: 1, y: 0 })
  })
})

describe('the middle', () => {
  it('does not take anybody who has not stood on two platforms', () => {
    const race = twoRacers()
    const [a] = race.racers
    standAt(race, a, { x: 0, y: 0 })
    expect(a.finishedAt).toBeNull()

    standAt(race, a, mazeFor(LAYOUT).platforms[0].at)
    standAt(race, a, { x: 0, y: 0 })
    expect(goalOpen(a)).toBe(false)
    expect(a.finishedAt).toBeNull()
  })

  it('takes anybody who has, any two', () => {
    const race = twoRacers()
    const [a] = race.racers
    const { platforms } = mazeFor(LAYOUT)
    // Somebody else's platforms count as much as your own.
    standAt(race, a, platforms[5].at)
    standAt(race, a, platforms[2].at)
    for (let i = 0; i < 40; i++) stepRace(race, still, 1 / 60)
    standAt(race, a, { x: 0, y: 0 })
    expect(a.place).toBe(1)
    expect(a.finishedAt).not.toBeNull()
  })

  it('places people in the order they get there', () => {
    const race = createRace(SEED, ['a', 'b', 'c'].map((id) => ({ id })))
    const { platforms } = mazeFor(LAYOUT)
    for (const racer of race.racers) {
      racer.touched = (1 << platforms[0].id) | (1 << platforms[1].id)
    }
    const [a, b, c] = race.racers
    standAt(race, b, { x: 0, y: 0 })
    standAt(race, c, { x: 0, y: 0 })
    standAt(race, a, { x: 0, y: 0 })
    expect([b.place, c.place, a.place]).toEqual([1, 2, 3])
    expect(race.over).toBe(true)
    expect(placings(race).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('calls time on everybody else once somebody is in', () => {
    const race = twoRacers()
    const [a, b] = race.racers
    a.touched = 0b11
    standAt(race, a, { x: 0, y: 0 })
    expect(race.firstIn).not.toBeNull()
    expect(race.over).toBe(false)
    for (let t = 0; t < RACE.lastCall + 1; t += 0.05) stepRace(race, still, 0.05)
    expect(race.over).toBe(true)
    expect(b.place).toBeNull()
    expect(placings(race).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('ranks anybody who did not make it by platforms, then by how far they had left', () => {
    const race = createRace(SEED, ['far', 'near', 'plat'].map((id) => ({ id })))
    const [far, near, plat] = race.racers
    const { platforms } = mazeFor(LAYOUT)
    near.x = platforms[1].at.x + MAZE.cell * 0
    near.y = platforms[1].at.y
    near.touched = 0
    plat.touched = 1 << platforms[0].id
    race.over = true
    // far is still in its corner; near is further along with no platforms;
    // plat has a platform, which beats being close.
    expect(placings(race).map((r) => r.id)).toEqual(['plat', 'near', 'far'])
    expect(far.place).toBeNull()
  })
})

describe('the mazes make everybody spin twice', () => {
  /**
   * Walks a racer straight for the middle, paying no attention to platforms at
   * all - the way somebody would who had not read the rules. `tight` cuts every
   * corner as close as the walls allow, which is the case that could slip past
   * the edge of a platform if anything could.
   */
  function headForTheMiddle(layout: number, corner: number, tight: boolean): Racer {
    const maze = mazeFor(layout)
    const race = createRace(SEED, [{ id: 'a' }], layout)
    const racer = race.racers[0]
    const start = cellCentre(maze.corners[corner])
    racer.x = start.x
    racer.y = start.y
    const field = stepsTo(maze, [GOAL])
    for (let frame = 0; frame < 60 * 90 && !race.over; frame++) {
      const here = cellAt(racer)
      const middle = cellCentre(here)
      let aim = middle
      if (stepsFrom(field, here) > 0) {
        const next = exits(maze, here).reduce((best, c) => (stepsFrom(field, c) < stepsFrom(field, best) ? c : best))
        const lined = next.x !== here.x ? Math.abs(racer.y - middle.y) < 0.3 : Math.abs(racer.x - middle.x) < 0.3
        if (tight || lined) aim = cellCentre(next)
      }
      stepRace(race, new Map([['a', { x: aim.x - racer.x, y: aim.y - racer.y }]]), 1 / 60)
    }
    return racer
  }

  it('from every corner of every maze, however tightly the corners are cut', () => {
    for (const maze of MAZES) {
      for (let corner = 0; corner < 4; corner++) {
        for (const tight of [false, true]) {
          const racer = headForTheMiddle(maze.id, corner, tight)
          const where = `${maze.name}, corner ${corner}${tight ? ', cutting corners' : ''}`
          expect(racer.place, where).toBe(1)
          expect(platformsTouched(racer), where).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })
})

describe('the stand-ins', () => {
  it('find their way through two platforms to the middle', () => {
    const race = createRace(SEED, ['a', 'b', 'c', 'd'].map((id) => ({ id, bot: true })))
    for (let t = 0; t < 120 && !race.over; t += 1 / 30) stepRace(race, botDirections(race), 1 / 30)
    expect(race.over).toBe(true)
    for (const racer of race.racers) {
      expect(racer.place, racer.id).not.toBeNull()
      expect(platformsTouched(racer)).toBeGreaterThanOrEqual(2)
    }
  })

  it('do it in every maze, from every corner', () => {
    for (const maze of MAZES) {
      const race = createRace(7, ['a', 'b', 'c', 'd'].map((id) => ({ id, bot: true })), maze.id)
      for (let t = 0; t < 150 && !race.over; t += 1 / 30) stepRace(race, botDirections(race), 1 / 30)
      for (const racer of race.racers) expect(racer.place, `${maze.name}, ${racer.id}`).not.toBeNull()
    }
  })

  it('never drive a person', () => {
    const race = createRace(SEED, [{ id: 'me', mine: true }, { id: 'bot', bot: true }])
    expect([...botDirections(race).keys()]).toEqual(['bot'])
  })
})
