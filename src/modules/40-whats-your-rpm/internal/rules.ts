/**
 * The rules of What's Your RPM?, as arithmetic.
 *
 * A race down a feed. Everybody has the same mini phone with the same sixty
 * reels on it, and scrolls - mouse wheel, as fast as they can - to get to the
 * end. Every so often an ad takes over the screen and the feed stops dead
 * until you click its **Skip Ad** button, which turns up somewhere different
 * each time and gets smaller as the feed goes on.
 *
 * The first to the end of the feed wins, and that ends it. Otherwise it ends
 * at the time limit, or once everybody has finished or gone. Places go by who
 * finished, soonest first, then by how far down the feed everybody else got.
 *
 * Everything here is pure. The ads come from the seed, which everybody has.
 */
import { createRng, hashSeed } from '../../00-core'

export const FEED = {
  /** Reels in the feed. The end of the last one is the finish. */
  reels: 60,
  /** Seconds the whole game may run. */
  limit: 120,
  /** Wheel pixels to a reel. A notch of a mouse wheel is about 100, so three notches a reel. */
  reelPx: 300,
  /** The most one wheel event may count for, in pixels - a page-at-a-time wheel is not a shortcut. */
  eventPx: 240,
  /** The fastest the feed moves, in reels a second. Sixty a minute times six: 360 rpm. */
  maxRate: 6,
  /** How far ahead of the screen scrolling may queue, in reels. Past it, the wheel is spinning for nothing. */
  queueMax: 1.5,
} as const

export const ADS = {
  /** The most ads in a feed. */
  most: 12,
  /** The first comes this many reels in. */
  first: 3,
  /** And after that, every this many reels, least and most. */
  gap: [3, 6] as readonly [number, number],
  /** The skip button's size, first ad to last - it shrinks as the feed goes on. */
  size: [1, 0.55] as readonly [number, number],
} as const

/**
 * One ad: the reel it is waiting at the top of, and where its skip button is
 * on the phone's screen - `x` and `y` are its middle, 0 to 1 across and down -
 * and how big it is, 1 being full size.
 */
export interface Ad {
  reel: number
  x: number
  y: number
  size: number
}

/** The ads in a feed, from its seed. Everybody's feed has the same ones. */
export function planAds(seed: number): Ad[] {
  const random = createRng(hashSeed(seed, 'whats-your-rpm:ads'))
  const ads: Ad[] = []
  let reel = ADS.first
  while (ads.length < ADS.most && reel < FEED.reels - 1) {
    const k = ads.length / Math.max(1, ADS.most - 1)
    ads.push({
      reel,
      x: round(0.16 + random() * 0.68),
      y: round(0.14 + random() * 0.72),
      size: round(ADS.size[0] + (ADS.size[1] - ADS.size[0]) * k),
    })
    reel += ADS.gap[0] + Math.floor(random() * (ADS.gap[1] - ADS.gap[0] + 1))
  }
  return ads
}

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** How far down the feed, in reels, 0 to `FEED.reels`. Everybody can see it. */
  progress: number
  /** Ads skipped. The next one is `ads[skipped]`. */
  skipped: number
  /** Seconds in when the ad in the way went up, or null when none is. */
  blockedAt: number | null
  /** Seconds in when this player got to the end, or null. */
  finishedAt: number | null
  left: boolean
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the start. */
  clock: number
  over: boolean
  ads: Ad[]
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    clock: 0,
    over: entrants.length === 0,
    ads: planAds(seed),
    players: entrants.map((e) => newPlayer(e.id, e.mine ?? false, e.bot ?? false)),
  }
}

export function newPlayer(id: string, mine = false, bot = false): Player {
  return { id, mine, bot, progress: 0, skipped: 0, blockedAt: null, finishedAt: null, left: false }
}

/** The ad a player has still to get past, or null when there are none left. */
export function nextAd(game: Pick<Game, 'ads'>, player: Pick<Player, 'skipped'>): Ad | null {
  return game.ads[player.skipped] ?? null
}

/** How far a player may scroll before something stops them: the next ad, or the end. */
export function capOf(game: Pick<Game, 'ads'>, player: Pick<Player, 'skipped'>): number {
  return nextAd(game, player)?.reel ?? FEED.reels
}

/** Whether an ad is up on a player's phone, stopping them. */
export function blocked(game: Pick<Game, 'ads'>, player: Pick<Player, 'skipped' | 'progress'>): boolean {
  const ad = nextAd(game, player)
  return !!ad && player.progress >= ad.reel
}

/** Whether a player has got to the end. */
export function finished(player: Pick<Player, 'progress'>): boolean {
  return player.progress >= FEED.reels
}

