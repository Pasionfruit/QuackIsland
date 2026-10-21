import { createRng, hashSeed } from '../../00-core'
import { castOneVsAll, type ArenaPlayer, type Entrant } from '../../68-minigame-kit'

export const DOOR_COUNTS = [5, 4, 3, 2] as const
export const CHOOSE_SECONDS = 25
export const REVEAL_SECONDS = 3
export const TARGET = 2
export const MESSAGE_MAX = 120
export const COLOURS = ['#60c6d0', '#f3b64b', '#df7896', '#88bc8f', '#9c91d5', '#dd9773', '#8aaed4', '#b5bf76']
export interface Player extends ArenaPlayer {
  role: 'solo' | 'adviser'
  point: number | null
  text: string
  seq: number
  spokeAt: number
  botStage: number
}
export interface Result { doors: number; pick: number | null; safe: number; ok: boolean }
export interface Round {
  id: number
  elapsed: number
  players: Player[]
  soloId: string
  stage: number
  phase: 'choose' | 'reveal' | 'over'
  phaseTime: number
  selected: number
  successes: number
  history: Result[]
  over: boolean
  winner: 'solo' | 'advisers' | null
  /** Host-only deal, excluded from all snapshots. */
  secret?: { seed: number; safe: number[] }
}
export interface Intent {
  round: number
  stage: number
  seq: number
  action: 'step' | 'choose' | 'point' | 'say'
  value?: number
  text?: string
}

export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = seed || 1): Round {
  const { oneId } = castOneVsAll(entrants, chosen)
  const rng = createRng(hashSeed(seed, 'trust-me-bro:doors'))
  return {
    id, elapsed: 0, soloId: oneId, stage: 0, phase: 'choose', phaseTime: 0,
    selected: 2, successes: 0, history: [], over: entrants.length === 0,
    winner: entrants.length === 0 ? 'advisers' : null,
    secret: { seed, safe: DOOR_COUNTS.map((n) => Math.floor(rng() * n)) },
    players: entrants.map((p) => ({ ...p, left: false, role: p.id === oneId ? 'solo' : 'adviser', point: null, text: '', seq: 0, spokeAt: -1, botStage: -1 })),
  }
}
export function doors(round: Round): number { return DOOR_COUNTS[round.stage] }
export function cleanMessage(text: string): string { return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX) }

export function resolveChoice(round: Round, pick: number | null): void {
  if (round.over || round.phase !== 'choose' || !round.secret) return
  const safe = round.secret.safe[round.stage]
  const ok = pick === safe
  round.history.push({ doors: doors(round), pick, safe, ok })
  if (ok) round.successes++
  round.phase = 'reveal'
  round.phaseTime = 0
}

/** Only the host applies intents; a guest cannot choose for another player. */
export function applyIntent(round: Round, who: number, intent: Intent): boolean {
  const player = round.players[who]
  if (!player || player.left || round.over || round.phase !== 'choose' || intent.round !== round.id || intent.stage !== round.stage || intent.seq <= player.seq) return false
  if (intent.action === 'step' && player.role === 'solo' && (intent.value === -1 || intent.value === 1)) {
    round.selected = Math.max(0, Math.min(doors(round) - 1, round.selected + intent.value))
  } else if (intent.action === 'choose' && player.role === 'solo') {
    if (!round.secret) return false
    resolveChoice(round, round.selected)
  } else if (intent.action === 'point' && player.role === 'adviser' && Number.isInteger(intent.value) && intent.value! >= 0 && intent.value! < doors(round)) {
    player.point = intent.value!
  } else if (intent.action === 'say' && player.role === 'adviser' && typeof intent.text === 'string' && round.elapsed - player.spokeAt >= 0.65) {
    const text = cleanMessage(intent.text)
    if (!text) return false
    player.text = text
    player.spokeAt = round.elapsed
  } else return false
  player.seq = intent.seq
  return true
}

export function tick(round: Round, dt: number): void {
  if (round.over || !round.players.length || !Number.isFinite(dt) || dt <= 0) return
  const step = Math.min(dt, 0.05)
  round.elapsed += step
  round.phaseTime += step
  if (round.phase === 'choose' && round.phaseTime >= CHOOSE_SECONDS) resolveChoice(round, null)
  else if (round.phase === 'reveal' && round.phaseTime >= REVEAL_SECONDS) {
    if (round.stage === 3) {
      round.over = true
      round.phase = 'over'
      round.winner = round.successes >= TARGET ? 'solo' : 'advisers'
    } else {
      round.stage++
      round.phase = 'choose'
      round.phaseTime = 0
      round.selected = Math.floor(doors(round) / 2)
      for (const p of round.players) { p.point = null; p.text = '' }
    }
  }
}

export function bots(round: Round): void {
  if (!round.secret || round.phase !== 'choose' || round.phaseTime < 0.9) return
  for (const p of round.players) {
    if (!p.bot || p.left || p.role !== 'adviser' || p.botStage === round.stage) continue
    const rng = createRng(hashSeed(round.secret.seed, `${p.id}:${round.stage}`))
    const honest = rng() < 0.5
    const safe = round.secret.safe[round.stage]
    const wrong = (safe + 1 + Math.floor(rng() * (doors(round) - 1))) % doors(round)
    p.point = honest ? safe : wrong
    p.text = [`Door ${p.point + 1}. Trust me, bro.`, `I've got a good feeling about ${p.point + 1}.`, `${p.point + 1} is the one. You've got this.`][Math.floor(rng() * 3)]
    p.botStage = round.stage
  }
}

export function leave(round: Round, who: number): void {
  const p = round.players[who]
  if (!p) return
  p.left = true
  p.point = null
  if (p.role === 'solo' && !round.over) { round.over = true; round.phase = 'over'; round.winner = 'advisers' }
}
