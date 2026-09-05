/**
 * The Polyland cast: upright, chunky, low-poly animals, flat-shaded facet by
 * facet.
 *
 * Everything is authored in "local" space - origin at the feet, +x forward,
 * -y up, sized in fractions of the character's height - and then placed into
 * the world with facing, squash and spin applied. Shading happens in world
 * space, so the light stays in the same place no matter which way a character
 * faces or how far they are tumbling.
 *
 * One rig covers every species. A raccoon and a penguin differ by a head
 * shape, a pair of ears and a tail, not by a separate drawing routine.
 */
import {
  domePoly,
  ellipse,
  facet,
  fillPoly,
  limb,
  rectPts,
  shade,
  softPoly,
  softShadow,
  type FacetOpts,
  type Pt,
} from '../lib/draw'

export type Species = 'raccoon' | 'penguin' | 'lion' | 'frog' | 'cat' | 'leopard'
export type TailStyle = 'ringed' | 'long' | 'tufted' | 'stub' | 'none'
export type HatStyle = 'none' | 'hood' | 'headband' | 'beanie' | 'visor' | 'cap' | 'bow'
export type Accessory =
  | 'none'
  | 'laptop'
  | 'briefcase'
  | 'handbag'
  | 'mug'
  | 'bottle'
  | 'staff'
  | 'fan'
export type Eyewear = 'none' | 'shades' | 'goggles'
export type Sleeves = 'long' | 'short' | 'tank' | 'none'

export interface AvatarDef {
  species: Species
  /** Main coat colour. */
  fur: string
  /** Muzzle, chest and belly. */
  belly: string
  /** Mask, mane or tail tuft; the species decides how it gets used. */
  markings?: string
  nose: string
  /** Beak and feet, for birds. */
  beak?: string
  earInner?: string
  /** Rosettes, for the spotted cats. */
  spots?: string
  tail: TailStyle

  // Clothing and kit.
  top?: string
  topAccent?: string
  sleeves?: Sleeves
  legs?: string
  feet?: string
  hat: HatStyle
  hatColor?: string
  hatAccent?: string
  accessory: Accessory
  accessoryColor?: string
  accessoryAccent?: string
  pack?: string
  satchel?: string
  eyewear?: Eyewear
  eyewearColor?: string
  headphones?: string
  /** A small symbol printed on the chest. */
  print?: 'code' | 'braces' | 'tie' | 'star' | 'none'
  printColor?: string
}

export type Pose =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'fall'
  | 'hurt'
  | 'tumble'
  | 'swingFwd'
  | 'swingUp'
  | 'swingDown'
  | 'brace'

export interface AvatarOpts {
  facing?: 1 | -1
  /** Total height in world units. */
  height?: number
  pose?: Pose
  /** Free-running animation counter, in frames. */
  phase?: number
  /** >0 squashes, <0 stretches. */
  squash?: number
  /** Rotation in radians, used for tumbling. */
  spin?: number
  /** Flat colour override for hit flashes. */
  tint?: string | null
  alpha?: number
  /** Draws the soft contact shadow at the feet. */
  shadow?: boolean
}

/** Corner cut for flat markings, gentler than the one forms get. */
const MARK_ROUND = 0.16

// Proportions, as fractions of total height. These animals are mostly head.
const LEG_H = 0.19
const TORSO_H = 0.34
const HEAD_H = 0.47
const TORSO_W = 0.5
const HEAD_W = 0.58
const LEG_W = 0.15
const ARM_W = 0.13
const ARM_L = 0.23

interface Brush {
  facet: (pts: Pt[], color: string, opts?: FacetOpts) => void
  /** Unshaded, for markings and prints. Corners still get softened. */
  flat: (pts: Pt[], color: string) => void
  /** A faceted lump: muzzles, cheeks, paws - anything with a form to it. */
  dome: (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
    seed?: number,
    opts?: FacetOpts,
  ) => void
  /** A true ellipse. Eyes and highlights only; everything else has facets. */
  blob: (cx: number, cy: number, rx: number, ry: number, color: string) => void
}

