/**
 * A host choice surviving a crowd, and a lost message.
 *
 * Found with eight browsers in one lobby: seven arrivals each asked about
 * every choice at once, the host answered every question separately, went
 * over the relay's sixty messages a second, and the relay silently dropped the
 * host pressing play. Everybody else sat on the briefing for good.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const room = vi.hoisted(() => ({
  host: true,
  sent: [] as Record<string, unknown>[],
  handler: null as null | ((from: string, message: Record<string, unknown>) => void),
}))

vi.mock('../../09-net', () => ({
  getNet: () => ({ status: 'joined', room: 'ABCDE', id: 'p1', peers: 7, host: room.host, why: null }),
  sendToRoom: (payload: Record<string, unknown>) => room.sent.push(payload),
  subscribeRoom: (handler: (from: string, message: Record<string, unknown>) => void) => {
    room.handler = handler
    return () => {
      room.handler = null
    }
  },
  useNet: () => ({ status: 'joined', room: 'ABCDE', id: 'p1', peers: 7, host: room.host, why: null }),
}))

import { CHOICE_ANSWER_MS, CHOICE_REPEAT_MS, hostChoice } from '../internal/choice'

const isColour = (v: unknown): v is 'red' | 'blue' => v === 'red' || v === 'blue'

describe('a host choice in a full lobby', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    room.host = true
    room.sent = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers seven questions at once with one answer', () => {
    const colour = hostChoice('colour', isColour, 'red')
    const stop = colour.listen()
    colour.set('blue')
    room.sent = []

    for (let i = 2; i <= 8; i++) room.handler!(`p${i}`, { t: 'colour', ask: true })
    expect(room.sent).toHaveLength(0)
    vi.advanceTimersByTime(CHOICE_ANSWER_MS)
    expect(room.sent).toEqual([{ t: 'colour', value: 'blue' }])
    stop()
  })

  it('says it again on its own, so a dropped message does not strand anybody', () => {
    const colour = hostChoice('colour', isColour, 'red')
    colour.set('blue')
    room.sent = []
    const stop = colour.repeat()
    vi.advanceTimersByTime(CHOICE_REPEAT_MS * 3)
    expect(room.sent).toEqual([
      { t: 'colour', value: 'blue' },
      { t: 'colour', value: 'blue' },
      { t: 'colour', value: 'blue' },
    ])
    stop()
    vi.advanceTimersByTime(CHOICE_REPEAT_MS * 3)
    expect(room.sent).toHaveLength(3)
  })

  it('stays quiet as a guest, and starts repeating if handed the lobby', () => {
    room.host = false
    const colour = hostChoice('colour', isColour, 'red')
    const stop = colour.repeat()
    vi.advanceTimersByTime(CHOICE_REPEAT_MS * 2)
    expect(room.sent).toHaveLength(0)
    room.host = true
    vi.advanceTimersByTime(CHOICE_REPEAT_MS)
    expect(room.sent).toHaveLength(1)
    stop()
  })

  it('costs a guest nothing to hear a value it already has', () => {
    room.host = false
    const colour = hostChoice('colour', isColour, 'red')
    const stop = colour.listen()
    room.handler!('p1', { t: 'colour', value: 'blue' })
    expect(colour.get()).toBe('blue')
    // Heard again: still blue, and nothing is sent back.
    room.handler!('p1', { t: 'colour', value: 'blue' })
    expect(colour.get()).toBe('blue')
    expect(room.sent).toHaveLength(0)
    stop()
  })
})
