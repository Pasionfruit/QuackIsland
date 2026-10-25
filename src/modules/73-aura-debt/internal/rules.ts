import { createRng } from '../../00-core'
import { castOneVsAll, type Entrant } from '../../68-minigame-kit'

export const AURA = { duration: 90, halfWidth: 6, maxHazards: 18, warning: 1.25 } as const
export const TRAPS = ['crate', 'slick', 'gust'] as const
export type TrapKind = typeof TRAPS[number]
export type Role = 'rider' | 'trappers'
export interface Player extends Entrant {
  left: boolean
  cooldown: number
  sequence: number
  sent: number
  inputX: number
  inputY: number
}
export interface Hazard { id: number; kind: TrapKind; x: number; at: number; warning: number; hit: boolean; owner: string }
export interface Round {
  id: number; seed: number; oneId: string; elapsed: number; over: boolean; winner: Role | null
  players: Player[]; x: number; vx: number; distance: number; balance: number; stability: number
  steer: number; throttle: number; slippery: number; hazards: Hazard[]; serial: number; nextCourse: number
  lastRelease: number; reason: string
}
export interface Hands { steer: number; throttle: number; trap: TrapKind; aim: number; sequence: number }
export const neutralHands = (): Hands => ({ steer: 0, throttle: 0, trap: 'crate', aim: 0, sequence: 0 })
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
export const difficulty = (r: Round) => clamp(r.elapsed / AURA.duration, 0, 1)
export const speed = (r: Round) => (10 + 10 * difficulty(r)) * (1 + r.throttle * 0.18)
export const trapCooldown = (r: Round) => 5 - 1.5 * difficulty(r)
export const lead = (r: Round) => Math.max(21, speed(r) * 1.8)

export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id: number): Round {
  const cast = castOneVsAll(entrants, chosen)
  return {
    id, seed, oneId: cast.oneId, elapsed: 0, over: false, winner: null,
    players: entrants.map(p => ({ ...p, left: false, cooldown: 1.5, sequence: 0, sent: 0, inputX: 0, inputY: 0 })),
    x: 0, vx: 0, distance: 0, balance: 0, stability: 100, steer: 0, throttle: 0, slippery: 0,
    hazards: [], serial: 0, nextCourse: 2.8, lastRelease: -10, reason: '',
  }
}

export function releaseTrap(r: Round, playerId: string, kind: TrapKind, x: number, sequence: number): boolean {
  const p = r.players.find(p => p.id === playerId)
  if (r.over || !p || p.left || playerId === r.oneId || !TRAPS.includes(kind) ||
      !Number.isFinite(x) || !Number.isSafeInteger(sequence) || sequence <= p.sequence) return false
  // Consume each click even when rejected: a queued click cannot fire later on cooldown expiry.
  p.sequence = sequence
  if (p.cooldown > 0 || r.elapsed - r.lastRelease < 0.4 || r.hazards.length >= AURA.maxHazards) return false
  r.hazards.push({ id: ++r.serial, kind, x: clamp(x, -4.9, 4.9), at: r.distance + lead(r),
    warning: AURA.warning, hit: false, owner: p.id })
  p.cooldown = trapCooldown(r)
  r.lastRelease = r.elapsed
  return true
}

function fall(r: Round, reason: string) { r.over = true; r.winner = 'trappers'; r.reason = reason }

function step(r: Round, dt: number) {
  r.elapsed += dt
  for (const p of r.players) p.cooldown = Math.max(0, p.cooldown - dt)
  r.slippery = Math.max(0, r.slippery - dt)
  const oldDistance = r.distance
  r.distance += speed(r) * dt
  const oldX = r.x
  const grip = r.slippery > 0 ? 0.4 : 1
  r.vx += (r.steer * 13 * grip - r.vx * (r.slippery > 0 ? 0.8 : 4)) * dt
  r.x += r.vx * dt
  r.balance += (r.vx * 0.095 - r.balance * 1.7) * dt
  r.stability = Math.min(100, r.stability + 2.5 * dt)
  if (r.elapsed >= r.nextCourse && r.hazards.length < AURA.maxHazards) {
    const rng = createRng(r.seed ^ (++r.serial * 2654435761))
    r.hazards.push({ id: r.serial, kind: rng() < 0.7 ? 'crate' : 'slick', x: (Math.floor(rng() * 5) - 2) * 2,
      at: r.distance + lead(r) + 8, warning: AURA.warning, hit: false, owner: 'course' })
    r.nextCourse = r.elapsed + 3.5 - difficulty(r) * 2
  }
  for (const h of r.hazards) {
    h.warning = Math.max(0, h.warning - dt)
    if (h.hit || h.warning > 0 || h.at < oldDistance - 0.8 || h.at > r.distance + 0.8) continue
    const along = clamp((h.at - oldDistance) / Math.max(0.001, r.distance - oldDistance), 0, 1)
    const contactX = oldX + (r.x - oldX) * along
    const width = h.kind === 'gust' ? 1.8 : h.kind === 'slick' ? 1.1 : 0.85
    if (Math.abs(contactX - h.x) > width + 0.35) continue
    h.hit = true
    const direction = contactX >= h.x ? 1 : -1
    if (h.kind === 'crate') { r.stability -= 38; r.balance += 0.38 * direction; r.vx += direction * 1.6 }
    if (h.kind === 'slick') { r.stability -= 19; r.slippery = 2.2; r.balance += direction * 0.2 }
    if (h.kind === 'gust') { r.stability -= 16; r.balance += direction * 0.48; r.vx += direction * 5 }
  }
  r.hazards = r.hazards.filter(h => h.at > r.distance - 9)
  if (Math.abs(r.x) > AURA.halfWidth - 0.25) fall(r, 'Rolled off the course')
  else if (r.stability <= 0) fall(r, 'Lost all stability')
  else if (Math.abs(r.balance) >= 1) fall(r, 'Lost balance')
  else if (r.elapsed >= AURA.duration) { r.over = true; r.winner = 'rider'; r.reason = 'Survived the full course' }
}

export function tick(r: Round, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || r.over) return
  let remaining = Math.min(dt, 0.25)
  while (remaining > 0 && !r.over) { const d = Math.min(remaining, 1 / 120); step(r, d); remaining -= d }
}

export function bots(r: Round) {
  for (const p of r.players) if (p.bot && !p.left && p.cooldown <= 0) {
    const rng = createRng(r.seed ^ (r.serial + 1) * 19349663)
    releaseTrap(r, p.id, TRAPS[Math.floor(rng() * TRAPS.length)], r.x + (rng() - 0.5) * 3, p.sequence + 1)
  }
}

export function leave(r: Round, index: number) {
  const p = r.players[index]
  if (!p || r.over) return
  p.left = true
  if (p.id === r.oneId) fall(r, 'Rider disconnected')
  else if (!r.players.some(p => p.id !== r.oneId && !p.left)) {
    r.over = true; r.winner = 'rider'; r.reason = 'All trap operators left'
  }
}

export function standings(r: Round) {
  return r.players.map(p => ({ id: p.id, mine: p.mine,
    place: !p.left && ((p.id === r.oneId) === (r.winner === 'rider')) ? 1 : 2 }))
}
