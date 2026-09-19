/**
 * The rules of I Just Work Here, as arithmetic.
 *
 * Everybody against everybody, in an office, seen from above. **Four pieces of
 * a bazooka in your colour are lying about the floor.** Find them, carry them
 * back to your desk **one at a time**, and once all four are on it you are
 * armed. A rocket flies straight until it touches something - furniture, a
 * wall, a person - and bursts. **Anybody within the blast is eliminated,
 * whoever fired it included**: fire at a wall you are standing next to and it
 * takes you with it. Last one standing wins.
 *
 * You can only pick up your own pieces. Carrying one slows you down a little,
 * and you can put it down wherever you are. Rockets are the only way anybody is
 * eliminated.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { createRng, hashSeed } from '../../00-core'
import { OFFICE, blocked, cast, collide, deskSlots, distanceTo, lineClear, officeFor, slide, type Desk, type Point } from './office'

export const BODY = {
  radius: PLAYER.radius,
  /** Metres a second, empty-handed. */
  speed: 5.4,
  /** Metres a second with a piece in your arms. */
  carrying: 4.4,
} as const

/** How many pieces make a bazooka. */
export const PIECES_EACH = 4

export const REACH = {
  /** How near a piece has to be to pick it up, middle to middle. */
  piece: 1.3,
  /** How near your desk you have to be to put a piece on it. */
  desk: 1.4,
} as const

export const ROCKET = {
  /** Metres a second: fast, but you can see it coming. */
  speed: 15,
  /** How big it is, for what it touches. */
  radius: 0.16,
  /** How far it flies before it bursts anyway. */
  range: 34,
  /** Seconds between rockets. */
  cooldown: 1.2,
  /** Where it leaves the barrel, from your middle. Anything nearer than this and it bursts in your face. */
  muzzle: 0.55,
} as const

export const BLAST = {
  /** Anybody whose middle is this near where it bursts, with nothing solid in between, is out. */
  radius: 2.6,
} as const

export const ROUND = {
  /** None: the minigame screen's own three-two-one runs first. */
  countdown: 0,
  /** Seconds from the start to the end, two and a half minutes. */
  limit: 150,
} as const

/**
 * How much the host gives a guest, which acted on its own screen a moment ago:
 * how far it may be from where the host has it, and how early after its last
 * rocket another may arrive.
 */
export const CLAIM = { reach: 1.5, early: 0.3 } as const

/** How long a blast is kept, for drawing and for the wire. */
export const BLAST_LIFE = 1

/** Loose on the floor, in somebody's arms, or on their desk. */
export const LOOSE = 0
export const CARRIED = 1
export const PLACED = 2
export type PieceState = typeof LOOSE | typeof CARRIED | typeof PLACED

export interface Piece {
  /** Whose it is, by player index. Player `owner` has pieces `owner * 4` to `owner * 4 + 3`. */
  owner: number
  /** Which part: 0 the tube, 1 the grip, 2 the sight, 3 the rocket. */
  part: number
  x: number
  z: number
  state: PieceState
}

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** Which of the eight desks is theirs. */
  slot: number
  x: number
  z: number
  /** Radians. Aiming along (-sin yaw, -cos yaw): 0 aims north, -Z. */
  yaw: number
  /** The piece in their arms, by index, or -1. */
  carrying: number
  /** When they were eliminated, seconds since the start, or null while standing. */
  out: number | null
  /** Who eliminated them, by index - themselves, if they blew themselves up - or null. */
  by: number | null
  kills: number
  /** When they last fired, in `elapsed`. */
  firedAt: number
  left: boolean
  /** When they left, seconds since the start, if they left standing. */
  leftAt: number | null
}

export interface Rocket {
  /** The host's count. A guest's own, drawn before the host has heard, is 0. */
  seq: number
  by: number
  x: number
  z: number
  yaw: number
  /** How much further it can fly. */
  left: number
  /** When it was fired, in `elapsed`. */
  at: number
  /** On a guest's screen: it has touched something and is waiting for the host's word. */
  stopped?: boolean
}

