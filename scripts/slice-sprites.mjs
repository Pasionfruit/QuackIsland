/**
 * Cuts a character reference sheet into the individual sprites the Smash game
 * draws, and writes them as WebP (about a quarter the size of PNG for this
 * kind of painterly art).
 *
 *   node scripts/slice-sprites.mjs src/Sprites.png ninjapenguin
 *
 * Sheets are expected to follow the template in src/Sprites.png: four banded
 * rows - movement, attacks, specials, then recover and take-hit - with evenly
 * spaced cells. Generate new characters to that layout and they slice with no
 * further work.
 *
 * Two things make this harder than keying out a colour. The background is a
 * vignetted dark brown that the character's own shadows match almost exactly,
 * so background is found by flooding in from the border instead: an interior
 * dark pixel is never reachable, and so is never erased. And each cell's
 * caption has to go, which is done by taking the ink projection along each
 * axis and keeping the heaviest run - the caption is always separated from the
 * art by clean background, whether it sits above it or below.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
const NAME = process.argv[3]
if (!SRC || !NAME) {
  console.error('usage: node scripts/slice-sprites.mjs <sheet.png> <character-id>')
  process.exit(1)
}
const OUT = join('src/games/smash/sprites', NAME)

/** The sheet layout, in fractions of the sheet size so resolution can vary. */
const TEMPLATE = [
  // The sheet captions these UP/DOWN/LEFT/RIGHT, but what they *show* is a
  // character facing the camera and one seen from behind - which is what the
  // arena needs to know. Named for the view, not the key that produces it.
  { band: [0.05, 0.245], x: [0.06, 0.88], names: ['front', 'back', 'left', 'right'] },
  {
    band: [0.28, 0.475],
    x: [0.03, 0.99],
    names: ['attackNeutral', 'attackUp', 'attackDown', 'attackLeft', 'attackRight'],
  },
  {
    band: [0.52, 0.73],
    x: [0.03, 0.99],
    names: ['specialNeutral', 'specialUp', 'specialDown', 'specialLeft', 'specialRight'],
  },
  { band: [0.775, 0.96], x: [0.03, 0.62], names: ['recoverUp', 'takeHit'] },
]

const NEAR = 10 // indistinguishable from the background
const FAR = 30 // definitely not background
const FLOOD = 52 // looser, so background texture cannot wall the flood off
const PAD = 4
const QUALITY = 82

const img = await loadImage(SRC)
const W = img.width
const H = img.height
const sheet = createCanvas(W, H)
const sctx = sheet.getContext('2d')
sctx.drawImage(img, 0, 0)
const px = sctx.getImageData(0, 0, W, H).data

// The sheet is vignetted, so the background colour is sampled per row.
const bgRow = new Float64Array(H * 3)
for (let y = 0; y < H; y++) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const x of [2, 5, 8, W - 3, W - 6, W - 9]) {
    const i = (y * W + x) * 4
    r += px[i]
    g += px[i + 1]
    b += px[i + 2]
    n++
  }
  bgRow[y * 3] = r / n
  bgRow[y * 3 + 1] = g / n
  bgRow[y * 3 + 2] = b / n
}

function bgDist(x, y) {
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
    if (!outside[s] && bgDist(x, y) < FLOOD) {
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
  return d <= NEAR ? 0 : d >= FAR ? 1 : (d - NEAR) / (FAR - NEAR)
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

/** Tightest box around the art in a window, with the caption left out. */
function inkBox(wx0, wy0, wx1, wy1) {
  const rows = new Float64Array(H)
  for (let y = wy0; y <= wy1; y++) {
    for (let x = wx0; x <= wx1; x++) if (!outside[y * W + x]) rows[y]++
  }
  const vr = heaviestRun(rows, wy0, wy1, 9)
  if (!vr) return null
  // Re-project across only the rows the art occupies, so a caption to one side
  // cannot widen the box.
  const cols = new Float64Array(W)
  for (let y = vr.a; y <= vr.b; y++) {
    for (let x = wx0; x <= wx1; x++) if (!outside[y * W + x]) cols[x]++
  }
  const hr = heaviestRun(cols, wx0, wx1, 14)
  return hr ? { x0: hr.a, y0: vr.a, x1: hr.b, y1: vr.b } : null
}

/**
 * Where the character's feet are within a cut sprite.
 *
 * Cells are cropped around the art including its effect, so the body sits in a
 * different place in every one - anchoring to the crop would make the penguin
 * jump around as it attacks. Down is easy: the lowest solid row is the ground.
 * Across is not, because a slash arc or a water spout is solid too and drags
 * the centre with it.
 *
 * The movement cells have no effects in them, so they are used to learn which
 * colours belong to this character. Anything an effect introduces - the white
 * of a slash, the blue of ice, the orange of a spark - is a colour the neutral
 * poses never contained, and is ignored when locating the body.
 */
const PALETTE_BITS = 4 // colours quantised to 4 bits per channel

function quantise(r, g, b) {
  const sh = 8 - PALETTE_BITS
  return ((r >> sh) << (PALETTE_BITS * 2)) | ((g >> sh) << PALETTE_BITS) | (b >> sh)
}

function addToPalette(palette, data, w, h) {
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 250) continue
    const key = quantise(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    palette.set(key, (palette.get(key) ?? 0) + 1)
  }
}

/** Ground point and body centre for one cut sprite. */
function bodyAnchor(data, w, h, palette) {
  let sumX = 0
  let n = 0
  let lowest = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 250) continue
      if (y > lowest) lowest = y
      // Only colours this character is actually made of count toward the centre.
      if (palette && !palette.has(quantise(data[i], data[i + 1], data[i + 2]))) continue
      sumX += x
      n++
    }
  }
  if (!n) return { ax: w / 2, ay: h - 1 }
  return { ax: sumX / n, ay: lowest }
}