/** Seconds left in the game. */
export function timeLeft(game: Pick<Game, 'clock'>): number {
  return Math.max(0, FEED.limit - game.clock)
}

/**
 * A player scrolls `reels` further down. It stops at the next ad - which goes
 * up there - and at the end, which is a finish. On the host the first finish
 * ends the game; a guest passes `ends: false` and waits to hear it. Says how
 * far it really moved.
 */
export function scroll(game: Game, player: number, reels: number, ends = true): number {
  const p = game.players[player]
  if (!p || p.left || game.over || !Number.isFinite(reels) || reels <= 0 || finished(p)) return 0
  const cap = capOf(game, p)
  const from = p.progress
  p.progress = Math.min(cap, from + reels)
  if (p.progress >= cap) {
    if (cap >= FEED.reels) {
      p.finishedAt ??= round(game.clock)
      if (ends) game.over = true
    } else {
      p.blockedAt ??= round(game.clock)
    }
  }
  return p.progress - from
}

/** A player clicks the skip button on ad `index`. Only the one in their way, and only while it is up. */
export function skipAd(game: Game, player: number, index: number): boolean {
  const p = game.players[player]
  if (!p || p.left || game.over || index !== p.skipped || !blocked(game, p)) return false
  p.skipped += 1
  p.blockedAt = null
  return true
}

/**
 * What a guest says of itself - how far it has got, and how many ads it has
 * skipped - put into the host's copy. Neither ever goes backwards, and the
 * progress still stops at an ad nobody has said was skipped.
 */
export function report(game: Game, player: number, progress: number, skipped: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over || !Number.isFinite(progress) || !Number.isInteger(skipped)) return
  const next = Math.min(Math.max(skipped, 0), game.ads.length)
  if (next > p.skipped) {
    p.skipped = next
    p.blockedAt = null
  }
  if (progress > p.progress) scroll(game, player, progress - p.progress)
}

/** A player who has left the lobby is not waited for. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (p) p.left = true
}

/** One step: the clock, and the end - somebody finished (see `scroll`), everybody done or gone, or the limit. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  game.clock = Math.min(FEED.limit, game.clock + Math.min(Math.max(dt, 0), 0.25))
  const everybody = game.players.every((p) => p.left || finished(p))
  if (everybody || game.clock >= FEED.limit) game.over = true
  return game
}

/** Everybody, best first: finished soonest, then furthest down the feed. Level shares a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const at = (p: Player) => p.finishedAt ?? Infinity
  // Two who never finished are Infinity apart, which is NaN, which is falsy: on to progress.
  const better = (a: Player, b: Player) => at(a) - at(b) || b.progress - a.progress
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => better(a.player, b.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => better(other.player, entry.player) < 0).length,
  }))
}

/**
 * Your own wheel, between the event and the feed.
 *
 * A wheel event queues reels; each frame drains them onto the feed no faster
 * than `FEED.maxRate`. So the feed moves smoothly however lumpy the wheel is,
 * and a free-spinning wheel tops out rather than teleporting - past
 * `FEED.queueMax` queued, the rest is thrown away.
 */
export interface Wheel {
  queued: number
}

export function newWheel(): Wheel {
  return { queued: 0 }
}

/** A wheel event's `deltaY` and `deltaMode`, in reels. Only down counts: the feed does not go back. */
export function wheelReels(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0
  const px = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY
  return Math.min(px, FEED.eventPx) / FEED.reelPx
}

export function queueWheel(wheel: Wheel, reels: number): Wheel {
  if (Number.isFinite(reels) && reels > 0) wheel.queued = Math.min(FEED.queueMax, wheel.queued + reels)
  return wheel
}

/** A frame's worth of the queue: how many reels to scroll now. */
export function drainWheel(wheel: Wheel, dt: number): number {
  const step = Math.min(wheel.queued, FEED.maxRate * Math.min(Math.max(dt, 0), 0.25))
  wheel.queued -= step
  return step
}

/** Throw away what is queued - an ad has gone up, and scrolling at it does nothing. */
export function clearWheel(wheel: Wheel): Wheel {
  wheel.queued = 0
  return wheel
}

/** Reels a minute, from how far you have got at moments over the last little while. */
export function rpm(samples: readonly { at: number; progress: number }[], window = 1.5): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const first = samples.find((s) => last.at - s.at <= window) ?? samples[0]
  const seconds = last.at - first.at
  if (seconds <= 0) return 0
  return Math.max(0, ((last.progress - first.progress) / seconds) * 60)
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const

function round(n: number): number {
  return Math.round(n * 100) / 100
}
