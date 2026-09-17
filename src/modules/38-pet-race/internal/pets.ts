/**
 * The five pets, and the numbers that make them different animals to race.
 *
 * Every one of them is the best at something and bad at something else, so
 * there is no pet to pick without thinking - which is the whole reason the
 * game spends ten seconds showing you the table before it starts.
 *
 * - **Speed** is metres a second on dry, clear ground.
 * - **Boost** multiplies that while you hold the button, and empties the tank
 *   at one second a second.
 * - **Stamina** is the tank, in seconds of boost.
 * - **Regrow** is how fast it fills again while you are not boosting.
 * - **Grip** is how quickly the animal can change which way it is going. A
 *   loose animal is fast in a line and terrible round a hedge.
 *
 * **The fish is a joke and is meant to be.** It has no speed, no boost and no
 * tank: it flops on the line for thirty seconds. It is what you get for not
 * choosing, and picking it on purpose is a bit you are doing for other people.
 *
 * Pure: numbers and words, no clock and no three.js.
 */

export type PetId = 'dog' | 'cat' | 'rabbit' | 'hamster' | 'fish'

export interface Pet {
  id: PetId
  name: string
  /** One line on the card, for somebody choosing in ten seconds. */
  blurb: string
  /** Metres a second, flat out, not boosting. */
  speed: number
  /** What holding boost multiplies `speed` by. */
  boost: number
  /** The tank, in seconds of boost. */
  stamina: number
  /** Seconds of tank regrown per second, while not boosting. */
  regen: number
  /** How quickly it can change direction, per second. Low is a wide turn. */
  grip: number
  /** Body colour, before a player's own colour is mixed in. */
  colour: string
  /** Roughly how much floor it takes up, for steering round things. */
  radius: number
}

/**
 * In the order they sit on the table, and the order the keys 1-5 pick them.
 *
 * The numbers were fitted against the course and the clock, not guessed: four
 * stand-ins driving the same policy over sixteen courses come home between
 * nineteen and twenty-two seconds whichever animal they are on, which is the
 * whole of what "none of them is simply the best" has to mean. There is a test
 * that holds them there.
 */
export const PETS: readonly Pet[] = Object.freeze([
  Object.freeze({
    id: 'dog' as const,
    name: 'Dog',
    blurb: 'Good at everything, best at nothing. Hard to go wrong with.',
    speed: 7.9,
    boost: 1.55,
    stamina: 5,
    regen: 0.85,
    grip: 9,
    colour: '#b07a42',
    radius: 0.62,
  }),
  Object.freeze({
    id: 'cat' as const,
    name: 'Cat',
    blurb: 'Turns on a coin and boosts hardest, but the tank is tiny. Live on treats.',
    speed: 7.1,
    boost: 2,
    stamina: 3,
    regen: 0.65,
    grip: 13,
    colour: '#6f6a7a',
    radius: 0.55,
  }),
  Object.freeze({
    id: 'rabbit' as const,
    name: 'Rabbit',
    blurb: 'Fastest on its feet and quickest to get its breath back - and it steers like a bus.',
    speed: 8.5,
    boost: 1.35,
    stamina: 2.2,
    regen: 1.7,
    grip: 5.5,
    colour: '#d8cfc2',
    radius: 0.58,
  }),
  Object.freeze({
    id: 'hamster' as const,
    name: 'Hamster',
    blurb: 'Slowest legs, endless tank. Hold the button down and never let go.',
    speed: 6.5,
    boost: 1.85,
    stamina: 9,
    regen: 1.15,
    grip: 11,
    colour: '#e0a862',
    radius: 0.48,
  }),
  Object.freeze({
    id: 'fish' as const,
    name: 'Fish',
    blurb: 'A fish. It will flop on the start line for thirty seconds. This is what not choosing gets you.',
    speed: 0,
    boost: 1,
    stamina: 0,
    regen: 0,
    grip: 0,
    colour: '#e0863f',
    radius: 0.5,
  }),
])

/** What anybody who does not choose in time is given. */
export const DEFAULT_PET: PetId = 'fish'

const BY_ID = new Map(PETS.map((pet) => [pet.id, pet]))

export function petById(id: PetId): Pet {
  const pet = BY_ID.get(id)
  if (!pet) throw new Error(`no such pet: ${id}`)
  return pet
}

export function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && BY_ID.has(value as PetId)
}

/** A pet's place in the list, which is what goes on the wire. */
export function petIndex(id: PetId): number {
  return PETS.findIndex((pet) => pet.id === id)
}

export function petAt(index: number): PetId | null {
  return PETS[index]?.id ?? null
}

/** Whether this one actually runs. Only the fish does not. */
export function canRun(id: PetId): boolean {
  return petById(id).speed > 0
}

/**
 * The bars on the card, each 0 to 1 against the best pet at that thing.
 *
 * Worked out from the table rather than written down beside it, so a pet whose
 * numbers are changed cannot end up with a card that lies about it. The fish is
 * left out of the scale: it is zero at everything and would flatten the rest.
 */
export function petBars(id: PetId): { speed: number; boost: number; stamina: number; regen: number; grip: number } {
  const pet = petById(id)
  const runners = PETS.filter((p) => p.speed > 0)
  const most = (pick: (p: Pet) => number) => Math.max(...runners.map(pick))
  return {
    speed: pet.speed / most((p) => p.speed),
    boost: (pet.boost - 1) / most((p) => p.boost - 1),
    stamina: pet.stamina / most((p) => p.stamina),
    regen: pet.regen / most((p) => p.regen),
    grip: pet.grip / most((p) => p.grip),
  }
}
