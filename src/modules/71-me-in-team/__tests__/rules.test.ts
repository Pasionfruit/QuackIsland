import { describe, expect, it } from 'vitest'
import { oneVsAllProblems, type Entrant } from '../../68-minigame-kit'
import { closestOnSegment, courseFor, validPoint } from '../internal/course'
import { activeTeam, bots, CHAIN_LENGTH, createRound, emptyHands, judgeEnd, leave, setInput, settle, stepWorld, tick, type Round } from '../internal/rules'
import { kit } from '../internal/setup'

const seats: Entrant[] = ['solo', 'a', 'b', 'c', 'd'].map((id) => ({ id, mine: id === 'solo', bot: false }))
const fresh = () => createRound(27, seats, 'solo')
const links = (r: Round) => activeTeam(r).slice(1).map((p, i) => Math.hypot(p.x - activeTeam(r)[i].x, p.z - activeTeam(r)[i].z))
function frame(r: Round) { tick(r, .05); settle(r) }

describe('ME in Team', () => {
  it('uses the kit’s one-vs-all base cases', () => expect(oneVsAllProblems(kit, (r) => r.players.find((p) => p.id === r.soloId), (r) => r.players)).toEqual([]))
  it('reproducibly deals a human solo, a separate team and a clear course', () => {
    const r = fresh()
    expect(r).toEqual(fresh())
    expect(activeTeam(r)).toHaveLength(4)
    expect(r.players.every((p) => validPoint(courseFor(r.seed), p))).toBe(true)
    expect(courseFor(r.seed).checkpoints).toHaveLength(3)
  })
  it('prevents teammates pulling in opposite directions from breaking their links', () => {
    const r = fresh(), team = activeTeam(r)
    for (let i = 0; i < 200; i++) {
      tick(r, .05)
      for (const [j, p] of team.entries()) setInput(r, p, { ...emptyHands(), strafe: j < 2 ? -1 : 1 })
      settle(r)
      expect(Math.max(...links(r))).toBeLessThanOrEqual(CHAIN_LENGTH + .002)
      expect(r.players.every((p) => validPoint(courseFor(r.seed), p))).toBe(true)
    }
  })
  it('transmits a pull to an idle chained teammate', () => {
    const r = createRound(1, seats.slice(0, 3), 'solo'), [, a, b] = r.players, old = b.x
    for (let i = 0; i < 50; i++) { tick(r, .05); setInput(r, a, { ...emptyHands(), strafe: -1 }); settle(r) }
    expect(b.x).toBeLessThan(old - 1)
    expect(Math.max(...links(r))).toBeLessThanOrEqual(CHAIN_LENGTH + .002)
  })
  it('allows a coordinated chain to move farther than opposing pulls', () => {
    const together = createRound(2, seats.slice(0, 3), 'solo'), opposite = createRound(2, seats.slice(0, 3), 'solo')
    for (let i = 0; i < 30; i++) {
      for (const r of [together, opposite]) {
        tick(r, .05)
        setInput(r, r.players[1], { ...emptyHands(), forward: -1 })
        setInput(r, r.players[2], { ...emptyHands(), forward: r === together ? -1 : 1 })
        settle(r)
      }
    }
    expect(together.players[1].z - 1).toBeGreaterThan(opposite.players[1].z - 1 + 2)
  })
  it('physically blocks the solo between teammates, instead of allowing passage through a chain', () => {
    const r = createRound(8, seats.slice(0, 3), 'solo'), solo = r.players[0]
    Object.assign(solo, { x: 0, z: 3 })
    for (let i = 0; i < 50; i++) { tick(r, .05); setInput(r, solo, { ...emptyHands(), forward: 1 }); settle(r) }
    const p = closestOnSegment(solo, r.players[1], r.players[2])
    expect(solo.z).toBeGreaterThan(1)
    expect(Math.hypot(solo.x - p.x, solo.z - p.z)).toBeGreaterThanOrEqual(.45)
  })
  it('lets the solo outmaneuver the ends of the chain', () => {
    const r = createRound(8, seats.slice(0, 3), 'solo'), solo = r.players[0]
    Object.assign(solo, { x: 5, z: 3 })
    for (let i = 0; i < 35; i++) { tick(r, .05); setInput(r, solo, { ...emptyHands(), forward: 1 }); settle(r) }
    expect(solo.z).toBeLessThan(-3)
  })
  it('requires checkpoints in order and then the exit', () => {
    const r = fresh(), solo = r.players[0], course = courseFor(r.seed)
    Object.assign(solo, course.finish); settle(r)
    expect(r.over).toBe(false)
    Object.assign(solo, course.checkpoints[1]); settle(r)
    expect(r.checkpoint).toBe(0)
    for (let i = 0; i < 3; i++) { Object.assign(solo, course.checkpoints[i]); settle(r); expect(r.checkpoint).toBe(i + 1) }
    expect(r.over).toBe(false)
    Object.assign(solo, course.finish); settle(r)
    expect(r).toMatchObject({ over: true, winner: 'solo' })
  })
  it('gives the team the win at 60 seconds, including a finish-line tie', () => {
    const r = fresh(); r.checkpoint = 3; Object.assign(r.players[0], courseFor(r.seed).finish); r.elapsed = 59.99
    tick(r, .05)
    expect(r).toMatchObject({ elapsed: 60, over: true, winner: 'team' })
  })
  it('stops stale input instead of walking a disconnected/stalled client indefinitely', () => {
    const r = fresh(), solo = r.players[0]
    setInput(r, solo, { ...emptyHands(), forward: 1 })
    for (let i = 0; i < 40; i++) frame(r)
    expect(18 - solo.z).toBeLessThanOrEqual(5.6 * .4 + .01)
  })
  it('resolves coincident bodies without NaN or extreme positions', () => {
    const r = createRound(5, seats.slice(0, 3), 'solo')
    Object.assign(r.players[1], r.players[0], { id: 'a', role: 'team', mine: false })
    stepWorld(r, .05)
    expect(r.players.every((p) => validPoint(courseFor(r.seed), p))).toBe(true)
    expect(Math.abs(r.players[0].x)).toBeLessThan(13)
  })
  it('keeps bodies and links outside cover as the chain is driven around pillars', () => {
    const r = fresh(), team = activeTeam(r), course = courseFor(r.seed)
    for (let i = 0; i < 240; i++) {
      tick(r, .05)
      for (const p of team) setInput(r, p, { ...emptyHands(), forward: 1, strafe: Math.sin(i * .04) })
      settle(r)
      expect(r.players.every((p) => validPoint(course, p))).toBe(true)
      expect(Math.max(...links(r))).toBeLessThan(CHAIN_LENGTH + .02)
      for (let j = 0; j < team.length-1; j++) for (let sample = 1; sample < 8; sample++) {
        const t = sample/8
        expect(validPoint(course, { x: team[j].x+(team[j+1].x-team[j].x)*t, z: team[j].z+(team[j+1].z-team[j].z)*t }, .075)).toBe(true)
      }
    }
  })
  it('re-forms the surviving chain when a middle teammate leaves', () => {
    const r = fresh(); leave(r, 2)
    expect(activeTeam(r).map((p) => p.id)).toEqual(['a', 'c', 'd'])
    expect(Math.max(...links(r))).toBeLessThan(CHAIN_LENGTH + .005)
    expect(r.over).toBe(false)
    leave(r, 0); expect(r.winner).toBe('team')
  })
  it('ends in a solo win if the opposing team leaves', () => {
    const r = fresh()
    for (let i = 1; i < r.players.length; i++) leave(r, i)
    expect(r.winner).toBe('solo')
  })
  it('runs coordinated deterministic stand-ins without breaking chains', () => {
    const entrants = seats.map((p, i) => ({ ...p, bot: i > 0 })), a = createRound(9, entrants, 'solo'), b = createRound(9, entrants, 'solo')
    for (let i = 0; i < 160; i++) for (const r of [a, b]) { tick(r, .05); bots(r); settle(r) }
    expect(a).toEqual(b)
    expect(Math.max(...links(a))).toBeLessThan(CHAIN_LENGTH + .02)
  })
  it('freezes a decided round', () => {
    const r = fresh(); r.elapsed = 60; judgeEnd(r); const before = structuredClone(r)
    tick(r, .05); setInput(r, r.players[0], { ...emptyHands(), forward: 1 }); settle(r)
    expect(r).toEqual(before)
  })
})
