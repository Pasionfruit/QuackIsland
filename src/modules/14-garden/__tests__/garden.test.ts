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
} from '../internal/pieces'
import {
  GOOFS,
  canAfford,
  cheapestCost,
  decodeGoofs,
  encodeGoofs,
  everyoneHasPicked,
  gardenPhase,
  handIsFull,
  validHand,
  waitingToPick,
  type Hands,
} from '../internal/goofs'

describe('the lawn', () => {
  it('is six rows by nine columns, and nothing else', () => {
    expect(GRID.rows).toBe(6)
    expect(GRID.cols).toBe(9)
    expect(cellCount()).toBe(54)
    expect(everyCell()).toHaveLength(54)
  })

  it('lists every square exactly once, in reading order', () => {
    const cells = everyCell()
    expect(new Set(cells.map((c) => `${c.row},${c.col}`)).size).toBe(54)
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
    expect(cellIndex(9, 9)).toBe(-1)
    expect(cellAt(54)).toBeNull()
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

describe('the animals and the pests', () => {
  it('is four animals: duck, frog, rabbit, turtle', () => {
    expect(DEFENDERS.map((d) => d.id)).toEqual(['duck', 'frog', 'rabbit', 'turtle'])
  })

  it('is eight pests', () => {
    expect(PESTS.map((p) => p.id)).toEqual([
      'worm',
      'beetle',
      'snail',
      'ant',
      'grasshopper',
      'bee',
      'spider',
      'moth',
    ])
  })

  it('gives everything a name, a line to read and a colour to be', () => {
    for (const species of [...DEFENDERS, ...PESTS]) {
      expect(species.name.length).toBeGreaterThan(0)
      expect(species.blurb.length).toBeGreaterThan(0)
      // Until the art is done every creature is a pill, so the colour is the
      // only thing telling a duck from a turtle.
      expect(species.colour).toMatch(/^#[0-9a-f]{6}$/i)
      expect(species.health).toBeGreaterThan(0)
    }
  })

  it('costs something to plant, and takes time to come back', () => {
    for (const animal of DEFENDERS) {
      expect(animal.cost).toBeGreaterThan(0)
      expect(animal.recharge).toBeGreaterThan(0)
      expect(animal.reach).toBeGreaterThanOrEqual(0)
    }
  })

  it('has exactly one animal that turns up seeds', () => {
    // The pot has to come from somewhere, and a lawn of nothing but growers is
    // as broken as a lawn with none.
    expect(DEFENDERS.filter((d) => d.role === 'enriches')).toHaveLength(1)
    expect(DEFENDERS.some((d) => d.role === 'walls')).toBe(true)
    expect(DEFENDERS.some((d) => d.role === 'eats')).toBe(true)
  })

  it('gives a grower no reach, because it cannot defend itself', () => {
    for (const animal of DEFENDERS) {
      if (animal.role !== 'eats') expect(animal.reach).toBe(0)
      else expect(animal.reach).toBeGreaterThan(0)
    }
  })

  it('makes every pest move, and bite when it gets there', () => {
    for (const pest of PESTS) {
      expect(pest.speed).toBeGreaterThan(0)
      expect(pest.bite).toBeGreaterThan(0)
      expect(['walks', 'flies', 'hops']).toContain(pest.moves)
    }
  })

  it('has something a wall cannot stop', () => {
    expect(PESTS.some((p) => p.moves === 'flies')).toBe(true)
  })

  it('starts the pot able to afford something and not everything', () => {
    expect(DEFENDERS.some((d) => GOOFS.startingSeeds >= d.cost)).toBe(true)
    const all = DEFENDERS.reduce((sum, d) => sum + d.cost, 0)
    expect(GOOFS.startingSeeds).toBeLessThan(all)
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
    // The two catalogues do not overlap, so neither guard lets the other in.
    for (const pest of PESTS) expect(isDefenderId(pest.id)).toBe(false)
  })

  it('cannot be added to at runtime', () => {
    expect(Object.isFrozen(DEFENDERS)).toBe(true)
    expect(Object.isFrozen(PESTS)).toBe(true)
    expect(Object.isFrozen(DEFENDERS[0])).toBe(true)
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
    expect(new Pest(pestById('bee'), 0, 8).flies).toBe(true)
    expect(new Pest(pestById('worm'), 0, 8).flies).toBe(false)
  })

  it('knows which animal pays into the pot', () => {
    expect(new Defender(defenderById('rabbit'), 0, 0).enriches).toBe(true)
    expect(new Defender(defenderById('turtle'), 0, 0).enriches).toBe(false)
    expect(new Defender(defenderById('frog'), 0, 0).cost).toBe(defenderById('frog').cost)
  })
})

describe('picking a hand', () => {
  it('takes a legal hand and hands it back clean', () => {
    expect(validHand(['duck', 'frog'])).toEqual(['duck', 'frog'])
  })

  it('drops a double click rather than refusing it', () => {
    expect(validHand(['duck', 'duck', 'frog'])).toEqual(['duck', 'frog'])
  })

  it('refuses a hand that is empty, too big, or made up', () => {
    expect(validHand([])).toBeNull()
    expect(validHand(['duck', 'frog', 'rabbit', 'turtle'])).toBeNull()
    expect(validHand(['duck', 'wasp'])).toBeNull()
    expect(validHand('duck')).toBeNull()
    expect(validHand(null)).toBeNull()
  })

  it('knows when the hand is full', () => {
    expect(handIsFull(['duck', 'frog'])).toBe(false)
    expect(handIsFull(['duck', 'frog', 'rabbit'])).toBe(true)
    expect(GOOFS.handSize).toBeLessThan(DEFENDERS.length)
  })
})

describe('whether the round can begin', () => {
  const hands = (...who: string[]): Hands =>
    Object.fromEntries(who.map((id) => [id, ['duck'] as const]))

  it('waits for everybody, not just for most', () => {
    const ids = ['self', 'a', 'b']
    expect(everyoneHasPicked(ids, hands('self', 'a'))).toBe(false)
    expect(waitingToPick(ids, hands('self', 'a'))).toBe(1)
    expect(everyoneHasPicked(ids, hands('self', 'a', 'b'))).toBe(true)
    expect(waitingToPick(ids, hands('self', 'a', 'b'))).toBe(0)
  })

  it('is not waiting on a lobby with nobody in it', () => {
    expect(everyoneHasPicked([], {})).toBe(false)
  })

  it('opens the menu when the host starts, and the lawn when everyone is in', () => {
    const ids = ['self', 'a']
    expect(gardenPhase(false, ids, {})).toBe('off')
    expect(gardenPhase(false, ids, hands('self', 'a'))).toBe('off')
    expect(gardenPhase(true, ids, {})).toBe('picking')
    expect(gardenPhase(true, ids, hands('self'))).toBe('picking')
    expect(gardenPhase(true, ids, hands('self', 'a'))).toBe('planting')
  })
})

describe('the shared pot', () => {
  it('knows what it covers', () => {
    expect(canAfford(GOOFS.startingSeeds, 'duck')).toBe(true)
    expect(canAfford(0, 'duck')).toBe(false)
    expect(canAfford(defenderById('turtle').cost, 'turtle')).toBe(true)
    expect(canAfford(defenderById('turtle').cost - 1, 'turtle')).toBe(false)
  })

  it('knows the least a hand could spend', () => {
    // Against the table rather than against a number, so rebalancing the
    // animals does not break the arithmetic's test.
    expect(cheapestCost(['turtle', 'frog'])).toBe(
      Math.min(defenderById('turtle').cost, defenderById('frog').cost),
    )
    expect(cheapestCost([])).toBe(0)
  })
})

describe('what arrives from another browser', () => {
  it('round-trips a hand through the transport, which is JSON', () => {
    const sent = JSON.parse(JSON.stringify(encodeGoofs({ hand: ['duck', 'turtle'] })))
    expect(decodeGoofs(sent)).toEqual({ hand: ['duck', 'turtle'] })
  })

  it('carries the pot, and a question with no answer in it', () => {
    expect(decodeGoofs(encodeGoofs({ seeds: 75 }))).toEqual({ seeds: 75 })
    expect(decodeGoofs(encodeGoofs({ ask: true }))).toEqual({ ask: true })
  })

  it('leaves everybody else’s messages alone', () => {
    // The room channel is shared with the party and with the choice of game.
    expect(decodeGoofs({ t: 'party', phase: 'playing' })).toBeNull()
    expect(decodeGoofs({ t: 'mode', value: 'garden' })).toBeNull()
    expect(decodeGoofs({})).toBeNull()
  })

  it('refuses a hand it cannot draw', () => {
    // An animal nobody has heard of, or a hand of nine, would put something in
    // the menu that cannot be drawn and cannot be cleared.
    expect(decodeGoofs({ t: 'goofs', hand: ['wasp'] })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', hand: [] })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', hand: ['duck', 'frog', 'rabbit', 'turtle'] })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', hand: 'duck' })).toBeNull()
  })

  it('refuses a pot that is not a number of seeds', () => {
    expect(decodeGoofs({ t: 'goofs', seeds: -1 })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', seeds: Number.NaN })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', seeds: Infinity })).toBeNull()
    expect(decodeGoofs({ t: 'goofs', seeds: '50' })).toBeNull()
    // A fraction of a seed is nobody's idea of a pot, so it is floored.
    expect(decodeGoofs({ t: 'goofs', seeds: 49.9 })).toEqual({ seeds: 49 })
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
