import { describe, expect, it } from 'vitest'
import { oneVsAllProblems, type Entrant } from '../../68-minigame-kit'
import { arenaFor, EDGE, rayBox, slide, walkable } from '../internal/arena'
import { bots, COOLDOWN, createRound, direction, DUCK_SPEED, emptyHands, eye, height, judgeEnd, leave, move, shoot, targetOf, tick } from '../internal/rules'
import { kit } from '../internal/setup'

const people: Entrant[] = [{ id: 'hunter', mine: true, bot: false }, { id: 'duck', mine: false, bot: false }]
const fresh = () => createRound(19, people, 'hunter')
function aim(r: ReturnType<typeof fresh>) {
  const [h, d] = r.players
  return { yaw: Math.atan2(-(d.x - h.x), -(d.z - h.z)), pitch: Math.atan2(height(d) / 2 - eye(h).y, Math.hypot(d.x - h.x, d.z - h.z)) }
}
function lineUp() { const r = fresh(); Object.assign(r.players[0], { x: 0, z: 18 }); Object.assign(r.players[1], { x: 0, z: 10 }); return r }

describe('Duck Szn rules', () => {
  it('conforms to all kit one-vs-all setup requirements', () => expect(oneVsAllProblems(kit, (r) => r.players.find((p) => p.id === r.hunterId), (r) => r.players)).toEqual([]))
  it('deals reproducible, collision-free positions with a human hunter', () => {
    for (let seed = 0; seed < 40; seed++) {
      const entrants = [...people, ...Array.from({ length: 6 }, (_, i) => ({ id: `bot${i}`, mine: false, bot: true }))]
      const r = createRound(seed, entrants, 'bot0')
      expect(r.hunterId).toBe('hunter')
      expect(r).toEqual(createRound(seed, entrants, 'bot0'))
      expect(r.players.every((p) => walkable(arenaFor(seed), p.x, p.z))).toBe(true)
    }
  })
  it('lets surviving ducks win at exactly 60 seconds', () => {
    const r = fresh(); r.elapsed = 59.975; tick(r, 0.05)
    expect(r).toMatchObject({ elapsed: 60, over: true, winner: 'duck' })
    const a = aim(r); expect(shoot(r, 0, a.yaw, a.pitch)).toBeNull()
    expect(r.players[1].alive).toBe(true)
  })
  it('one valid hit eliminates a duck and the last elimination wins for the hunter', () => {
    const r = lineUp(), a = aim(r)
    expect(targetOf(r, r.players[0], a.yaw, a.pitch)).toBe('duck')
    expect(shoot(r, 0, a.yaw, a.pitch)?.victim).toBe('duck')
    expect(r).toMatchObject({ over: true, winner: 'hunter' })
    expect(r.players[0]).toMatchObject({ shots: 1, kills: 1 })
    expect(r.players[1].alive).toBe(false)
  })
  it('misses consume cooldown, ducks cannot shoot, and rapid repeat shots are refused', () => {
    const r = lineUp()
    expect(shoot(r, 1, 0, 0)).toBeNull()
    expect(shoot(r, 0, Math.PI, 0)?.victim).toBeNull()
    expect(shoot(r, 0, 0, 0)).toBeNull()
    r.elapsed = COOLDOWN
    expect(shoot(r, 0, 0, 0)).not.toBeNull()
    expect(r.players[0].shots).toBe(2)
  })
  it('a rock blocks shots even if a duck is directly behind it', () => {
    const r = fresh(), c = arenaFor(r.seed).cover.find((p) => p.kind === 'rock')!
    Object.assign(r.players[0], { x: c.x, z: c.z + 3 })
    Object.assign(r.players[1], { x: c.x, z: c.z - 3 })
    const a = aim(r)
    expect(shoot(r, 0, a.yaw, a.pitch)?.victim).toBeNull()
    expect(r.players[1].alive).toBe(true)
  })
  it('crouching hides a duck behind a low log while a standing duck can be hit', () => {
    const r = fresh(), c = arenaFor(r.seed).cover.find((p) => p.kind === 'log')!
    Object.assign(r.players[0], { x: c.x, z: c.z + 3 })
    Object.assign(r.players[1], { x: c.x, z: c.z - 2 })
    const standingAim = { yaw: 0, pitch: Math.atan2(0.8 - 1.62, 5) }
    expect(targetOf(r, r.players[0], standingAim.yaw, standingAim.pitch)).toBe('duck')
    r.players[1].crouch = true
    const crouchedAim = aim(r)
    expect(targetOf(r, r.players[0], crouchedAim.yaw, crouchedAim.pitch)).toBeNull()
    expect(height(r.players[1])).toBeLessThan(c.h)
    expect(eye(r.players[1]).y).toBeLessThan(c.h)
  })
  it('normalizes diagonal movement, slows hiding, and ignores a hunter’s hide key', () => {
    const r = lineUp(), duck = r.players[1]
    const start = { x: duck.x, z: duck.z }
    move(r, duck, { ...emptyHands(), forward: 1, strafe: 1 }, 0.05)
    expect(Math.hypot(duck.x - start.x, duck.z - start.z)).toBeCloseTo(DUCK_SPEED * 0.05)
    const oldZ = duck.z
    move(r, duck, { ...emptyHands(), forward: 1, crouch: true }, 0.05)
    expect(oldZ - duck.z).toBeLessThan(DUCK_SPEED * 0.05)
    expect(duck.crouch).toBe(true)
    move(r, r.players[0], { ...emptyHands(), crouch: true }, 0.05)
    expect(r.players[0].crouch).toBe(false)
  })
  it('cannot tunnel through cover or walk outside the marsh', () => {
    const a = arenaFor(19), c = a.cover[0]
    const blocked = slide(a, { x: c.x, z: c.z + 5 }, { x: c.x, z: c.z - 5 })
    expect(blocked.z).toBeGreaterThan(c.z + c.d / 2)
    const edge = slide(a, { x: 0, z: 20 }, { x: 200, z: 200 })
    expect(Math.abs(edge.x)).toBeLessThan(EDGE)
    expect(Math.abs(edge.z)).toBeLessThan(EDGE)
    expect(walkable(a, edge.x, edge.z)).toBe(true)
  })
  it('chooses the nearest duck along a shot rather than accepting a victim claim', () => {
    const r = lineUp()
    r.players.push({ ...r.players[1], id: 'farther', z: 4 })
    const a = aim(r)
    shoot(r, 0, a.yaw, a.pitch)
    expect(r.players[1].alive).toBe(false)
    expect(r.players[2].alive).toBe(true)
    expect(r.over).toBe(false)
  })
  it('gives the ducks victory when the hunter leaves, and excludes departing ducks', () => {
    const r = fresh(); leave(r, 0)
    expect(r.winner).toBe('duck')
    const other = fresh(); leave(other, 1)
    expect(other.winner).toBe('hunter')
    expect(other.players[1].left).toBe(true)
  })
  it('runs deterministic duck stand-ins that remain inside valid cover collision', () => {
    const r = createRound(8, [{ ...people[0] }, { ...people[1], bot: true }], 'hunter')
    const other = createRound(8, [{ ...people[0] }, { ...people[1], bot: true }], 'hunter')
    for (let i = 0; i < 100; i++) { tick(r, 0.05); bots(r, 0.05); tick(other, 0.05); bots(other, 0.05) }
    expect(r).toEqual(other)
    expect(walkable(arenaFor(r.seed), r.players[1].x, r.players[1].z)).toBe(true)
  })
  it('handles parallel rays without NaN intersections', () => {
    expect(rayBox({ x: 0, y: 1, z: 0 }, direction(0, 0), { x: 2, y: 0, z: -4 }, { x: 3, y: 2, z: -2 })).toBeNull()
  })
  it('freezes movement and shooting after a decision', () => {
    const r = lineUp(); r.elapsed = 60; judgeEnd(r)
    const before = structuredClone(r)
    tick(r, 0.05); move(r, r.players[0], { ...emptyHands(), forward: 1 }, 0.05); shoot(r, 0, 0, 0)
    expect(r).toEqual(before)
  })
})
