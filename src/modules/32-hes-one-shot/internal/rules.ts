/**
 * The rules of He's One Shot, as arithmetic.
 *
 * Everybody against everybody, in first person, with a gun that needs a second
 * and a half between shots. **One shot eliminates.** Being eliminated does not
 * take you out of it: you become a hunter - you still walk, and you still shoot
 * anybody who is left standing - but nobody can shoot you any more. The game
 * ends when one player is left standing, and they win. For the first two
 * seconds everybody is hidden and cannot be shot, so nobody is spawn-killed. At a
 * minute and a half, anybody still standing shares first.
 *
 * **A hunter hunts for whoever eliminated them.** They start hunting again beside
 * that player, and their shots pass straight through them - and through anybody
 * else on that side, hunters that player has made themselves - so the one who
 * eliminated you is safe from you and the rest of the arena is not. If that player
 * is eliminated in turn, they and everybody hunting for them now hunt for whoever
 * did it. See `crewOf`.
 *
 * **You can jump**, a little: nearly a metre, with your eyes still under the top
 * of the cover, so nobody shoots over it. A body in the air is a body in the air:
 * a shot under it misses, and it shoots from higher up.
 *
 * **A shield power-up** appears in a few places round the arena. Walk through one
 * and you are shielded: the next shot that hits you breaks the shield and does
 * nothing else. See `collect`.
 *
 * A shot is instant and straight: from your eyes, the way you look, until it
 * meets a body, a box or the floor. Cover is taller than anybody's eyes, so
 * there is no shooting over it. A body is the island's capsule: a standing
 * cylinder, `BODY.radius` round and `BODY.height` tall.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { arenaFor, collide, rayHit, respawnSpot, slab, slide, spawnPoint, type Point, type Vec3 } from './arena'

export const BODY = {
  radius: PLAYER.radius,
  height: PLAYER.height,
  eye: PLAYER.eyeHeight,
  /** Metres a second: a jog, not the island's sprint. */
  speed: 5.2,
} as const

/**
 * Jumping: straight up at `speed` metres a second under `gravity`, so a jump goes
 * about `speed² / 2 gravity` = 0.9 m high (0.85 at sixty frames a second) and takes
 * about 0.6 s. `max` is a little over that, for what a guest may claim to be at.
 * Eyes at 1.7 m and a jump of 0.95 is 2.65 m: under the 2.8 m cover.
 */
export const JUMP = { speed: 6, gravity: 20, max: 0.95 } as const

/** A shield power-up: how close you have to walk to it, and how long it is gone once taken, seconds. */
export const PICKUP = { reach: 1.1, respawn: 20 } as const

/**
 * A player's shield has a cooldown: **once one has broken, they cannot pick up
 * another for this many seconds**, however many are lying about. It is the host's
 * to enforce, and the player's own HUD counts it down.
 */
export const SHIELD = { cooldown: 10 } as const

export const GUN = {
  /** Seconds between shots. */
  cooldown: 1.5,
  /** How far a shot reaches: further than the arena is across. */
  range: 60,
} as const

export const ROUND = {
  /**
   * Seconds of count before the round. None: the minigame screen's shared three-two-one runs before the game is
   * let go, so a count of its own would be a second one.
   */
  countdown: 0,
  /** Seconds from the start to the end, a minute and a half: a bigger arena takes longer to cross. */
  limit: 90,
  /**
   * Seconds from the start that everybody is hidden and cannot be shot, so
   * nobody is picked off from where they spawned before they can move.
   */
  guard: 2,
} as const

/** How far up or down anybody can look, radians. */
export const PITCH_LIMIT = 1.35

/**
 * How much the host gives a guest's shot, which the guest judged on its own
 * screen a moment ago: how far the shooter may be from where the host has them,
 * how far the shot may pass from where the host has its target, and how early
 * after the last shot it may arrive.
 */
export const CLAIM = { reach: 1.5, slack: 0.9, early: 0.3 } as const

/**
 * How far back the host looks for where a shooter saw somebody, seconds.
 *
 * **A guest aims at what its screen shows, and its screen is behind the host**:
 * by however long the last snapshot took to arrive, plus the wait for the next
 * one. Somebody running flat out covers half a metre in a tenth of a second, so
 * checking a guest's shot against where the host has the victim *now* throws
 * away hits that were dead on when they were taken - the shot that "went
 * straight through them".
 *
 * So the host keeps a short trail of where everybody has been and lets a hit
 * count against any of it. Long enough to cover a bad connection, short enough
 * that nobody is shot after properly getting behind a wall: a trail step is
 * only taken where somebody actually stood, and every step is checked for
 * something solid in the way just as the live position is.
 */
