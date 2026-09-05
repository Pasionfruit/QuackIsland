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
 * further work. A sheet with several characters tiled together (a reference
 * sheet drawn as a grid) needs scripts/slice-sprite-panels.mjs instead, which
 * shares the cropping core in scripts/lib/sprite-cut.mjs with this script.
 *
 * Two things make this harder than keying out a colour. The background is a
 * vignetted dark brown that the character's own shadows match almost exactly,
 * so background is found by flooding in from the border instead: an interior
 * dark pixel is never reachable, and so is never erased. And each cell's
 * caption has to go, which is done by taking the ink projection along each
 * axis and keeping the heaviest run - the caption is always separated from the
 * art by clean background, whether it sits above it or below.
 */
import { loadImage } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addToPalette, bodyAnchor, cut, inkBox, loadSheet, QUALITY } from './lib/sprite-cut.mjs'

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

const img = await loadImage(SRC)
const sheet = loadSheet(img)
const { W, H } = sheet

mkdirSync(OUT, { recursive: true })
const manifest = {}
let bytes = 0
const palette = new Map()
let bodyH = 0

function boxFor(row, i) {
  const wy0 = Math.round(row.band[0] * H)
  const wy1 = Math.round(row.band[1] * H)
  const rx0 = row.x[0] * W
  const step = (row.x[1] * W - rx0) / row.names.length
  return inkBox(
    sheet,
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
  const cell = cut(sheet, box)
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
      sheet,
      Math.round(rx0 + i * step),
      wy0,
      Math.min(W - 1, Math.round(rx0 + (i + 1) * step) - 1),
      wy1,
    )
    if (!box) {
      console.warn(`  ${name}: nothing found`)
      return
    }
    const { canvas: out, data: dst, w, h } = cut(sheet, box)
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
