/**
 * The rules of OP Finder, as arithmetic.
 *
 * Everybody races through the same ten CAPTCHA-style challenges, in the same
 * order - which challenge is which, and what its correct answer is, comes
 * from `(seed, stage)` alone, so nothing about a challenge's content is ever
 * sent over the wire; only *how far somebody has got* is shared state.
 *
 * Checking a guess happens in whichever browser made it - the same trust
 * model every minigame here uses for a guest's own input - and the host only
 * clamps how fast a reported stage may rise, the way Sprint Triathlon clamps
 * strokes and pedals against what hands can honestly do. A wrong guess is not
 * reported at all: it just starts a short local lockout before the next
 * attempt counts.
 *
 * No three.js, no React, no clock of its own. `stepRound` takes a round,
 * everybody's reported progress and how long since last time, and gives back
 * the round a moment later.
 */
import { createRng, hashSeed } from '../../00-core'

/** How many challenges make up a round. */
export const STAGE_COUNT = 10

export const ANSWER = {
  /** Seconds a wrong guess blocks the next attempt from counting. */
  lockout: 0.4,
  /** Anti-cheat floor: a reported stage cannot rise faster than one every this many seconds. */
  minStageTime: 0.5,
} as const

export const ROUND = {
  /** Safety net: however far anybody has got, the round ends here. */
  limit: 180,
  /** Seconds after the first finish before the round is actually over - long enough to see who won. */
  outro: 2,
} as const

export type Kind = 'match' | 'text' | 'identify' | 'pattern' | 'checkboxes' | 'count'
export const KINDS: readonly Kind[] = ['match', 'text', 'identify', 'pattern', 'checkboxes', 'count']

/** One icon, tagged with what it is - the raw material every kind but `text` draws from. */
export interface Thing {
  icon: string
  cat: string
}

export const THINGS: readonly Thing[] = [
  { icon: '🐶', cat: 'animal' }, { icon: '🐱', cat: 'animal' }, { icon: '🐭', cat: 'animal' }, { icon: '🐰', cat: 'animal' },
  { icon: '🦊', cat: 'animal' }, { icon: '🐻', cat: 'animal' }, { icon: '🐼', cat: 'animal' }, { icon: '🐸', cat: 'animal' },
  { icon: '🍎', cat: 'fruit' }, { icon: '🍌', cat: 'fruit' }, { icon: '🍇', cat: 'fruit' }, { icon: '🍊', cat: 'fruit' },
  { icon: '🍓', cat: 'fruit' }, { icon: '🍍', cat: 'fruit' }, { icon: '🍉', cat: 'fruit' }, { icon: '🥝', cat: 'fruit' },
  { icon: '🚗', cat: 'vehicle' }, { icon: '🚕', cat: 'vehicle' }, { icon: '🚌', cat: 'vehicle' }, { icon: '🚑', cat: 'vehicle' },
  { icon: '🚓', cat: 'vehicle' }, { icon: '🚜', cat: 'vehicle' }, { icon: '✈️', cat: 'vehicle' }, { icon: '🚀', cat: 'vehicle' },
  { icon: '🔴', cat: 'shape' }, { icon: '🔵', cat: 'shape' }, { icon: '🟡', cat: 'shape' }, { icon: '🟢', cat: 'shape' },
  { icon: '🟣', cat: 'shape' }, { icon: '🟠', cat: 'shape' }, { icon: '⬛', cat: 'shape' }, { icon: '⬜', cat: 'shape' },
] as const

export const CATEGORIES: readonly string[] = [...new Set(THINGS.map((t) => t.cat))]

