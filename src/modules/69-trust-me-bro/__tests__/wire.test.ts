import { describe, expect, it } from 'vitest'
import { createRound, applyIntent } from '../internal/rules'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const fresh = () => createRound(42, [{ id: 'a', mine: true, bot: false }, { id: 'b', mine: false, bot: false }], 'a')
describe('Trust Me Bro wire', () => {
  it('never sends a private seed or an unrevealed answer in the public snapshot', () => {
    const r = fresh()
    const raw = encodeSnapshot(r)
    expect(raw).not.toHaveProperty('secret')
    expect(raw).not.toHaveProperty('seed')
    expect(raw).not.toHaveProperty('safe')
    expect(raw.history).toEqual([])
    expect(decodeSnapshot(raw)).not.toBeNull()
    applyIntent(r, 0, { round: r.id, stage: 0, seq: 1, action: 'choose' })
    expect((encodeSnapshot(r).history as unknown[])).toHaveLength(1)
  })
  it('gives every browser the correct own body without copying host secrets', () => {
    const host = fresh(), guest = fresh()
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'b')
    expect(guest.secret).toBeUndefined()
    expect(guest.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['b'])
  })
  it.each([
    { action: 'point', value: 8 }, { action: 'step', value: 3 }, { action: 'say', text: 'x'.repeat(121) },
    { action: 'say', text: '\n\0' }, { action: 'choose', stage: -1 }, { action: 'choose', seq: NaN },
    { action: 'choose', seq: 0 }, { action: 'choose', round: Infinity }, { action: 'choose', tag: 'another-game' },
  ])('rejects malformed intent %j', (bad) => {
    expect(decodeIntent({ ...encodeIntent({ round: 42, stage: 0, seq: 1, action: 'choose' }), ...bad })).toBeNull()
  })
  it('rejects malformed snapshots and inconsistent revealed results', () => {
    const raw = encodeSnapshot(fresh())
    for (const changes of [{ elapsed: NaN }, { selected: 5 }, { players: [] }, { players: Array(9).fill((raw.players as unknown[])[0]) }, { successes: 4 }, { over: true }]) expect(decodeSnapshot({ ...raw, ...changes })).toBeNull()
    expect(decodeSnapshot({ ...raw, history: [{ doors: 5, safe: 0, pick: 0, ok: false }], phase: 'reveal' })).toBeNull()
  })
})
