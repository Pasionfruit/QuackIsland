import { castOneVsAll, type ArenaPlayer, type Entrant } from '../../68-minigame-kit'
import { BODY_RADIUS, closestOnSegment, courseFor, resolvePoint, type Course, type Point } from './course'

export const DURATION = 60
export const SOLO_SPEED = 5.6
export const TEAM_SPEED = 5.1
export const CHAIN_LENGTH = 2.6
export const CHECKPOINT_RADIUS = 1.45
export const PALETTE = ['#e8b35e', '#66b7ba', '#de8e82', '#92b77d', '#a494c5', '#d5a279', '#7ea9cc', '#b7b775']
export const SENSITIVITY = .0028
export interface Player extends ArenaPlayer, Point {
  role: 'solo' | 'team'
  yaw: number
  pitch: number
  forward: number
  strafe: number
  inputAt: number
}
export interface Round {
  id: number; seed: number; elapsed: number; soloId: string; players: Player[]
  checkpoint: number; over: boolean; winner: 'solo' | 'team' | null
  step: number; tension: number
}
export interface Hands { forward: number; strafe: number; yaw: number; pitch: number }
export const emptyHands = (): Hands => ({ forward: 0, strafe: 0, yaw: 0, pitch: .55 })
export const wrapAngle = (yaw: number): number => Math.atan2(Math.sin(yaw), Math.cos(yaw))
export const activeTeam = (r: Round): Player[] => r.players.filter((p) => p.role === 'team' && !p.left)
export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = seed || 1): Round {
  const cast = castOneVsAll(entrants, chosen)
  const round: Round = {
    id, seed, elapsed: 0, soloId: cast.oneId, checkpoint: 0, over: false, winner: null, step: .05, tension: 0,
    players: entrants.map((p) => ({ ...p, left: false, role: p.id === cast.oneId ? 'solo' : 'team', x: p.id === cast.oneId ? 0 : (cast.rest.findIndex((e) => e.id === p.id) - (cast.rest.length - 1) / 2) * 2.15, z: p.id === cast.oneId ? 18 : 1, yaw: 0, pitch: .55, forward: 0, strafe: 0, inputAt: 0 })),
  }
  judgeEnd(round)
  return round
}
export function tick(r: Round, dt: number): void {
  if (r.over || !r.players.length || !Number.isFinite(dt) || dt <= 0) return
  r.step = Math.min(.05, dt)
  r.elapsed = Math.min(DURATION, r.elapsed + r.step)
  if (r.elapsed >= DURATION) judgeEnd(r)
}
export function setInput(r: Round, p: Player, hands: Hands): void {
  if (!p || p.left || r.over) return
  p.forward = Math.max(-1, Math.min(1, Number.isFinite(hands.forward) ? hands.forward : 0))
  p.strafe = Math.max(-1, Math.min(1, Number.isFinite(hands.strafe) ? hands.strafe : 0))
  p.yaw = wrapAngle(Number.isFinite(hands.yaw) ? hands.yaw : 0)
  p.pitch = Math.max(.18, Math.min(1.1, Number.isFinite(hands.pitch) ? hands.pitch : .55))
  p.inputAt = r.elapsed
}
function chainPair(a: Point, b: Point): void {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
  if (d <= CHAIN_LENGTH || d < 1e-9) return
  const fix = (d - CHAIN_LENGTH) / (2 * d)
  a.x += dx * fix; a.z += dz * fix; b.x -= dx * fix; b.z -= dz * fix
}
function separate(a: Point, b: Point): void {
  let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
  if (d >= BODY_RADIUS * 2) return
  const nx = d < 1e-8 ? 1 : dx / d, nz = d < 1e-8 ? 0 : dz / d
  const fix = (BODY_RADIUS * 2 - d) / 2
  a.x -= nx * fix; a.z -= nz * fix; b.x += nx * fix; b.z += nz * fix
}
/** A chain is a blocking segment, so the solo cannot walk between its links. */
function blockSolo(p: Point, before: Point, a: Point, b: Point): void {
  const close = closestOnSegment(p, a, b), radius = BODY_RADIUS + .08
  let nx = p.x - close.x, nz = p.z - close.z, d = Math.hypot(nx, nz)
  const old = closestOnSegment(before, a, b)
  const ox = before.x - old.x, oz = before.z - old.z
  if (d >= radius) return
  if (d < 1e-8) { nx = -(b.z - a.z); nz = b.x - a.x; d = Math.hypot(nx, nz) || 1 }
  nx /= d; nz /= d
  if (nx * ox + nz * oz < 0) { nx = -nx; nz = -nz }
  p.x = close.x + nx * radius; p.z = close.z + nz * radius
}
function chainCover(a: Point, b: Point, course: Course): void {
  for (const c of course.obstacles) {
    for (let i = 1; i < 8; i++) {
      const t = i / 8, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
      const dx = c.w / 2 + .08 - Math.abs(x - c.x), dz = c.d / 2 + .08 - Math.abs(z - c.z)
      if (dx <= 0 || dz <= 0) continue
      const scale = 1 / ((1 - t) ** 2 + t ** 2)
      if (dx < dz) { const shift = (x >= c.x ? 1 : -1) * dx * scale; a.x += shift * (1 - t); b.x += shift * t }
      else { const shift = (z >= c.z ? 1 : -1) * dz * scale; a.z += shift * (1 - t); b.z += shift * t }
    }
  }
}

