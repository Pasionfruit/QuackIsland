/**
 * In-canvas text. The app uses a soft rounded sans everywhere, so the HUD and
 * banners do too - no bitmap font, no pixel snapping.
 */

export const UI_FONT = "'Quicksand', 'Nunito', 'Trebuchet MS', system-ui, sans-serif"

export interface TextOpts {
  size?: number
  weight?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** Soft drop shadow colour. */
  shadow?: string
  shadowOffset?: number
  /** Extra letter spacing in world units. */
  tracking?: number
}

export function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 600): void {
  ctx.font = `${weight} ${size}px ${UI_FONT}`
}

export function textWidth(ctx: CanvasRenderingContext2D, text: string, opts: TextOpts = {}): number {
  setFont(ctx, opts.size ?? 10, opts.weight ?? 600)
  return ctx.measureText(text).width
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: TextOpts = {},
): void {
  const size = opts.size ?? 10
  setFont(ctx, size, opts.weight ?? 600)
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = opts.baseline ?? 'top'

  const tracking = opts.tracking ?? 0
  const paint = (col: string, dx: number, dy: number) => {
    ctx.fillStyle = col
    if (!tracking) {
      ctx.fillText(text, x + dx, y + dy)
      return
    }
    // Manual tracking: lay out glyph by glyph.
    const total = ctx.measureText(text).width + tracking * (text.length - 1)
    let cx = x + dx
    if (ctx.textAlign === 'center') cx -= total / 2
    else if (ctx.textAlign === 'right') cx -= total
    const prev = ctx.textAlign
    ctx.textAlign = 'left'
    for (const ch of text) {
      ctx.fillText(ch, cx, y + dy)
      cx += ctx.measureText(ch).width + tracking
    }
    ctx.textAlign = prev
  }

  if (opts.shadow) paint(opts.shadow, opts.shadowOffset ?? size * 0.09, opts.shadowOffset ?? size * 0.12)
  paint(color, 0, 0)
}
