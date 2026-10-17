/**
 * The one-vs-all base case: one player against everybody else.
 *
 * Every one-vs-all game deals the same way. The host has said who the 1 is
 * (`getTheOne` in `15-minigames`); if that person is actually in the roster
 * they are it, and otherwise the first human is - alone, that is you, so a
 * stand-in never plays the 1. Everybody else is "the rest", in roster order,
 * which is what spawn slots are counted along.
 *
 * `oneVsAllSetup` is the whole of a one-vs-all `setup.ts`: a game hands it its
 * own `createRound` and gets back `newRound`, `waitingRound`, the roster and
 * the seed dealer, all built the same way. The bug that used to come with
 * writing those by hand - an empty placeholder round reading as a finished
 * one, and flashing Finish at a guest before the host's first snapshot - is
 * fixed once, in `holding`.
 */
import { getTheOne } from '../../15-minigames'
import { entrantsOf, lobbyRoster, myId, seedDealer, type Entrant, type RosterRule, type Seat } from './roster'

/**
 * Who is the 1: whoever was chosen, if they are in the roster and not a
 * stand-in; otherwise the first human; otherwise the first seat at all; and
 * `''` for nobody.
 */
export function resolveTheOne(roster: readonly { id: string; bot?: boolean }[], chosen: string | null): string {
  if (chosen !== null && roster.some((e) => e.id === chosen && !e.bot)) return chosen
  return (roster.find((e) => !e.bot) ?? roster[0])?.id ?? ''
}

export interface Cast<E> {
  /** The 1's id, or `''` for an empty roster. */
  oneId: string
  /** Everybody else, in roster order - spawn slots are counted along this. */
  rest: E[]
}

/** Splits a roster into the 1 and the rest. */
export function castOneVsAll<E extends { id: string; bot?: boolean }>(entrants: readonly E[], chosen: string | null): Cast<E> {
  const oneId = resolveTheOne(entrants, chosen)
  return { oneId, rest: entrants.filter((e) => e.id !== oneId) }
}

/** What every round has, as far as being over goes. */
export interface Decidable {
  over: boolean
  winner: unknown
}

/**
 * A round that is not a round yet: what a guest holds until the host's first
 * snapshot. A real round with nobody in it is decided - it goes to the 1 -
 * but this one must never read as over, or the shared Finish card flashes up
 * for a frame before the host's word arrives.
 */
export function holding<R extends Decidable>(round: R): R {
  round.over = false
  round.winner = null
  return round
}

export interface OneVsAllSpec<R extends Decidable> extends RosterRule {
  /** Mixed into the seed so two games never deal the same round. */
  game: string
  /** The game's own deal, from a seed, the entrants, who was chosen as the 1, and a round id. */
  createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id: number): R
}

export interface RoundSetup {
  seed?: number
  roster?: readonly Seat[]
  me?: string
  /** Who the host has said is the 1 - `getTheOne()` by default; alone, nobody has, so the roster's first human is it. */
  chosen?: string | null
}

export interface OneVsAllKit<R> {
  nextSeed(): number
  roster(): Seat[]
  newRound(setup?: RoundSetup): R
  waitingRound(): R
}

export function oneVsAllSetup<R extends Decidable>(spec: OneVsAllSpec<R>): OneVsAllKit<R> {
  const nextSeed = seedDealer(spec.game)
  const roster = () => lobbyRoster(spec)
  return {
    nextSeed,
    roster,
    newRound: ({ seed = nextSeed(), roster: seats = roster(), me = myId(), chosen = getTheOne() } = {}) =>
      spec.createRound(seed, entrantsOf(seats, me), chosen, seed || 1),
    waitingRound: () => holding(spec.createRound(0, [], null, 0)),
  }
}

/**
 * What a one-vs-all game's setup must get right, as a list of what it got
 * wrong - empty when it is sound. Pure, so each game's own tests can assert
 * `toEqual([])` without this module importing a test runner.
 */
export function oneVsAllProblems<R extends Decidable>(
  kit: OneVsAllKit<R>,
  oneOf: (round: R) => { id: string; bot: boolean } | undefined,
  playersOf: (round: R) => readonly { id: string; bot: boolean }[],
): string[] {
  const problems: string[] = []
  const waiting = kit.waitingRound()
  if (waiting.over) problems.push('the waiting round reads as over')
  if (waiting.winner !== null) problems.push('the waiting round has a winner')
  if (playersOf(waiting).length !== 0) problems.push('the waiting round has players in it')

  const seats: Seat[] = [
    { id: 'human', bot: false },
    { id: 'stand-in 2', bot: true },
    { id: 'stand-in 3', bot: true },
  ]
  const alone = kit.newRound({ seed: 7, roster: seats, me: 'human', chosen: null })
  if (oneOf(alone)?.id !== 'human') problems.push('alone, the human is not the 1')
  const ghost = kit.newRound({ seed: 7, roster: seats, me: 'human', chosen: 'ghost' })
  if (oneOf(ghost)?.id !== 'human') problems.push('a chosen 1 who is not here is still the 1')
  const bot = kit.newRound({ seed: 7, roster: seats, me: 'human', chosen: 'stand-in 2' })
  if (oneOf(bot)?.bot !== false) problems.push('a stand-in can be the 1')

  const people: Seat[] = [
    { id: 'a', bot: false },
    { id: 'b', bot: false },
    { id: 'c', bot: false },
  ]
  const picked = kit.newRound({ seed: 7, roster: people, me: 'a', chosen: 'c' })
  if (oneOf(picked)?.id !== 'c') problems.push("the host's pick is not the 1")
  if (playersOf(picked).length !== people.length) problems.push('not everybody in the roster was dealt in')
  if (picked.over) problems.push('a fresh round with players reads as over')
  return problems
}