interface Rig {
  hx: number
  headCy: number
  hw: number
  hh: number
  lean: number
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  def: AvatarDef,
  x: number,
  y: number,
  o: AvatarOpts = {},
): void {
  const facing = o.facing ?? 1
  const h = o.height ?? 32
  const pose = o.pose ?? 'idle'
  const phase = o.phase ?? 0
  const squash = o.squash ?? 0
  const spin = o.spin ?? 0
  const sx = 1 + squash * 0.16
  const sy = 1 - squash * 0.2
  const pivotY = (-h / 2) * sy
  const cos = Math.cos(spin)
  const sin = Math.sin(spin)

  const place = (pts: Pt[]): Pt[] =>
    pts.map((p) => {
      const lx = p.x * facing * sx
      const ly = p.y * sy
      const dy = ly - pivotY
      return { x: x + lx * cos - dy * sin, y: y + pivotY + lx * sin + dy * cos }
    })
  const placeOne = (px: number, py: number): Pt => place([{ x: px, y: py }])[0]

  const prevAlpha = ctx.globalAlpha
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha
  if (o.shadow) softShadow(ctx, x, y + h * 0.02, h * 0.33, h * 0.08, 0.24)

  const brush: Brush = {
    facet: (pts, color, opts) => {
      if (o.tint) fillPoly(ctx, place(pts), o.tint)
      else facet(ctx, place(pts), color, opts)
    },
    // Markings get a lighter corner cut than forms do: a chest print or a
    // bandit mask should soften, not dissolve.
    flat: (pts, color) => softPoly(ctx, place(pts), o.tint ?? color, MARK_ROUND),
    dome: (cx, cy, rx, ry, color, seed = 0, opts) => {
      const pts = place(domePoly(cx, cy, rx, ry, 9, seed))
      if (o.tint) fillPoly(ctx, pts, o.tint)
      else facet(ctx, pts, color, { dark: 0.16, light: 0.11, round: 0, seed, ...opts })
    },
    blob: (cx, cy, rx, ry, color) => {
      const c = placeOne(cx, cy)
      ellipse(ctx, c.x, c.y, rx * sx, ry * sy, o.tint ?? color)
    },
  }

  // ------------------------------------------------------------- geometry
  const legH = h * LEG_H
  const torsoH = h * TORSO_H
  const headH = h * HEAD_H
  const torsoW = h * TORSO_W
  const headW = h * HEAD_W
  const legW = h * LEG_W
  const armW = h * ARM_W
  const armL = h * ARM_L

  const hipY = -legH
  const shoulderY = hipY - torsoH
  const headCy = shoulderY - headH / 2
  const hw = headW / 2
  const hh = headH / 2
  const bird = def.species === 'penguin'
  const legColor = def.legs ?? def.fur
  const footColor = def.feet ?? (bird ? def.beak ?? '#e8a33c' : shade(def.fur, -0.2))
  const sleeves = def.sleeves ?? (def.top ? 'long' : 'none')
  const armColor = sleeves === 'none' || sleeves === 'tank' ? def.fur : def.top ?? def.fur

  // --------------------------------------------------------------- posing
  const walkSwing = Math.sin(phase * 0.3) * 0.42
  let legFront = 0.06
  let legBack = -0.06
  let armFront = 1.32
  let armBack = 1.78
  let lean = 0
  let propAngle = 0.5
  let eyes: 'open' | 'hurt' | 'focus' = 'open'

  switch (pose) {
    case 'walk':
      legFront = walkSwing
      legBack = -walkSwing
      armFront = 1.32 - walkSwing * 0.5
      armBack = 1.78 + walkSwing * 0.5
      lean = 0.3
      break
    case 'jump':
      legFront = 0.5
      legBack = -0.35
      armFront = 0.3
      armBack = 0.1
      lean = -0.3
      break
    case 'fall':
      legFront = -0.3
      legBack = 0.35
      armFront = 0.66
      armBack = 0.46
      break
    case 'hurt':
      legFront = -0.5
      legBack = 0.5
      armFront = -0.2
      armBack = -0.5
      lean = -1.1
      eyes = 'hurt'
      break
    case 'tumble':
      legFront = 0.7
      legBack = -0.6
      armFront = -0.4
      armBack = 2.6
      eyes = 'hurt'
      break
    case 'swingFwd':
      legFront = 0.4
      legBack = -0.45
      armFront = -0.06
      armBack = 2.1
      lean = 1.0
      propAngle = -0.15
      eyes = 'focus'
      break
    case 'swingUp':
      legFront = 0.2
      legBack = -0.2
      armFront = -1.35
      armBack = 2.0
      lean = -0.4
      propAngle = -1.45
      eyes = 'focus'
      break
    case 'swingDown':
      legFront = 0.15
      legBack = -0.15
      armFront = 1.05
      armBack = 2.3
      lean = 0.55
      propAngle = 1.25
      eyes = 'focus'
      break
    case 'brace':
      legFront = 0.25
      legBack = -0.25
      armFront = 0.88
      armBack = 2.2
      lean = 0.45
      eyes = 'focus'
      break
    default:
      armFront = 1.32 + Math.sin(phase * 0.08) * 0.06
      armBack = 1.8 - Math.sin(phase * 0.08) * 0.06
  }

  const hx = lean * 1.8
  const rig: Rig = { hx, headCy, hw, hh, lean }

  // ------------------------------------------------------------------ tail
  drawTail(brush, def, torsoW, torsoH, hipY, h, phase, pose)

  // -------------------------------------------------------------- back arm
  drawArm(brush, def, {
    shoulderX: -torsoW * 0.16,
    shoulderY: shoulderY + torsoH * 0.18,
    angle: Math.PI / 2 + armBack - 1.57,
    len: armL,
    w: armW,
    color: shade(armColor, -0.16),
    back: true,
    bird,
  })

  // ----------------------------------------------------------------- legs
  const drawLeg = (swing: number, tone: number) => {
    const ox = swing >= 0 ? legW * 0.32 : -legW * 0.32
    const ang = Math.PI / 2 - swing
    brush.facet(limb(ox, hipY, ang, legH * 0.98, legW, 0.9), shade(legColor, tone), {
      dark: 0.2,
      light: 0.1,
    })
    const footX = ox + Math.cos(ang) * legH * 0.95
    const footY = hipY + Math.sin(ang) * legH * 0.95
    if (bird) {
      brush.facet(
        [
          { x: footX - legW * 0.5, y: footY - legW * 0.2 },
          { x: footX + legW * 1.0, y: footY - legW * 0.14 },
          { x: footX + legW * 1.08, y: footY + legW * 0.18 },
          { x: footX - legW * 0.5, y: footY + legW * 0.18 },
        ],
        shade(footColor, tone),
        { dark: 0.2 },
      )
    } else {
      brush.facet(
        [
          { x: footX - legW * 0.48, y: footY - legW * 0.36 },
          { x: footX + legW * 0.7, y: footY - legW * 0.3 },
          { x: footX + legW * 0.78, y: footY + legW * 0.1 },
          { x: footX - legW * 0.48, y: footY + legW * 0.1 },
        ],
        shade(footColor, tone),
        { dark: 0.2 },
      )
    }
  }
  drawLeg(legBack, -0.18)
  drawLeg(legFront, 0)

  // ----------------------------------------------------------------- pack
  if (def.pack) {
    const packW = torsoW * 0.5
    const packH = torsoH * 0.98
    const px0 = -torsoW * 0.48 - packW * 0.5
    const py0 = shoulderY + torsoH * 0.1
    brush.facet(
      [
        { x: px0 + packW * 0.22, y: py0 },
        { x: px0 + packW, y: py0 - packH * 0.04 },
        { x: px0 + packW, y: py0 + packH },
        { x: px0 + packW * 0.1, y: py0 + packH * 0.88 },
        { x: px0 - packW * 0.06, y: py0 + packH * 0.36 },
      ],
      def.pack,
      { dark: 0.2 },
    )
    brush.flat(
      rectPts(px0 + packW * 0.14, py0 + packH * 0.44, packW * 0.72, packH * 0.13),
      shade(def.pack, -0.3),
    )
  }

  // ---------------------------------------------------------------- torso
  const tw = torsoW / 2
  // Rounded and slightly pear shaped: these are round animals.
  const torso: Pt[] = [
    { x: -tw * 0.7 + lean * 1.1, y: shoulderY },
    { x: tw * 0.7 + lean * 1.1, y: shoulderY },
    { x: tw * 0.98, y: shoulderY + torsoH * 0.4 },
    { x: tw, y: shoulderY + torsoH * 0.78 },
    { x: tw * 0.8, y: hipY },
    { x: -tw * 0.8, y: hipY },
    { x: -tw, y: shoulderY + torsoH * 0.78 },
    { x: -tw * 0.98, y: shoulderY + torsoH * 0.4 },
  ]
  brush.facet(torso, def.top ?? def.fur, { dark: 0.24, light: 0.14 })

  // Chest and belly, for anyone not fully dressed.
  if (!def.top || bird) {
    brush.facet(
      [
        { x: -tw * 0.56 + lean * 0.8, y: shoulderY + torsoH * 0.1 },
        { x: tw * 0.62 + lean * 0.8, y: shoulderY + torsoH * 0.06 },
        { x: tw * 0.72, y: shoulderY + torsoH * 0.6 },
        { x: tw * 0.5, y: hipY },
        { x: -tw * 0.5, y: hipY },
        { x: -tw * 0.7, y: shoulderY + torsoH * 0.6 },
      ],
      def.belly,
      { dark: 0.12, light: 0.08 },
    )
  }
  if (def.topAccent) {
    brush.facet(
      [
        { x: -tw * 0.7 + lean * 1.1, y: shoulderY },
        { x: tw * 0.7 + lean * 1.1, y: shoulderY },
        { x: tw * 0.5 + lean, y: shoulderY + torsoH * 0.22 },
        { x: -tw * 0.5 + lean, y: shoulderY + torsoH * 0.22 },
      ],
      def.topAccent,
      { dark: 0.14, light: 0.08, relief: 0.5, seed: 2.4 },
    )
  }
  drawPrint(brush, def, lean, shoulderY, torsoH, tw)

  if (def.satchel) {
    brush.flat(
      [
        { x: -tw * 0.62 + lean, y: shoulderY + torsoH * 0.04 },
        { x: -tw * 0.32 + lean, y: shoulderY + torsoH * 0.01 },
        { x: tw * 0.78, y: hipY + torsoH * 0.12 },
        { x: tw * 0.52, y: hipY + torsoH * 0.16 },
      ],
      def.satchel,
    )
    brush.facet(rectPts(tw * 0.46, hipY - torsoH * 0.02, tw * 0.66, torsoH * 0.32), def.satchel, {
      dark: 0.2,
    })
  }

  // ------------------------------------------------------------------ head
  drawEarsBehind(brush, def, rig)
  brush.facet(headShape(def.species, hx, headCy, hw, hh), def.fur, {
    dark: 0.18,
    light: 0.13,
    split: 0.12,
  })
  drawSpots(brush, def, rig)
  drawFace(brush, def, rig, eyes, lean)
  drawEarsFront(brush, def, rig)
  drawHat(brush, def, rig)

  if (def.headphones) {
    const band: Pt[] = []
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI
      band.push({ x: hx + Math.cos(a) * hw * 1.0, y: headCy - hh * 0.3 + Math.sin(a) * hh * 0.86 })
    }
    for (let i = 12; i >= 0; i--) {
      const a = Math.PI + (i / 12) * Math.PI
      band.push({ x: hx + Math.cos(a) * hw * 0.84, y: headCy - hh * 0.3 + Math.sin(a) * hh * 0.68 })
    }
    brush.facet(band, def.headphones, { dark: 0.24 })
    brush.facet(rectPts(hx + hw * 0.66, headCy - hh * 0.36, hw * 0.4, hh * 0.6), def.headphones, {
      dark: 0.2,
    })
    brush.facet(
      rectPts(hx - hw * 1.06, headCy - hh * 0.36, hw * 0.4, hh * 0.6),
      shade(def.headphones, -0.16),
      { flat: true },
    )
  }

  // ------------------------------------------------- front arm and the prop
  const shoulderX = torsoW * 0.2 + lean * 1.3
  const armAngle = Math.PI / 2 + armFront - 1.57
  const handX = shoulderX + Math.cos(armAngle) * armL
  const handY = shoulderY + torsoH * 0.18 + Math.sin(armAngle) * armL

  drawProp(brush, def, handX, handY, propAngle, h, pose)
  drawArm(brush, def, {
    shoulderX,
    shoulderY: shoulderY + torsoH * 0.18,
    angle: armAngle,
    len: armL,
    w: armW,
    color: armColor,
    back: false,
    bird,
  })

  ctx.globalAlpha = prevAlpha
}

