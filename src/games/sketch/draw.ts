/**
 * The one drawing surface all three Sketch modes share.
 *
 * A stroke is a list of points normalised to 0..1 - not canvas pixels - so it
 * looks identical on every peer's canvas regardless of window size. The relay
 * already broadcasts a sender's message to everyone else in the room, so a
 * stroke goes straight from the person drawing to every viewer with the host
 * only in the loop as one more viewer, not a relay stop.
 */

export type Pt = [number, number]

export interface Stroke {
  id: number
  owner: number
  color: string
  width: number
  points: Pt[]
  /** False while still being drawn; a live stroke is redrawn every point. */
  done: boolean
}

export const PALETTE = [
  '#2b2622',
  '#f6f2e6',
  '#d9534f',
  '#e8a33c',
  '#e8c05f',
  '#7fb069',
  '#4f8fbf',
  '#7a4f8c',
  '#c85f96',
  '#8a5a3a',
]

export const BRUSH_SIZES = [2, 4, 8, 16]

/** Renders every stroke onto a canvas sized `w` x `h` CSS pixels. */
export function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number): void {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fbf8f0'
  ctx.fillRect(0, 0, w, h)
  for (const s of strokes) drawStroke(ctx, s, w, h)
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number): void {
  if (s.points.length === 0) return
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.points.length === 1) {
    // A tap with no drag: draw a dot, or the point is otherwise invisible.
    const [x, y] = s.points[0]
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(x * w, y * h, s.width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(s.points[0][0] * w, s.points[0][1] * h)
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * w, s.points[i][1] * h)
  ctx.stroke()
}

/**
 * Captures local pointer input into strokes and reports new points as they
 * happen, batched a little rather than one network message per pixel.
 */
export class LocalDrawer {
  strokes: Stroke[] = []
  private active: Stroke | null = null
  private pending: Pt[] = []
  private nextId: number
  private owner: number
  private onFlush: (chunk: { id: number; color: string; width: number; pts: Pt[]; done: boolean }) => void
  private onChange: () => void

  constructor(
    owner: number,
    onFlush: LocalDrawer['onFlush'],
    onChange: () => void = () => {},
  ) {
    this.owner = owner
    this.onFlush = onFlush
    this.onChange = onChange
    this.nextId = owner * 1_000_000 + 1
  }

  get drawing(): boolean {
    return this.active !== null
  }

  begin(color: string, width: number, pt: Pt): void {
    const s: Stroke = { id: this.nextId++, owner: this.owner, color, width, points: [pt], done: false }
    this.active = s
    this.strokes.push(s)
    this.pending = [pt]
    this.onChange()
  }

  extend(pt: Pt): void {
    if (!this.active) return
    this.active.points.push(pt)
    this.pending.push(pt)
    this.onChange()
    if (this.pending.length >= 6) this.flush(false)
  }

  end(): void {
    if (!this.active) return
    this.flush(true)
    this.active = null
  }

  private flush(done: boolean): void {
    if (!this.active) return
    if (this.pending.length === 0 && !done) return
    this.onFlush({ id: this.active.id, color: this.active.color, width: this.active.width, pts: this.pending, done })
    this.pending = []
  }

  clear(): void {
    this.strokes = []
    this.active = null
    this.pending = []
    this.onChange()
  }

  /** Merges a remote chunk into (or as) the stroke it belongs to. */
  applyRemote(from: number, chunk: { id: number; color: string; width: number; pts: Pt[]; done: boolean }): void {
    let s = this.strokes.find((x) => x.id === chunk.id)
    if (!s) {
      s = { id: chunk.id, owner: from, color: chunk.color, width: chunk.width, points: [], done: false }
      this.strokes.push(s)
    }
    s.points.push(...chunk.pts)
    if (chunk.done) s.done = true
    this.onChange()
  }
}

/** Canvas pixel coordinates -> the 0..1 space strokes are stored in. */
export function toUnit(canvas: HTMLCanvasElement, clientX: number, clientY: number): Pt {
  const box = canvas.getBoundingClientRect()
  return [clamp01((clientX - box.left) / box.width), clamp01((clientY - box.top) / box.height)]
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Downloads the canvas as a PNG - a plain browser download, no server involved. */
export function saveCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = filename
  a.click()
}
