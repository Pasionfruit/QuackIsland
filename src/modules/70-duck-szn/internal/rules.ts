import { createRng, hashSeed } from '../../00-core'
import { castOneVsAll, type ArenaPlayer, type Entrant } from '../../68-minigame-kit'
import { arenaFor, blockedAt, rayBox, slide, spawn, type Point, type Vector } from './arena'

export const DURATION = 60
export const COOLDOWN = 0.72
export const HUNTER_SPEED = 5.6
export const DUCK_SPEED = 6.2
export const HIDE_SPEED = 2.8
export const SENSITIVITY = 0.0022
export const PITCH_LIMIT = 1.25
export const PALETTE = ['#f3c759', '#78b6bb', '#de936a', '#b2bd79', '#b496bc', '#d9808b', '#8aabc6', '#c0aa87']
export interface Player extends ArenaPlayer, Point {
  role: 'hunter' | 'duck'
  yaw: number
  pitch: number
  crouch: boolean
  alive: boolean
  lastShot: number
  shots: number
  kills: number
  drift: number
}
export interface Shot { seq: number; at: number; x: number; z: number; yaw: number; pitch: number; victim: string | null }
export interface Round {
  id: number; seed: number; elapsed: number; hunterId: string; players: Player[]
  over: boolean; winner: 'hunter' | 'duck' | null; shot: Shot | null
}
export interface Hands {
  forward: number; strafe: number; yaw: number; pitch: number; crouch: boolean; fire: boolean
}
export function emptyHands(): Hands { return { forward: 0, strafe: 0, yaw: 0, pitch: 0, crouch: false, fire: false } }
export function wrapAngle(angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)) }
export function speed(p: Player): number { return p.role === 'hunter' ? HUNTER_SPEED : p.crouch ? HIDE_SPEED : DUCK_SPEED }
export function height(p: Player): number { return p.role === 'hunter' ? 1.8 : p.crouch ? 0.38 : 0.95 }
export function eye(p: Player): Vector { return { x: p.x, y: p.role === 'hunter' ? 1.62 : p.crouch ? 0.28 : 0.78, z: p.z } }
export function direction(yaw: number, pitch: number): Vector { return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) } }
export function standing(p: Player): boolean { return p.alive && !p.left }
export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = seed || 1): Round {
  const { oneId, rest } = castOneVsAll(entrants, chosen)
  const a = arenaFor(seed)
  const round: Round = {
    id, seed, elapsed: 0, hunterId: oneId, over: false, winner: null, shot: null,
    players: entrants.map((p) => {
      const hunter = p.id === oneId
      const rng = createRng(hashSeed(seed, p.id))
      return { ...p, ...spawn(a, hunter ? -1 : rest.findIndex((r) => r.id === p.id)), left: false, role: hunter ? 'hunter' : 'duck', yaw: hunter ? 0 : rng() * Math.PI * 2 - Math.PI, pitch: 0, crouch: false, alive: true, lastShot: -COOLDOWN, shots: 0, kills: 0, drift: rng() * Math.PI * 2 }
    }),
  }
  judgeEnd(round)
  return round
}
export function judgeEnd(round: Round): void {
  if (round.over) return
  const hunter = round.players.find((p) => p.id === round.hunterId)
  if (!hunter || !standing(hunter)) { round.over = true; round.winner = 'duck' }
  else if (!round.players.some((p) => p.role === 'duck' && standing(p))) { round.over = true; round.winner = 'hunter' }
  else if (round.elapsed >= DURATION) { round.over = true; round.winner = 'duck' }
}
export function tick(round: Round, dt: number): void {
  if (round.over || !round.players.length || !Number.isFinite(dt) || dt <= 0) return
  round.elapsed = Math.min(DURATION, round.elapsed + Math.min(dt, 0.05))
  // The clock is decisive: a shot arriving at or after 60 seconds cannot win.
  if (round.elapsed >= DURATION) judgeEnd(round)
}
export function move(round: Round, p: Player, hands: Hands, dt: number): void {
  if (round.over || !standing(p)) return
  p.yaw = wrapAngle(hands.yaw)
  p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, hands.pitch))
  p.crouch = p.role === 'duck' && hands.crouch
  const f = Math.max(-1, Math.min(1, hands.forward)), s = Math.max(-1, Math.min(1, hands.strafe))
  const norm = Math.max(1, Math.hypot(f, s)), d = speed(p) * Math.max(0, Math.min(dt, 0.05)) / norm
  Object.assign(p, slide(arenaFor(round.seed), p, { x: p.x + (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * d, z: p.z + (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * d }))
}
export function targetOf(round: Round, hunter: Player, yaw = hunter.yaw, pitch = hunter.pitch): string | null {
  const origin = eye(hunter), ray = direction(yaw, pitch)
  let nearest = blockedAt(arenaFor(round.seed), origin, ray), victim: string | null = null
  for (const p of round.players) {
    if (p.role !== 'duck' || !standing(p)) continue
    const d = rayBox(origin, ray, { x: p.x - 0.34, y: 0.02, z: p.z - 0.34 }, { x: p.x + 0.34, y: height(p), z: p.z + 0.34 })
    if (d !== null && d < nearest) { nearest = d; victim = p.id }
  }
  return victim
}
export function shoot(round: Round, who: number, yaw: number, pitch: number): Shot | null {
  const p = round.players[who]
  if (!p || p.role !== 'hunter' || !standing(p) || round.over || round.elapsed >= DURATION || round.elapsed + 1e-6 < p.lastShot + COOLDOWN || !Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(pitch) > PITCH_LIMIT) return null
  p.lastShot = round.elapsed
  p.shots++
  const victim = targetOf(round, p, yaw, pitch)
  const duck = round.players.find((d) => d.id === victim)
  if (duck) { duck.alive = false; duck.crouch = false; p.kills++ }
  const shot = { seq: p.shots, at: round.elapsed, x: p.x, z: p.z, yaw: wrapAngle(yaw), pitch, victim }
  round.shot = shot
  judgeEnd(round)
  return shot
}
export function bots(round: Round, dt: number): void {
  if (round.over) return
  const hunter = round.players.find((p) => p.id === round.hunterId)
  if (!hunter) return
  const a = arenaFor(round.seed)
  for (const p of round.players) {
    if (!p.bot || p.role !== 'duck' || !standing(p)) continue
    let best = { x: p.x, z: p.z }, value = -Infinity
    for (let i = 0; i < 12; i++) {
      const yaw = p.drift + i * Math.PI / 6 + Math.sin(round.elapsed * 0.3) * 0.2
      const candidate = slide(a, p, { x: p.x + Math.sin(yaw) * 1.2, z: p.z + Math.cos(yaw) * 1.2 })
      const dist = Math.hypot(candidate.x - hunter.x, candidate.z - hunter.z)
      const cover = a.cover.reduce((n, c) => Math.min(n, Math.hypot(c.x - candidate.x, c.z - candidate.z)), 100)
      const score = dist * 0.4 - cover * 0.65 + Math.hypot(candidate.x - p.x, candidate.z - p.z) * 0.7
      if (score > value) { value = score; best = candidate }
    }
    const nearbyLowCover = a.cover.some((c) => c.kind === 'log' && Math.hypot(c.x - p.x, c.z - p.z) < 4)
    const hands = { ...emptyHands(), forward: 1, yaw: Math.atan2(-(best.x - p.x), -(best.z - p.z)), crouch: nearbyLowCover && Math.hypot(p.x - hunter.x, p.z - hunter.z) < 15 }
    move(round, p, hands, dt)
  }
}
export function leave(round: Round, who: number): void {
  const p = round.players[who]
  if (!p || p.bot) return
  p.left = true
  judgeEnd(round)
}
