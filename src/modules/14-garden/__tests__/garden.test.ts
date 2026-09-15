import { describe, expect, it } from 'vitest'
import {
  GRID,
  cellAt,
  cellCount,
  cellIndex,
  entryCol,
  everyCell,
  houseCol,
  inGrid,
  isLight,
  laneProgress,
} from '../internal/grid'
import {
  DEFAULT_GARDEN_MODE,
  GARDEN_MODES,
  gardenModeById,
  isGardenMode,
  needsPlayers,
} from '../internal/modes'
import {
  DEFENDERS,
  Defender,
  GardenPiece,
  PESTS,
  Pest,
  defenderById,
  isDefenderId,
  isPestId,
  pestById,
  silhouette,
  type Gait,
  type Role,
  type Shape,
} from '../internal/pieces'

/** Every shape, role and gait there is, so a test can walk all of them. */
const SHAPES: Shape[] = ['tall', 'round', 'squat', 'wide', 'spiky', 'long', 'winged']
const ROLES: Role[] = ['shoots', 'guards', 'grows', 'eats']
const GAITS: Gait[] = ['walks', 'flies', 'hops']
import {
  GOOFS,
  canBegin,
  decodeGoofs,
  encodeGoofs,
  everyoneHasPicked,
  gardenPhase,
  handIsFull,
  toggle,
  validHand,
  waitingToPick,
} from '../internal/goofs'

describe('the lawn', () => {
  it('is eight rows by twelve columns, and nothing else', () => {
    // Two people play on one lawn, so it is bigger than one person can cover.
    expect(GRID.rows).toBe(8)
    expect(GRID.cols).toBe(12)
    expect(cellCount()).toBe(96)
    expect(everyCell()).toHaveLength(96)
  })

  it('lists every square exactly once, in reading order', () => {
    const cells = everyCell()
    expect(new Set(cells.map((c) => `${c.row},${c.col}`)).size).toBe(96)
    cells.forEach((cell, i) => {
      expect(cellIndex(cell.row, cell.col)).toBe(i)
      expect(cellAt(i)).toEqual(cell)
    })
  })

  it('knows a square from a number somebody made up', () => {
    expect(inGrid(0, 0)).toBe(true)
    expect(inGrid(GRID.rows - 1, GRID.cols - 1)).toBe(true)
    expect(inGrid(-1, 0)).toBe(false)
    expect(inGrid(0, GRID.cols)).toBe(false)
    expect(inGrid(GRID.rows, 0)).toBe(false)
    // A pest sits between two squares, so a fractional column is a real thing
    // to be handed - and it is not a square.
    expect(inGrid(0, 3.5)).toBe(false)
    expect(cellIndex(GRID.rows, GRID.cols)).toBe(-1)
    expect(cellAt(96)).toBeNull()
    expect(cellAt(-1)).toBeNull()
    expect(cellAt(1.5)).toBeNull()
  })

  it('runs lanes from the far end towards the house', () => {
    // The one thing here that is a game decision. Everything written later
    // assumes it and none of it will say so.
    expect(houseCol()).toBe(0)
    expect(entryCol()).toBe(GRID.cols - 1)
    expect(laneProgress(houseCol())).toBe(0)
    expect(laneProgress(entryCol())).toBe(1)
    expect(laneProgress(4)).toBeGreaterThan(laneProgress(3))
  })

  it('clamps a lane position that has walked off either end', () => {
    expect(laneProgress(-3)).toBe(0)
    expect(laneProgress(99)).toBe(1)
  })

  it('checkerboards along a lane and across the lanes', () => {
    expect(isLight(0, 0)).toBe(true)
    expect(isLight(0, 1)).toBe(false)
    expect(isLight(1, 0)).toBe(false)
    expect(isLight(1, 1)).toBe(true)
  })
})

