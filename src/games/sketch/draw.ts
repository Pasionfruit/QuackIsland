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
  /** A paint-bucket fill seeded at points[0], rather than a drawn line. Defaults to 'line'. */
  kind?: 'line' | 'fill'
}

export interface StrokeChunk {
  id: number
  color: string
  width: number
  pts: Pt[]
  done: boolean
  kind?: 'line' | 'fill'
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
/**
 * `w`/`h` are CSS pixels - the space strokes are drawn in. `dpr` is only
 * needed by the paint bucket, which reads and writes the backing store
 * directly and so has to work in device pixels instead.
 */
export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  dpr = 1,
): void {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fbf8f0'
  ctx.fillRect(0, 0, w, h)
  for (const s of strokes) drawStroke(ctx, s, w, h, dpr)
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, dpr = 1): void {
  if (s.kind === 'fill') {
    drawFill(ctx, s, w, h, dpr)
    return
  }
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

// ------------------------------------------------------------- paint bucket

/**
 * Colours within this Manhattan distance of the seed pixel count as "inside"
 * the region to fill - without it, a bucket fill leaves a thin unfilled ring
 * around any anti-aliased line, since the true edge is a gradient, not a
 * single boundary colour.
 */
const FILL_TOLERANCE = 48

/**
 * Every peer replays the same ordered list of strokes onto their own canvas,
 * so a fill re-run from scratch every frame would recompute (and re-pay for)
 * the same flood fill sixty times a second. Caching the result keyed by the
 * canvas size it was computed at means a resize is the only thing that ever
 * forces a recompute.
 */
const fillCache = new WeakMap<Stroke, { w: number; h: number; data: Uint8ClampedArray }>()

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
}

function drawFill(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, dpr = 1): void {
  // getImageData/putImageData ignore the context transform and work on the
  // backing store, so everything here is in device pixels while the rest of
  // the file is in CSS pixels.
  const pw = Math.max(1, Math.round(w * dpr))
  const ph = Math.max(1, Math.round(h * dpr))
  const cached = fillCache.get(s)
  if (cached && cached.w === pw && cached.h === ph) {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(cached.data), pw, ph), 0, 0)
    return
  }
  const img = ctx.getImageData(0, 0, pw, ph)
  const x = Math.round(s.points[0][0] * pw)
  const y = Math.round(s.points[0][1] * ph)
  floodFillBuffer(img.data, pw, ph, x, y, hexToRgba(s.color))
  ctx.putImageData(img, 0, 0)
  fillCache.set(s, { w: pw, h: ph, data: img.data.slice() })
}

/**
 * Stack-based scanline flood fill over a flat RGBA buffer - the one part of
 * this file with no canvas dependency, so it runs identically in a browser or
 * headless in a smoke test.
 */
export function floodFillBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: [number, number, number, number],
): void {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return
  const idx = (x: number, y: number) => (y * width + x) * 4
  const scratch: [number, number, number, number] = [0, 0, 0, 0]
  const readInto = (x: number, y: number) => {
    const i = idx(x, y)
    scratch[0] = data[i]
    scratch[1] = data[i + 1]
    scratch[2] = data[i + 2]
    scratch[3] = data[i + 3]
  }
  const dist = (a: [number, number, number, number], b: [number, number, number, number]) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3])

  readInto(startX, startY)
  const target: [number, number, number, number] = [...scratch]
  if (dist(target, fillColor) < 4) return // already this colour: nothing to do

  const matches = (x: number, y: number) => {
    readInto(x, y)
    return dist(scratch, target) <= FILL_TOLERANCE
  }
  const setColor = (x: number, y: number) => {
    const i = idx(x, y)
    data[i] = fillColor[0]
    data[i + 1] = fillColor[1]
    data[i + 2] = fillColor[2]
    data[i + 3] = fillColor[3]
  }

  const stack: Pt[] = [[startX, startY]]
  while (stack.length) {
    const [x, seedY] = stack.pop()!
    if (!matches(x, seedY)) continue
    let y = seedY
    while (y > 0 && matches(x, y - 1)) y--
    let leftOpen = false
    let rightOpen = false
    while (y < height && matches(x, y)) {
      setColor(x, y)
      if (x > 0) {
        const open = matches(x - 1, y)
        if (open && !leftOpen) stack.push([x - 1, y])
        leftOpen = open
      }
      if (x < width - 1) {
        const open = matches(x + 1, y)
        if (open && !rightOpen) stack.push([x + 1, y])
        rightOpen = open
      }
      y++
    }
  }
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
  private onFlush: (chunk: StrokeChunk) => void
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
    const s: Stroke = { id: this.nextId++, owner: this.owner, color, width, points: [pt], done: false, kind: 'line' }
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

  /** One-shot paint-bucket fill seeded at `pt` - not a drag, so it bypasses begin/extend/end. */
  fill(color: string, pt: Pt): void {
    const s: Stroke = { id: this.nextId++, owner: this.owner, color, width: 0, points: [pt], done: true, kind: 'fill' }
    this.strokes.push(s)
    this.onFlush({ id: s.id, color, width: 0, pts: [pt], done: true, kind: 'fill' })
    this.onChange()
  }

  /** Removes this drawer's own most recent mark (line or fill). Returns its id, or null if there was nothing of theirs to undo. */
  undo(): number | null {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (this.strokes[i].owner === this.owner) {
        const [removed] = this.strokes.splice(i, 1)
        if (this.active?.id === removed.id) {
          this.active = null
          this.pending = []
        }
        this.onChange()
        return removed.id
      }
    }
    return null
  }

  /** Removes one stroke by id, however it got here - how a remote undo is applied. */
  removeById(id: number): void {
    this.strokes = this.strokes.filter((s) => s.id !== id)
    this.onChange()
  }

  clear(): void {
    this.reset()
  }

  /** Wipes the canvas and, optionally, seeds it with someone else's finished work - how a round hands a picture to the next player. */
  reset(seedStrokes: Stroke[] = []): void {
    this.strokes = seedStrokes.map((s) => ({ ...s, points: [...s.points] }))
    this.active = null
    this.pending = []
    this.onChange()
  }

  /** Merges a remote chunk into (or as) the stroke it belongs to. */
  applyRemote(from: number, chunk: StrokeChunk): void {
    let s = this.strokes.find((x) => x.id === chunk.id)
    if (!s) {
      s = { id: chunk.id, owner: from, color: chunk.color, width: chunk.width, points: [], done: false, kind: chunk.kind ?? 'line' }
      this.strokes.push(s)
    }
    if (chunk.kind === 'fill') {
      s.points = chunk.pts
      s.done = true
    } else {
      s.points.push(...chunk.pts)
      if (chunk.done) s.done = true
    }
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
