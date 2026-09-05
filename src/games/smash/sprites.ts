/**
 * Sprite sheets for the Smash cast.
 *
 * Art is authored as one reference sheet per character (see
 * [src/Sprites.png](../../Sprites.png) for the template) and cut into
 * individual frames by `scripts/slice-sprites.mjs`, which also records where
 * each frame's feet are. Cells are cropped around their effects, so a frame's
 * own box is not a usable origin - a slash arc makes the crop wider on one
 * side and the character would slide as it attacked. Everything here is drawn
 * from the recorded anchor instead, which keeps the body still.
 *
 * A character with no sheet yet simply has no set, and the caller falls back
 * to the procedural rig in `art/avatar.ts`.
 */

export type SpriteState =
  /** Facing the camera - the arena's "south". */
  | 'front'
  /** Seen from behind - the arena's "north". */
  | 'back'
  | 'left'
  | 'right'
  | 'attackNeutral'
  | 'attackUp'
  | 'attackDown'
  | 'attackLeft'
  | 'attackRight'
  | 'specialNeutral'
  | 'specialUp'
  | 'specialDown'
  | 'specialLeft'
  | 'specialRight'
  | 'recoverUp'
  | 'takeHit'

interface FrameMeta {
  w: number
  h: number
  /** Anchor within the frame: the body's centre line and the ground it sits on. */
  ax: number
  ay: number
}

interface Manifest {
  /** Sprite-space height that maps onto the fighter's world height. */
  bodyH: number
  frames: Partial<Record<SpriteState, FrameMeta>>
}

export interface SpriteSet {
  id: string
  bodyH: number
  frames: Partial<Record<SpriteState, FrameMeta & { img: HTMLImageElement }>>
}

// Vite resolves both of these at build time, so adding a character is just a
// matter of dropping its folder in - no registry to update.
//
// The calls have to stay literal for Vite to rewrite them, but `import.meta`
// has no `glob` under any other bundler, so each is guarded: headless tools
// that bundle the renderer with esbuild get an empty set and the procedural
// rig, instead of a TypeError.
let urls: Record<string, string> = {}
let manifests: Record<string, Manifest> = {}
try {
  urls = import.meta.glob('./sprites/*/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>
  manifests = import.meta.glob('./sprites/*/manifest.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Manifest>
} catch {
  urls = {}
  manifests = {}
}

const sets = new Map<string, SpriteSet>()
let loading: Promise<void> | null = null

function charIdFrom(path: string): string {
  return path.split('/')[2] ?? ''
}

/**
 * Loads every sprite sheet. Safe to call repeatedly; the same promise is
 * handed back, and a frame that fails to decode is simply left out rather
 * than failing the whole set.
 */
export function loadSprites(): Promise<void> {
  if (loading) return loading
  const jobs: Promise<void>[] = []

  for (const [path, manifest] of Object.entries(manifests)) {
    const id = charIdFrom(path)
    const set: SpriteSet = { id, bodyH: manifest.bodyH, frames: {} }
    sets.set(id, set)

    for (const [state, meta] of Object.entries(manifest.frames) as [SpriteState, FrameMeta][]) {
      const url = urls[`./sprites/${id}/${state}.webp`]
      if (!url) continue
      jobs.push(
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            set.frames[state] = { ...meta, img }
            resolve()
          }
          img.onerror = () => resolve()
          img.src = url
        }),
      )
    }
  }

  loading = Promise.all(jobs).then(() => undefined)
  return loading
}

/** The sheet for a character, or null if they are still drawn procedurally. */
export function spriteSet(charId: string): SpriteSet | null {
  const set = sets.get(charId)
  return set && Object.keys(set.frames).length > 0 ? set : null
}

/** Which characters currently have art, for the select screen to mark up. */
export function spritedCharacters(): string[] {
  return [...sets.keys()].filter((id) => spriteSet(id))
}

// Tinting needs an offscreen buffer, since compositing on the scene canvas
// would flood the whole frame. One scratch canvas, grown as needed.
let scratch: HTMLCanvasElement | null = null

function tinted(
  img: HTMLImageElement,
  w: number,
  h: number,
  color: string,
  strength: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (!scratch) scratch = document.createElement('canvas')
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, Math.ceil(w))
    scratch.height = Math.max(scratch.height, Math.ceil(h))
  }
  const sctx = scratch.getContext('2d')
  if (!sctx) return null
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, scratch.width, scratch.height)
  sctx.globalAlpha = 1
  sctx.globalCompositeOperation = 'source-over'
  sctx.drawImage(img, 0, 0, w, h)
  // `source-atop` keeps the sprite's own alpha, so the flash follows its shape.
  sctx.globalCompositeOperation = 'source-atop'
  sctx.globalAlpha = strength
  sctx.fillStyle = color
  sctx.fillRect(0, 0, w, h)
  sctx.globalAlpha = 1
  sctx.globalCompositeOperation = 'source-over'
  return scratch
}

export interface DrawSpriteOpts {
  /** World units the character should stand: the frame scales to match. */
  height: number
  /** Mirrors horizontally, for reusing one frame on both facings. */
  flip?: boolean
  alpha?: number
  /** Hit-flash colour laid over the sprite's own shape. */
  tint?: string | null
  tintStrength?: number
  /** Extra rotation about the anchor, for tumbles. */
  spin?: number
  /** >0 squashes and widens, <0 stretches. */
  squash?: number
}

/**
 * Draws one frame with its feet at (x, y).
 *
 * Returns false when the frame is missing, so callers can fall back to the
 * procedural rig for a state a sheet does not cover.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  set: SpriteSet,
  state: SpriteState,
  x: number,
  y: number,
  o: DrawSpriteOpts,
): boolean {
  const frame = set.frames[state]
  if (!frame) return false

  const scale = o.height / set.bodyH
  const sx = (1 + (o.squash ?? 0) * 0.16) * (o.flip ? -1 : 1)
  const sy = 1 - (o.squash ?? 0) * 0.2
  const w = frame.w * scale
  const h = frame.h * scale

  const prevAlpha = ctx.globalAlpha
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha
  ctx.save()
  ctx.translate(x, y)
  if (o.spin) ctx.rotate(o.spin)
  ctx.scale(sx, sy)

  const dx = -frame.ax * scale
  const dy = -frame.ay * scale
  if (o.tint) {
    const buf = tinted(frame.img, w, h, o.tint, o.tintStrength ?? 0.75)
    if (buf) ctx.drawImage(buf, 0, 0, w, h, dx, dy, w, h)
    else ctx.drawImage(frame.img, dx, dy, w, h)
  } else {
    ctx.drawImage(frame.img, dx, dy, w, h)
  }

  ctx.restore()
  ctx.globalAlpha = prevAlpha
  return true
}