export const REWIND = 0.45

/** Where somebody was, and when: a step of the trail the host keeps of everybody. */
export interface Step {
  at: number
  x: number
  z: number
  /** How high off the floor their feet were. */
  y: number
}

/** How long a shot is kept, seconds, for drawing and for the wire. */
export const SHOT_LIFE = 1

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** How high their feet are off the floor: 0 on it, up to `JUMP.max` in a jump. */
  y: number
  /** How fast they are going up, metres a second. Only the one whose jump it is knows it. */
  vy: number
  /** Radians. Looking along (-sin yaw, -cos yaw): 0 looks north, -Z. */
  yaw: number
  /** Radians, up positive. */
  pitch: number
  /** When they were eliminated, seconds since the start, or null while standing. */
  out: number | null
  /** Who eliminated them, by index, or null. */
  by: number | null
  kills: number
  /** Whether the next hit on them is absorbed. */
  shield: boolean
  /** When they can pick up a shield again, in `elapsed`: 0 until one has broken on them. The host's; not sent. */
  shieldReadyAt: number
  /** How many times they have been moved to a new spot by being eliminated. Only ever counted where it is looked at: not sent. */
  respawns: number
  /** When they last shot, in `elapsed`. */
  shotAt: number
  /** Where they have been lately, newest last. The host's own record; never sent. */
  trail: Step[]
  left: boolean
  /** When they left, seconds since the start, if they left standing. */
  leftAt: number | null
}

export interface Shot {
  /** The host's count, for telling shots apart on the wire. */
  seq: number
  by: number
  from: Vec3
  to: Vec3
  /** Who it hit, by index, or -1. If they had a shield, it broke it and eliminated nobody. */
  hit: number
  /** When, in `elapsed`. */
  at: number
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt, countdown included. */
  elapsed: number
  over: boolean
  players: Player[]
  shots: Shot[]
  /** The last shot number handed out, or - on a guest - heard from the host. */
  seq: number
  /**
   * When each of the arena's shield spots has a shield again, in `elapsed`: 0 for
   * one that is there now. On a guest, 0 for there and Infinity for gone, from the
   * host's word - which is all a guest needs to know about it.
   */
  pickups: number[]
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

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    shots: [],
    seq: 0,
    pickups: arenaFor(seed).pickups.map(() => 0),
    players: entrants.map((e, index) => {
      const at = spawnPoint(seed, entrants.length, index)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        y: 0,
        vy: 0,
        yaw: at.yaw,
        pitch: 0,
        out: null,
        by: null,
        kills: 0,
        shield: false,
        shieldReadyAt: 0,
        respawns: 0,
        shotAt: -GUN.cooldown,
        trail: [],
        left: false,
        leftAt: null,
      }
    }),
  }
}

/** Seconds since the start; negative during the countdown. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** Still standing: can be shot. */
export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

/** Whether the spawn guard is still up: everybody hidden, and nobody can be shot. */
export function guarded(game: Game): boolean {
  return clock(game) < ROUND.guard
}

/** Standing, and past the spawn guard: can be shot just now. */
export function isTarget(game: Game, p: Player): boolean {
  return isStanding(p) && !guarded(game)
}

/** Eliminated, and still here hunting. */
export function isHunter(p: Player): boolean {
  return p.out !== null && !p.left
}

/**
 * Who a player is on the side of: themselves, if they are standing; if they are
 * hunting, whoever eliminated them - or, if that player has been eliminated in
 * turn, whoever eliminated them, and so on to somebody standing. Null for a
 * hunter with nobody to hunt for: the one they hunted for left, or - in a crossfire
 * that eliminated both - each was the other's.
 */
export function crewOf(game: Game, index: number): number | null {
  const seen = new Set<number>()
  let at = index
  for (;;) {
    const p = game.players[at]
    if (!p) return null
    if (p.out === null) return p.left ? null : at
    if (seen.has(at) || p.by === null) return null
    seen.add(at)
    at = p.by
  }
}

/** Whether two players are on the same side, and so cannot hurt each other. Nobody is on their own side against anybody but themselves. */
export function allied(game: Game, a: number, b: number): boolean {
  const ca = crewOf(game, a)
  return ca !== null && ca === crewOf(game, b)
}

/** Whether a player can move and shoot just now - standing or hunting. */
export function canAct(game: Game, p: Player): boolean {
  return !game.over && clock(game) >= 0 && !p.left
}

