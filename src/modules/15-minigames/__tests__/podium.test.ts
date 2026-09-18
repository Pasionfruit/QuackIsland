/**
 * Who stands where on the podium. Pure, so every rule is a list of numbers.
 */
import { describe, expect, it } from 'vitest'
import { poseFor, rankStandings, type Standing } from '../internal/podium'

const field = (...places: number[]): Standing[] => places.map((place, i) => ({ id: `p${i + 1}`, place }))
const ranks = (...places: number[]) => rankStandings(field(...places)).placed.map((p) => p.rank)
const poses = (...places: number[]) => rankStandings(field(...places)).placed.map((p) => p.pose)

describe('the podium', () => {
  it('jumps for first, smiles for second, keeps a straight face for third and falls on it after', () => {
    expect(poses(1, 2, 3, 4, 5)).toEqual(['joy', 'happy', 'straight', 'flop', 'flop'])
    expect(poseFor(8)).toBe('flop')
  })

  it('puts the top three on their steps and everybody else on the sand', () => {
    const { placed } = rankStandings(field(1, 2, 3, 4))
    expect(placed.map((p) => p.step)).toEqual([1, 2, 3, null])
  })

  it('shares a place between ties and skips the places after them', () => {
    // Two level at the top: whoever is next is third, not second.
    expect(ranks(1, 1, 2)).toEqual([1, 1, 3])
    expect(poses(1, 1, 2)).toEqual(['joy', 'joy', 'straight'])
    expect(ranks(1, 2, 2, 3)).toEqual([1, 2, 2, 4])
    expect(poses(1, 2, 2, 3)).toEqual(['joy', 'happy', 'happy', 'flop'])
  })

  it('derives the ranks from the order, whatever numbers the game used', () => {
    expect(ranks(1, 1, 3)).toEqual([1, 1, 3])
    expect(ranks(4, 2, 2)).toEqual([1, 1, 3])
  })

  it('ranks best first, whatever order they were handed over in', () => {
    const { placed } = rankStandings([
      { id: 'c', place: 3 },
      { id: 'a', place: 1 },
      { id: 'b', place: 2 },
    ])
    expect(placed.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('makes everybody lose when everybody ties', () => {
    for (const n of [2, 3, 8]) {
      const { placed, allTied } = rankStandings(field(...Array(n).fill(1)))
      expect(allTied).toBe(true)
      expect(placed.every((p) => p.pose === 'flop' && p.step === null)).toBe(true)
    }
  })

  it('does not call a partial tie a tie of everybody', () => {
    expect(rankStandings(field(1, 1, 1, 4)).allTied).toBe(false)
  })

  it('takes two to tie: a player on their own wins', () => {
    const { placed, allTied } = rankStandings(field(1))
    expect(allTied).toBe(false)
    expect(placed[0].pose).toBe('joy')
  })

  it('has nobody on it when nobody played', () => {
    expect(rankStandings([])).toEqual({ placed: [], allTied: false })
  })
})