// ---------------------------------------------------------------------- arms

function drawArm(
  brush: Brush,
  def: AvatarDef,
  a: {
    shoulderX: number
    shoulderY: number
    angle: number
    len: number
    w: number
    color: string
    back: boolean
    bird: boolean
  },
): void {
  if (a.bird) {
    // A flipper: wide at the shoulder, tapering to a rounded tip.
    const c = Math.cos(a.angle)
    const s = Math.sin(a.angle)
    const nx = -s
    const ny = c
    const tipX = a.shoulderX + c * a.len * 1.15
    const tipY = a.shoulderY + s * a.len * 1.15
    brush.facet(
      [
        { x: a.shoulderX + nx * a.w * 0.7, y: a.shoulderY + ny * a.w * 0.7 },
        { x: tipX + nx * a.w * 0.24, y: tipY + ny * a.w * 0.24 },
        { x: tipX - nx * a.w * 0.24, y: tipY - ny * a.w * 0.24 },
        { x: a.shoulderX - nx * a.w * 0.7, y: a.shoulderY - ny * a.w * 0.7 },
      ],
      a.color,
      a.back ? { flat: true, dark: 0.14 } : { dark: 0.2, light: 0.12 },
    )
    return
  }
  brush.facet(
    limb(a.shoulderX, a.shoulderY, a.angle, a.len, a.w, 0.86),
    a.color,
    a.back ? { flat: true, dark: 0.12 } : { dark: 0.18, light: 0.12 },
  )
  const px = a.shoulderX + Math.cos(a.angle) * a.len
  const py = a.shoulderY + Math.sin(a.angle) * a.len
  brush.dome(px, py, a.w * 0.55, a.w * 0.55, a.back ? shade(def.fur, -0.18) : def.fur, 4.2)
}

// --------------------------------------------------------------------- heads

