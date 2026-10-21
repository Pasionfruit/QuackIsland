import { describe, expect, it } from 'vitest'
import { createArenaLink, holding, type ArenaRoom } from '../../68-minigame-kit'
import { DUCK_RULES } from '../internal/net'
import { createRound, emptyHands, height, eye } from '../internal/rules'
import { decodeGuest, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot } from '../internal/wire'

function setup(chosen = 'b') {
  let now = 0, here = true
  let toHost: (from: string, raw: Record<string, unknown>) => void = () => {}, toGuest: typeof toHost = () => {}
  const hostRoom: ArenaRoom = { host: () => true, joined: () => true, me: () => 'a', peers: () => here ? ['b'] : [], now: () => now, send: (raw) => toGuest('a', raw) }
  const guestRoom: ArenaRoom = { host: () => false, joined: () => true, me: () => 'b', peers: () => ['a'], now: () => now, send: (raw) => toHost('b', raw) }
  const h = createArenaLink(DUCK_RULES, hostRoom), g = createArenaLink(DUCK_RULES, guestRoom)
  toHost = h.hear; toGuest = g.hear
  const host = createRound(19, [{ id: 'a', mine: true, bot: false }, { id: 'b', mine: false, bot: false }], chosen)
  const guest = holding(createRound(0, [], null, 0)), hh = emptyHands(), gh = emptyHands()
  function frames(n: number, paused = false) { for (let i = 0; i < n; i++) { now += 50; h.advance(host, 0.05, hh, paused); g.advance(guest, 0.05, gh, paused) } }
  frames(10)
  return { host, guest, hh, gh, h, frames, leave: () => { here = false } }
}
describe('Duck Szn wire and shared arena loop', () => {
  it('round-trips the shared header and player rows', () => {
    const r = setup()
    expect(decodeSnapshot(encodeSnapshot(r.host))).not.toBeNull()
    expect(r.guest.hunterId).toBe('b')
    expect(r.guest.players.find((p) => p.mine)?.id).toBe('b')
    expect(r.guest.seed).toBe(r.host.seed)
  })
  it('uses kit pose and claim messages and refuses invalid coordinates', () => {
    const { host } = setup(), p = host.players[1]
    expect(decodeGuest(encodeMove(host, p))).toMatchObject({ kind: 'move', crouch: false })
    expect(decodeGuest(encodeShot(host, p))).toMatchObject({ kind: 'shot' })
    const raw = encodeMove(host, p)
    expect(decodeGuest({ ...raw, hide: 'yes' })).toBeNull()
    expect(decodeSnapshot({ ...encodeSnapshot(host), players: [['a']] })).toBeNull()
    expect(decodeSnapshot({ ...encodeSnapshot(host), shot: { at: NaN } })).toBeNull()
  })
  it('carries guest movement and the hide action to the host', () => {
    const r = setup('a'), before = r.host.players[1].z
    r.gh.yaw = 0; r.gh.forward = 1; r.gh.crouch = true; r.frames(15)
    expect(r.host.players[1].z).toBeLessThan(before)
    expect(r.host.players[1].crouch).toBe(true)
  })
  it('accepts a guest hunter shot on the host and agrees on the winner', () => {
    const r = setup()
    const hunter = r.host.players[1], duck = r.host.players[0]
    const yaw = Math.atan2(-(duck.x - hunter.x), -(duck.z - hunter.z))
    const pitch = Math.atan2(height(duck) / 2 - eye(hunter).y, Math.hypot(duck.x - hunter.x, duck.z - hunter.z))
    r.gh.yaw = yaw; r.gh.pitch = pitch; r.gh.fire = true; r.frames(10)
    expect(r.host.players[0].alive).toBe(false)
    expect(r.host.winner).toBe('hunter')
    expect(r.guest.winner).toBe('hunter')
    expect(r.host.players[1].kills).toBe(1)
  })
  it('cannot eliminate a duck by inventing the victim in a claim', () => {
    const r = setup(), p = r.host.players[1]
    r.h.hear('b', encodeShot(r.host, { ...p, yaw: Math.PI, pitch: 0 }))
    r.frames(4)
    expect(r.host.players[0].alive).toBe(true)
    expect(r.host.players[1].shots).toBe(1)
  })
  it('freezes the authoritative clock under pause and resumes', () => {
    const r = setup(), before = r.host.elapsed
    r.frames(20, true); expect(r.host.elapsed).toBe(before)
    r.frames(10); expect(r.host.elapsed).toBeGreaterThan(before)
  })
  it('clamps a guest teleport to the host clock’s movement allowance', () => {
    const r = setup(), before = { x: r.host.players[1].x, z: r.host.players[1].z }
    r.h.hear('b', encodeMove(r.host, { ...r.host.players[1], x: 20, z: -20 }))
    r.frames(1)
    expect(Math.hypot(r.host.players[1].x - before.x, r.host.players[1].z - before.z)).toBeLessThan(1)
  })
  it('drops a departing guest hunter and awards the flock the round', () => {
    const r = setup(); r.leave(); r.frames(10)
    expect(r.host.winner).toBe('duck')
    expect(r.guest.winner).toBe('duck')
    expect(r.host.players[1].left).toBe(true)
  })
})
