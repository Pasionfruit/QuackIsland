/**
 * Everybody else's crosshair: where an aim lands, how it travels, and where a
 * stand-in's is heading.
 */
import { describe, expect, it } from 'vitest'
import { botAim, botShot } from '../internal/ai'
import { AIM_PLANE_Z, aimAt, balloonAt } from '../internal/arena'
import { frameScene } from '../internal/camera'
import { createGame, fire, stepGame } from '../internal/game'
import { AIM_TAG, decodeAim, decodeShot, decodeSnapshot, encodeAim } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

describe('an aim', () => {
  it('lands where a ray from the camera meets the aiming wall', () => {
    const shot = frameScene(16 / 9)
    const origin = { x: shot.x, y: shot.y, z: shot.z }
    const direction = { x: 0.1, y: -0.05, z: -1 }
    const at = aimAt(origin, direction)!
    expect(at.z).toBeCloseTo(AIM_PLANE_Z)
    const along = (AIM_PLANE_Z - origin.z) / direction.z
    expect(at.x).toBeCloseTo(origin.x + direction.x * along)
    expect(at.y).toBeCloseTo(origin.y + direction.y * along)
  })

  it('is nowhere when the ray points away from the wall', () => {
    expect(aimAt({ x: 0, y: 5, z: 30 }, { x: 0, y: 0, z: 1 })).toBeNull()
    expect(aimAt({ x: 0, y: 5, z: 30 }, { x: 1, y: 0, z: 0 })).toBeNull()
  })

  it('comes back off the wire as it went, and a hidden one as hidden', () => {
    expect(decodeAim(relay(encodeAim({ x: 3.456, y: 7.891, z: AIM_PLANE_Z })))).toEqual({ x: 3.46, y: 7.89, z: AIM_PLANE_Z })
    expect(decodeAim(relay(encodeAim(null)))).toBeNull()
  })

  it('is not mistaken for anything else, nor anything else for it', () => {
    const wire = relay(encodeAim({ x: 1, y: 2, z: AIM_PLANE_Z }))
    expect(decodeShot(wire)).toBeNull()
    expect(decodeSnapshot(wire)).toBeNull()
    expect(decodeAim({ t: 'dh-in', q: 1, b: -1, x: 0, y: 0, z: 0 })).toBeUndefined()
  })

  it('refuses nonsense', () => {
    for (const bad of [{ x: 'a', y: 1 }, { x: 1 }, { x: Infinity, y: 1 }, { x: 1e6, y: 1 }]) {
      expect(decodeAim({ t: AIM_TAG, ...bad })).toBeUndefined()
    }
  })
})

describe("a stand-in's crosshair", () => {
  const game = () =>
    createGame(77, [{ id: 'you', mine: true }, { id: 'b1', bot: true }, { id: 'b2', bot: true }])

  it('heads for the balloon it then shoots at', () => {
    const g = game()
    let checked = 0
    while (!g.over && checked < 10) {
      const aim = botAim(g, 1)
      const shot = botShot(g, 1)
      if (shot && shot.balloon !== null) {
        const b = g.balloons[shot.balloon]
        expect(aim).toEqual(balloonAt(b, g.elapsed))
        checked++
      }
      if (shot) fire(g, shot)
      stepGame(g, 1 / 30)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('stays on its shot for a moment after firing', () => {
    const g = game()
    while (!g.players[1].lastShot) {
      const shot = botShot(g, 1)
      if (shot) fire(g, shot)
      stepGame(g, 1 / 30)
    }
    expect(botAim(g, 1)).toBe(g.players[1].lastShot)
  })

  it('is only for stand-ins', () => {
    expect(botAim(game(), 0)).toBeNull()
  })
})
