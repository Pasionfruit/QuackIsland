/**
 * One round on the wire - progress only, never a challenge's content - and
 * eight racers playing through it with a lossy network.
 */
import { describe, expect, it } from 'vitest'
import { ANSWER, STAGE_COUNT, createRound, stepRound, type Intent, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 321

function host(n = 3): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 77)
}

describe('a snapshot', () => {
  it('comes back as the round that went out, finish and all', () => {
    const round = host()
    const [a, b] = round.players
    a.stage = 4
    a.mistakes = 2
    b.stage = STAGE_COUNT
    b.finishAt = 12.34

    const copy = applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.id).toBe(77)
    for (const p of round.players) {
      const c = copy.players.find((x) => x.id === p.id)!
      expect(c.stage).toBe(p.stage)
      expect(c.mistakes).toBe(p.mistakes)
      if (p.finishAt !== null) expect(c.finishAt).toBeCloseTo(p.finishAt, 1)
      else expect(c.finishAt).toBeNull()
    }
    expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['p2'])
  })

  it('updates the players a guest already has, and deals a new round on a new id', () => {
    const round = host()
    const copy = applySnapshot(waitingRound(), decodeSnapshot(encodeSnapshot(round))!, 'p1')
    const before = [...copy.players]
    round.players[0].stage = 3
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(round))!, 'p1')
    copy.players.forEach((p, i) => expect(p).toBe(before[i]))

    const next = createRound(1, [{ id: 'p1' }, { id: 'p2' }], 78)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(next))!, 'p1')
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.players.every((p) => p.stage === 0)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot({ ...good, t: 'nope' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot(withField(0, 7))).toBeNull()
    expect(decodeSnapshot(withField(1, -1))).toBeNull()
    expect(decodeSnapshot(withField(1, STAGE_COUNT + 1))).toBeNull()
    expect(decodeSnapshot(withField(3, -1))).toBeNull()
  })

  it('fits in a relay message with eight racers, all finished', () => {
    const round = host(8)
    for (const p of round.players) {
      p.stage = STAGE_COUNT
      p.finishAt = 45.2
      p.mistakes = 6
    }
    expect(JSON.stringify(encodeSnapshot(round)).length).toBeLessThan(1024)
  })
})

describe('an intent', () => {
  it('comes back as what was sent, for its round', () => {
    const said = decodeIntent(relay(encodeIntent({ stage: 4, mistakes: 2 }, 12)))!
    expect(said.round).toBe(12)
    expect(said.intent).toEqual({ stage: 4, mistakes: 2 })
  })

  it('is refused when a count is missing or negative, or the round is missing', () => {
    expect(decodeIntent({ t: 'opf-in', r: 1, s: -1, m: 0 })).toBeNull()
    expect(decodeIntent({ t: 'opf-in', s: 1, m: 0 })).toBeNull()
    expect(decodeIntent({ t: 'opf-in', r: 1, s: 1 })).toBeNull()
  })
})

describe('eight racers in one round', () => {
  it('agree on who finished and how far everyone else got, with messages repeated and some lost', () => {
    const round = host(8)
    const guests = round.players.slice(1).map((p) => ({ id: p.id, copy: waitingRound(), stage: 0, mistakes: 0 }))
    const heard = new Map<string, Intent>()
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

    for (let frame = 0; frame < 120 * 60 && !round.over; frame++) {
      for (const guest of guests) {
        // A guest "solves" a stage roughly every couple of seconds, staggered by id.
        if (guest.stage < STAGE_COUNT && frame % 130 === guests.indexOf(guest) * 17) guest.stage += 1
        const intent: Intent = { stage: guest.stage, mistakes: guest.mistakes }
        if (random() < 0.3) continue
        const said = decodeIntent(relay(encodeIntent(intent, round.id)))!
        if (said.round === round.id) heard.set(guest.id, said.intent)
      }
      stepRound(round, heard, 1 / 60)
      if (frame % 3 === 0) {
        const snap = relay(encodeSnapshot(round))
        for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(snap)!, guest.id)
      }
    }
    const snap = relay(encodeSnapshot(round))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(snap)!, guest.id)

    expect(round.players.some((p) => p.finishAt !== null)).toBe(true)
    for (const guest of guests) {
      expect(guest.copy.players.map((p) => [p.id, p.stage])).toEqual(round.players.map((p) => [p.id, p.stage]))
      for (const p of round.players) {
        const c = guest.copy.players.find((each) => each.id === p.id)!
        if (p.finishAt === null) expect(c.finishAt).toBeNull()
        else expect(c.finishAt).toBeCloseTo(p.finishAt, 1)
      }
    }
  })

  it('cannot report clearing more than the anti-cheat floor allows', () => {
    const round = host(2)
    const heard = new Map<string, Intent>([['p2', { stage: STAGE_COUNT, mistakes: 0 }]])
    stepRound(round, heard, 1 / 60)
    const p2 = round.players.find((p) => p.id === 'p2')!
    expect(p2.stage).toBeLessThanOrEqual(1)
    // Even generously fast-forwarded, it cannot outrun ANSWER.minStageTime per stage.
    for (let i = 0; i < 5; i++) stepRound(round, heard, ANSWER.minStageTime - 0.01)
    expect(p2.stage).toBeLessThan(STAGE_COUNT)
  })
})