mkdirSync(OUT, { recursive: true })
const manifest = {}
let bytes = 0
const palette = new Map()
let bodyH = 0

/** Cuts one cell out of the sheet, with the background keyed to transparent. */
function cut(box) {
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
      dst.data[di + 3] = Math.round(alphaAt(x0 + x, y0 + y) * 255)
    }
  }
  octx.putImageData(dst, 0, 0)
  return { canvas: out, ctx: octx, data: dst, w, h }
}

function boxFor(row, i) {
  const wy0 = Math.round(row.band[0] * H)
  const wy1 = Math.round(row.band[1] * H)
  const rx0 = row.x[0] * W
  const step = (row.x[1] * W - rx0) / row.names.length
  return inkBox(
    Math.round(rx0 + i * step),
    wy0,
    Math.min(W - 1, Math.round(rx0 + (i + 1) * step) - 1),
    wy1,
  )
}

// Pass one: the movement row is effect-free, so it defines the character's
// palette. Rare colours are dropped - they are mostly antialiasing.
for (let i = 0; i < TEMPLATE[0].names.length; i++) {
  const box = boxFor(TEMPLATE[0], i)
  if (!box) continue
  const cell = cut(box)
  addToPalette(palette, cell.data.data, cell.w, cell.h)
  // Tallest neutral pose: the height the fighter's world height maps onto.
  bodyH = Math.max(bodyH, box.y1 - box.y0 + 1)
}
let dropped = 0
for (const [key, count] of palette) {
  if (count < 12) {
    palette.delete(key)
    dropped++
  }
}
console.log(`palette: ${palette.size} colours (dropped ${dropped} rare)
`)

for (const row of TEMPLATE) {
  const wy0 = Math.round(row.band[0] * H)
  const wy1 = Math.round(row.band[1] * H)
  const rx0 = row.x[0] * W
  const step = (row.x[1] * W - rx0) / row.names.length
  row.names.forEach((name, i) => {
    const box = inkBox(
      Math.round(rx0 + i * step),
      wy0,
      Math.min(W - 1, Math.round(rx0 + (i + 1) * step) - 1),
      wy1,
    )
    if (!box) {
      console.warn(`  ${name}: nothing found`)
      return
    }
    const { canvas: out, data: dst, w, h } = cut(box)
    const { ax, ay } = bodyAnchor(dst.data, w, h, palette)
    const buf = out.toBuffer('image/webp', QUALITY)
    writeFileSync(join(OUT, `${name}.webp`), buf)
    bytes += buf.length
    manifest[name] = { w, h, ax: Math.round(ax), ay: Math.round(ay) }
    console.log(
      `  ${name.padEnd(15)} ${`${w}x${h}`.padEnd(9)} anchor ${Math.round(ax)},${Math.round(ay)}  ${(buf.length / 1024).toFixed(1)}KB`,
    )
  })
}

// `bodyH` is the sprite-space height that maps onto the fighter's world
// height, so a sheet redrawn at any resolution still scales into the game.
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ bodyH, frames: manifest }, null, 2) + '\n')
console.log(
  `\n${Object.keys(manifest).length} sprites -> ${OUT}  body ${bodyH}px  (${(bytes / 1024).toFixed(0)}KB total)`,
)
