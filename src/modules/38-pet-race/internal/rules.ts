/**
 * The rules of Pet Race, as arithmetic.
 *
 * **Ten seconds to choose.** Five pets and their numbers are on the table.
 * Anybody who has not chosen when the time is up is given the fish, and the
 * fish does not run. If everybody has chosen before the ten seconds are out,
 * the wait ends there rather than running the clock down for nobody.
 *
 * **Three, two, one, and thirty seconds to race.** Down the course, through the
 * gates in the hedges, round or through the puddles, past the treats if your
 * tank needs them. Hold the button to boost and the tank empties a second a
 * second; let go and it fills at whatever rate your animal regrows at.
 *
 * **An animal has momentum.** The keys say where you want to be going and the
 * animal turns towards it at its own grip, so the rabbit is quickest in a line
 * and hopeless at a gate, and the cat is the other way round.
 *
 * The race ends when three have finished, everybody has, or the thirty seconds
 * are up.
 * Finishers place by their time; everybody else by how far they got.
 *
 * Everything here is pure.
 */
import { FINISH_Z, TRACK, TREAT, clearOf, courseFor, dragAt, progressOf, startAt } from './course'
import { DEFAULT_PET, petById, type PetId } from './pets'

export const RACE = {
  /** Seconds with the table on the screen. */
  choosing: 10,
  /** Three, two, one. */
  countdown: 3,
  /** Seconds of racing, after which whoever is still out there is placed where they stand. */
  length: 30,
  /** The race is over as soon as this many are home. */
  podium: 3,
  /**
   * How much tank you have to have got back before the button works again,
   * once you have run yourself dry.
   *
   * Without it, holding the button on an empty tank gets you a boost every
   * other frame: the tank regrows a frame's worth, that is more than nothing,
   * so it boosts, which empties it again. That is a free half-speed boost for
   * ever and it makes the tank meaningless. Run it out and you have to get your
   * breath back, which is also the one thing that makes a slow regrow hurt.
   */
  breath: 0.75,
} as const

export type Phase = 'choosing' | 'countdown' | 'racing' | 'over'

export interface Racer {
  id: string
  mine: boolean
  bot: boolean
  /** Null until they choose. The fish is what null becomes when the time is up. */
  pet: PetId | null
  x: number
  z: number
  vx: number
  vz: number
  /** The way the body faces, radians: 0 is +Z, back towards the start. */
  facing: number
  /** Seconds of boost left in the tank. */
  stamina: number
  /** Whether the button is down and there is anything left to burn. */
  boosting: boolean
  /** Run dry: the button does nothing until `RACE.breath` is back in the tank. */
  winded: boolean
  /** Which treats this racer has picked up, as a bit per treat. Each racer has their own. */
  taken: number
  /** When they crossed the line, in race seconds, or null. */
  finishedAt: number | null
  /** The furthest down the course they have been, metres. */
  best: number
  left: boolean
}

/** What a racer's hands are doing: where the keys point, and whether boost is held. */
export interface Hands {
  x: number
  z: number
  boost: boolean
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  racers: Racer[]
  hands: Hands[]
  phase: Exclude<Phase, 'over'>
  /** When this phase started, in `elapsed`. */
  phaseAt: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

export const NO_HANDS: Readonly<Hands> = Object.freeze({ x: 0, z: 0, boost: false })

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    racers: entrants.map((e, i) => {
      const at = startAt(entrants.length, i)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        pet: null,
        x: at.x,
        z: at.z,
        vx: 0,
        vz: 0,
        // Facing down the course, which is -Z.
        facing: Math.PI,
        stamina: 0,
        boosting: false,
        winded: false,
        taken: 0,
        finishedAt: null,
        best: 0,
        left: false,
      }
    }),
    hands: entrants.map(() => ({ ...NO_HANDS })),
    phase: 'choosing',
    phaseAt: 0,
  }
}

export function phase(game: Game): Phase {
  return game.over ? 'over' : game.phase
}

/** Seconds since this phase began. */
export function phaseTime(game: Game): number {
  return round2(game.elapsed - game.phaseAt)
}