/** The way a player looks, as a unit vector. The same as a camera turned `YXZ` by (pitch, yaw). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** Where a player's eyes are: at the height of their feet, and a body's eye height up from there. */
export function eyeOf(p: Point & { y?: number }): Vec3 {
  return { x: p.x, y: BODY.eye + (p.y ?? 0), z: p.z }
}

/** Turns a player to look this way. */
export function look(game: Game, player: number, yaw: number, pitch: number): void {
  const p = game.players[player]
  if (!p || p.left) return
  p.yaw = wrapAngle(yaw)
  p.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
}

/**
 * Moves a player for `dt` seconds: `forward` and `right` are each -1 to 1, the
 * way the keys are held, relative to where they look, and diagonals are no
 * faster; `jump` is whether the jump key is held, which takes them up if they are
 * on the floor - held, they jump again as they land. Up is the same for
 * everybody: `JUMP.speed`, and gravity.
 */
export function walk(game: Game, player: number, intent: { forward: number; right: number; jump?: boolean }, dt: number): void {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  // Up and down.
  if (intent.jump && p.y <= 1e-9 && p.vy <= 0) p.vy = JUMP.speed
  if (p.y > 0 || p.vy > 0) {
    // Gravity first, then the move: the jump peaks a little under `speed² / 2 gravity`, never over it.
    p.vy -= JUMP.gravity * step
    p.y = Math.max(0, p.y + p.vy * step)
    // Down, to the nearest nanometre: what is left of a landing is not a body in the air.
    if (p.y <= 1e-9) {
      p.y = 0
      p.vy = 0
    }
  }
  // Along the floor.
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) return
  if (length > 1) {
    f /= length
    r /= length
  }
  const pace = BODY.speed * step
  // Forward is where they look, flat; right is a quarter turn clockwise from it, seen from above.
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  const at = slide(arenaFor(game.seed), p, (fx * f + rx * r) * pace, (fz * f + rz * r) * pace, BODY.radius)
  p.x = at.x
  p.z = at.z
}

/** Seconds until a player can shoot again. */
export function cooldownLeft(game: Game, p: Player): number {
  return Math.max(0, GUN.cooldown - (game.elapsed - p.shotAt))
}

export function canShoot(game: Game, p: Player): boolean {
  return canAct(game, p) && cooldownLeft(game, p) <= 1e-9
}

/**
 * How far along a ray it meets a standing body at `p` - a cylinder on the floor -
 * or null if it misses, or meets it only past `maxT`.
 */
export function bodyHit(from: Vec3, dir: Vec3, p: Point & { y?: number }, maxT: number): number | null {
  const ox = from.x - p.x
  const oz = from.z - p.z
  const r = BODY.radius
  const a = dir.x * dir.x + dir.z * dir.z
  let t0 = -Infinity
  let t1 = Infinity
  if (a < 1e-12) {
    if (ox * ox + oz * oz > r * r) return null
  } else {
    const b = ox * dir.x + oz * dir.z
    const c = ox * ox + oz * oz - r * r
    const disc = b * b - a * c
    if (disc < 0) return null
    const s = Math.sqrt(disc)
    t0 = (-b - s) / a
    t1 = (-b + s) / a
  }
  // A cylinder stood on the floor - or on the air, in a jump: a shot under it misses.
  const feet = p.y ?? 0
  const ys = slab(from.y, dir.y, feet, feet + BODY.height)
  if (!ys) return null
  const enter = Math.max(t0, ys[0], 0)
  const exit = Math.min(t1, ys[1], maxT)
  return enter <= exit ? enter : null
}

/** Where a shot from `from` along `dir` ends, and who it meets first: -1 for nobody. */
export function trace(game: Game, shooter: number, from: Vec3, dir: Vec3): { t: number; hit: number } {
  let t = rayHit(arenaFor(game.seed), from, dir, GUN.range)
  let hit = -1
  game.players.forEach((p, index) => {
    // Nobody can shoot somebody on their own side: a shot goes on through them.
    if (index === shooter || !isTarget(game, p) || allied(game, shooter, index)) return
    const at = bodyHit(from, dir, p, t)
    if (at !== null && (hit < 0 || at < t)) {
      t = at
      hit = index
    }
  })
  return { t, hit }
}

const along = (from: Vec3, dir: Vec3, t: number): Vec3 => ({ x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t })

