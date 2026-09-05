/**
 * Cuts a reference sheet that tiles several characters' full movesets into one
 * image (a grid of panels, each laid out like scripts/slice-sprites.mjs's
 * single-character template but compressed to fit a square panel under its
 * own title) into the same per-character sprite folders that script writes.
 *
 *   node scripts/slice-sprite-panels.mjs config.json
 *
 * The config names each panel's pixel rectangle within the sheet and the
 * output character id; row/column fractions are relative to that rectangle,
 * so one script handles any grid shape or panel size, including a sheet with
 * only one panel covering the whole image.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addToPalette, bodyAnchor, cut, inkBox, loadSheet, QUALITY } from './lib/sprite-cut.mjs'

const CONFIG_PATH = process.argv[2]
if (!CONFIG_PATH) {
  console.error('usage: node scripts/slice-sprite-panels.mjs <config.json>')
  process.exit(1)
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))

/**
 * The layout every panel in this project's grid sheets shares: four banded
 * rows under a title, fractions relative to the panel's own rectangle rather
 * than the whole sheet. `movement` can list 4 names in 5 evenly-spaced slots
 * (skipping index 2) for the couple of panels whose art has a spare unlabeled
 * pose wedged into the middle of that row.
 */
function rowsFor(panel) {
  const movementSlots = panel.movementSlots ?? 4
  const movementNames =
    movementSlots === 5 ? [0, 1, 3, 4].map((slot) => ['front', 'back', null, 'left', 'right'][slot]) : ['front', 'back', 'left', 'right']
  return [
    { band: [0.078, 0.293], x: [0.03, 0.97], slots: movementSlots, names: movementNames },
    {
      band: [0.293, 0.52],
      x: [0.02, 0.99],
      slots: 5,
      names: ['attackNeutral', 'attackUp', 'attackDown', 'attackLeft', 'attackRight'],
    },
    {
      band: [0.52, 0.765],
      x: [0.02, 0.99],
      slots: 5,
      names: ['specialNeutral', 'specialUp', 'specialDown', 'specialLeft', 'specialRight'],
    },
    { band: [0.765, 0.98], x: [0.03, 0.62], slots: 2, names: ['recoverUp', 'takeHit'] },
  ]
}

const img = await loadImage(config.sheet)

for (const panel of config.panels) {
  const { id, rect } = panel
  const [rectX, rectY, pw, ph] = rect
  const OUT = join('src/games/smash/sprites', id)
  mkdirSync(OUT, { recursive: true })
  console.log(`\n== ${id} ==`)

  // Each panel gets its own background analysis rather than sharing one pass
  // over the whole composite: every panel is independently vignetted around
  // its own character, so a background estimate sampled from the *sheet's*
  // outer edges is simply wrong everywhere except the corner panels that
  // happen to touch it. Cropping first makes each panel's own edges the ones
  // loadSheet measures against - the same thing scripts/slice-sprites.mjs
  // already gets right for a sheet with only one panel to begin with.
  const panelCanvas = createCanvas(pw, ph)
  panelCanvas.getContext('2d').drawImage(img, rectX, rectY, pw, ph, 0, 0, pw, ph)
  // These reference sheets have a visibly grainier background than
  // scripts/Sprites.png's flatter vignette - measured directly against a
  // strip of known background, the grain's colour distance runs close enough
  // to how dark some characters' own features (a pupil, black fur) get that
  // widening the near/far window ate into them instead of just clearing the
  // grain. A blur pass smooths the noise out before classification without
  // touching the colours actually written to each cut sprite.
  const sheet = loadSheet(panelCanvas, { blur: 2 })
  const px = 0
  const py = 0

  const rows = rowsFor(panel)

  // This layout crams a title and four rows into one square panel, so a pose
  // sits closer to its caption than scripts/slice-sprites.mjs's roomier
  // single-character template does - the default gap is too generous here
  // and fuses the two into one box.
  const V_GAP = 3

  // A character whose own colours are this close to the background (a black
  // jacket, black fur) can't be separated from it by colour at all - the flood
  // leaks straight through with no edge to stop at, eroding holes clean
  // through solid fabric. The ink-tightened box still bounds the character
  // correctly (erosion inside it doesn't fragment the box the way it can for
  // an even darker character), so protecting its own interior - rather than
  // a wider, un-tightened box that would drag real background in with it -
  // clears the holes without reintroducing the background around it.
  const PROTECT_MARGIN = panel.protectDark ? 14 : 0

  function boxFor(row, slotIndex) {
    const wy0 = py + Math.round(row.band[0] * ph)
    const wy1 = py + Math.round(row.band[1] * ph)
    const rx0 = px + row.x[0] * pw
    const step = (row.x[1] * pw - row.x[0] * pw) / row.slots
    const cellX0 = Math.round(rx0 + slotIndex * step)
    const cellX1 = Math.min(px + pw - 1, Math.round(rx0 + (slotIndex + 1) * step) - 1)
    return inkBox(sheet, cellX0, wy0, cellX1, wy1, V_GAP)
  }

  // Pass one: the movement row is effect-free, so it defines the palette used
  // to keep an effect's colour from dragging a later cell's anchor sideways.
  const palette = new Map()
  let bodyH = 0
  const movementRow = rows[0]
  movementRow.names.forEach((name, slotIndex) => {
    if (!name) return
    const box = boxFor(movementRow, slotIndex)
    if (!box) return
    const cell = cut(sheet, box, PROTECT_MARGIN)
    addToPalette(palette, cell.data.data, cell.w, cell.h)
    bodyH = Math.max(bodyH, box.y1 - box.y0 + 1)
  })
  for (const [key, count] of palette) {
    if (count < 12) palette.delete(key)
  }

  const manifest = {}
  let bytes = 0
  for (const row of rows) {
    row.names.forEach((name, slotIndex) => {
      if (!name) return
      const box = boxFor(row, slotIndex)
      if (!box) {
        console.warn(`  ${name}: nothing found`)
        return
      }
      const { canvas: out, data: dst, w, h } = cut(sheet, box, PROTECT_MARGIN)
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

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ bodyH, frames: manifest }, null, 2) + '\n')
  console.log(`${Object.keys(manifest).length} sprites -> ${OUT}  body ${bodyH}px  (${(bytes / 1024).toFixed(0)}KB total)`)
}