function headShape(species: Species, hx: number, cy: number, hw: number, hh: number): Pt[] {
  switch (species) {
    case 'frog':
      // Wide, low, and flat on top where the eyes sit.
      return [
        { x: hx - hw * 1.02, y: cy - hh * 0.18 },
        { x: hx - hw * 0.78, y: cy - hh * 0.72 },
        { x: hx - hw * 0.24, y: cy - hh * 0.86 },
        { x: hx + hw * 0.34, y: cy - hh * 0.86 },
        { x: hx + hw * 0.86, y: cy - hh * 0.66 },
        { x: hx + hw * 1.04, y: cy - hh * 0.1 },
        { x: hx + hw * 0.96, y: cy + hh * 0.52 },
        { x: hx + hw * 0.5, y: cy + hh * 0.92 },
        { x: hx - hw * 0.52, y: cy + hh * 0.92 },
        { x: hx - hw * 0.96, y: cy + hh * 0.5 },
      ]
    case 'penguin':
      // An egg, a little heavier at the jaw.
      return [
        { x: hx - hw * 0.94, y: cy - hh * 0.3 },
        { x: hx - hw * 0.68, y: cy - hh * 0.86 },
        { x: hx - hw * 0.12, y: cy - hh * 1.0 },
        { x: hx + hw * 0.46, y: cy - hh * 0.88 },
        { x: hx + hw * 0.88, y: cy - hh * 0.4 },
        { x: hx + hw * 0.94, y: cy + hh * 0.24 },
        { x: hx + hw * 0.6, y: cy + hh * 0.86 },
        { x: hx - hw * 0.44, y: cy + hh * 0.92 },
        { x: hx - hw * 0.9, y: cy + hh * 0.36 },
      ]
    default:
      // A round skull with a slight brow and a jaw.
      return [
        { x: hx - hw * 0.98, y: cy - hh * 0.36 },
        { x: hx - hw * 0.7, y: cy - hh * 0.88 },
        { x: hx - hw * 0.16, y: cy - hh * 1.0 },
        { x: hx + hw * 0.42, y: cy - hh * 0.9 },
        { x: hx + hw * 0.86, y: cy - hh * 0.44 },
        { x: hx + hw * 0.98, y: cy + hh * 0.18 },
        { x: hx + hw * 0.72, y: cy + hh * 0.78 },
        { x: hx - hw * 0.42, y: cy + hh * 0.9 },
        { x: hx - hw * 0.92, y: cy + hh * 0.34 },
      ]
  }
}

function drawEarsBehind(brush: Brush, def: AvatarDef, r: Rig): void {
  const { hx, headCy: cy, hw, hh } = r
  if (def.species === 'lion') {
    // The mane is a ring of facets sitting behind the head.
    const mane: Pt[] = []
    const spikes = 13
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2
      const rr = i % 2 === 0 ? 1.36 : 1.12
      mane.push({ x: hx + Math.cos(a) * hw * rr, y: cy + Math.sin(a) * hh * rr })
    }
    brush.facet(mane, def.markings ?? shade(def.fur, -0.28), { dark: 0.24, light: 0.14 })
    for (const side of [-1, 1]) {
      brush.dome(hx + side * hw * 0.72, cy - hh * 0.78, hw * 0.2, hh * 0.22, def.fur, 7 + side)
    }
    return
  }
  if (def.species === 'raccoon' || def.species === 'cat' || def.species === 'leopard') {
    const pointy = def.species !== 'raccoon'
    for (const side of [-1, 1]) {
      const ex = hx + side * hw * 0.6 + (side > 0 ? hw * 0.06 : 0)
      const tip = pointy ? hh * 1.5 : hh * 1.32
      const wide = pointy ? 0.3 : 0.4
      brush.facet(
        [
          { x: ex - hw * wide, y: cy - hh * 0.6 },
          { x: ex + hw * (side > 0 ? 0.06 : -0.02), y: cy - tip },
          { x: ex + hw * wide, y: cy - hh * 0.58 },
        ],
        def.fur,
        { dark: 0.22, light: 0.12 },
      )
      brush.flat(
        [
          { x: ex - hw * wide * 0.5, y: cy - hh * 0.62 },
          { x: ex + hw * (side > 0 ? 0.04 : -0.01), y: cy - tip * 0.86 },
          { x: ex + hw * wide * 0.5, y: cy - hh * 0.6 },
        ],
        def.earInner ?? shade(def.nose, 0.2),
      )
    }
  }
}

/**
 * Rosettes across the top and sides of the skull. Fixed positions rather than
 * random ones, so a leopard has the same markings every frame.
 */
const ROSETTES: { x: number; y: number; r: number }[] = [
  { x: -0.62, y: -0.52, r: 0.15 },
  { x: -0.2, y: -0.78, r: 0.13 },
  { x: 0.3, y: -0.72, r: 0.14 },
  { x: 0.72, y: -0.4, r: 0.12 },
  { x: -0.78, y: -0.06, r: 0.12 },
  { x: 0.82, y: 0.12, r: 0.11 },
  { x: -0.5, y: 0.3, r: 0.1 },
]

function drawSpots(brush: Brush, def: AvatarDef, r: Rig): void {
  if (!def.spots) return
  const { hx, headCy: cy, hw, hh } = r
  ROSETTES.forEach((s, i) => {
    brush.dome(hx + hw * s.x, cy + hh * s.y, hw * s.r, hh * s.r * 1.1, def.spots!, 12 + i, {
      dark: 0.14,
      light: 0.08,
    })
  })
}

function drawEarsFront(brush: Brush, def: AvatarDef, r: Rig): void {
  // Only the frog needs something on the side of the head: an eardrum.
  if (def.species !== 'frog') return
  const { hx, headCy: cy, hw, hh } = r
  brush.dome(hx + hw * 0.68, cy + hh * 0.16, hw * 0.2, hh * 0.2, shade(def.fur, -0.16), 2.6)
}

