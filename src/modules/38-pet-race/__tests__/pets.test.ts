/**
 * The five pets: that there are five, that the table is honest, and that the
 * fish is the only one that does not run.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PET, PETS, canRun, isPetId, petAt, petBars, petById, petIndex } from '../internal/pets'

describe('the table', () => {
  it('is five animals, each named once', () => {
    expect(PETS).toHaveLength(5)
    expect(PETS.map((pet) => pet.id)).toEqual(['dog', 'cat', 'rabbit', 'hamster', 'fish'])
    expect(new Set(PETS.map((pet) => pet.name)).size).toBe(5)
    for (const pet of PETS) {
      expect(pet.name.length).toBeGreaterThan(0)
      expect(pet.blurb.length).toBeGreaterThan(10)
      expect(pet.radius).toBeGreaterThan(0)
    }
  })

  it('makes the fish the only one that cannot run, and the one you get for not choosing', () => {
    expect(DEFAULT_PET).toBe('fish')
    expect(canRun('fish')).toBe(false)
    expect(petById('fish').speed).toBe(0)
    expect(petById('fish').stamina).toBe(0)
    for (const pet of PETS.filter((p) => p.id !== 'fish')) {
      expect(canRun(pet.id), pet.id).toBe(true)
      expect(pet.speed, pet.id).toBeGreaterThan(0)
      expect(pet.boost, pet.id).toBeGreaterThan(1)
      expect(pet.stamina, pet.id).toBeGreaterThan(0)
      expect(pet.regen, pet.id).toBeGreaterThan(0)
      expect(pet.grip, pet.id).toBeGreaterThan(0)
    }
  })

  it('gives nobody the best of everything, and nobody the worst of everything', () => {
    // The claim on the tin: there is no pet to take without thinking, and none
    // to rule out without thinking either.
    const runners = PETS.filter((pet) => pet.speed > 0)
    const fields = ['speed', 'boost', 'stamina', 'regen', 'grip'] as const
    const bestAt = (pet: (typeof runners)[number], field: (typeof fields)[number]) => runners.every((other) => pet[field] >= other[field])
    const worstAt = (pet: (typeof runners)[number], field: (typeof fields)[number]) => runners.every((other) => pet[field] <= other[field])
    for (const pet of runners) {
      // The rabbit trails three of the five and leads the two that matter most
      // in a straight line: a glass cannon is allowed, an all-rounder that is
      // simply better than everybody is not.
      expect(fields.filter((field) => bestAt(pet, field)).length, `${pet.id} leads`).toBeLessThan(fields.length)
      expect(fields.filter((field) => worstAt(pet, field)).length, `${pet.id} trails`).toBeLessThan(fields.length)
    }
    // Every number is somebody's strong suit, or it is a number nobody chose for.
    for (const field of fields) {
      expect(runners.filter((pet) => bestAt(pet, field)).length, field).toBe(1)
      expect(runners.filter((pet) => worstAt(pet, field)).length, field).toBe(1)
    }
  })

  it('makes the dog exactly what its card says: middling at all five', () => {
    const runners = PETS.filter((pet) => pet.speed > 0)
    const dog = petById('dog')
    for (const field of ['speed', 'boost', 'stamina', 'regen', 'grip'] as const) {
      expect(runners.some((other) => other[field] > dog[field]), `${field} above`).toBe(true)
      expect(runners.some((other) => other[field] < dog[field]), `${field} below`).toBe(true)
    }
  })

  it('cannot be looked up by a name it does not have', () => {
    expect(isPetId('dog')).toBe(true)
    expect(isPetId('ferret')).toBe(false)
    expect(isPetId(3)).toBe(false)
    expect(isPetId(null)).toBe(false)
    expect(() => petById('ferret' as never)).toThrow()
  })

  it('has a place in the list for each, and the place says which one', () => {
    for (const [i, pet] of PETS.entries()) {
      expect(petIndex(pet.id)).toBe(i)
      expect(petAt(i)).toBe(pet.id)
    }
    expect(petAt(99)).toBeNull()
    expect(petAt(-1)).toBeNull()
  })
})

describe('the bars on a card', () => {
  it('are worked out from the numbers, so a card cannot lie about its animal', () => {
    const runners = PETS.filter((pet) => pet.speed > 0)
    const fields = ['speed', 'boost', 'stamina', 'regen', 'grip'] as const
    for (const field of fields) {
      const full = runners.filter((pet) => petBars(pet.id)[field] > 0.999)
      // Exactly one animal is the best at each thing, and its bar is full.
      expect(full.length, field).toBe(1)
    }
    for (const pet of runners) {
      const bars = petBars(pet.id)
      for (const field of fields) {
        expect(bars[field], `${pet.id} ${field}`).toBeGreaterThan(0)
        expect(bars[field], `${pet.id} ${field}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('leaves the fish at the bottom of every one of them', () => {
    const bars = petBars('fish')
    for (const value of Object.values(bars)) expect(value).toBeLessThanOrEqual(0)
  })
})