/** Keeps a shot. Only the host numbers them: a guest's own, drawn before the host has heard, is 0. */
function record(game: Game, by: number, from: Vec3, to: Vec3, hit: number, numbered = true): Shot {
  if (numbered) game.seq += 1
  const shot: Shot = { seq: numbered ? game.seq : 0, by, from, to, hit, at: game.elapsed }
  game.shots.push(shot)
  return shot
}

/**
 * Eliminates a standing player - unless they have a shield, in which case the
 * shield breaks and that is all. Their place is fixed by when. **They start
 * hunting again beside whoever eliminated them**, looking the way that player
 * looks, and hunt for them from then on (see `crewOf`). Returns whether they were
 * eliminated.
 */
export function eliminate(game: Game, player: number, by: number | null): boolean {
  const p = game.players[player]
  if (!p || !isStanding(p) || game.over) return false
  if (p.shield) {
    p.shield = false
    // Spent: no other until the cooldown is over.
    p.shieldReadyAt = game.elapsed + SHIELD.cooldown
    return false
  }
  p.out = round2(Math.max(0, clock(game)))
  p.by = by
  const killer = by !== null ? game.players[by] : undefined
  if (killer) {
    killer.kills += 1
    const at = respawnSpot(arenaFor(game.seed), killer)
    p.x = at.x
    p.z = at.z
    p.yaw = at.yaw
  }
  p.y = 0
  p.vy = 0
  p.pitch = 0
  p.trail = []
  p.respawns += 1
  return true
}

/**
 * A player pulls the trigger, where they stand and look. Nothing if they cannot
 * shoot yet. With `apply` - the host, or alone - whoever it meets is eliminated;
 * without - a guest, judging its own shot - it only says who that would be.
 */
export function fire(game: Game, player: number, apply = true): Shot | null {
  const p = game.players[player]
  if (!p || !canShoot(game, p)) return null
  const from = eyeOf(p)
  const dir = aimDirection(p.yaw, p.pitch)
  const { t, hit } = trace(game, player, from, dir)
  p.shotAt = game.elapsed
  const shot = record(game, player, from, along(from, dir, t), hit, apply)
  if (apply && hit >= 0) eliminate(game, hit, player)
  return shot
}

export interface Claim {
  x: number
  z: number
  /** How high off the floor the guest's feet were. Absent is on it. */
  y?: number
  yaw: number
  pitch: number
  /** Who the guest's own screen saw the shot meet, or null for nobody. */
  victim: string | null
}

/**
 * A guest's shot, as its own screen judged it, checked by the host.
 *
 * The shot is taken from where the guest says it stood, if that is near where
 * the host has it, and otherwise from where the host has it. A hit counts if the
 * shot passes near enough where the host has the victim - a guest sees
 * everybody a moment late - with nothing solid in between, and the victim is
 * still standing. A shot sooner after the last than the gun allows, give or take
 * the wire, is not a shot. The host never finds a hit the guest did not see.
 */
export function claim(game: Game, player: number, c: Claim): Shot | null {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return null
  if (game.elapsed - p.shotAt < GUN.cooldown - CLAIM.early) return null
  const arena = arenaFor(game.seed)
  const stood = Math.hypot(c.x - p.x, c.z - p.z) <= CLAIM.reach ? collide(arena, { x: c.x, z: c.z }, BODY.radius) : p
  // As high as a jump goes and no higher, whatever the guest says.
  const from = eyeOf({ x: stood.x, z: stood.z, y: clamp(Number.isFinite(c.y) ? (c.y as number) : p.y, 0, JUMP.max) })
  const dir = aimDirection(c.yaw, clamp(c.pitch, -PITCH_LIMIT, PITCH_LIMIT))
  p.shotAt = game.elapsed
  let t = rayHit(arena, from, dir, GUN.range)
  let hit = -1
  const victim = c.victim === null ? -1 : game.players.findIndex((q) => q.id === c.victim)
  const q = game.players[victim]
  if (q && victim !== player && isTarget(game, q) && !allied(game, player, victim)) {
    // Where the victim is now, and where they have been since the shooter's
    // screen was last told - the shot counts against whichever it lines up with
    // best. Nothing is taken on trust: every one of them is a place the victim
    // really stood, and the shot still has to reach it with nothing in the way.
    const wheres: { x: number; z: number; y: number }[] = [q, ...q.trail.filter((step) => game.elapsed - step.at <= REWIND)]
    const flat = dir.x * dir.x + dir.z * dir.z
    let best: { t: number; off: number } | null = null
    for (const where of wheres) {
      const tq = flat < 1e-9 ? 0 : ((where.x - from.x) * dir.x + (where.z - from.z) * dir.z) / flat
      const passes = along(from, dir, tq)
      const off = Math.hypot(passes.x - where.x, passes.z - where.z)
      if (tq <= 0 || tq > t + BODY.radius) continue
      if (off > BODY.radius + CLAIM.slack || passes.y < where.y - CLAIM.slack || passes.y > where.y + BODY.height + CLAIM.slack) continue
      if (!best || off < best.off) best = { t: tq, off }
    }
    if (best) {
      t = Math.min(best.t, t)
      hit = victim
    }
  }
  const shot = record(game, player, from, along(from, dir, t), hit)
  if (hit >= 0) eliminate(game, hit, player)
  return shot
}

