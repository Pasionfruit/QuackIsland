/**
 * Everything that stands on the lawn: the animals that defend it and the pests
 * that come for it.
 *
 * Two halves, deliberately kept apart:
 *
 * - **Species** are data. Frozen catalogues of what a duck *is* - what it
 *   costs, how much it can take, what it does. Nothing in a catalogue changes
 *   while a game runs, and the lobby reads them to draw the picking menu long
 *   before any game exists.
 * - **Pieces** are the live things. One duck, in one square, with the health it
 *   has left. `GardenPiece` is the base: everything on the lawn is one, has a
 *   species, sits somewhere, and can be hurt. `Defender` and `Pest` are the two
 *   sides of it.
 *
 * The base class carries only what is true of *both* sides, which is less than
 * it looks: a duck and a beetle share being alive, being somewhere, and being
 * damageable, and share nothing else at all. Everything a duck does that a
 * beetle does not belongs on `Defender`, and the reverse on `Pest`.
 *
 * **No rules here.** Nothing attacks, nothing walks, nothing is spent. The
 * numbers are first numbers, written down so the menu has something to show
 * and so balancing later is editing a table rather than hunting through code.
 */

/** What every species has, defender and pest alike. */
export interface Species {
  id: string
  /** What the menu calls it. */
  name: string
  /** One line, in the menu, under the name. */
  blurb: string
  /** How much it can take before it is gone. */
  health: number
  /**
   * The colour of its pill.
   *
   * Every creature is a pill until the art is done - see the note in
   * `13-modes` - so the colour is the only thing telling a duck from a turtle.
   * It is on the species rather than in the view because it is part of what
   * the thing *is* to a player.
   */
  colour: string
}

/** An animal that holds the lawn, or feeds it. */
export interface DefenderSpecies extends Species {
  id: DefenderId
  /** Seeds to plant one, out of the shared pool. */
  cost: number
  /** Seconds before you may plant another of the same kind. */
  recharge: number
  /**
   * What it is for.
   *
   * `eats` clears pests in front of it, `walls` is there to be chewed on
   * instead of the lawn, and `enriches` is where seeds come from - the pool is
   * shared, so one player planting rabbits pays for everybody.
   */
  role: 'eats' | 'walls' | 'enriches'
  /** How many squares along its lane it reaches. Zero for a wall. */
  reach: number
}

/** Something that came to ruin it. */
export interface PestSpecies extends Species {
  id: PestId
  /** Squares a second, walking up the lane towards the house. */
  speed: number
  /** How hard it chews, per second. */
  bite: number
  /**
   * How it gets about.
   *
   * `walks` is the ordinary case and the only one a wall stops. `flies` goes
   * over anything on the ground, and `hops` clears exactly one thing in its
   * way - the difference matters enough to be a field rather than a note.
   */
  moves: 'walks' | 'flies' | 'hops'
}

export type DefenderId = 'duck' | 'frog' | 'rabbit' | 'turtle'

export type PestId =
  | 'worm'
  | 'beetle'
  | 'snail'
  | 'ant'
  | 'grasshopper'
  | 'bee'
  | 'spider'
  | 'moth'

/**
 * The four animals you plant.
 *
 * Deliberately few. Four species and a hand of three is a real decision every
 * round; twelve species and a hand of twelve is a list.
 */
export const DEFENDERS: readonly DefenderSpecies[] = Object.freeze([
  Object.freeze({
    id: 'duck',
    name: 'Duck',
    blurb: 'Snaps up whatever wanders into its lane. The one you always bring.',
    cost: 25,
    recharge: 5,
    role: 'eats',
    health: 100,
    reach: 9,
    colour: '#e0563f',
  }),
  Object.freeze({
    id: 'frog',
    name: 'Frog',
    blurb: 'Sits still and takes anything within a few squares, either side.',
    cost: 50,
    recharge: 8,
    role: 'eats',
    health: 80,
    reach: 3,
    colour: '#5d9145',
  }),
  Object.freeze({
    id: 'rabbit',
    name: 'Rabbit',
    blurb: 'Digs. Turns up seeds for everybody, and cannot defend itself.',
    cost: 25,
    recharge: 6,
    role: 'enriches',
    health: 60,
    reach: 0,
    colour: '#d8c9a4',
  }),
  Object.freeze({
    id: 'turtle',
    name: 'Turtle',
    blurb: 'A shell in the way. Slow to chew through, and that is the whole job.',
    cost: 40,
    recharge: 12,
    role: 'walls',
    health: 400,
    reach: 0,
    colour: '#6d8f5a',
  }),
]) as readonly DefenderSpecies[]