function drawFace(
  brush: Brush,
  def: AvatarDef,
  r: Rig,
  eyes: 'open' | 'hurt' | 'focus',
  lean: number,
): void {
  const { hx, headCy: cy, hw, hh } = r
  const tilt = lean * 0.5

  let eyeCx = hx + hw * 0.16
  let eyeY = cy + hh * 0.04 + tilt * 1.2
  let eyeW = hw * 0.4
  let eyeH = hh * 0.5
  let eyeSpread = hw * 0.42

  switch (def.species) {
    case 'raccoon': {
      // Cream forehead and muzzle, with the bandit mask between them.
      brush.facet(
        [
          { x: hx - hw * 0.86, y: cy - hh * 0.42 },
          { x: hx - hw * 0.3, y: cy - hh * 0.94 },
          { x: hx + hw * 0.44, y: cy - hh * 0.84 },
          { x: hx + hw * 0.7, y: cy - hh * 0.38 },
        ],
        def.belly,
        { dark: 0.12, light: 0.07, relief: 0.6, seed: 1.1 },
      )
      brush.facet(
        [
          { x: hx - hw * 0.92, y: cy - hh * 0.36 },
          { x: hx + hw * 0.82, y: cy - hh * 0.4 },
          { x: hx + hw * 0.86, y: cy + hh * 0.24 },
          { x: hx - hw * 0.88, y: cy + hh * 0.28 },
        ],
        def.markings ?? '#3a3733',
        { flat: true },
      )
      brush.dome(hx + hw * 0.26, cy + hh * 0.56, hw * 0.52, hh * 0.36, def.belly, 1.4)
      brush.blob(hx + hw * 0.42, cy + hh * 0.36, hw * 0.16, hh * 0.13, def.nose)
      break
    }
    case 'penguin': {
      brush.facet(
        [
          { x: hx - hw * 0.5, y: cy - hh * 0.62 },
          { x: hx + hw * 0.5, y: cy - hh * 0.56 },
          { x: hx + hw * 0.8, y: cy + hh * 0.16 },
          { x: hx + hw * 0.5, y: cy + hh * 0.8 },
          { x: hx - hw * 0.42, y: cy + hh * 0.84 },
          { x: hx - hw * 0.62, y: cy + hh * 0.1 },
        ],
        def.belly,
        { dark: 0.1, light: 0.06 },
      )
      brush.facet(
        [
          { x: hx + hw * 0.36, y: cy + hh * 0.12 },
          { x: hx + hw * 1.02, y: cy + hh * 0.3 },
          { x: hx + hw * 0.36, y: cy + hh * 0.52 },
        ],
        def.beak ?? '#e8a33c',
        { dark: 0.22, light: 0.14 },
      )
      eyeSpread = hw * 0.36
      eyeCx = hx + hw * 0.1
      eyeY = cy - hh * 0.1 + tilt
      break
    }
    case 'lion': {
      brush.dome(hx + hw * 0.24, cy + hh * 0.54, hw * 0.56, hh * 0.36, def.belly, 3.1)
      brush.blob(hx + hw * 0.4, cy + hh * 0.32, hw * 0.17, hh * 0.13, def.nose)
      for (let i = 0; i < 2; i++) {
        brush.blob(
          hx + hw * (0.16 + i * 0.24),
          cy + hh * 0.6,
          hw * 0.04,
          hh * 0.04,
          shade(def.belly, -0.3),
        )
      }
      break
    }
    case 'frog': {
      brush.facet(
        [
          { x: hx - hw * 0.92, y: cy + hh * 0.16 },
          { x: hx + hw * 0.98, y: cy + hh * 0.1 },
          { x: hx + hw * 0.78, y: cy + hh * 0.78 },
          { x: hx - hw * 0.62, y: cy + hh * 0.82 },
        ],
        def.belly,
        { dark: 0.1, light: 0.06 },
      )
      brush.flat(
        [
          { x: hx - hw * 0.72, y: cy + hh * 0.2 },
          { x: hx + hw * 0.9, y: cy + hh * 0.14 },
          { x: hx + hw * 0.9, y: cy + hh * 0.24 },
          { x: hx - hw * 0.72, y: cy + hh * 0.3 },
        ],
        shade(def.belly, -0.3),
      )
      brush.blob(hx + hw * 0.3, cy - hh * 0.1, hw * 0.05, hh * 0.04, shade(def.fur, -0.4))
      brush.blob(hx + hw * 0.06, cy - hh * 0.08, hw * 0.05, hh * 0.04, shade(def.fur, -0.4))
      // The eyes are domes sitting on top of the skull.
      eyeY = cy - hh * 0.82 + tilt
      eyeSpread = hw * 0.52
      eyeCx = hx + hw * 0.08
      eyeW = hw * 0.56
      eyeH = hh * 0.6
      for (const side of [-1, 1]) {
        brush.dome(eyeCx + side * eyeSpread, eyeY, eyeW * 0.62, eyeH * 0.62, def.fur, 5 + side)
      }
      break
    }
    default: {
      brush.dome(hx + hw * 0.28, cy + hh * 0.52, hw * 0.44, hh * 0.3, def.belly, 6.3)
      brush.blob(hx + hw * 0.42, cy + hh * 0.34, hw * 0.14, hh * 0.11, def.nose)
      break
    }
  }

  if (def.eyewear && def.eyewear !== 'none') {
    drawEyewear(brush, def, eyeCx, eyeY, hh, eyeW, eyeSpread)
    return
  }

  const scale = def.species === 'frog' ? 0.5 : 1
  if (eyes === 'hurt') {
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * eyeSpread
      const t = hh * 0.08
      brush.flat(
        [
          { x: ex - eyeW * 0.45 * scale, y: eyeY - eyeH * 0.28 * scale },
          { x: ex + eyeW * 0.45 * scale, y: eyeY + eyeH * 0.1 * scale },
          { x: ex + eyeW * 0.45 * scale, y: eyeY + eyeH * 0.1 * scale + t },
          { x: ex - eyeW * 0.45 * scale, y: eyeY - eyeH * 0.28 * scale + t },
        ],
        '#2b2723',
      )
      brush.flat(
        [
          { x: ex - eyeW * 0.45 * scale, y: eyeY + eyeH * 0.1 * scale },
          { x: ex + eyeW * 0.45 * scale, y: eyeY - eyeH * 0.28 * scale },
          { x: ex + eyeW * 0.45 * scale, y: eyeY - eyeH * 0.28 * scale + t },
          { x: ex - eyeW * 0.45 * scale, y: eyeY + eyeH * 0.1 * scale + t },
        ],
        '#2b2723',
      )
    }
    return
  }

  const hgt = (eyes === 'focus' ? eyeH * 0.66 : eyeH) * scale
  const wid = eyeW * scale
  for (const side of [-1, 1]) {
    const ex = eyeCx + side * eyeSpread
    brush.blob(ex, eyeY, wid * 0.5, hgt * 0.5, '#241f1c')
    brush.blob(ex - wid * 0.16, eyeY - hgt * 0.22, wid * 0.18, hgt * 0.2, '#fdfbf5')
  }
}