export interface Blast {
  seq: number
  by: number
  x: number
  z: number
  /** Who it eliminated, by index. */
  victims: number[]
  at: number
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt. */
  elapsed: number
  over: boolean
  players: Player[]
  pieces: Piece[]
  rockets: Rocket[]
  blasts: Blast[]
  /** The last number handed out, or - on a guest - heard from the host. */
  seq: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round2 = (v: number) => Math.round(v * 100) / 100

/** An angle brought into -π..π. */
export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The way a yaw aims, on the floor. */
export function aimDirection(yaw: number): Point {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

/** The yaw that aims from `from` at `to`. */
export function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/**
 * Where everybody's pieces are dealt: tucked in beside the furniture, well away
 * from their owner's desk, and apart from each other. Each player's four are
 * dealt in turn, a piece at a time, so nobody's all come from the good spots.
 */
export function scatter(seed: number, desks: readonly Desk[]): Piece[] {
  const office = officeFor(seed)
  const random = createRng(hashSeed(seed, 'i-just-work-here:pieces'))
  const pieces: Piece[] = desks.flatMap((_, owner) => Array.from({ length: PIECES_EACH }, (_, part): Piece => ({ owner, part, x: 0, z: 0, state: LOOSE })))
  const placed: Point[] = []
  for (let part = 0; part < PIECES_EACH; part++) {
    desks.forEach((desk, owner) => {
      const piece = pieces[owner * PIECES_EACH + part]
      let best: Point | null = null
      for (let attempt = 0; attempt < 400; attempt++) {
        const p = { x: (random() * 2 - 1) * (OFFICE.halfX - 1), z: (random() * 2 - 1) * (OFFICE.halfZ - 1) }
        if (blocked(office, p, 0.55)) continue
        // Tucked in beside something, for the first tries; anywhere open after that.
        if (attempt < 250 && !blocked(office, p, 1.3)) continue
        if (Math.hypot(p.x - desk.spot.x, p.z - desk.spot.z) < 9) continue
        if (placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2)) continue
        if (office.desks.some((d) => distanceTo(d.block, p) < 2.2)) continue
        best = p
        break
      }
      best ??= { x: -desk.spot.x * 0.5, z: -desk.spot.z * 0.5 }
      piece.x = best.x
      piece.z = best.z
      placed.push(best)
    })
  }
  return pieces
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const slots = deskSlots(seed, entrants.length)
  const office = officeFor(seed)
  const desks = slots.map((slot) => office.desks[slot])
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    seq: 0,
    rockets: [],
    blasts: [],
    pieces: scatter(seed, desks),
    players: entrants.map((e, index) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      slot: slots[index],
      x: desks[index].spot.x,
      z: desks[index].spot.z,
      yaw: desks[index].yaw,
      carrying: -1,
      out: null,
      by: null,
      kills: 0,
      firedAt: -ROCKET.cooldown,
      left: false,
      leftAt: null,
    })),
  }
}

/** Seconds since the start. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

/** Whether a player can move and act just now. */
export function canAct(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && clock(game) >= 0 && isStanding(p)
}

/** A player's desk. */
export function deskOf(game: Game, player: number): Desk {
  return officeFor(game.seed).desks[game.players[player]?.slot ?? 0]
}

/** A player's pieces, by index into `game.pieces`. */
export function piecesOf(game: Game, player: number): number[] {
  return Array.from({ length: PIECES_EACH }, (_, part) => player * PIECES_EACH + part).filter((i) => i < game.pieces.length)
}

/** How many of a player's pieces are on their desk. */
export function placedCount(game: Game, player: number): number {
  return piecesOf(game, player).filter((i) => game.pieces[i].state === PLACED).length
}

/** All four on the desk: a bazooka. */
export function isArmed(game: Game, player: number): boolean {
  return game.pieces.length > 0 && placedCount(game, player) >= PIECES_EACH
}

/** Near enough their desk to put a piece on it. */
export function atDesk(game: Game, player: number, at: Point = game.players[player]): boolean {
  return distanceTo(deskOf(game, player).block, at) <= REACH.desk
}

