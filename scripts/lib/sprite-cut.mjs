/**
 * The image-processing core shared by every sprite-sheet slicer: keying a
 * vignetted dark background out by flooding in from the border rather than
 * matching a colour, finding the tightest box around one cell's art with its
 * caption text excluded, and locating the ground point a fighter's feet
 * should anchor to. See scripts/slice-sprites.mjs for the fuller story.
 */
import { createCanvas } from '@napi-rs/canvas'

export const PAD = 4
export const QUALITY = 82
export const PALETTE_BITS = 4 // colours quantised to 4 bits per channel

/**
 * A separable box blur over RGB, used only to decide what counts as
 * background - never to touch the colours actually written out. Background
 * grain is high-frequency (it flickers pixel to pixel); a real character
 * edge or a solid dark feature like a pupil is not, so blurring collapses
 * the grain toward the true background colour while leaving genuine edges
 * and large dark regions where they are - which a single global colour
 * threshold cannot do, since some sheets' grain reaches distances close to
 * how dark the character's own features are.
 */
function boxBlurRgb(px, W, H, radius) {
  const size = radius * 2 + 1
  const tmp = new Float32Array(W * H * 3)
  const out = new Float32Array(W * H * 3)

  for (let y = 0; y < H; y++) {
    let r = 0
    let g = 0
    let b = 0
    for (let x = -radius; x <= radius; x++) {
      const i = (y * W + Math.min(W - 1, Math.max(0, x))) * 4
      r += px[i]
      g += px[i + 1]
      b += px[i + 2]
    }
    for (let x = 0; x < W; x++) {
      const oi = (y * W + x) * 3
      tmp[oi] = r / size
      tmp[oi + 1] = g / size
      tmp[oi + 2] = b / size
      const ai = (y * W + Math.min(W - 1, x + radius + 1)) * 4
      const si = (y * W + Math.max(0, x - radius)) * 4
      r += px[ai] - px[si]
      g += px[ai + 1] - px[si + 1]
      b += px[ai + 2] - px[si + 2]
    }
  }

  for (let x = 0; x < W; x++) {
    let r = 0
    let g = 0
    let b = 0
    for (let y = -radius; y <= radius; y++) {
      const i = (Math.min(H - 1, Math.max(0, y)) * W + x) * 3
      r += tmp[i]
      g += tmp[i + 1]
      b += tmp[i + 2]
    }
    for (let y = 0; y < H; y++) {
      const oi = (y * W + x) * 3
      out[oi] = r / size
      out[oi + 1] = g / size
      out[oi + 2] = b / size
      const ai = (Math.min(H - 1, y + radius + 1) * W + x) * 3
      const si = (Math.max(0, y - radius) * W + x) * 3
      r += tmp[ai] - tmp[si]
      g += tmp[ai + 1] - tmp[si + 1]
      b += tmp[ai + 2] - tmp[si + 2]
    }
  }
  return out
}

/**
 * Loads a sheet and does the one-time background analysis every cut in it
 * reuses. The thresholds default to what scripts/Sprites.png's fairly flat
 * vignette needs. A sheet with a visibly grainier background (ghostly
 * speckle surviving around a cut character, or the opposite - a dark feature
 * like a pupil turning translucent) needs `blur` raised instead of widening
 * the thresholds: the grain and a character's own dark tones can sit close
 * enough together in raw colour distance that no single threshold separates
 * them, but the grain is the one that is pixel-to-pixel noisy.
 */
export function loadSheet(img, { near = 10, far = 30, flood = 52, blur = 0 } = {}) {
  const W = img.width
  const H = img.height
  const sheet = createCanvas(W, H)
  const sctx = sheet.getContext('2d')
  sctx.drawImage(img, 0, 0)
  const px = sctx.getImageData(0, 0, W, H).data
  const smooth = blur > 0 ? boxBlurRgb(px, W, H, blur) : null

  // The sheet is vignetted, so the background colour is sampled per row, from
  // the same (optionally blurred) signal bgDist compares against.
  const bgRow = new Float64Array(H * 3)
  for (let y = 0; y < H; y++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (const x of [2, 5, 8, W - 3, W - 6, W - 9]) {
      if (smooth) {
        const i = (y * W + x) * 3
        r += smooth[i]
        g += smooth[i + 1]
        b += smooth[i + 2]
      } else {
        const i = (y * W + x) * 4
        r += px[i]
        g += px[i + 1]
        b += px[i + 2]
      }
      n++
    }
    bgRow[y * 3] = r / n
    bgRow[y * 3 + 1] = g / n
    bgRow[y * 3 + 2] = b / n
  }

  function bgDist(x, y) {
    if (smooth) {
      const i = (y * W + x) * 3
      const dr = smooth[i] - bgRow[y * 3]
      const dg = smooth[i + 1] - bgRow[y * 3 + 1]
      const db = smooth[i + 2] - bgRow[y * 3 + 2]
      return Math.sqrt(dr * dr + dg * dg + db * db)
    }
    const i = (y * W + x) * 4
    const dr = px[i] - bgRow[y * 3]
    const dg = px[i + 1] - bgRow[y * 3 + 1]
    const db = px[i + 2] - bgRow[y * 3 + 2]
    return Math.sqrt(dr * dr + dg * dg + db * db)
  }

  // Everything the border can reach through background-coloured pixels.
  const outside = new Uint8Array(W * H)
  {
    const stack = new Int32Array(W * H)
    let top = 0
    const push = (x, y) => {
      const s = y * W + x
      if (!outside[s] && bgDist(x, y) < flood) {
        outside[s] = 1
        stack[top++] = s
      }
    }
    for (let x = 0; x < W; x++) {
      push(x, 0)
      push(x, H - 1)
    }
    for (let y = 0; y < H; y++) {
      push(0, y)
      push(W - 1, y)
    }
    while (top > 0) {
      const p = stack[--top]
      const x = p % W
      const y = (p / W) | 0
      if (x > 0) push(x - 1, y)
      if (x < W - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < H - 1) push(x, y + 1)
    }
  }

  function alphaAt(x, y) {
    if (!outside[y * W + x]) return 1
    const d = bgDist(x, y)
    return d <= near ? 0 : d >= far ? 1 : (d - near) / (far - near)
  }

  return { W, H, px, outside, alphaAt }
}