/** Letters and digits a warped-text challenge draws from - no `O`/`0`/`I`/`1`/`l`, too easy to mix up. */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function shuffled<T>(random: () => number, items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** `count` distinct indices into `THINGS`, none sharing `exclude`'s category if given. */
function sampleThings(random: () => number, count: number, exclude?: number): number[] {
  const pool = THINGS.map((_, i) => i).filter((i) => i !== exclude)
  return shuffled(random, pool).slice(0, count)
}

export interface MatchChallenge {
  kind: 'match'
  target: number
  options: readonly number[]
}
export interface TextChallenge {
  kind: 'text'
  text: string
}
export interface IdentifyChallenge {
  kind: 'identify'
  options: readonly number[]
  oddIndex: number
}
export interface PatternChallenge {
  kind: 'pattern'
  sequence: readonly number[]
  options: readonly number[]
  answerIndex: number
}
export interface CheckboxesChallenge {
  kind: 'checkboxes'
  options: readonly number[]
  category: string
  correct: readonly number[]
}
export interface CountChallenge {
  kind: 'count'
  target: number
  field: readonly number[]
  answer: number
  choices: readonly number[]
}

export type Challenge = MatchChallenge | TextChallenge | IdentifyChallenge | PatternChallenge | CheckboxesChallenge | CountChallenge

function genMatch(random: () => number): MatchChallenge {
  const target = Math.floor(random() * THINGS.length)
  const distractors = sampleThings(random, 5, target)
  return { kind: 'match', target, options: shuffled(random, [target, ...distractors]) }
}

function genText(random: () => number): TextChallenge {
  let text = ''
  for (let i = 0; i < 6; i++) text += GLYPHS[Math.floor(random() * GLYPHS.length)]
  return { kind: 'text', text }
}

function genIdentify(random: () => number): IdentifyChallenge {
  const first = Math.floor(random() * THINGS.length)
  const category = THINGS[first].cat
  const sameCat = THINGS.map((_, i) => i).filter((i) => THINGS[i].cat === category)
  const majority = shuffled(random, sameCat).slice(0, 7)
  const otherCats = CATEGORIES.filter((c) => c !== category)
  const oddCat = otherCats[Math.floor(random() * otherCats.length)]
  const oddPool = THINGS.map((_, i) => i).filter((i) => THINGS[i].cat === oddCat)
  const odd = oddPool[Math.floor(random() * oddPool.length)]
  const options = shuffled(random, [...majority, odd])
  return { kind: 'identify', options, oddIndex: options.indexOf(odd) }
}

function genPattern(random: () => number): PatternChallenge {
  const cycleLength = random() < 0.5 ? 2 : 3
  const cycle = sampleThings(random, cycleLength)
  const sequence = Array.from({ length: 5 }, (_, i) => cycle[i % cycle.length])
  const correct = cycle[5 % cycle.length]
  const decoys = sampleThings(random, 3, correct).filter((i) => !cycle.includes(i))
  const options = shuffled(random, [correct, ...decoys.slice(0, 3)])
  return { kind: 'pattern', sequence, options, answerIndex: options.indexOf(correct) }
}

function genCheckboxes(random: () => number): CheckboxesChallenge {
  const category = CATEGORIES[Math.floor(random() * CATEGORIES.length)]
  const matching = THINGS.map((_, i) => i).filter((i) => THINGS[i].cat === category)
  const others = THINGS.map((_, i) => i).filter((i) => THINGS[i].cat !== category)
  const wantMatching = 2 + Math.floor(random() * 3) // 2..4
  const chosenMatching = shuffled(random, matching).slice(0, wantMatching)
  const chosenOthers = shuffled(random, others).slice(0, 7 - wantMatching)
  const options = shuffled(random, [...chosenMatching, ...chosenOthers])
  const correct = options.map((thing, i) => (THINGS[thing].cat === category ? i : -1)).filter((i) => i >= 0)
  return { kind: 'checkboxes', options, category, correct }
}

function genCount(random: () => number): CountChallenge {
  const target = Math.floor(random() * THINGS.length)
  const answer = 2 + Math.floor(random() * 4) // 2..5
  const decoyCount = 10
  const decoys = Array.from({ length: decoyCount }, () => sampleThings(random, 1, target)[0])
  const field = shuffled(random, [...Array(answer).fill(target), ...decoys])
  const wrongChoices = new Set<number>()
  while (wrongChoices.size < 3) {
    const guess = Math.max(1, answer + Math.floor(random() * 5) - 2)
    if (guess !== answer) wrongChoices.add(guess)
  }
  const choices = shuffled(random, [answer, ...wrongChoices])
  return { kind: 'count', target, field, answer, choices }
}

function generate(kind: Kind, seed: number, index: number): Challenge {
  const random = createRng(hashSeed(seed, `op-finder:content:${kind}:${index}`))
  switch (kind) {
    case 'match': return genMatch(random)
    case 'text': return genText(random)
    case 'identify': return genIdentify(random)
    case 'pattern': return genPattern(random)
    case 'checkboxes': return genCheckboxes(random)
    case 'count': return genCount(random)
  }
}

const planned = new Map<string, Challenge>()

/** The challenge at `stage` (0-indexed) - deterministic, and never the same kind as the one before it. */
export function challengeFor(seed: number, stage: number): Challenge {
  const key = `${seed}:${stage}`
  const known = planned.get(key)
  if (known) return known
  const kindRandom = createRng(hashSeed(seed, `op-finder:kind:${stage}`))
  const before = stage > 0 ? challengeFor(seed, stage - 1).kind : null
  const pool = before ? KINDS.filter((k) => k !== before) : KINDS
  const kind = pool[Math.floor(kindRandom() * pool.length)]
  const challenge = generate(kind, seed, stage)
  planned.set(key, challenge)
  if (planned.size > 512) planned.delete(planned.keys().next().value!)
  return challenge
}

/** What a guess looks like, one shape per kind. */
export type Guess =
  | { kind: 'match'; pick: number }
  | { kind: 'text'; text: string }
  | { kind: 'identify'; pick: number }
  | { kind: 'pattern'; pick: number }
  | { kind: 'checkboxes'; picks: readonly number[] }
  | { kind: 'count'; pick: number }

/** Whether `guess` is the correct answer to `challenge`. Wrong-shaped guesses are just wrong. */
export function checkGuess(challenge: Challenge, guess: Guess): boolean {
  if (guess.kind !== challenge.kind) return false
  switch (challenge.kind) {
    case 'match':
      return guess.kind === 'match' && challenge.options[guess.pick] === challenge.target
    case 'text':
      return guess.kind === 'text' && guess.text.trim().toUpperCase() === challenge.text
    case 'identify':
      return guess.kind === 'identify' && guess.pick === challenge.oddIndex
    case 'pattern':
      return guess.kind === 'pattern' && guess.pick === challenge.answerIndex
    case 'checkboxes':
      if (guess.kind !== 'checkboxes') return false
      { const a = [...guess.picks].sort((x, y) => x - y); const b = [...challenge.correct].sort((x, y) => x - y)
        return a.length === b.length && a.every((v, i) => v === b[i]) }
    case 'count':
      return guess.kind === 'count' && challenge.choices[guess.pick] === challenge.answer
  }
}

export interface Player {
  id: string
  /** How many of the ten challenges are cleared. */
  stage: number
  /** Round-elapsed when `stage` last rose - paces the anti-cheat floor. */
  lastAdvance: number
  /** A wrong guess blocks the next attempt until this round-elapsed. */
  lockedUntil: number
  mistakes: number
  finishAt: number | null
  mine: boolean
  bot: boolean
}

export interface Round {
  seed: number
  id: number
  players: Player[]
  elapsed: number
  decidedAt: number | null
  over: boolean
}

/**
 * What somebody has reported this frame: their own running `stage` and
 * `mistakes`, exactly what their own browser already knows - never a guess's
 * content, which the host has no way to check anyway.
 */
export interface Intent {
  stage: number
  mistakes: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createRound(seed: number, entrants: readonly Entrant[], id = 1): Round {
  return {
    seed,
    id,
    elapsed: 0,
    decidedAt: null,
    over: false,
    players: entrants.map((e) => ({
      id: e.id,
      stage: 0,
      lastAdvance: -Infinity,
      lockedUntil: -Infinity,
      mistakes: 0,
      finishAt: null,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

/**
 * Tries a guess against a player's current stage, in place. Right and past
 * the lockout: the stage rises. Wrong: a short local lockout starts. Called
 * by whichever browser made the guess, on its own copy of that player -
 * nothing here talks to the network.
 */
export function answer(round: Round, player: Player, guess: Guess): boolean {
  if (player.stage >= STAGE_COUNT || round.elapsed < player.lockedUntil) return false
  const right = checkGuess(challengeFor(round.seed, player.stage), guess)
  if (!right) {
    player.mistakes += 1
    player.lockedUntil = round.elapsed + ANSWER.lockout
    return false
  }
  player.stage += 1
  player.lastAdvance = round.elapsed
  if (player.stage >= STAGE_COUNT) player.finishAt = round.elapsed
  return true
}

/**
 * One step of the round: folds in everybody's reported progress (the host's
 * own included), rate-clamped, then checks whether the round has been
 * decided. `dt` is clamped, same as every other minigame, so a backgrounded
 * tab cannot report a burst of stages all reaching the floor at once.
 */
export function stepRound(round: Round, intents: ReadonlyMap<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05)
  round.elapsed += step

  if (round.decidedAt !== null) {
    if (round.elapsed - round.decidedAt >= ROUND.outro) round.over = true
    return round
  }

  for (const p of round.players) {
    const intent = intents.get(p.id)
    if (!intent) continue
    p.mistakes = Math.max(p.mistakes, intent.mistakes)
    while (p.stage < intent.stage && p.stage < STAGE_COUNT && round.elapsed - p.lastAdvance >= ANSWER.minStageTime) {
      p.stage += 1
      p.lastAdvance = round.elapsed
    }
    if (p.stage >= STAGE_COUNT && p.finishAt === null) p.finishAt = round.elapsed
  }

  if (round.players.some((p) => p.finishAt !== null)) {
    round.decidedAt = round.elapsed
  } else if (round.elapsed >= ROUND.limit) {
    round.over = true
    round.elapsed = ROUND.limit
  }
  return round
}

export function timeLeft(round: Round): number {
  return Math.max(0, ROUND.limit - round.elapsed)
}

/**
 * Everybody, best first. The winner and anybody else who finished rank by
 * finish time; everybody still racing ranks by how far they got.
 */
export function placings(round: Round): { player: Player; index: number; place: number }[] {
  const score = (p: Player) => (p.finishAt !== null ? 100000 - p.finishAt : p.stage)
  const ranked = round.players.map((player, index) => ({ player, index })).sort((a, b) => score(b.player) - score(a.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.player) > score(entry.player)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