/** Their own loose piece nearest them within reach, or -1. */
export function pieceInReach(game: Game, player: number, at: Point = game.players[player], reach: number = REACH.piece): number {
  let best = -1
  let bestD = Infinity
  for (const i of piecesOf(game, player)) {
    const piece = game.pieces[i]
    if (piece.state !== LOOSE) continue
    const d = Math.hypot(piece.x - at.x, piece.z - at.z)
    if (d <= reach && d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/** Turns a player to aim this way. */
export function aim(game: Game, player: number, yaw: number): void {
  const p = game.players[player]
  if (!p || p.left || p.out !== null) return
  p.yaw = wrapAngle(yaw)
}

/**
 * Walks a player for `dt` seconds: `x` and `z` are each -1 to 1, east and south,
 * the way the keys are held - the office is seen from the south, so W is north.
 * Diagonals are no faster, and a piece in your arms slows you down.
 */
export function walk(game: Game, player: number, intent: { x: number; z: number }, dt: number): void {
  const p = game.players[player]
  if (!canAct(game, p)) return
  let x = clamp(intent.x, -1, 1)
  let z = clamp(intent.z, -1, 1)
  const length = Math.hypot(x, z)
  if (length < 1e-6) return
  if (length > 1) {
    x /= length
    z /= length
  }
  const step = (p.carrying >= 0 ? BODY.carrying : BODY.speed) * Math.min(Math.max(dt, 0), 0.25)
  const at = slide(officeFor(game.seed), p, x * step, z * step, BODY.radius)
  p.x = at.x
  p.z = at.z
  carry(game, player)
}

/** The piece in somebody's arms goes where they go. */
function carry(game: Game, player: number): void {
  const p = game.players[player]
  const piece = p && p.carrying >= 0 ? game.pieces[p.carrying] : null
  if (!piece) return
  piece.x = p.x
  piece.z = p.z
}

/** Picks up one of their own loose pieces, if their arms are empty and it is in reach. */
export function pickUp(game: Game, player: number, piece: number = pieceInReach(game, player), reach: number = REACH.piece): boolean {
  const p = game.players[player]
  const it = game.pieces[piece]
  if (!canAct(game, p) || !it || p.carrying >= 0 || it.owner !== player || it.state !== LOOSE) return false
  if (Math.hypot(it.x - p.x, it.z - p.z) > reach + 1e-9) return false
  it.state = CARRIED
  p.carrying = piece
  carry(game, player)
  return true
}

/** Puts the piece in their arms on their desk, if they are at it. */
export function place(game: Game, player: number, reach: number = REACH.desk): boolean {
  const p = game.players[player]
  if (!canAct(game, p) || p.carrying < 0) return false
  if (distanceTo(deskOf(game, player).block, p) > reach + 1e-9) return false
  const it = game.pieces[p.carrying]
  it.state = PLACED
  const spot = deskSpot(game, p.carrying)
  it.x = spot.x
  it.z = spot.z
  p.carrying = -1
  return true
}

/** Where on its owner's desk a piece sits once it is there: one part to each quarter of the desk. */
export function deskSpot(game: Game, piece: number): Point {
  const it = game.pieces[piece]
  const block = deskOf(game, it.owner).block
  const w = block.x1 - block.x0
  return { x: block.x0 + (w * (it.part + 0.5)) / PIECES_EACH, z: (block.z0 + block.z1) / 2 }
}

/** Puts the piece in their arms down where they stand. */
export function drop(game: Game, player: number): boolean {
  const p = game.players[player]
  if (!p || p.carrying < 0 || game.over) return false
  const it = game.pieces[p.carrying]
  it.state = LOOSE
  it.x = p.x
  it.z = p.z
  p.carrying = -1
  return true
}

/**
 * The left click: put the piece in your arms on your desk if you are at it, or
 * pick up your nearest piece if your arms are empty. What happened, if anything.
 */
export function act(game: Game, player: number): 'pick' | 'place' | null {
  const p = game.players[player]
  if (!canAct(game, p)) return null
  if (p.carrying >= 0) return place(game, player) ? 'place' : null
  return pickUp(game, player) ? 'pick' : null
}

/** Seconds until a player can fire again. */
export function cooldownLeft(game: Game, p: Player): number {
  return Math.max(0, ROCKET.cooldown - (game.elapsed - p.firedAt))
}

export function canFire(game: Game, player: number): boolean {
  const p = game.players[player]
  return canAct(game, p) && isArmed(game, player) && cooldownLeft(game, p) <= 1e-9
}

/**
 * How far a rocket gets from `from` along `dir` before it touches something:
 * furniture, a wall, or anybody standing but the one who fired it - and who,
 * or -1 for nobody.
 */
export function rocketTouch(game: Game, by: number, from: Point, dir: Point, maxT: number): { t: number; hit: number } {
  let t = cast(officeFor(game.seed), from, dir, maxT, ROCKET.radius)
  let hit = -1
  const r = BODY.radius + ROCKET.radius
  game.players.forEach((p, index) => {
    if (index === by || !isStanding(p)) return
    const ox = from.x - p.x
    const oz = from.z - p.z
    const b = ox * dir.x + oz * dir.z
    const c = ox * ox + oz * oz - r * r
    const disc = b * b - c
    if (disc < 0) return
    const enter = Math.max(0, -b - Math.sqrt(disc))
    if (-b + Math.sqrt(disc) < 0 || enter > t) return
    t = enter
    hit = index
  })
  return { t, hit }
}

/** Keeps a rocket. Only the host numbers them. */
function launch(game: Game, by: number, from: Point, yaw: number, numbered: boolean): Rocket | Blast {
  const dir = aimDirection(yaw)
  const p = game.players[by]
  p.firedAt = game.elapsed
  // Out of the barrel first: anything nearer than the muzzle and it bursts right there.
  const { t } = rocketTouch(game, by, from, dir, ROCKET.muzzle)
  if (t < ROCKET.muzzle - 1e-9) {
    const at = { x: from.x + dir.x * t, z: from.z + dir.z * t }
    return numbered ? explode(game, by, at) : { seq: 0, by, x: at.x, z: at.z, victims: [], at: game.elapsed }
  }
  if (numbered) game.seq += 1
  const rocket: Rocket = { seq: numbered ? game.seq : 0, by, x: from.x + dir.x * ROCKET.muzzle, z: from.z + dir.z * ROCKET.muzzle, yaw: wrapAngle(yaw), left: ROCKET.range - ROCKET.muzzle, at: game.elapsed }
  game.rockets.push(rocket)
  return rocket
}

/**
 * A player pulls the trigger, where they stand and aim. Nothing if they cannot
 * fire yet. With `apply` - the host, or alone - the rocket is real; without - a
 * guest, drawing its own shot before the host has heard - it is only drawn.
 */
export function fire(game: Game, player: number, apply = true): Rocket | Blast | null {
  const p = game.players[player]
  if (!canFire(game, player)) return null
  return launch(game, player, { x: p.x, z: p.z }, p.yaw, apply)
}

/**
 * A rocket bursts at `at`. Everybody standing within the blast, with nothing
 * solid between them and it, is out - the one who fired it as well, if they are
 * that near. Everybody it catches goes at the same moment.
 */
export function explode(game: Game, by: number, at: Point): Blast {
  const office = officeFor(game.seed)
  const victims: number[] = []
  game.players.forEach((p, index) => {
    if (!isStanding(p)) return
    if (Math.hypot(p.x - at.x, p.z - at.z) > BLAST.radius) return
    if (!lineClear(office, at, p)) return
    victims.push(index)
  })
  for (const v of victims) eliminate(game, v, by)
  game.seq += 1
  const blast: Blast = { seq: game.seq, by, x: at.x, z: at.z, victims, at: game.elapsed }
  game.blasts.push(blast)
  return blast
}

/** Eliminates a standing player. Whatever was in their arms falls where they stood. */
export function eliminate(game: Game, player: number, by: number | null): boolean {
  const p = game.players[player]
  if (!p || !isStanding(p) || game.over) return false
  drop(game, player)
  p.out = round2(Math.max(0, clock(game)))
  p.by = by
  if (by !== null && by !== player && game.players[by]) game.players[by].kills += 1
  return true
}

/** Every rocket in the air flies on by `dt`, and bursts on whatever it touches. The host's, or alone. */
export function flyRockets(game: Game, dt: number): Blast[] {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const blasts: Blast[] = []
  const flying: Rocket[] = []
  for (const rocket of game.rockets) {
    const dir = aimDirection(rocket.yaw)
    const travel = Math.min(ROCKET.speed * step, rocket.left)
    const { t } = rocketTouch(game, rocket.by, rocket, dir, travel)
    if (t < travel - 1e-9 || rocket.left - travel <= 1e-9) {
      blasts.push(explode(game, rocket.by, { x: rocket.x + dir.x * t, z: rocket.z + dir.z * t }))
      continue
    }
    rocket.x += dir.x * travel
    rocket.z += dir.z * travel
    rocket.left -= travel
    flying.push(rocket)
  }
  game.rockets = flying
  return blasts
}

/**
 * Rockets on a guest's screen, between the host's word: they fly on, and stop
 * where they touch furniture or a wall, to wait for the host's blast.
 */
export function coastRockets(game: Game, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const office = officeFor(game.seed)
  for (const rocket of game.rockets) {
    if (rocket.stopped) continue
    const dir = aimDirection(rocket.yaw)
    const travel = Math.min(ROCKET.speed * step, rocket.left)
    const t = cast(office, rocket, dir, travel, ROCKET.radius)
    rocket.x += dir.x * t
    rocket.z += dir.z * t
    rocket.left -= t
    if (t < travel - 1e-9 || rocket.left <= 1e-9) rocket.stopped = true
  }
  // A guest's own, never heard back about, is let go of.
  game.rockets = game.rockets.filter((r) => r.seq > 0 || game.elapsed - r.at < 0.6)
}

/** A guest's shot, checked by the host: from where the guest says it stood, if that is near enough where the host has it. */
export interface FireClaim {
  x: number
  z: number
  yaw: number
}

export function claimFire(game: Game, player: number, c: FireClaim): Rocket | Blast | null {
  const p = game.players[player]
  if (!canAct(game, p) || !isArmed(game, player)) return null
  if (game.elapsed - p.firedAt < ROCKET.cooldown - CLAIM.early) return null
  const office = officeFor(game.seed)
  const stood = Math.hypot(c.x - p.x, c.z - p.z) <= CLAIM.reach ? collide(office, c, BODY.radius) : { x: p.x, z: p.z }
  p.yaw = wrapAngle(c.yaw)
  return launch(game, player, stood, c.yaw, true)
}

/** A guest picking up, putting down or placing, checked by the host with the same slack as its walk. */
export function claimAct(game: Game, player: number, kind: 'pick' | 'place' | 'drop', piece: number, at: Point): boolean {
  const p = game.players[player]
  if (!canAct(game, p)) return false
  if (Math.hypot(at.x - p.x, at.z - p.z) <= CLAIM.reach) {
    const to = collide(officeFor(game.seed), at, BODY.radius)
    p.x = to.x
    p.z = to.z
    carry(game, player)
  }
  if (kind === 'pick') return pickUp(game, player, piece, REACH.piece + CLAIM.reach)
  if (kind === 'place') return place(game, player, REACH.desk + CLAIM.reach)
  return drop(game, player)
}

/**
 * A guest says where it is and which way it aims. The host takes the position
 * only as far as the guest could have walked since it last heard, and not
 * through anything.
 */
export function report(game: Game, player: number, at: Point, yaw: number, since: number): void {
  const p = game.players[player]
  if (!canAct(game, p)) return
  aim(game, player, yaw)
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * BODY.speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(officeFor(game.seed), p, (dx / want) * go, (dz / want) * go, BODY.radius)
  p.x = to.x
  p.z = to.z
  carry(game, player)
}

/** The clock, and old blasts let go of - on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
  if (game.blasts.length > 0 && game.elapsed - game.blasts[0].at > BLAST_LIFE) {
    game.blasts = game.blasts.filter((b) => game.elapsed - b.at <= BLAST_LIFE)
  }
}

/** Whether the game is over: time is up, or one player or nobody is left standing. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const standing = game.players.filter(isStanding)
  if (clock(game) >= ROUND.limit || standing.length <= 1) game.over = true
  if (game.over) game.rockets = []
  return game.over
}

/** One step: the clock, the rockets, and the end - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  if (!game.over) flyRockets(game, dt)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. Whatever was in their arms falls where they stood. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  drop(game, player)
  if (p.out === null) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/**
 * Everybody, best first, with their place. Anybody still standing at the end
 * comes first - more than one only if time ran out, when those with more pieces
 * on their desk come before those with fewer. Then the eliminated, the last to
 * go first: a blast that takes two takes them at the same moment, and they share
 * a place. Then anybody who left standing, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player, index: number): [number, number] =>
    p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, -placedCount(game, index)]
  const keys = game.players.map((p, index) => key(p, index))
  const better = (a: number, b: number) => (keys[a][0] !== keys[b][0] ? keys[a][0] < keys[b][0] : keys[a][1] < keys[b][1] - 1e-9)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.index, b.index) ? -1 : better(b.index, a.index) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.index, entry.index)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const

/** The four parts, for the screen. */
export const PARTS = ['tube', 'grip', 'sight', 'rocket'] as const
