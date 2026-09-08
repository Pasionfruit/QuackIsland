import { describe, expect, it } from 'vitest'
import { WEATHER_KINDS } from '../../00-core'
import { NET, dayCorrection, decodeWorld, encodeWorld, isHost, type WorldState } from '../internal/protocol'

const world = (over: Partial<WorldState> = {}): WorldState => ({
  day: 0.3,
  scale: 60,
  running: true,
  weather: 'rainy',
  ...over,
})

const kinds = [...WEATHER_KINDS]

describe('who hosts the world', () => {
  it('is the lowest id in the room', () => {
    expect(isHost('p1', ['p1', 'p2', 'p3'])).toBe(true)
    expect(isHost('p2', ['p1', 'p2', 'p3'])).toBe(false)
    expect(isHost('p3', ['p1', 'p2', 'p3'])).toBe(false)
  })

  it('compares ids as numbers, not as text', () => {
    // Sorted as text, `p10` comes before `p2` and the room is handed to
    // whoever happened to be tenth.
    expect(isHost('p2', ['p2', 'p10'])).toBe(true)
    expect(isHost('p10', ['p2', 'p10'])).toBe(false)
    expect(isHost('p9', ['p9', 'p11', 'p100'])).toBe(true)
  })

  it('makes you the host when you are on your own', () => {
    // Joining a lobby alone must not take the clock away from you.
    expect(isHost('p7', ['p7'])).toBe(true)
    expect(isHost('p7', [])).toBe(true)
  })

  it('hands over on its own when the host leaves', () => {
    const room = ['p1', 'p4', 'p9']
    expect(isHost('p4', room)).toBe(false)
    const afterHostLeaves = room.filter((id) => id !== 'p1')
    // No election, no messages: everyone has the same list and reaches the
    // same answer, so the next one simply is the host.
    expect(isHost('p4', afterHostLeaves)).toBe(true)
    expect(isHost('p9', afterHostLeaves)).toBe(false)
  })

  it('never makes two people host at once', () => {
    const room = ['p3', 'p11', 'p2', 'p20']
    expect(room.filter((id) => isHost(id, room))).toHaveLength(1)
  })

  it('hosts nothing when it does not know its own id yet', () => {
    expect(isHost(null, ['p1'])).toBe(false)
  })
})

describe('the world on the wire', () => {
  it('survives a round trip', () => {
    const back = decodeWorld(encodeWorld(world()), kinds)
    expect(back).not.toBeNull()
    expect(back?.day).toBeCloseTo(0.3, 4)
    expect(back?.scale).toBe(60)
    expect(back?.running).toBe(true)
    expect(back?.weather).toBe('rainy')
  })

  it('is small enough to send every second without thinking about it', () => {
    expect(encodeWorld(world()).length).toBeLessThan(120)
  })

  it('refuses anything that is not a world update', () => {
    for (const bad of ['', 'nope', '{}', '{"t":"duck"}', 'null', '[]']) {
      expect(decodeWorld(bad, kinds)).toBeNull()
    }
    expect(decodeWorld(7, kinds)).toBeNull()
  })

  it('refuses a day outside the day', () => {
    // This drives the sun. A day of 40 would put the lighting somewhere it has
    // no preset for.
    for (const day of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decodeWorld(JSON.stringify({ t: 'world', d: day, w: 'sunny' }), kinds)).toBeNull()
    }
  })

  it('refuses a weather nobody has heard of', () => {
    // `setWeather` would be handed a key with no preset behind it.
    expect(decodeWorld(JSON.stringify({ t: 'world', d: 0.5, w: 'volcanic' }), kinds)).toBeNull()
    expect(decodeWorld(JSON.stringify({ t: 'world', d: 0.5 }), kinds)).toBeNull()
  })

  it('clamps a hostile time scale rather than believing it', () => {
    const fast = decodeWorld(
      JSON.stringify({ t: 'world', d: 0.5, w: 'sunny', sc: 1e9 }),
      kinds,
    )
    expect(fast?.scale).toBeLessThanOrEqual(3600)
    const backwards = decodeWorld(
      JSON.stringify({ t: 'world', d: 0.5, w: 'sunny', sc: -50 }),
      kinds,
    )
    expect(backwards?.scale).toBeGreaterThanOrEqual(0)
  })

  it('accepts every weather the game actually has', () => {
    for (const kind of kinds) {
      expect(decodeWorld(encodeWorld(world({ weather: kind })), kinds)?.weather).toBe(kind)
    }
  })
})

describe('catching a guest up to the host', () => {
  const dt = 1 / 60

  it('does nothing when the clocks already agree', () => {
    expect(dayCorrection(0.4, 0.4, dt)).toBe(0)
  })

  it('moves towards the host rather than past it', () => {
    const step = dayCorrection(0.4, 0.41, dt)
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThan(0.01)
  })

  it('goes the short way round midnight', () => {
    // A host at 0.99 and a guest at 0.01 are two hundredths apart, not
    // ninety-eight. Getting this wrong runs the guest backwards through a
    // whole day every time the clock wraps - a sunrise in reverse.
    expect(dayCorrection(0.01, 0.99, dt)).toBeLessThan(0)
    expect(dayCorrection(0.99, 0.01, dt)).toBeGreaterThan(0)
  })

  it('snaps rather than crawls when it is a long way out', () => {
    // Half a day of easing is a slow sunrise going the wrong way. Somebody
    // who has only just joined should simply arrive in the right hour.
    expect(dayCorrection(0.1, 0.6, dt)).toBeCloseTo(0.5, 9)
    expect(dayCorrection(0.6, 0.1, dt)).toBeCloseTo(-0.5, 9)
  })

  it('eases small differences invisibly', () => {
    // A snap is visible as a jump in the light, so anything inside the snap
    // threshold is corrected over about a second rather than at once.
    const small = NET.daySnap / 2
    const step = dayCorrection(0, small, dt)
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThan(small)
  })

  it('converges rather than oscillating', () => {
    let mine = 0.2
    for (let i = 0; i < 600; i++) mine += dayCorrection(mine, 0.35, dt)
    expect(mine).toBeCloseTo(0.35, 4)
  })

  it('converges across the wrap too', () => {
    let mine = 0.98
    for (let i = 0; i < 600; i++) {
      mine = (mine + dayCorrection(mine, 0.02, dt) + 1) % 1
    }
    expect(Math.min(Math.abs(mine - 0.02), 1 - Math.abs(mine - 0.02))).toBeLessThan(1e-3)
  })

  it('corrects faster with a longer frame, and never overshoots', () => {
    const slow = dayCorrection(0, 0.01, 1 / 120)
    const fast = dayCorrection(0, 0.01, 1 / 20)
    expect(fast).toBeGreaterThan(slow)
    // Even an enormous frame cannot send the guest past the host.
    expect(dayCorrection(0, 0.01, 10)).toBeLessThanOrEqual(0.01)
  })
})