describe('the roster', () => {
  it('is forty-nine animals and twenty-five pests', () => {
    // Forty-nine so the picking shelf is an exact 7x7 grid - one screen, no
    // scrolling, no half-filled row at the end.
    expect(DEFENDERS).toHaveLength(49)
    expect(Math.sqrt(DEFENDERS.length)).toBe(7)
    expect(PESTS).toHaveLength(25)
  })

  it('names everybody once, on both sides', () => {
    expect(new Set(DEFENDERS.map((d) => d.id)).size).toBe(DEFENDERS.length)
    expect(new Set(PESTS.map((p) => p.id)).size).toBe(PESTS.length)
    expect(new Set(DEFENDERS.map((d) => d.name)).size).toBe(DEFENDERS.length)
    expect(new Set(PESTS.map((p) => p.name)).size).toBe(PESTS.length)
  })

  it('keeps the two catalogues apart, snails and spiders included', () => {
    // There is a garden snail that helps and a snail that eats the lawn, and
    // the same for spiders. They are different creatures with different ids,
    // and an id that was in both would let a pest through a defender's guard.
    for (const pest of PESTS) expect(isDefenderId(pest.id)).toBe(false)
    for (const animal of DEFENDERS) expect(isPestId(animal.id)).toBe(false)
    expect(isDefenderId('garden-snail')).toBe(true)
    expect(isPestId('snail')).toBe(true)
  })

  it('gives everything a name, a line to read, a colour and a shape', () => {
    for (const species of [...DEFENDERS, ...PESTS]) {
      expect(species.name.length).toBeGreaterThan(0)
      expect(species.blurb.length).toBeGreaterThan(0)
      // Until the art is done every creature is a pill, so the colour and the
      // shape are the whole of what tells one from another.
      expect(species.colour).toMatch(/^#[0-9a-f]{6}$/i)
      expect(species.health).toBeGreaterThan(0)
      expect(SHAPES).toContain(species.shape)
    }
  })

  it('draws a different silhouette for every shape there is', () => {
    // The design rule: recognisable at a small distance. Two shapes that came
    // out the same size would be one shape with two names.
    const drawn = SHAPES.map((shape) => JSON.stringify(silhouette(shape)))
    expect(new Set(drawn).size).toBe(SHAPES.length)
    for (const shape of SHAPES) {
      const { width, height, radius } = silhouette(shape)
      expect(width).toBeGreaterThan(0)
      expect(width).toBeLessThanOrEqual(1)
      expect(height).toBeGreaterThan(0)
      expect(height).toBeLessThanOrEqual(1)
      expect(radius).toBeGreaterThanOrEqual(0)
    }
  })

  it('uses more than a couple of shapes across the roster', () => {
    // Forty-nine things that are all "round" would be forty-nine things
    // nobody can tell apart on a lawn.
    expect(new Set(DEFENDERS.map((d) => d.shape)).size).toBeGreaterThan(3)
    expect(new Set(PESTS.map((p) => p.shape)).size).toBeGreaterThan(3)
  })

  it('costs something to plant, and takes time to come back', () => {
    for (const animal of DEFENDERS) {
      expect(animal.cost).toBeGreaterThan(0)
      expect(animal.recharge).toBeGreaterThan(0)
      expect(animal.reach).toBeGreaterThanOrEqual(0)
    }
  })

  it('has all four jobs on the shelf, and plenty of each', () => {
    for (const role of ROLES) {
      expect(DEFENDERS.filter((d) => d.role === role).length).toBeGreaterThan(5)
    }
  })

  it('gives a grower no reach, because it cannot defend itself', () => {
    // The pot has to come from somewhere, and something that both paid and
    // fought would make every other choice on the shelf pointless.
    for (const animal of DEFENDERS) {
      if (animal.role === 'grows') expect(animal.reach).toBe(0)
      if (animal.role === 'shoots') expect(animal.reach).toBeGreaterThan(0)
    }
  })

  it('makes every pest move, and bite when it gets there', () => {
    for (const pest of PESTS) {
      expect(pest.speed).toBeGreaterThan(0)
      expect(pest.bite).toBeGreaterThan(0)
      expect(GAITS).toContain(pest.moves)
    }
  })

  it('has some pests a wall cannot stop, and some that hop it', () => {
    expect(PESTS.some((p) => p.moves === 'flies')).toBe(true)
    expect(PESTS.some((p) => p.moves === 'hops')).toBe(true)
    expect(PESTS.some((p) => p.moves === 'walks')).toBe(true)
  })

  it('runs from a nuisance up to something you have to plan for', () => {
    // Cheap and quick at one end, slow and enormous at the other. A roster
    // where everything cost and took the same would be one pest with 25 names.
    const health = PESTS.map((p) => p.health)
    expect(Math.max(...health)).toBeGreaterThan(Math.min(...health) * 10)
    const costs = DEFENDERS.map((d) => d.cost)
    expect(Math.max(...costs)).toBeGreaterThan(Math.min(...costs) * 5)
  })

  it('starts the pot able to afford something and not everything', () => {
    expect(DEFENDERS.some((d) => GOOFS.startingSeeds >= d.cost)).toBe(true)
    expect(DEFENDERS.some((d) => GOOFS.startingSeeds < d.cost)).toBe(true)
  })

  it('looks one up, and guards one from the wire', () => {
    for (const animal of DEFENDERS) {
      expect(defenderById(animal.id)).toBe(animal)
      expect(isDefenderId(animal.id)).toBe(true)
    }
    for (const pest of PESTS) {
      expect(pestById(pest.id)).toBe(pest)
      expect(isPestId(pest.id)).toBe(true)
    }
    for (const junk of ['', 'Duck', 'wasp', 7, null, undefined, {}]) {
      expect(isDefenderId(junk)).toBe(false)
      expect(isPestId(junk)).toBe(false)
    }
  })

  it('cannot be added to at runtime', () => {
    expect(Object.isFrozen(DEFENDERS)).toBe(true)
    expect(Object.isFrozen(PESTS)).toBe(true)
    expect(Object.isFrozen(DEFENDERS[0])).toBe(true)
    expect(Object.isFrozen(PESTS[0])).toBe(true)
  })
})

describe('a piece on the lawn', () => {
  it('starts whole, in the square it was put in', () => {
    const duck = new Defender(defenderById('duck'), 2, 3, 'self')
    expect(duck).toBeInstanceOf(GardenPiece)
    expect(duck.side).toBe('defence')
    expect(duck.health).toBe(defenderById('duck').health)
    expect(duck.condition).toBe(1)
    expect(duck.alive).toBe(true)
    expect(duck.square).toEqual({ row: 2, col: 3 })
    expect(duck.planter).toBe('self')
    expect(duck.name).toBe('Duck')
    expect(duck.colour).toBe(defenderById('duck').colour)
  })

  it('takes damage, and stops at dead', () => {
    const snail = new Pest(pestById('snail'), 1, 8)
    snail.hurt(30)
    expect(snail.health).toBe(pestById('snail').health - 30)
    expect(snail.condition).toBeCloseTo(1 - 30 / pestById('snail').health, 9)
    snail.hurt(99999)
    // Nothing is deader than dead, and a health of -9000 leaks into every
    // health bar that ever reads it.
    expect(snail.health).toBe(0)
    expect(snail.alive).toBe(false)
    expect(snail.condition).toBe(0)
  })

  it('ignores a hit that is not one', () => {
    const duck = new Defender(defenderById('duck'), 0, 0)
    duck.hurt(-50)
    duck.hurt(0)
    duck.hurt(Number.NaN)
    expect(duck.health).toBe(defenderById('duck').health)
  })

  it('knows which square it is in while it is between two', () => {
    // A defender sits in a square; a pest spends most of its life crossing
    // one, which is why the column is a number and not an index.
    const ant = new Pest(pestById('ant'), 4, 6.7)
    expect(ant.square).toEqual({ row: 4, col: 6 })
    expect(ant.side).toBe('pest')
  })

  it('knows what a wall will not stop', () => {
    expect(new Pest(pestById('crow'), 0, 8).flies).toBe(true)
    expect(new Pest(pestById('worm'), 0, 8).flies).toBe(false)
  })

  it('knows which animal pays into the pot', () => {
    expect(new Defender(defenderById('rabbit'), 0, 0).enriches).toBe(true)
    expect(new Defender(defenderById('turtle'), 0, 0).enriches).toBe(false)
    expect(new Defender(defenderById('frog'), 0, 0).cost).toBe(defenderById('frog').cost)
  })
})

describe('the loadout the party brings', () => {
  it('takes a legal loadout and hands it back clean', () => {
    expect(validHand(['duck', 'frog'])).toEqual(['duck', 'frog'])
  })

  it('drops a double click rather than refusing it', () => {
    // Two people clicking the duck is agreement, not a lie.
    expect(validHand(['duck', 'duck', 'frog'])).toEqual(['duck', 'frog'])
  })

  it('allows an empty one, because a party starts with nothing chosen', () => {
    expect(validHand([])).toEqual([])
  })

  it('refuses one that is too big, or made up', () => {
    // More distinct animals than the loadout holds is refused outright.
    const toomany = DEFENDERS.map((d) => d.id).slice(0, GOOFS.handSize + 1)
    if (toomany.length > GOOFS.handSize) expect(validHand(toomany)).toBeNull()
    expect(validHand(['duck', 'wasp'])).toBeNull()
    expect(validHand('duck')).toBeNull()
    expect(validHand(null)).toBeNull()
  })

  it('is added to and taken from by anybody', () => {
    // "As a team" is the whole point: it is one lawn and one pot, so it is one
    // loadout, and anybody may change anybody's pick.
    expect(toggle([], 'duck')).toEqual(['duck'])
    expect(toggle(['duck', 'frog'], 'duck')).toEqual(['frog'])
  })

  it('refuses another once it is full rather than pushing one out', () => {
    // Silently replacing somebody else's pick is the worst of both.
    const full = DEFENDERS.slice(0, GOOFS.handSize).map((d) => d.id)
    if (full.length < GOOFS.handSize) return
    expect(handIsFull(full)).toBe(true)
    const spare = DEFENDERS.find((d) => !full.includes(d.id))
    if (spare) expect(toggle(full, spare.id)).toEqual(full)
  })

  it('brings fewer animals than there are to choose from', () => {
    // The loadout is meant to be a decision. With forty-nine on the shelf it
    // is decided as much by what you left behind as by what you brought.
    expect(GOOFS.handSize).toBeGreaterThan(0)
    expect(GOOFS.handSize).toBeLessThan(DEFENDERS.length)
  })
})

describe('whether the round can begin', () => {
  it('waits for everybody, not just for most', () => {
    const ids = ['self', 'a', 'b']
    expect(everyoneHasPicked(ids, ['self', 'a'])).toBe(false)
    expect(waitingToPick(ids, ['self', 'a'])).toBe(1)
    expect(everyoneHasPicked(ids, ids)).toBe(true)
    expect(waitingToPick(ids, ids)).toBe(0)
  })

  it('is not waiting on a lobby with nobody in it', () => {
    expect(everyoneHasPicked([], [])).toBe(false)
  })

  it('refuses to begin on an empty loadout', () => {
    // A round that started with nothing chosen would be a lawn nobody could
    // put anything on.
    const ids = ['self']
    expect(canBegin(ids, ids, [])).toBe(false)
    expect(canBegin(ids, ids, ['duck'])).toBe(true)
  })

  it('opens the shelf when the host starts, and the lawn when everyone is in', () => {
    const ids = ['self', 'a']
    expect(gardenPhase(false, ids, ids, ['duck'])).toBe('off')
    expect(gardenPhase(true, ids, [], ['duck'])).toBe('picking')
    expect(gardenPhase(true, ids, ['self'], ['duck'])).toBe('picking')
    expect(gardenPhase(true, ids, ids, [])).toBe('picking')
    expect(gardenPhase(true, ids, ids, ['duck'])).toBe('planting')
  })
})

describe('what arrives from another browser', () => {
  it('round-trips a loadout through the transport, which is JSON', () => {
    const sent = JSON.parse(JSON.stringify(encodeGoofs({ hand: ['duck', 'turtle'] })))
    expect(decodeGoofs(sent)).toEqual({ hand: ['duck', 'turtle'] })
  })

  it('carries a done flag, a claim, a planting and a question', () => {
    expect(decodeGoofs(encodeGoofs({ done: true }))).toEqual({ done: true })
    expect(decodeGoofs(encodeGoofs({ claim: 12 }))).toEqual({ claim: 12 })
    expect(decodeGoofs(encodeGoofs({ plant: { row: 1, col: 2, id: 'duck' } }))).toEqual({
      plant: { row: 1, col: 2, id: 'duck' },
    })
    expect(decodeGoofs(encodeGoofs({ ask: true }))).toEqual({ ask: true })
  })

  it('leaves everybody else messages alone', () => {
    expect(decodeGoofs({ t: 'party', phase: 'playing' })).toBeNull()
    expect(decodeGoofs({ t: 'mode', value: 'garden' })).toBeNull()
    expect(decodeGoofs({})).toBeNull()
  })

  it('refuses a loadout it cannot draw', () => {
    expect(decodeGoofs({ t: 'goofs', hand: ['wasp'] })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', hand: 'duck' })).toBeNull()
  })

  it('refuses a planting off the lawn or of something unheard of', () => {
    expect(decodeGoofs({ t: 'goofs', plant: { row: 99, col: 0, id: 'duck' } })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', plant: { row: 0, col: 0, id: 'wasp' } })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', plant: { row: 0, col: 0 } })).toBeNull()
  })

  it('refuses a done flag that is not one', () => {
    expect(decodeGoofs({ t: 'goofs', done: 'yes' })).toBeNull()
  })
})

describe('the three ways to play', () => {
  it('is endless, co-op and versus', () => {
    expect(GARDEN_MODES.map((m) => m.id)).toEqual(['endless', 'coop', 'versus'])
  })

  it('gives every one of them something to read', () => {
    for (const mode of GARDEN_MODES) {
      expect(mode.title.length).toBeGreaterThan(0)
      expect(mode.blurb.length).toBeGreaterThan(0)
      expect(gardenModeById(mode.id)).toBe(mode)
      expect(isGardenMode(mode.id)).toBe(true)
    }
  })

  it('refuses anything else', () => {
    for (const junk of ['', 'ENDLESS', 'solo', 3, null, undefined, {}]) {
      expect(isGardenMode(junk)).toBe(false)
    }
  })

  it('opens on the one a single player can play', () => {
    expect(isGardenMode(DEFAULT_GARDEN_MODE)).toBe(true)
    expect(needsPlayers(DEFAULT_GARDEN_MODE)).toBe(1)
  })

  it('knows which modes need company', () => {
    expect(needsPlayers('endless')).toBe(1)
    expect(needsPlayers('coop')).toBe(2)
    expect(needsPlayers('versus')).toBe(2)
  })
})