/** Seconds left of the race, or of the choosing, whichever is running. */
export function timeLeft(game: Game): number {
  const of = game.phase === 'choosing' ? RACE.choosing : game.phase === 'countdown' ? RACE.countdown : RACE.length
  return Math.max(0, round2(of - (game.elapsed - game.phaseAt)))
}

/** The pet a racer is running as - the fish, if they never chose. */
export function petOf(racer: Racer): PetId {
  return racer.pet ?? DEFAULT_PET
}

/** Still in: not gone. Somebody who left keeps their place but stops moving. */
export function isIn(racer: Racer): boolean {
  return !racer.left
}

/** A racer takes a pet. Only while the table is up, and they may change their mind. */
export function choose(game: Game, player: number, pet: PetId): boolean {
  const racer = game.racers[player]
  if (!racer || game.over || game.phase !== 'choosing' || racer.left) return false
  racer.pet = pet
  return true
}

/** Whether everybody still here has chosen, which is what lets the wait end early. */
export function allChosen(game: Game): boolean {
  const here = game.racers.filter(isIn)
  return here.length > 0 && here.every((racer) => racer.pet !== null)
}

/** Whether the button would do anything at all just now. */
export function canBoost(racer: Racer): boolean {
  return !racer.winded && racer.stamina > 0 && petById(petOf(racer)).speed > 0
}

/** How full a racer's tank is, 0 to 1. The fish has no tank, and reads empty. */
export function tankOf(racer: Racer): number {
  const pet = petById(petOf(racer))
  return pet.stamina > 0 ? Math.max(0, Math.min(1, racer.stamina / pet.stamina)) : 0
}

/** How far down the course a racer is, in metres. */
export function progress(racer: Racer): number {
  return progressOf(racer.z)
}

/** Whether a treat has been taken by this racer. */
export function hasTaken(racer: Racer, treat: number): boolean {
  return (racer.taken & (1 << treat)) !== 0
}

/** Moves one racer a step: what the keys asked for, what the animal can do, and what is in the way. */
function move(game: Game, index: number, dt: number): void {
  const racer = game.racers[index]
  const pet = petById(petOf(racer))
  const course = courseFor(game.seed)

  if (!isIn(racer) || pet.speed <= 0) {
    // The fish and the gone: on the course, going nowhere.
    racer.vx = 0
    racer.vz = 0
    racer.boosting = false
    return
  }

  if (racer.finishedAt !== null) {
    // Home. The keys do nothing now, but an animal at eight metres a second
    // does not stop on a painted line - it runs it off.
    const slow = 1 - Math.exp(-3 * dt)
    racer.vx -= racer.vx * slow
    racer.vz -= racer.vz * slow
    racer.x += racer.vx * dt
    racer.z += racer.vz * dt
    const stopping = clearOf(course, racer.x, racer.z, pet.radius)
    racer.x = stopping.x
    racer.z = stopping.z
    racer.boosting = false
    return
  }

  const hands = game.hands[index] ?? NO_HANDS
  if (racer.winded && racer.stamina >= Math.min(RACE.breath, pet.stamina)) racer.winded = false
  racer.boosting = hands.boost && !racer.winded && racer.stamina > 0
  racer.stamina = Math.max(0, Math.min(pet.stamina, racer.stamina + (racer.boosting ? -dt : pet.regen * dt)))
  if (racer.stamina <= 0) racer.winded = true

  const length = Math.hypot(hands.x, hands.z)
  const want = length > 1e-6 ? Math.min(1, length) / length : 0
  const top = pet.speed * (racer.boosting ? pet.boost : 1) * dragAt(course, racer.x, racer.z)
  const wantVx = hands.x * want * top
  const wantVz = hands.z * want * top

  // Grip is how quickly the animal can be going somewhere else.
  const k = 1 - Math.exp(-pet.grip * dt)
  racer.vx += (wantVx - racer.vx) * k
  racer.vz += (wantVz - racer.vz) * k
  racer.x += racer.vx * dt
  racer.z += racer.vz * dt

  const clear = clearOf(course, racer.x, racer.z, pet.radius)
  racer.x = clear.x
  racer.z = clear.z
  // Running into a hedge costs you the speed you ran into it with.
  if (clear.hit) {
    racer.vx *= 0.35
    racer.vz *= 0.35
  }

  const moving = Math.hypot(racer.vx, racer.vz)
  if (moving > 0.4) racer.facing = Math.atan2(racer.vx, racer.vz)

  for (const [treat, at] of course.treats.entries()) {
    if (hasTaken(racer, treat)) continue
    if (Math.hypot(at.x - racer.x, at.z - racer.z) > TREAT.reach + pet.radius) continue
    racer.taken |= 1 << treat
    racer.stamina = Math.min(pet.stamina, racer.stamina + TREAT.gives)
  }

  racer.best = Math.max(racer.best, progress(racer))
  if (racer.z <= FINISH_Z) {
    racer.finishedAt = round2(game.elapsed - game.phaseAt)
    racer.best = TRACK.length
  }
}