/** Shared deterministic prediction and host simulation; only the host judges progress. */
export function stepWorld(r: Round, dt: number): void {
  if (r.over || !r.players.length || !Number.isFinite(dt) || dt <= 0) return
  const course = courseFor(r.seed), people = r.players.filter((p) => !p.left), team = activeTeam(r), solo = people.find((p) => p.role === 'solo')
  const substeps = Math.ceil(Math.min(dt, .05) * SOLO_SPEED / .1), seconds = Math.min(dt, .05) / substeps
  for (let sub = 0; sub < substeps; sub++) {
    const before = solo ? { x: solo.x, z: solo.z } : null
    for (const p of people) {
      const stale = r.elapsed - p.inputAt > .35
      const f = stale ? 0 : p.forward, s = stale ? 0 : p.strafe, n = Math.max(1, Math.hypot(f, s))
      const d = seconds * (p.role === 'solo' ? SOLO_SPEED : TEAM_SPEED) / n
      p.x += (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * d
      p.z += (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * d
      resolvePoint(course, p)
    }
    for (let iteration = 0; iteration < 20; iteration++) {
      for (let i = 0; i < team.length - 1; i++) { chainPair(team[i], team[i + 1]); chainCover(team[i], team[i + 1], course) }
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) separate(people[i], people[j])
      if (solo && before) for (let i = 0; i < team.length - 1; i++) blockSolo(solo, before, team[i], team[i + 1])
      for (const p of people) resolvePoint(course, p)
    }
  }
  r.tension = team.length < 2 ? 0 : Math.min(1, Math.max(...team.slice(1).map((p, i) => Math.hypot(p.x - team[i].x, p.z - team[i].z) / CHAIN_LENGTH)))
}
export function settle(r: Round): void {
  stepWorld(r, r.step)
  if (r.over) return
  const solo = r.players.find((p) => p.id === r.soloId && !p.left), course = courseFor(r.seed)
  const target = course.checkpoints[r.checkpoint]
  if (solo && target && Math.hypot(solo.x - target.x, solo.z - target.z) <= CHECKPOINT_RADIUS) r.checkpoint++
  judgeEnd(r)
}
export function judgeEnd(r: Round): void {
  if (r.over) return
  const solo = r.players.find((p) => p.id === r.soloId && !p.left)
  if (!solo) { r.over = true; r.winner = 'team' }
  else if (!activeTeam(r).length) { r.over = true; r.winner = 'solo' }
  else if (r.elapsed >= DURATION) { r.over = true; r.winner = 'team' }
  else if (r.checkpoint === 3 && Math.hypot(solo.x - courseFor(r.seed).finish.x, solo.z - courseFor(r.seed).finish.z) <= 1.8) { r.over = true; r.winner = 'solo' }
}
export function bots(r: Round): void {
  if (r.over) return
  const solo = r.players.find((p) => p.id === r.soloId && !p.left), team = activeTeam(r)
  if (!solo) return
  const target = courseFor(r.seed).checkpoints[r.checkpoint] ?? courseFor(r.seed).finish
  const dx = target.x - solo.x, dz = target.z - solo.z, n = Math.hypot(dx, dz) || 1
  const cx = solo.x + dx / n * 3.5, cz = solo.z + dz / n * 3.5
  for (const [i, p] of team.entries()) {
    if (!p.bot) continue
    const spread = (i - (team.length - 1) / 2) * 2.1
    const goal = { x: cx - dz / n * spread, z: cz + dx / n * spread }
    resolvePoint(courseFor(r.seed), goal)
    const vx = goal.x - p.x, vz = goal.z - p.z, size = Math.max(1, Math.hypot(vx, vz))
    setInput(r, p, { forward: -vz / size, strafe: vx / size, yaw: 0, pitch: .55 })
  }
}
export function leave(r: Round, who: number): void {
  const p = r.players[who]
  if (!p || p.bot || p.left) return
  p.left = true; p.forward = 0; p.strafe = 0
  // Re-form the surviving chain without a long, invalid dangling segment.
  const team = activeTeam(r), course = courseFor(r.seed)
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < team.length - 1; i++) { chainPair(team[i], team[i + 1]); chainCover(team[i], team[i + 1], course) }
    for (const member of team) resolvePoint(course, member)
  }
  judgeEnd(r)
}
