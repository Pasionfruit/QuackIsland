import { describe, expect, it } from 'vitest'
import { decodeLobbyPistolHit, encodeLobbyPistolHit } from '../internal/protocol'
import { aimedLobbyTarget, scoreLobbyHit } from '../internal/rules'

describe('lobby pistols', () => {
  it('selects the nearest player under the aim ray', () => {
    expect(aimedLobbyTarget(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: -1 },
      [
        { id: 'far', x: 0, y: 0, z: -12 },
        { id: 'near', x: 0.25, y: 0, z: -4 },
        { id: 'miss', x: 2, y: 0, z: -2 },
      ],
    )).toBe('near')
  })

  it('records a knockdown as a kill and a death without removing either player', () => {
    expect(scoreLobbyHit({}, 'p1', 'p2')).toEqual({
      p1: { kills: 1, deaths: 0 },
      p2: { kills: 0, deaths: 1 },
    })
  })

  it('only accepts complete pistol messages', () => {
    const message = encodeLobbyPistolHit('p2', 'p1:1:0')
    expect(decodeLobbyPistolHit({ ...message })).toEqual(message)
    expect(decodeLobbyPistolHit({ tag: 'lobby-pistol', type: 'hit', targetId: 3, shotId: 'x' })).toBeNull()
  })
})
