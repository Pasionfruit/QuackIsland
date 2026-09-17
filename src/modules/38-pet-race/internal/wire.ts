/**
 * One race, on the wire.
 *
 * **The host runs the race.** Who got through a gate, who was in a puddle, who
 * took which treat and who crossed the line first all have to have one answer,
 * so there is one simulation and it is the host's. It sends a snapshot fifteen
 * times a second: the seed, the clock, the phase and when it began, and every
 * racer - which pet, where, facing which way, how much tank, whether the button
 * is down, which treats they have taken, when they finished, how far they got
 * and whether they have left.
 *
 * **The seed goes out in the open.** Unlike Musical Mayhem's, nothing follows
 * from it that a racer could use: the course is drawn on every screen, so
 * knowing it is the same as looking out of the window.
 *
 * **A guest sends its hands** twenty times a second - where its keys point,
 * whether boost is held, and which pet it has chosen. The choice rides along on
 * every message rather than being sent once, so a pick made a frame before the
 * table comes down cannot be the one message that goes missing, and changing
 * your mind is just the next message saying something else.
 */
import { TRACK } from './course'
import { PETS, petAt, petIndex, type PetId } from './pets'
import { RACE, petOf, type Game, type Phase, type Racer } from './rules'
import { MAX_RACERS } from './setup'

export const SNAPSHOT_TAG = 'pr'
export const HANDS_TAG = 'pr-in'

const PHASES = ['choosing', 'countdown', 'racing'] as const

/** `[id, pet, x cm, z cm, facing mrad, tank cs, burn 0 idle 1 boosting 2 winded, treats taken, finished cs or -1, best dm, left 0/1]`. */
export type WireRacer = [string, number, number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  phase: Exclude<Phase, 'over'>
  phaseAt: number
  racers: WireRacer[]
}

export interface HandsMessage {
  game: number
  x: number
  z: number
  boost: boolean
  /** The pet this guest has chosen, or null while it has not. */
  pet: PetId | null
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cs = (v: number) => Math.round(v * 100)

/** The furthest from the middle of the track anything can be, in centimetres. */
const ACROSS = Math.ceil((TRACK.width / 2 + 1) * 100)
/** How far up and down the course anything can be, in centimetres. */
const ALONG = Math.ceil((TRACK.length + TRACK.runUp + TRACK.runOff + 2) * 100)
/** The biggest tank any pet has, in centimetres of a second. */
const TANK = Math.ceil(Math.max(...PETS.map((pet) => pet.stamina)) * 100)
/** All thirty-one treat bits set. */
const ALL_TREATS = 2 ** 31 - 1

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: cs(game.elapsed) / 100,
    o: game.over ? 1 : 0,
    h: PHASES.indexOf(game.phase),
    a: cs(game.phaseAt),
    p: game.racers.map(
      (r): WireRacer => [
        r.id,
        // -1 while they have not chosen: a guest's table has to show that.
        r.pet === null ? -1 : petIndex(r.pet),
        cs(r.x),
        cs(r.z),
        Math.round(Math.atan2(Math.sin(r.facing), Math.cos(r.facing)) * 1000),
        cs(r.stamina),
        // One field for three states: a guest has to be able to say why the
        // button is doing nothing, and "winded" is not the same as "empty".
        r.boosting ? 1 : r.winded ? 2 : 0,
        r.taken,
        r.finishedAt === null ? -1 : cs(r.finishedAt),
        Math.round(r.best * 10),
        r.left ? 1 : 0,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if ((message.o !== 0 && message.o !== 1) || !isCount(message.a)) return null
  if (!Number.isInteger(message.h) || (message.h as number) < 0 || (message.h as number) >= PHASES.length) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_RACERS) return null
  const racers: WireRacer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, pet, x, z, facing, tank, burn, taken, finished, best, left] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(pet) || pet < -1 || pet >= PETS.length) return null
    if (!isInt(x) || Math.abs(x) > ACROSS || !isInt(z) || Math.abs(z) > ALONG) return null
    if (!isInt(facing) || Math.abs(facing) > 3142) return null
    if (!isCount(tank) || tank > TANK) return null
    if (burn !== 0 && burn !== 1 && burn !== 2) return null
    if (!isCount(taken) || taken > ALL_TREATS) return null
    if (!isInt(finished) || finished < -1 || finished > RACE.length * 100) return null
    if (!isCount(best) || best > TRACK.length * 10) return null
    if (left !== 0 && left !== 1) return null
    racers.push([id, pet, x, z, facing, tank, burn, taken, finished, best, left])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    phase: PHASES[message.h as number],
    phaseAt: message.a / 100,
    racers,
  }
}

/** Brings a guest's copy into line with the host's - all of it but the clock, which the caller eases. */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.racers = []
    game.elapsed = snap.elapsed
  }
  Object.assign(game, { id: snap.id, seed: snap.seed, over: snap.over, phase: snap.phase, phaseAt: snap.phaseAt })
  const before = game.racers
  game.racers = snap.racers.map(
    ([id, pet, x, z, facing, tank, burn, taken, finished, best, left]): Racer => ({
      id,
      mine: id === me,
      bot: before.find((r) => r.id === id)?.bot ?? false,
      pet: pet < 0 ? null : petAt(pet),
      x: x / 100,
      z: z / 100,
      vx: 0,
      vz: 0,
      facing: facing / 1000,
      stamina: tank / 100,
      boosting: burn === 1,
      winded: burn === 2,
      taken,
      finishedAt: finished < 0 ? null : finished / 100,
      best: best / 10,
      left: left === 1,
    }),
  )
  game.hands = game.racers.map(() => ({ x: 0, z: 0, boost: false }))
  return game
}

export function encodeHands(message: HandsMessage): Record<string, unknown> {
  return {
    t: HANDS_TAG,
    g: message.game,
    x: Math.round(message.x * 100),
    z: Math.round(message.z * 100),
    b: message.boost ? 1 : 0,
    c: message.pet === null ? -1 : petIndex(message.pet),
  }
}

export function decodeHands(message: Record<string, unknown>): HandsMessage | null {
  if (message.t !== HANDS_TAG) return null
  if (!isCount(message.g) || !isInt(message.x) || !isInt(message.z)) return null
  if (Math.abs(message.x) > 100 || Math.abs(message.z) > 100) return null
  if (message.b !== 0 && message.b !== 1) return null
  if (!isInt(message.c) || (message.c as number) < -1 || (message.c as number) >= PETS.length) return null
  return {
    game: message.g as number,
    x: message.x / 100,
    z: message.z / 100,
    boost: message.b === 1,
    pet: (message.c as number) < 0 ? null : petAt(message.c as number),
  }
}

/** What a racer is running as, for anything that has only the wire's word for it. */
export function petOnWire(racer: Racer): PetId {
  return petOf(racer)
}