/** The eight things that come for it. */
export const PESTS: readonly PestSpecies[] = Object.freeze([
  Object.freeze({
    id: 'worm',
    name: 'Worm',
    blurb: 'Slow and soft. Turns up first, and never alone for long.',
    health: 60,
    speed: 0.16,
    bite: 8,
    moves: 'walks',
    colour: '#c98d9b',
  }),
  Object.freeze({
    id: 'beetle',
    name: 'Beetle',
    blurb: 'Armoured. Takes a while to shift and does not care what you throw.',
    health: 220,
    speed: 0.2,
    bite: 12,
    moves: 'walks',
    colour: '#4a5568',
  }),
  Object.freeze({
    id: 'snail',
    name: 'Snail',
    blurb: 'Barely moves. Gets there anyway, and eats every leaf on the way.',
    health: 180,
    speed: 0.1,
    bite: 16,
    moves: 'walks',
    colour: '#b08968',
  }),
  Object.freeze({
    id: 'ant',
    name: 'Ant',
    blurb: 'Quick and weak, and there is never one ant.',
    health: 30,
    speed: 0.45,
    bite: 6,
    moves: 'walks',
    colour: '#8b5a2b',
  }),
  Object.freeze({
    id: 'grasshopper',
    name: 'Grasshopper',
    blurb: 'Hops the first thing in its way, then walks like anything else.',
    health: 90,
    speed: 0.3,
    bite: 10,
    moves: 'hops',
    colour: '#7cb342',
  }),
  Object.freeze({
    id: 'bee',
    name: 'Bee',
    blurb: 'Flies straight over the ground. A wall is no use at all.',
    health: 70,
    speed: 0.38,
    bite: 9,
    moves: 'flies',
    colour: '#f0c34a',
  }),
  Object.freeze({
    id: 'spider',
    name: 'Spider',
    blurb: 'Drops in on a thread, so it can start anywhere down the lane.',
    health: 110,
    speed: 0.26,
    bite: 14,
    moves: 'walks',
    colour: '#3d3d46',
  }),
  Object.freeze({
    id: 'moth',
    name: 'Moth',
    blurb: 'Flies, and goes for the leaves rather than whatever is guarding them.',
    health: 50,
    speed: 0.34,
    bite: 7,
    moves: 'flies',
    colour: '#cfc3a8',
  }),
]) as readonly PestSpecies[]

export function isDefenderId(value: unknown): value is DefenderId {
  return DEFENDERS.some((d) => d.id === value)
}

export function isPestId(value: unknown): value is PestId {
  return PESTS.some((p) => p.id === value)
}

/** The entry for an id. Total on the id types. */
export function defenderById(id: DefenderId): DefenderSpecies {
  return DEFENDERS.find((d) => d.id === id) ?? DEFENDERS[0]
}

export function pestById(id: PestId): PestSpecies {
  return PESTS.find((p) => p.id === id) ?? PESTS[0]
}

/**
 * One creature on the lawn.
 *
 * The base of both sides. It knows what it is, where it is, and how much of it
 * is left - and nothing else, because that is the whole of what a duck and a
 * beetle have in common.
 *
 * `col` is deliberately a number rather than an integer: a defender sits in a
 * square and a pest walks between them, so a pest's column is 6.4 for most of
 * its life. `square` is the one it is standing in.
 */
export abstract class GardenPiece {
  /** Which side it is on. Set by the subclass; the base never asks. */
  abstract readonly side: 'defence' | 'pest'

  health: number

  constructor(
    readonly species: Species,
    public row: number,
    public col: number,
  ) {
    this.health = species.health
  }

  get id(): string {
    return this.species.id
  }

  get name(): string {
    return this.species.name
  }

  get colour(): string {
    return this.species.colour
  }

  /** The square it is standing in, whatever fraction of one it has crossed. */
  get square(): { row: number; col: number } {
    return { row: Math.round(this.row), col: Math.floor(this.col) }
  }

  get alive(): boolean {
    return this.health > 0
  }

  /**
   * Takes a hit.
   *
   * Clamped at zero rather than going negative: nothing is deader than dead,
   * and a health of -40 is a number that leaks into anything that later wants
   * to draw a health bar.
   */
  hurt(amount: number): void {
    if (!(amount > 0)) return
    this.health = Math.max(0, this.health - amount)
  }

  /** How much of it is left, 0 to 1. For a health bar, when there is one. */
  get condition(): number {
    return this.species.health > 0 ? this.health / this.species.health : 0
  }
}

/** An animal you planted. It stays in the square you put it in. */
export class Defender extends GardenPiece {
  readonly side = 'defence' as const

  constructor(
    readonly kind: DefenderSpecies,
    row: number,
    col: number,
    /** Who planted it. The lawn is shared, so this is worth keeping. */
    readonly planter: string | null = null,
  ) {
    super(kind, row, col)
  }

  get cost(): number {
    return this.kind.cost
  }

  /** Whether it is the kind that turns up seeds for the shared pool. */
  get enriches(): boolean {
    return this.kind.role === 'enriches'
  }
}

/** Something that came for the lawn. It walks the lane it arrived in. */
export class Pest extends GardenPiece {
  readonly side = 'pest' as const

  constructor(
    readonly kind: PestSpecies,
    row: number,
    col: number,
  ) {
    super(kind, row, col)
  }

  /** Whether anything on the ground can stop it. */
  get flies(): boolean {
    return this.kind.moves === 'flies'
  }
}