// ---------------------------------------------------------------- chest print

function drawPrint(
  brush: Brush,
  def: AvatarDef,
  lean: number,
  shoulderY: number,
  torsoH: number,
  tw: number,
): void {
  if (!def.print || def.print === 'none') return
  const cx = lean * 0.8 + tw * 0.08
  const cy = shoulderY + torsoH * 0.52
  const s = tw * 0.3
  const col = def.printColor ?? '#e8dfd0'

  switch (def.print) {
    case 'code':
      brush.flat(
        [
          { x: cx - s * 1.1, y: cy },
          { x: cx - s * 0.5, y: cy - s * 0.6 },
          { x: cx - s * 0.28, y: cy - s * 0.4 },
          { x: cx - s * 0.7, y: cy },
          { x: cx - s * 0.28, y: cy + s * 0.4 },
          { x: cx - s * 0.5, y: cy + s * 0.6 },
        ],
        col,
      )
      brush.flat(
        [
          { x: cx + s * 1.1, y: cy },
          { x: cx + s * 0.5, y: cy - s * 0.6 },
          { x: cx + s * 0.28, y: cy - s * 0.4 },
          { x: cx + s * 0.7, y: cy },
          { x: cx + s * 0.28, y: cy + s * 0.4 },
          { x: cx + s * 0.5, y: cy + s * 0.6 },
        ],
        col,
      )
      brush.flat(
        [
          { x: cx + s * 0.16, y: cy - s * 0.62 },
          { x: cx - s * 0.02, y: cy + s * 0.62 },
          { x: cx - s * 0.2, y: cy + s * 0.62 },
          { x: cx - s * 0.02, y: cy - s * 0.62 },
        ],
        col,
      )
      break
    case 'braces':
      brush.flat(rectPts(cx - s * 0.7, cy - s * 0.5, s * 0.2, s), col)
      brush.flat(rectPts(cx + s * 0.5, cy - s * 0.5, s * 0.2, s), col)
      break
    case 'tie':
      brush.flat(
        [
          { x: cx - s * 0.3, y: cy - s * 1.5 },
          { x: cx + s * 0.3, y: cy - s * 1.5 },
          { x: cx + s * 0.42, y: cy + s * 0.7 },
          { x: cx, y: cy + s * 1.1 },
          { x: cx - s * 0.42, y: cy + s * 0.7 },
        ],
        col,
      )
      break
    case 'star':
      brush.flat(
        [
          { x: cx, y: cy - s * 0.9 },
          { x: cx + s * 0.28, y: cy - s * 0.2 },
          { x: cx + s * 0.9, y: cy - s * 0.1 },
          { x: cx + s * 0.4, y: cy + s * 0.34 },
          { x: cx + s * 0.56, y: cy + s * 0.96 },
          { x: cx, y: cy + s * 0.58 },
          { x: cx - s * 0.56, y: cy + s * 0.96 },
          { x: cx - s * 0.4, y: cy + s * 0.34 },
          { x: cx - s * 0.9, y: cy - s * 0.1 },
          { x: cx - s * 0.28, y: cy - s * 0.2 },
        ],
        col,
      )
      break
  }
}

// ----------------------------------------------------------------------- tail

function drawTail(
  brush: Brush,
  def: AvatarDef,
  torsoW: number,
  torsoH: number,
  hipY: number,
  h: number,
  phase: number,
  pose: Pose,
): void {
  if (def.tail === 'none') return
  const baseX = -torsoW * 0.42
  const baseY = pose === 'jump' || pose === 'fall' ? hipY - torsoH * 0.3 : hipY - torsoH * 0.16
  const sway = Math.sin(phase * 0.05) * 0.2 + (pose === 'walk' ? Math.sin(phase * 0.3) * 0.2 : 0)

  switch (def.tail) {
    case 'ringed': {
      // A thick banded raccoon tail curling up behind.
      const segs = 5
      const len = h * 0.5
      for (let i = segs - 1; i >= 0; i--) {
        const t = i / segs
        const a = -0.5 - sway + t * -1.05
        const cx = baseX - Math.cos(a) * len * t * 0.9
        const cy = baseY + Math.sin(a) * len * t * 0.9 - t * h * 0.06
        const rr = h * (0.115 - t * 0.022)
        brush.dome(cx, cy, rr, rr * 0.94, i % 2 === 0 ? shade(def.fur, -0.34) : shade(def.fur, 0.1), i * 1.7)
      }
      break
    }
    case 'long': {
      const segs = 6
      const len = h * 0.6
      const top: Pt[] = []
      const bottom: Pt[] = []
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const a = -0.35 - sway * 1.4 - t * t * 1.7
        const cx = baseX - Math.cos(a) * len * t
        const cy = baseY + Math.sin(a) * len * t
        const w = h * 0.055 * (1 - t * 0.5)
        top.push({ x: cx, y: cy - w })
        bottom.unshift({ x: cx, y: cy + w })
      }
      brush.facet([...top, ...bottom], shade(def.fur, -0.06), { dark: 0.2 })
      break
    }
    case 'tufted': {
      const len = h * 0.46
      const a = -0.3 - sway
      const tipX = baseX - Math.cos(a) * len
      const tipY = baseY + Math.sin(a) * len * 0.4 + h * 0.12
      brush.facet(
        limb(baseX, baseY, Math.atan2(tipY - baseY, tipX - baseX), len, h * 0.05, 0.7),
        shade(def.fur, -0.1),
        { dark: 0.2 },
      )
      brush.blob(tipX, tipY, h * 0.075, h * 0.075, def.markings ?? shade(def.fur, -0.3))
      break
    }
    case 'stub': {
      brush.facet(
        [
          { x: baseX + h * 0.02, y: baseY - h * 0.05 },
          { x: baseX - h * 0.14, y: baseY + h * 0.02 },
          { x: baseX + h * 0.02, y: baseY + h * 0.08 },
        ],
        shade(def.fur, -0.14),
        { dark: 0.18 },
      )
      break
    }
  }
}

// ------------------------------------------------------------------ eyewear

