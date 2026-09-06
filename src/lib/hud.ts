/**
 * One HUD vocabulary for every game.
 *
 * Each game had grown its own banner scrim, its own countdown size, its own
 * cream, and its own name-tag weight, so moving between them felt like moving
 * between projects. Everything on-screen that is *chrome* rather than *world*
 * goes through here instead: same colours, same plate, same banner, same tag.
 *
 * World art still belongs to each game - this is only the layer on top of it.
 */
import { withAlpha } from './draw'
import { drawText, textWidth } from './text'

/** HUD ink, kept apart from the world palette because it sits over anything. */
export const HUD = {
  /** Primary readout text. */
  ink: '#fff6e2',
  /** Secondary/label text. */
  dim: '#d8cfbc',
  /** Something is running out. */
  warn: '#ffb04a',
  /** Something has gone wrong, or a life is about to be lost. */
  bad: '#e8703a',
  /** Plate behind a readout, over arbitrary artwork. */
  plate: 'rgba(28, 26, 22, 0.55)',
  /** Full-screen scrim behind a banner. */
  scrim: 'rgba(28, 26, 22, 0.62)',
  shadow: 'rgba(24, 20, 16, 0.75)',
} as const

/**
 * HUD text always carries a shadow. Canvas text sits over sky, water, walls
 * and whatever a player just built, so contrast can never be assumed - this
 * is the difference between a readable HUD and one that vanishes over a
 * bright patch.
 */
export function hudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number
    weight?: number
    color?: string
    align?: CanvasTextAlign
    tracking?: number
  } = {},
): void {
  drawText(ctx, text, x, y, opts.color ?? HUD.ink, {
    size: opts.size ?? 10,
    weight: opts.weight ?? 700,
    align: opts.align ?? 'left',
    tracking: opts.tracking,
    shadow: HUD.shadow,
  })
}

/** A rounded plate to sit a readout on, so it reads over any background. */
export function hudPlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: string; radius?: number; accent?: string } = {},
): void {
  const r = opts.radius ?? Math.min(6, h / 2)
  ctx.fillStyle = opts.fill ?? HUD.plate
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  if (opts.accent) {
    // A colour stripe along the top, for a plate that belongs to one player.
    ctx.fillStyle = opts.accent
    ctx.beginPath()
    ctx.roundRect(x, y, w, 2.5, [r, r, 0, 0])
    ctx.fill()
  }
}

/**
 * The name floating over a character. Every game with more than two players
 * on screen needs one, and they should all look the same.
 */
export function nameTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: { self?: boolean } = {},
): void {
  drawText(ctx, text, x, y, color, {
    size: opts.self ? 8.5 : 7.5,
    weight: 800,
    align: 'center',
    shadow: HUD.shadow,
  })
}

export interface BannerOpts {
  /** Small line above the title - "ROUND 3", "STAGE CLEAR". */
  kicker?: string
  title: string
  /** Small line below the title. */
  sub?: string
  /** 0-1; fades the whole card, for phase transitions. */
  alpha?: number
  /** Dims the whole screen behind the card. */
  scrim?: boolean
  /** Vertical centre; defaults to the middle of the view. */
  centerY?: number
  titleColor?: string
}

/**
 * The one banner every game shows for a countdown, a phase change or a
 * result. Fixed sizes and spacing so "STAGE CLEAR" in the shooting gallery
 * and "Round Results" in the platformer are visibly the same game's work.
 */
export function banner(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, o: BannerOpts): void {
  const a = o.alpha ?? 1
  if (a <= 0) return
  const cy = o.centerY ?? viewH / 2

  ctx.save()
  ctx.globalAlpha = a
  if (o.scrim !== false) {
    ctx.fillStyle = HUD.scrim
    ctx.fillRect(0, 0, viewW, viewH)
  }
  if (o.kicker) {
    hudText(ctx, o.kicker, viewW / 2, cy - 30, {
      size: 10,
      weight: 800,
      align: 'center',
      color: HUD.warn,
      tracking: 1.6,
    })
  }
  hudText(ctx, o.title, viewW / 2, cy - 14, {
    size: 26,
    weight: 800,
    align: 'center',
    color: o.titleColor ?? HUD.ink,
  })
  if (o.sub) {
    hudText(ctx, o.sub, viewW / 2, cy + 20, { size: 12, weight: 600, align: 'center', color: HUD.dim })
  }
  ctx.restore()
}

/** A big centred number for the last seconds of a countdown. */
export function countdown(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, text: string, alpha = 1): void {
  ctx.save()
  ctx.globalAlpha = alpha
  hudText(ctx, text, viewW / 2, viewH / 2 - 24, { size: 46, weight: 800, align: 'center' })
  ctx.restore()
}

/**
 * A timer readout on its own plate. `urgent` turns it amber, which is the
 * only signal several of these games give that time is nearly up.
 */
export function hudTimer(
  ctx: CanvasRenderingContext2D,
  label: string,
  seconds: number,
  x: number,
  y: number,
  urgent = false,
): void {
  const secs = Math.max(0, Math.ceil(seconds))
  const text = `${secs}`
  const w = Math.max(46, textWidth(ctx, label, { size: 9, weight: 700 }) + 16)
  hudPlate(ctx, x - w / 2, y, w, 30)
  hudText(ctx, label, x, y + 4, { size: 9, weight: 700, align: 'center', color: HUD.dim, tracking: 1.2 })
  hudText(ctx, text, x, y + 14, { size: 15, weight: 800, align: 'center', color: urgent ? HUD.warn : HUD.ink })
}

/** Fades a value in over `frames`, for banners that should not pop. */
export function fadeIn(elapsed: number, frames = 12): number {
  return Math.max(0, Math.min(1, elapsed / frames))
}

export { withAlpha }
