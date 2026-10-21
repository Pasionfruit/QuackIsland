import { describe, expect, it } from 'vitest'
import { createArenaLink, holding, type ArenaRoom } from '../../68-minigame-kit'
import { TRUST_RULES, type Hands } from '../internal/net'
import { createRound } from '../internal/rules'

function room(chosen: 'a' | 'b' = 'b') {
  let now = 0, peerHere = true
  let toHost: (from: string, raw: Record<string, unknown>) => void = () => {}
  let toGuest: (from: string, raw: Record<string, unknown>) => void = () => {}
  const h: ArenaRoom = { host: () => true, joined: () => true, me: () => 'a', peers: () => peerHere ? ['b'] : [], now: () => now, send: (r) => toGuest('a', r) }
  const g: ArenaRoom = { host: () => false, joined: () => true, me: () => 'b', peers: () => ['a'], now: () => now, send: (r) => toHost('b', r) }
  const host = createArenaLink(TRUST_RULES, h), guest = createArenaLink(TRUST_RULES, g)
  toHost = host.hear; toGuest = guest.hear
  const hr = createRound(33, [{ id: 'a', mine: true, bot: false }, { id: 'b', mine: false, bot: false }], chosen)
  const gr = holding(createRound(0, [], null, 0))
  const hh: Hands = { queue: [] }, gh: Hands = { queue: [] }
  function frames(n: number, paused = false) { for (let i = 0; i < n; i++) { now += 50; host.advance(hr, 0.05, hh, paused); guest.advance(gr, 0.05, gh, paused) } }
  frames(10)
  return { hr, gr, hh, gh, frames, leave: () => { peerHere = false } }
}
describe('Trust Me Bro through the shared arena loop', () => {
  it('adopts the host deal, selected solo and correct own bodies', () => {
    const { hr, gr } = room()
    expect(gr.id).toBe(hr.id)
    expect(gr.soloId).toBe('b')
    expect(gr.secret).toBeUndefined()
    expect(gr.players.find((p) => p.mine)?.id).toBe('b')
  })
  it('accepts a guest solo move and choice on the host and shares the reveal', () => {
    const r = room()
    r.gh.queue.push({ round: r.gr.id, stage: 0, seq: 1, action: 'step', value: -1 }, { round: r.gr.id, stage: 0, seq: 2, action: 'choose' })
    r.frames(15)
    expect(r.hr.history[0].pick).toBe(1)
    expect(r.gr.history).toEqual(r.hr.history)
  })
  it('accepts guest adviser pointing and chat but refuses their choose request', () => {
    const r = room('a')
    r.gh.queue.push({ round: r.gr.id, stage: 0, seq: 1, action: 'point', value: 3 }, { round: r.gr.id, stage: 0, seq: 2, action: 'say', text: 'Door 4, trust me.' }, { round: r.gr.id, stage: 0, seq: 3, action: 'choose' })
    r.frames(15)
    expect(r.hr.players[1]).toMatchObject({ point: 3, text: 'Door 4, trust me.' })
    expect(r.hr.history).toHaveLength(0)
    expect(r.gr.players[1].text).toBe('Door 4, trust me.')
  })
  it('freezes both sides under pause and resumes the authoritative clock', () => {
    const r = room()
    const before = r.hr.elapsed
    r.frames(20, true)
    expect(r.hr.elapsed).toBe(before)
    r.frames(10)
    expect(r.hr.elapsed).toBeGreaterThan(before)
  })
  it('drops a departed guest solo and shares the resulting adviser victory', () => {
    const r = room()
    r.leave(); r.frames(10)
    expect(r.hr.players[1].left).toBe(true)
    expect(r.hr.winner).toBe('advisers')
    expect(r.gr.winner).toBe('advisers')
  })
})