function drawEyewear(
  brush: Brush,
  def: AvatarDef,
  eyeCx: number,
  eyeY: number,
  hh: number,
  eyeW: number,
  spread: number,
): void {
  const col = def.eyewearColor ?? '#2b2723'
  if (def.eyewear === 'shades') {
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * spread
      brush.facet(
        [
          { x: ex - eyeW * 0.62, y: eyeY - hh * 0.24 },
          { x: ex + eyeW * 0.62, y: eyeY - hh * 0.28 },
          { x: ex + eyeW * 0.5, y: eyeY + hh * 0.3 },
          { x: ex - eyeW * 0.5, y: eyeY + hh * 0.26 },
        ],
        col,
        { dark: 0.2, light: 0.24 },
      )
      brush.flat(
        [
          { x: ex - eyeW * 0.5, y: eyeY - hh * 0.16 },
          { x: ex - eyeW * 0.1, y: eyeY - hh * 0.18 },
          { x: ex - eyeW * 0.3, y: eyeY + hh * 0.06 },
          { x: ex - eyeW * 0.46, y: eyeY + hh * 0.04 },
        ],
        'rgba(255,255,255,0.4)',
      )
    }
    brush.flat(
      [
        { x: eyeCx - spread * 0.3, y: eyeY - hh * 0.14 },
        { x: eyeCx + spread * 0.3, y: eyeY - hh * 0.14 },
        { x: eyeCx + spread * 0.3, y: eyeY - hh * 0.04 },
        { x: eyeCx - spread * 0.3, y: eyeY - hh * 0.04 },
      ],
      col,
    )
    return
  }
  brush.flat(
    [
      { x: eyeCx - spread - eyeW * 0.8, y: eyeY - hh * 0.28 },
      { x: eyeCx + spread + eyeW * 0.8, y: eyeY - hh * 0.28 },
      { x: eyeCx + spread + eyeW * 0.8, y: eyeY + hh * 0.28 },
      { x: eyeCx - spread - eyeW * 0.8, y: eyeY + hh * 0.28 },
    ],
    col,
  )
  for (const side of [-1, 1]) {
    brush.blob(eyeCx + side * spread, eyeY, eyeW * 0.56, hh * 0.22, '#cfe9f2')
  }
}

// ---------------------------------------------------------------------- hats

function drawHat(brush: Brush, def: AvatarDef, r: Rig): void {
  const { hx, headCy: cy, hw, hh } = r
  const col = def.hatColor ?? '#3a3733'
  const accent = def.hatAccent ?? '#c8483c'
  const hatY = cy - hh * 0.86

  switch (def.hat) {
    case 'hood': {
      // Pushed back off the head, bunched around the shoulders.
      brush.facet(
        [
          { x: hx - hw * 1.16, y: cy + hh * 1.05 },
          { x: hx - hw * 1.2, y: cy + hh * 0.12 },
          { x: hx - hw * 0.7, y: cy + hh * 0.54 },
          { x: hx + hw * 0.72, y: cy + hh * 0.52 },
          { x: hx + hw * 1.16, y: cy + hh * 0.1 },
          { x: hx + hw * 1.12, y: cy + hh * 1.06 },
        ],
        col,
        { dark: 0.24, light: 0.12 },
      )
      break
    }
    case 'beanie': {
      brush.facet(
        [
          { x: hx - hw * 1.0, y: hatY + hh * 0.36 },
          { x: hx - hw * 0.88, y: hatY - hh * 0.4 },
          { x: hx - hw * 0.28, y: hatY - hh * 0.74 },
          { x: hx + hw * 0.44, y: hatY - hh * 0.66 },
          { x: hx + hw * 0.9, y: hatY - hh * 0.34 },
          { x: hx + hw * 1.0, y: hatY + hh * 0.36 },
        ],
        col,
        { dark: 0.2, light: 0.12 },
      )
      break
    }
    case 'headband': {
      // Ninja: a dark cap, a bright band, two trailing tails.
      brush.facet(
        [
          { x: hx - hw * 1.0, y: hatY + hh * 0.34 },
          { x: hx - hw * 0.9, y: hatY - hh * 0.42 },
          { x: hx - hw * 0.26, y: hatY - hh * 0.78 },
          { x: hx + hw * 0.46, y: hatY - hh * 0.68 },
          { x: hx + hw * 0.92, y: hatY - hh * 0.32 },
          { x: hx + hw * 1.0, y: hatY + hh * 0.34 },
        ],
        col,
        { dark: 0.22, light: 0.12 },
      )
      brush.facet(
        [
          { x: hx - hw * 1.02, y: hatY + hh * 0.06 },
          { x: hx + hw * 1.02, y: hatY + hh * 0.02 },
          { x: hx + hw * 1.0, y: hatY + hh * 0.42 },
          { x: hx - hw * 1.0, y: hatY + hh * 0.46 },
        ],
        accent,
        { dark: 0.18, light: 0.12 },
      )
      brush.blob(hx - hw * 1.02, hatY + hh * 0.24, hw * 0.16, hh * 0.18, accent)
      brush.facet(
        [
          { x: hx - hw * 1.06, y: hatY + hh * 0.12 },
          { x: hx - hw * 1.72, y: hatY + hh * 0.02 },
          { x: hx - hw * 1.62, y: hatY + hh * 0.3 },
        ],
        shade(accent, -0.12),
        { flat: true },
      )
      brush.facet(
        [
          { x: hx - hw * 1.04, y: hatY + hh * 0.3 },
          { x: hx - hw * 1.66, y: hatY + hh * 0.52 },
          { x: hx - hw * 1.5, y: hatY + hh * 0.68 },
        ],
        shade(accent, -0.24),
        { flat: true },
      )
      break
    }
    case 'visor': {
      brush.flat(rectPts(hx - hw * 0.96, hatY + hh * 0.02, hw * 1.92, hh * 0.3), col)
      brush.facet(
        [
          { x: hx + hw * 0.5, y: hatY + hh * 0.06 },
          { x: hx + hw * 1.6, y: hatY + hh * 0.12 },
          { x: hx + hw * 1.56, y: hatY + hh * 0.34 },
          { x: hx + hw * 0.5, y: hatY + hh * 0.32 },
        ],
        accent,
        { flat: true },
      )
      break
    }
    case 'cap': {
      brush.facet(
        [
          { x: hx - hw * 0.96, y: hatY + hh * 0.24 },
          { x: hx - hw * 0.76, y: hatY - hh * 0.5 },
          { x: hx + hw * 0.7, y: hatY - hh * 0.44 },
          { x: hx + hw * 0.96, y: hatY + hh * 0.22 },
        ],
        col,
        { dark: 0.2, light: 0.12 },
      )
      brush.facet(
        [
          { x: hx + hw * 0.6, y: hatY + hh * 0.14 },
          { x: hx + hw * 1.56, y: hatY + hh * 0.18 },
          { x: hx + hw * 1.52, y: hatY + hh * 0.38 },
          { x: hx + hw * 0.6, y: hatY + hh * 0.38 },
        ],
        accent,
        { flat: true },
      )
      break
    }
    case 'bow': {
      const bx = hx - hw * 0.5
      const by = hatY - hh * 0.3
      for (const side of [-1, 1]) {
        brush.facet(
          [
            { x: bx, y: by },
            { x: bx + side * hw * 0.62, y: by - hh * 0.34 },
            { x: bx + side * hw * 0.66, y: by + hh * 0.26 },
          ],
          col,
          { dark: 0.2, light: 0.16 },
        )
      }
      brush.blob(bx, by, hw * 0.15, hh * 0.16, shade(col, -0.2))
      break
    }
    default:
      break
  }
}

