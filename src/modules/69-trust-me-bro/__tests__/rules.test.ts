import { describe, expect, it } from 'vitest'
import { oneVsAllProblems, type Entrant } from '../../68-minigame-kit'
import { applyIntent, bots, CHOOSE_SECONDS, createRound, DOOR_COUNTS, leave, REVEAL_SECONDS, tick, type Intent, type Round } from '../internal/rules'
import { kit } from '../internal/setup'

const entrants: Entrant[] = [{ id: 'solo', mine: true, bot: false }, { id: 'bro', mine: false, bot: false }]
const fresh = (seed = 17) => createRound(seed, entrants, 'solo')
const advance = (r: Round, seconds: number) => { for (let i = 0; i < Math.ceil(seconds / 0.05); i++) tick(r, 0.05) }
const intent = (r: Round, action: Intent['action'], seq: number, value?: number, text?: string): Intent => ({ round: r.id, stage: r.stage, action, seq, value, text })

describe('Trust Me Bro rules', () => {
  it('conforms to the shared one-vs-all base cases', () => {
    expect(oneVsAllProblems(kit, (r) => r.players.find((p) => p.id === r.soloId), (r) => r.players)).toEqual([])
  })
  it('deals one reproducible safe door for each of the four exact odds', () => {
    expect(DOOR_COUNTS).toEqual([5, 4, 3, 2])
    for (let seed = 0; seed < 200; seed++) {
      const a = fresh(seed), b = fresh(seed)
      expect(a.secret).toEqual(b.secret)
      a.secret!.safe.forEach((safe, i) => { expect(safe).toBeGreaterThanOrEqual(0); expect(safe).toBeLessThan(DOOR_COUNTS[i]) })
    }
  })
  it('only the solo can walk or choose; advisers can point and speak', () => {
    const r = fresh()
    expect(applyIntent(r, 1, intent(r, 'step', 1, -1))).toBe(false)
    expect(applyIntent(r, 1, intent(r, 'choose', 2))).toBe(false)
    expect(applyIntent(r, 0, intent(r, 'say', 1, undefined, 'hello'))).toBe(false)
    expect(applyIntent(r, 0, intent(r, 'point', 1, 0))).toBe(false)
    expect(applyIntent(r, 1, intent(r, 'point', 1, 4))).toBe(true)
    expect(applyIntent(r, 1, intent(r, 'say', 2, undefined, 'Door 5, bro.'))).toBe(true)
    expect(r.players[1]).toMatchObject({ point: 4, text: 'Door 5, bro.' })
  })
  it('bounds movement and rejects replayed, stale-stage and other-round inputs', () => {
    const r = fresh()
    for (let seq = 1; seq < 12; seq++) applyIntent(r, 0, intent(r, 'step', seq, -1))
    expect(r.selected).toBe(0)
    expect(applyIntent(r, 0, intent(r, 'step', 1, 1))).toBe(false)
    expect(applyIntent(r, 0, { ...intent(r, 'step', 20, 1), stage: 2 })).toBe(false)
    expect(applyIntent(r, 0, { ...intent(r, 'choose', 21), round: r.id + 1 })).toBe(false)
    expect(applyIntent(r, 0, intent(r, 'step', 22, 100))).toBe(false)
  })
  it('does not reuse held choose input through the reveal and next round', () => {
    const r = fresh()
    applyIntent(r, 0, intent(r, 'choose', 1))
    expect(r.history).toHaveLength(1)
    expect(applyIntent(r, 0, intent(r, 'choose', 2))).toBe(false)
    advance(r, REVEAL_SECONDS + 0.1)
    expect(r.stage).toBe(1)
    expect(r.phase).toBe('choose')
    expect(applyIntent(r, 0, { ...intent(r, 'choose', 3), stage: 0 })).toBe(false)
    expect(r.history).toHaveLength(1)
  })
  it.each([0, 1, 2, 3, 4])('plays all four rounds with %i safe picks and awards the right side', (wins) => {
    const r = fresh()
    for (let stage = 0; stage < 4; stage++) {
      const safe = r.secret!.safe[stage]
      const pick = stage < wins ? safe : (safe + 1) % DOOR_COUNTS[stage]
      let seq = stage * 20 + 1
      while (r.selected !== pick) applyIntent(r, 0, intent(r, 'step', seq++, pick > r.selected ? 1 : -1))
      expect(applyIntent(r, 0, intent(r, 'choose', seq))).toBe(true)
      expect(r.over).toBe(false)
      advance(r, REVEAL_SECONDS + 0.1)
    }
    expect(r.history).toHaveLength(4)
    expect(r.successes).toBe(wins)
    expect(r.over).toBe(true)
    expect(r.winner).toBe(wins >= 2 ? 'solo' : 'advisers')
  })
  it('times out without granting a lucky success and still reaches all four rounds', () => {
    const r = fresh()
    for (let i = 0; i < 4; i++) {
      r.selected = r.secret!.safe[i]
      advance(r, CHOOSE_SECONDS + 0.1)
      expect(r.history[i]).toMatchObject({ pick: null, ok: false })
      advance(r, REVEAL_SECONDS + 0.1)
    }
    expect(r.over).toBe(true)
    expect(r.successes).toBe(0)
  })
  it('bounds messages, removes control characters and limits rapid chat', () => {
    const r = fresh()
    applyIntent(r, 1, intent(r, 'say', 1, undefined, '  door\n\t3\0 bro  '))
    expect(r.players[1].text).toBe('door 3 bro')
    expect(applyIntent(r, 1, intent(r, 'say', 2, undefined, 'spam'))).toBe(false)
    advance(r, 0.7)
    applyIntent(r, 1, intent(r, 'say', 3, undefined, 'x'.repeat(500)))
    expect(r.players[1].text).toHaveLength(120)
  })
  it('stand-ins offer both truthful and false encouragement and refresh next round', () => {
    let honest = 0, bluff = 0
    for (let seed = 0; seed < 50; seed++) {
      const r = createRound(seed, [entrants[0], { ...entrants[1], bot: true }], 'solo')
      advance(r, 1)
      bots(r)
      const p = r.players[1]
      expect(p.text.length).toBeGreaterThan(0)
      if (p.point === r.secret!.safe[0]) honest++; else bluff++
      applyIntent(r, 0, intent(r, 'choose', 1))
      advance(r, REVEAL_SECONDS + 1.1)
      bots(r)
      expect(p.botStage).toBe(1)
      expect(p.point).toBeLessThan(4)
    }
    expect(honest).toBeGreaterThan(0)
    expect(bluff).toBeGreaterThan(0)
  })
  it('removes departed advisers and ends safely when the solo leaves', () => {
    const r = fresh()
    leave(r, 1)
    expect(applyIntent(r, 1, intent(r, 'say', 1, undefined, 'boo'))).toBe(false)
    expect(r.over).toBe(false)
    leave(r, 0)
    expect(r).toMatchObject({ over: true, winner: 'advisers' })
  })
})