/** The heaviest contiguous run in a projection, ignoring runs past a gap. */
function heaviestRun(weight, lo, hi, gap) {
  const runs = []
  let start = -1
  let blank = 0
  for (let i = lo; i <= hi; i++) {
    if (weight[i] > 0) {
      if (start < 0) start = i
      blank = 0
    } else if (start >= 0 && ++blank >= gap) {
      runs.push({ a: start, b: i - blank })
      start = -1
    }
  }
  if (start >= 0) runs.push({ a: start, b: hi })
  if (!runs.length) return null
  for (const r of runs) {
    r.mass = 0
    for (let i = r.a; i <= r.b; i++) r.mass += weight[i]
  }
  runs.sort((p, q) => q.mass - p.mass)
  return runs[0]
}

/**
 * Tightest box around the art in a window, with the caption left out.
 *
 * `vGap`/`hGap` are how many consecutive background rows/columns count as a
 * real separation between the art and its caption, rather than antialiasing
 * inside the art itself - tune down for a sheet whose captions sit closer to
 * the pose than scripts/slice-sprites.mjs's template does.
 */
export function inkBox(sheet, wx0, wy0, wx1, wy1, vGap = 9, hGap = 14) {
  const { H, W, outside } = sheet
  const rows = new Float64Array(H)
  for (let y = wy0; y <= wy1; y++) {
    for (let x = wx0; x <= wx1; x++) if (!outside[y * W + x]) rows[y]++
  }
  const vr = heaviestRun(rows, wy0, wy1, vGap)
  if (!vr) return null
  // Re-project across only the rows the art occupies, so a caption to one side
  // cannot widen the box.
  const cols = new Float64Array(W)
  for (let y = vr.a; y <= vr.b; y++) {
    for (let x = wx0; x <= wx1; x++) if (!outside[y * W + x]) cols[x]++
  }
  const hr = heaviestRun(cols, wx0, wx1, hGap)
  return hr ? { x0: hr.a, y0: vr.a, x1: hr.b, y1: vr.b } : null
}

/**
 * Cuts one cell out of the sheet, with the background keyed to transparent.
 *
 * `protectMargin`, when set, forces every pixel more than that many pixels
 * from all four edges of the box to stay fully opaque, whatever the colour
 * key says. Colour-distance keying assumes the character's own colours are
 * different enough from the background to tell them apart - true for most
 * of this cast, but a near-black jacket against a near-black background can
 * be numerically indistinguishable with no edge contrast anywhere to find,
 * which erodes holes clean through solid fabric rather than just leaving a
 * speckle. Trusting the box's geometry for the interior and only letting the
 * colour key touch the rim - where the real background actually is - avoids
 * that without needing to tell the two apart by colour at all.
 */
export function cut(sheet, box, protectMargin = 0) {
  const { W, H, px, alphaAt } = sheet
  const x0 = Math.max(0, box.x0 - PAD)
  const y0 = Math.max(0, box.y0 - PAD)
  const w = Math.min(W - 1, box.x1 + PAD) - x0 + 1
  const h = Math.min(H - 1, box.y1 + PAD) - y0 + 1
  const out = createCanvas(w, h)
  const octx = out.getContext('2d')
  const dst = octx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * W + (x0 + x)) * 4
      const di = (y * w + x) * 4
      dst.data[di] = px[si]
      dst.data[di + 1] = px[si + 1]
      dst.data[di + 2] = px[si + 2]
      const protect = protectMargin > 0 && Math.min(x, y, w - 1 - x, h - 1 - y) >= protectMargin
      dst.data[di + 3] = protect ? 255 : Math.round(alphaAt(x0 + x, y0 + y) * 255)
    }
  }
  octx.putImageData(dst, 0, 0)
  return { canvas: out, ctx: octx, data: dst, w, h }
}

export function quantise(r, g, b) {
  const sh = 8 - PALETTE_BITS
  return ((r >> sh) << (PALETTE_BITS * 2)) | ((g >> sh) << PALETTE_BITS) | (b >> sh)
}

export function addToPalette(palette, data, w, h) {
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 250) continue
    const key = quantise(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    palette.set(key, (palette.get(key) ?? 0) + 1)
  }
}

/**
 * Ground point and body centre for one cut sprite.
 *
 * Only colours this character is actually made of count toward the centre -
 * a slash arc or a water spout is a colour the neutral poses never contained,
 * so it cannot drag the anchor sideways with it. Down is easy regardless: the
 * lowest solid row is the ground.
 */
export function bodyAnchor(data, w, h, palette) {
  let sumX = 0
  let n = 0
  let lowest = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 250) continue
      if (y > lowest) lowest = y
      if (palette && !palette.has(quantise(data[i], data[i + 1], data[i + 2]))) continue
      sumX += x
      n++
    }
  }
  if (!n) return { ax: w / 2, ay: h - 1 }
  return { ax: sumX / n, ay: lowest }
}