// --------------------------------------------------------------------- props

function drawProp(
  brush: Brush,
  def: AvatarDef,
  hx: number,
  hy: number,
  angle: number,
  h: number,
  pose: Pose,
): void {
  const col = def.accessoryColor ?? '#8a8378'
  const accent = def.accessoryAccent ?? shade(col, -0.28)
  const c = Math.cos(angle)
  const s = Math.sin(angle)

  switch (def.accessory) {
    case 'laptop': {
      const w = h * 0.32
      const d = h * 0.23
      const open = pose === 'swingFwd' || pose === 'swingUp' ? 0.5 : 1
      brush.facet(
        [
          { x: hx - w * 0.12, y: hy + d * 0.1 },
          { x: hx + w, y: hy + d * 0.1 },
          { x: hx + w * 0.9, y: hy + d * 0.3 },
          { x: hx - w * 0.22, y: hy + d * 0.3 },
        ],
        accent,
        { flat: true },
      )
      brush.facet(
        [
          { x: hx - w * 0.12, y: hy + d * 0.1 },
          { x: hx + w * 0.86, y: hy + d * 0.1 },
          { x: hx + w * 0.78, y: hy + d * 0.1 - d * open },
          { x: hx - w * 0.18, y: hy + d * 0.1 - d * open },
        ],
        col,
        { dark: 0.2, light: 0.14 },
      )
      brush.flat(
        [
          { x: hx + w * 0.02, y: hy + d * 0.04 },
          { x: hx + w * 0.76, y: hy + d * 0.04 },
          { x: hx + w * 0.7, y: hy + d * 0.06 - d * open * 0.84 },
          { x: hx - w * 0.04, y: hy + d * 0.06 - d * open * 0.84 },
        ],
        '#7fd6e0',
      )
      break
    }
    case 'briefcase': {
      const w = h * 0.3
      const d = h * 0.24
      brush.facet(
        [
          { x: hx - w * 0.5, y: hy + d * 0.16 },
          { x: hx + w * 0.5, y: hy + d * 0.16 },
          { x: hx + w * 0.5, y: hy + d * 1.05 },
          { x: hx - w * 0.5, y: hy + d * 1.05 },
        ],
        col,
        { dark: 0.26, light: 0.14 },
      )
      brush.flat(rectPts(hx - w * 0.5, hy + d * 0.5, w, d * 0.12), accent)
      brush.flat(
        [
          { x: hx - w * 0.2, y: hy + d * 0.16 },
          { x: hx + w * 0.2, y: hy + d * 0.16 },
          { x: hx + w * 0.2, y: hy },
          { x: hx + w * 0.12, y: hy },
          { x: hx + w * 0.12, y: hy + d * 0.08 },
          { x: hx - w * 0.12, y: hy + d * 0.08 },
          { x: hx - w * 0.12, y: hy },
          { x: hx - w * 0.2, y: hy },
        ],
        accent,
      )
      break
    }
    case 'handbag': {
      const w = h * 0.24
      const d = h * 0.2
      brush.flat(
        [
          { x: hx - w * 0.24, y: hy },
          { x: hx - w * 0.16, y: hy },
          { x: hx - w * 0.02, y: hy + d * 0.5 },
          { x: hx - w * 0.1, y: hy + d * 0.5 },
        ],
        accent,
      )
      brush.facet(
        [
          { x: hx - w * 0.5, y: hy + d * 0.5 },
          { x: hx + w * 0.5, y: hy + d * 0.5 },
          { x: hx + w * 0.38, y: hy + d * 1.3 },
          { x: hx - w * 0.38, y: hy + d * 1.3 },
        ],
        col,
        { dark: 0.24, light: 0.18 },
      )
      brush.blob(hx, hy + d * 0.78, w * 0.12, d * 0.12, accent)
      break
    }
    case 'mug': {
      const w = h * 0.13
      brush.facet(rectPts(hx - w * 0.5, hy - w * 0.2, w, w * 1.1), col, { dark: 0.22, light: 0.14 })
      brush.flat(rectPts(hx - w * 0.5, hy - w * 0.2, w, w * 0.18), shade(col, 0.2))
      break
    }
    case 'bottle': {
      brush.facet(rectPts(hx - h * 0.03, hy - h * 0.12, h * 0.07, h * 0.17), col, { dark: 0.2 })
      brush.flat(rectPts(hx - h * 0.02, hy - h * 0.16, h * 0.045, h * 0.05), accent)
      break
    }
    case 'staff': {
      const len = h * 0.94
      brush.facet(limb(hx - c * len * 0.34, hy - s * len * 0.34, angle, len, h * 0.05), col, {
        dark: 0.24,
      })
      const lx = hx + c * len * 0.5
      const ly = hy + s * len * 0.5
      brush.facet(
        [
          { x: lx, y: ly },
          { x: lx + h * 0.1, y: ly - h * 0.07 },
          { x: lx + h * 0.14, y: ly + h * 0.01 },
        ],
        accent,
        { dark: 0.2 },
      )
      break
    }
    case 'fan': {
      const r = h * 0.22
      const pts: Pt[] = [{ x: hx, y: hy }]
      for (let i = 0; i <= 6; i++) {
        const a = angle - 0.7 + (i / 6) * 1.4
        pts.push({ x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r })
      }
      brush.facet(pts, col, { dark: 0.2, light: 0.18 })
      break
    }
    default:
      break
  }
}
