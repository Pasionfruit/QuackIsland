import { describe, expect, it } from 'vitest'
import { createArenaLink, holding, type ArenaRoom } from '../../68-minigame-kit'
import { TEAM_RULES } from '../internal/net'
import { activeTeam, CHAIN_LENGTH, createRound, emptyHands } from '../internal/rules'
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot } from '../internal/wire'

function setup() {
  let now = 0, departed = ''
  const inbox = new Map<string, (from: string, raw: Record<string, unknown>) => void>()
  const ids = ['a', 'b', 'c']
  const links = ids.map((id) => {
    const room: ArenaRoom = { host: () => id === 'a', joined: () => true, me: () => id, peers: () => ids.filter((other) => other !== id && other !== departed), now: () => now,
      send: (raw) => { for (const [other, hear] of inbox) if (other !== id && other !== departed) hear(id, raw) } }
    return createArenaLink(TEAM_RULES, room)
  })
  ids.forEach((id, i) => inbox.set(id, links[i].hear))
  const rounds = ids.map((id) => id === 'a' ? createRound(37, ids.map((id) => ({ id, mine: id === 'a', bot: false })), 'a') : holding(createRound(0, [], null, 0)))
  const hands = ids.map(emptyHands)
  function frames(n: number, paused = false) { for (let frame = 0; frame < n; frame++) { now += 50; links.forEach((link, i) => link.advance(rounds[i], .05, hands[i], paused)) } }
  frames(10)
  return { rounds, hands, links, frames, depart: (id: string) => { departed = id } }
}
describe('ME in Team shared net loop', () => {
  it('round-trips kit headers, poses and authoritative player rows', () => {
    const s = setup()
    for (const [i, r] of s.rounds.entries()) { expect(r.soloId).toBe('a'); expect(r.players.find((p) => p.mine)?.id).toBe(['a', 'b', 'c'][i]) }
    expect(decodeSnapshot(encodeSnapshot(s.rounds[0]))).not.toBeNull()
    expect(decodeInput(encodeInput(s.rounds[0], s.rounds[0].players[1]))).toMatchObject({ forward: 0, strafe: 0 })
  })
  it('transmits guest input and pulls an idle teammate on the host', () => {
    const s = setup(), before = s.rounds[0].players[2].z
    s.hands[1].forward = 1; s.frames(35)
    expect(s.rounds[0].players[2].z).toBeLessThan(before - .4)
    const team = activeTeam(s.rounds[0])
    expect(Math.hypot(team[0].x-team[1].x,team[0].z-team[1].z)).toBeLessThanOrEqual(CHAIN_LENGTH + .01)
    s.hands[1].forward = 0; s.frames(25)
    for (const r of s.rounds.slice(1)) r.players.forEach((p, i) => expect(Math.hypot(p.x-s.rounds[0].players[i].x,p.z-s.rounds[0].players[i].z)).toBeLessThan(.1))
  })
  it('ignores a guest’s claimed position, so pose messages cannot teleport a body', () => {
    const s = setup(), r = s.rounds[0], before = { x: r.players[1].x, z: r.players[1].z }
    s.links[0].hear('b', encodeInput(r, { ...r.players[1], x: 12, z: -22 }))
    s.frames(1)
    expect(Math.hypot(r.players[1].x-before.x,r.players[1].z-before.z)).toBeLessThan(.01)
  })
  it('rejects invalid input vectors and malformed snapshots', () => {
    const r = setup().rounds[0], raw = encodeInput(r, r.players[1])
    expect(decodeInput({ ...raw, f: Infinity })).toBeNull()
    expect(decodeInput({ ...raw, s: 3 })).toBeNull()
    expect(decodeSnapshot({ ...encodeSnapshot(r), checkpoint: 4 })).toBeNull()
    expect(decodeSnapshot({ ...encodeSnapshot(r), tension: NaN })).toBeNull()
    expect(decodeSnapshot({ ...encodeSnapshot(r), players: [['a']] })).toBeNull()
  })
  it('pauses all clocks and physics', () => {
    const s = setup(), before = structuredClone(s.rounds[0])
    s.hands[1].forward = 1; s.frames(20, true)
    expect(s.rounds[0]).toEqual(before)
    s.frames(10); expect(s.rounds[0].elapsed).toBeGreaterThan(before.elapsed)
  })
  it('drops a guest and re-forms the surviving chain', () => {
    const s = setup(); s.depart('b'); s.frames(10)
    expect(s.rounds[0].players[1].left).toBe(true)
    expect(activeTeam(s.rounds[0])).toHaveLength(1)
    expect(s.rounds[2].players[1].left).toBe(true)
  })
  it('shares a final timed decision after local play ends', () => {
    const s = setup(); for (const r of s.rounds) r.elapsed = 59.99
    s.frames(10)
    expect(s.rounds.every((r) => r.over && r.winner === 'team')).toBe(true)
  })
})
