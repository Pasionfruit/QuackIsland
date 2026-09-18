/**
 * One game, on the wire.
 *
 * **The host moves everybody.** Pushes send bodies flying into each other and
 * off chairs, and who got which chair first has to have one answer, so there is
 * one simulation and it is the host's. It sends a snapshot fifteen times a
 * second: the clock, the round, the phase and when it began, how many chairs,
 * and every player - where, facing which way, on which chair, how long they have
 * sat, how stunned, how long since they pushed, how long since they last got
 * round the ring, how long since they were thrown to the edge, when they went
 * out, whether they have left.
 *
 * **The seed never goes on the wire.** How long the music plays is the seed and
 * the round put through `musicFor`, so a guest holding the seed could work out
 * the exact moment it will stop and sit on it - which is the one thing this game
 * cannot allow. A game's id is a hash of its seed rather than the seed itself,
 * so copies can agree on which game they are in without anybody being able to
 * run the clock backwards. A guest's `seed` stays zero and it never needs it:
 * the music stopping reaches it as a phase that has already changed.
 *
 * **A guest sends its hands**: which way its keys point, twenty times a second,
 * with a running count of how many times it has pressed sit and pushed - so a
 * press is never lost or counted twice, whichever message carries it.
 */
import { FLOOR, type Game, type Phase, type Player } from './rules'
import { MAX_PLAYERS } from './setup'

export const SNAPSHOT_TAG = 'mm'
export const HANDS_TAG = 'mm-in'

const PHASES = ['countdown', 'music', 'scramble', 'result'] as const

/** `[id, x cm, z cm, facing mrad, seat or -1, sat cs or -1, stun cs, since pushed cs, since got round cs, since thrown cs, out round or -1, left 0/1]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  elapsed: number
  over: boolean
  round: number
  phase: Exclude<Phase, 'over'>
  phaseAt: number
  chairs: number
  players: WirePlayer[]
}

export interface HandsMessage {
  game: number
  x: number
  z: number
  sits: number
  pushes: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cs = (v: number) => Math.round(v * 100)
const REACH = Math.ceil(FLOOR.radius * 100)
/** The longest "since" worth sending: anything longer is just "a while". */
const LONG = 999

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    e: cs(game.elapsed) / 100,
    o: game.over ? 1 : 0,
    r: game.round,
    h: PHASES.indexOf(game.phase),
    a: cs(game.phaseAt),
    c: game.chairs,
    p: game.players.map(
      (p): WirePlayer => [
        p.id,
        cs(p.x),
        cs(p.z),
        Math.round(Math.atan2(Math.sin(p.facing), Math.cos(p.facing)) * 1000),
        p.seat ?? -1,
        p.seatedAt === null ? -1 : Math.min(LONG, cs(game.elapsed - p.seatedAt)),
        cs(p.stunned),
        Math.min(LONG, cs(game.elapsed - p.pushAt)),
        Math.min(LONG, cs(game.elapsed - p.lapAt)),
        Math.min(LONG, cs(game.elapsed - p.thrownAt)),
        p.out ?? -1,
        p.left ? 1 : 0,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.e) || message.e < 0) return null
  if ((message.o !== 0 && message.o !== 1) || !isCount(message.r) || !isCount(message.a)) return null
  if (!Number.isInteger(message.h) || (message.h as number) < 0 || (message.h as number) >= PHASES.length) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  if (!isCount(message.c) || message.c < 1 || message.c >= Math.max(2, count)) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 12) return null
    const [id, x, z, facing, seat, sat, stun, pushed, lap, thrown, out, left] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH || !isInt(facing) || Math.abs(facing) > 3142) return null
    if (!isInt(seat) || seat < -1 || seat >= (message.c as number)) return null
    if (!isInt(sat) || sat < -1 || sat > LONG || !isCount(stun) || stun > 100 || !isCount(pushed) || pushed > LONG) return null
    if (!isCount(lap) || lap > LONG || !isCount(thrown) || thrown > LONG) return null
    if (!isInt(out) || out < -1 || out > MAX_PLAYERS * 4 || (left !== 0 && left !== 1)) return null
    players.push([id, x, z, facing, seat, sat, stun, pushed, lap, thrown, out, left])
  }
  return {
    id: message.g as number,
    elapsed: message.e,
    over: message.o === 1,
    round: message.r,
    phase: PHASES[message.h as number],
    phaseAt: message.a / 100,
    chairs: message.c,
    players,
  }
}

/** Brings a guest's copy into line with the host's - all of it but the clock, which the caller eases. */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  // The seed is left alone on purpose - see the note at the top. A guest's is zero.
  Object.assign(game, { id: snap.id, over: snap.over, round: snap.round, phase: snap.phase, phaseAt: snap.phaseAt, chairs: snap.chairs })
  const before = game.players
  const at = game.elapsed
  game.players = snap.players.map(
    ([id, x, z, facing, seat, sat, stun, pushed, lap, thrown, out, left]): Player => ({
      id,
      mine: id === me,
      bot: before.find((p) => p.id === id)?.bot ?? false,
      x: x / 100,
      z: z / 100,
      vx: 0,
      vz: 0,
      facing: facing / 1000,
      seat: seat < 0 ? null : seat,
      seatedAt: sat < 0 ? null : at - sat / 100,
      stunned: stun / 100,
      pushAt: at - pushed / 100,
      lapFrom: Math.atan2(x, z),
      lapAt: at - lap / 100,
      thrownAt: thrown >= LONG ? -Infinity : at - thrown / 100,
      out: out < 0 ? null : out,
      left: left === 1,
    }),
  )
  game.hands = game.players.map(() => ({ x: 0, z: 0 }))
  return game
}

export function encodeHands(message: HandsMessage): Record<string, unknown> {
  return { t: HANDS_TAG, g: message.game, x: Math.round(message.x * 100), z: Math.round(message.z * 100), s: message.sits, p: message.pushes }
}

export function decodeHands(message: Record<string, unknown>): HandsMessage | null {
  if (message.t !== HANDS_TAG) return null
  if (!isCount(message.g) || !isInt(message.x) || !isInt(message.z) || Math.abs(message.x) > 100 || Math.abs(message.z) > 100) return null
  if (!isCount(message.s) || !isCount(message.p)) return null
  return { game: message.g as number, x: message.x / 100, z: message.z / 100, sits: message.s, pushes: message.p }
}