/** The clock and the bodies, on every screen that simulates. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  game.elapsed += step
  if (game.phase !== 'racing') return
  for (let i = 0; i < game.racers.length; i++) move(game, i, step)
}

/** Everybody who never chose is given the fish. */
function handOutFish(game: Game): void {
  for (const racer of game.racers) if (racer.pet === null) racer.pet = DEFAULT_PET
}

/** Puts every racer back on the line with a full tank, ready for the countdown. */
function toTheLine(game: Game): void {
  game.racers.forEach((racer, i) => {
    const at = startAt(game.racers.length, i)
    const pet = petById(petOf(racer))
    Object.assign(racer, { x: at.x, z: at.z, vx: 0, vz: 0, facing: Math.PI, stamina: pet.stamina, boosting: false, winded: false })
  })
}

/** Whether every racer who could finish has. */
export function allHome(game: Game): boolean {
  const running = game.racers.filter((racer) => isIn(racer) && petById(petOf(racer)).speed > 0)
  return running.length > 0 && running.every((racer) => racer.finishedAt !== null)
}

/** The phases, for the host or alone. */
export function advance(game: Game): void {
  if (game.over) return
  const since = game.elapsed - game.phaseAt
  if (game.phase === 'choosing') {
    // The table comes down early if nobody is still deciding.
    if (since >= RACE.choosing || allChosen(game)) {
      handOutFish(game)
      toTheLine(game)
      Object.assign(game, { phase: 'countdown', phaseAt: game.elapsed })
    }
    return
  }
  if (game.phase === 'countdown') {
    if (since >= RACE.countdown) Object.assign(game, { phase: 'racing', phaseAt: game.elapsed })
    return
  }
  const home = game.racers.filter((racer) => racer.finishedAt !== null).length
  if (since >= RACE.length || allHome(game) || home >= RACE.podium) game.over = true
}

/** One step: the clock and the bodies, then the phases. For the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  advance(game)
  return game
}

/** A racer who has left the lobby. They stop where they are and keep whatever they got. */
export function leave(game: Game, player: number): void {
  const racer = game.racers[player]
  if (!racer) return
  racer.left = true
  racer.vx = 0
  racer.vz = 0
  racer.boosting = false
}

/**
 * Everybody, first home first.
 *
 * A finisher is placed by their time. Anybody who did not finish is placed
 * behind every finisher, by how far down the course they got. Two racers level
 * to the hundredth of a second, or to a tenth of a metre, share a place.
 */
export function placings(game: Game): { racer: Racer; index: number; place: number }[] {
  const key = (racer: Racer) =>
    racer.finishedAt !== null ? Math.round(racer.finishedAt * 100) : 1_000_000 + Math.round((TRACK.length - racer.best) * 10)
  const ranked = game.racers.map((racer, index) => ({ racer, index })).sort((a, b) => key(a.racer) - key(b.racer) || a.index - b.index)
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => key(other.racer) < key(entry.racer)).length }))
}

/** Eight colours that do not look alike, one per racer, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
