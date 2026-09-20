import { describe, expect, it } from 'vitest'
import {
  applyTurnOrderRoll,
  canAcknowledgeTurnOrder,
  createTurnOrder,
  reconcileTurnOrderPlayers,
  type DieValue,
  type TurnOrderPlayer,
  type TurnOrderSnapshot,
} from '../internal/rules'

const player = (id: string): TurnOrderPlayer => ({ id, name: `Player ${id}` })
const begin = (ids: readonly string[]): TurnOrderSnapshot =>
  createTurnOrder('ROOM:session', 'ROOM', 1337, ids.map(player))

function roll(snapshot: TurnOrderSnapshot, id: string, value: DieValue): TurnOrderSnapshot {
  return applyTurnOrderRoll(snapshot, id, value, `${id}:${snapshot.rolls.length}:${value}`)
}

describe('turn order rules', () => {
  it('locks a numeric relay-id roster for two through eight players', () => {
    const two = begin(['p10', 'p2'])
    expect(two.phase).toBe('rolling')
    expect(two.players.map((entry) => entry.id)).toEqual(['p2', 'p10'])

    expect(begin(['p1']).phase).toBe('invalid')
    expect(begin(Array.from({ length: 8 }, (_, index) => `p${index + 1}`)).phase).toBe('rolling')
    expect(begin(Array.from({ length: 9 }, (_, index) => `p${index + 1}`)).phase).toBe('invalid')
  })

  it('accepts one roll per pending player and publishes highest first', () => {
    let state = begin(['p1', 'p2'])
    state = roll(state, 'p1', 2)
    const duplicate = applyTurnOrderRoll(state, 'p1', 6, 'another-click')
    expect(duplicate).toBe(state)

    state = roll(state, 'p2', 6)
    expect(state.phase).toBe('complete')
    expect(state.turnOrder).toEqual(['p2', 'p1'])
  })

  it('rerolls only the players whose complete histories are tied', () => {
    let state = begin(['p1', 'p2', 'p3'])
    state = roll(state, 'p1', 4)
    state = roll(state, 'p2', 4)
    state = roll(state, 'p3', 1)

    expect(state.phase).toBe('rolling')
    expect(state.pendingPlayerIds).toEqual(['p1', 'p2'])

    state = roll(state, 'p2', 2)
    state = roll(state, 'p1', 5)
    expect(state.phase).toBe('complete')
    expect(state.turnOrder).toEqual(['p1', 'p2', 'p3'])
  })

  it('keeps separate tie groups inside their original score bands', () => {
    let state = begin(['p1', 'p2', 'p3', 'p4'])
    state = roll(state, 'p1', 6)
    state = roll(state, 'p2', 6)
    state = roll(state, 'p3', 2)
    state = roll(state, 'p4', 2)
    expect(state.pendingPlayerIds).toEqual(['p1', 'p2', 'p3', 'p4'])

    state = roll(state, 'p1', 1)
    state = roll(state, 'p2', 5)
    state = roll(state, 'p3', 6)
    state = roll(state, 'p4', 2)
    expect(state.turnOrder).toEqual(['p2', 'p1', 'p3', 'p4'])
  })

  it('completes an eight-player order without special cases', () => {
    let state = begin(Array.from({ length: 8 }, (_, index) => `p${index + 1}`))
    const values: DieValue[] = [6, 5, 4, 3, 2, 1, 6, 5]
    for (let index = 0; index < 8; index++) state = roll(state, `p${index + 1}`, values[index])
    expect(state.pendingPlayerIds).toEqual(['p1', 'p7', 'p2', 'p8'])

    state = roll(state, 'p1', 6)
    state = roll(state, 'p7', 1)
    state = roll(state, 'p2', 5)
    state = roll(state, 'p8', 2)
    expect(state.phase).toBe('complete')
    expect(state.turnOrder).toHaveLength(8)
    expect(new Set(state.turnOrder).size).toBe(8)
  })

  it('removes a disconnected pending player rather than blocking the room', () => {
    let state = begin(['p1', 'p2', 'p3'])
    state = roll(state, 'p1', 6)
    state = roll(state, 'p2', 3)
    state = reconcileTurnOrderPlayers(state, ['p1', 'p2'])
    expect(state.phase).toBe('complete')
    expect(state.turnOrder).toEqual(['p1', 'p2'])
  })

  it('acknowledges only the exact completed session', () => {
    let state = begin(['p1', 'p2'])
    expect(canAcknowledgeTurnOrder(state, 'ROOM:session')).toBe(false)
    state = roll(state, 'p1', 6)
    state = roll(state, 'p2', 2)
    expect(canAcknowledgeTurnOrder(state, 'another-session')).toBe(false)
    expect(canAcknowledgeTurnOrder(state, 'ROOM:session')).toBe(true)
  })
})