/**
 * The host notes where everybody is, for `claim` to look back over.
 *
 * Called as often as the host sends - about fifteen times a second - which is
 * a step every third of a metre at a run, close enough together that a shot
 * lines up with one of them.
 */
export function remember(game: Game): void {
  for (const p of game.players) {
    const last = p.trail[p.trail.length - 1]
    // A step only where there is not one already, but the old ones go whether
    // or not a new one is taken - a trail is never older than the rewind.
    if (!last || game.elapsed - last.at >= 0.03) p.trail.push({ at: game.elapsed, x: p.x, z: p.z, y: p.y })
    while (p.trail.length > 0 && game.elapsed - p.trail[0].at > REWIND) p.trail.shift()
  }
}

/**
 * A guest says where it is and which way it looks. The host takes the position
 * as far as the guest could have walked since it last heard - with some slack -
 * and not through anything.
 */
export function report(game: Game, player: number, at: Point, yaw: number, pitch: number, since: number, y = 0): void {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return
  look(game, player, yaw, pitch)
  // A guest jumps on its own screen and says how high it is: taken, up to as high as a jump goes.
  p.y = clamp(Number.isFinite(y) ? y : 0, 0, JUMP.max)
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * BODY.speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(arenaFor(game.seed), p, (dx / want) * go, (dz / want) * go, BODY.radius)
  p.x = to.x
  p.z = to.z
}

/** The clock, and old shots let go of - on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
  if (game.shots.length > 0 && game.elapsed - game.shots[0].at > SHOT_LIFE) {
    game.shots = game.shots.filter((s) => game.elapsed - s.at <= SHOT_LIFE)
  }
}

/**
 * Whether the game is over: time is up, one player or nobody is left standing,
 * or there is nobody left to shoot the last one standing. Only the host decides.
 */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const here = game.players.filter((p) => !p.left)
  const standing = here.filter((p) => p.out === null)
  if (clock(game) >= ROUND.limit || standing.length <= 1 || here.length <= 1) game.over = true
  return game.over
}

/** Seconds until a player can pick up a shield again, or 0: the cooldown after one broke on them. */
export function shieldCooldown(game: Pick<Game, 'elapsed'>, p: Pick<Player, 'shieldReadyAt'>): number {
  return Math.max(0, p.shieldReadyAt - game.elapsed)
}

/** Whether the shield at spot `k` is there to be taken. */
export function pickupReady(game: Game, k: number): boolean {
  return game.elapsed >= (game.pickups[k] ?? Infinity)
}

/**
 * Shields are picked up by walking through them: anybody standing, without one
 * already and not cooling down from one that broke (`SHIELD.cooldown`), within
 * `PICKUP.reach` of a spot that has one, takes it - and the spot is
 * empty for `PICKUP.respawn` seconds. In player order, so two on the same spot at
 * the same moment have it come out the same way everywhere. Only the host, or alone.
 */
export function collect(game: Game): void {
  if (game.over) return
  const spots = arenaFor(game.seed).pickups
  game.players.forEach((p) => {
    if (!isStanding(p) || !canAct(game, p) || p.shield || shieldCooldown(game, p) > 0) return
    spots.forEach((at, k) => {
      if (p.shield || !pickupReady(game, k) || Math.hypot(p.x - at.x, p.z - at.z) > PICKUP.reach) return
      p.shield = true
      game.pickups[k] = game.elapsed + PICKUP.respawn
    })
  })
}

/** One step of the clock, shields picked up, and the end - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  collect(game)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.out === null) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/**
 * Everybody, best first, with their place: anybody still standing at the end
 * shares first; then the eliminated, the last to go first; then anybody who left
 * while still standing, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, 0])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1] - 1e-9
  }
  const same = (a: Player, b: Player) => !better(a, b) && !better(b, a)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (same(a.player, b.player) ? a.index - b.index : better(a.player, b.player) ? -1 : 1))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => better(other.player, entry.player)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
