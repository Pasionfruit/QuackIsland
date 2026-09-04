/**
 * The Polyland campers: chunky low-poly chibi people, flat-shaded facet by
 * facet.
 *
 * Everything is authored in "local" space - origin at the feet, +x forward,
 * -y up, sized in fractions of the character's height - and then placed into
 * the world with facing, squash and spin applied. Shading happens in world
 * space, so the light stays in the same place no matter which way a camper
 * faces or how far they are tumbling.
 */
import {
  ellipse,
  facet,
  fillPoly,
  limb,
  rectPts,
  shade,
  softShadow,
  type FacetOpts,
  type Pt,
} from '../lib/draw'

export type HairStyle = 'short' | 'long' | 'curly' | 'bob' | 'bun' | 'buzz' | 'ponytail'
export type HatStyle =
  | 'none'
  | 'toque'
  | 'bucket'
  | 'cap'
  | 'beanie'
  | 'helmet'
  | 'safari'
  | 'hood'
  | 'visor'
export type Accessory = 'none' | 'pan' | 'staff' | 'rod' | 'board' | 'laptop' | 'bottle'
export type Eyewear = 'none' | 'goggles' | 'shades' | 'snorkel'
export type Sleeves = 'long' | 'short' | 'tank'

export interface AvatarDef {
  skin: string
  hair: string
  hairStyle: HairStyle
  top: string
  legs: string
  shoes?: string
  sleeves?: Sleeves
  hat: HatStyle
  hatColor?: string
  hatAccent?: string
  accessory: Accessory
  accessoryColor?: string
  accessoryAccent?: string
  /** Backpack colour; omit for none. */
  pack?: string
  /** Shoulder-bag strap colour. */
  satchel?: string
  eyewear?: Eyewear
  eyewearColor?: string
  /** Over-ear headphones in this colour. */
  headphones?: string
  /** Apron, bib or jersey panel. */
  accent?: string
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

// Proportions, as fractions of total height. Chibi: the head is enormous.
const LEG_H = 0.24
const TORSO_H = 0.3
const HEAD_H = 0.46
const TORSO_W = 0.44
const HEAD_W = 0.54
const LEG_W = 0.14
const ARM_W = 0.11
const ARM_L = 0.24

interface Brush {
  facet: (pts: Pt[], color: string, opts?: FacetOpts) => void
  flat: (pts: Pt[], color: string) => void
  blob: (cx: number, cy: number, rx: number, ry: number, color: string) => void
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

  if (o.shadow) softShadow(ctx, x, y + h * 0.02, h * 0.3, h * 0.075, 0.24)

  const brush: Brush = {
    facet: (pts, color, opts) => {
      if (o.tint) fillPoly(ctx, place(pts), o.tint)
      else facet(ctx, place(pts), color, opts)
    },
    flat: (pts, color) => fillPoly(ctx, place(pts), o.tint ?? color),
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
  const shoes = def.shoes ?? shade(def.legs, -0.3)
  const sleeves = def.sleeves ?? 'long'

  // --------------------------------------------------------------- posing
  const walkSwing = Math.sin(phase * 0.3) * 0.45
  let legFront = 0.06
  let legBack = -0.06
  let armFront = 1.35
  let armBack = 1.75
  let lean = 0
  let propAngle = 0.5
  let eyes: 'open' | 'hurt' | 'focus' = 'open'

  switch (pose) {
    case 'walk':
      legFront = walkSwing
      legBack = -walkSwing
      armFront = 1.35 - walkSwing * 0.5
      armBack = 1.75 + walkSwing * 0.5
      lean = 0.35
      break
    case 'jump':
      legFront = 0.5
      legBack = -0.35
      armFront = 0.35
      armBack = 0.15
      lean = -0.3
      break
    case 'fall':
      legFront = -0.3
      legBack = 0.35
      armFront = 0.7
      armBack = 0.5
      break
    case 'hurt':
      legFront = -0.5
      legBack = 0.5
      armFront = -0.2
      armBack = -0.5
      lean = -1.2
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
      armFront = -0.08
      armBack = 2.1
      lean = 1.1
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
      lean = 0.6
      propAngle = 1.25
      eyes = 'focus'
      break
    case 'brace':
      legFront = 0.25
      legBack = -0.25
      armFront = 0.9
      armBack = 2.2
      lean = 0.5
      eyes = 'focus'
      break
    default:
      armFront = 1.35 + Math.sin(phase * 0.08) * 0.06
      armBack = 1.78 - Math.sin(phase * 0.08) * 0.06
  }

  const headTilt = lean * 0.5
  const hx = lean * 1.9

  // ------------------------------------------------------------- back arm
  const backSleeve = sleeves === 'tank' ? def.skin : def.top
  brush.facet(
    limb(-torsoW * 0.16, shoulderY + torsoH * 0.16, Math.PI / 2 + armBack - 1.57, armL, armW, 0.85),
    shade(backSleeve, -0.18),
    { flat: true, dark: 0.12 },
  )

  // ----------------------------------------------------------------- legs
  const drawLeg = (swing: number, tone: number) => {
    const ox = swing >= 0 ? legW * 0.34 : -legW * 0.34
    const ang = Math.PI / 2 - swing
    brush.facet(limb(ox, hipY, ang, legH * 1.02, legW, 0.88), shade(def.legs, tone), {
      dark: 0.2,
      light: 0.1,
    })
    const footX = ox + Math.cos(ang) * legH
    const footY = hipY + Math.sin(ang) * legH
    brush.facet(
      [
        { x: footX - legW * 0.5, y: footY - legW * 0.34 },
        { x: footX + legW * 0.62, y: footY - legW * 0.3 },
        { x: footX + legW * 0.7, y: footY + legW * 0.06 },
        { x: footX - legW * 0.5, y: footY + legW * 0.06 },
      ],
      shade(shoes, tone),
      { dark: 0.18 },
    )
  }
  drawLeg(legBack, -0.18)
  drawLeg(legFront, 0)

  // ----------------------------------------------------------------- pack
  if (def.pack) {
    const packW = torsoW * 0.58
    const packH = torsoH * 1.06
    const px0 = -torsoW * 0.5 - packW * 0.5
    const py0 = shoulderY + torsoH * 0.04
    brush.facet(
      [
        { x: px0 + packW * 0.2, y: py0 },
        { x: px0 + packW, y: py0 - packH * 0.05 },
        { x: px0 + packW, y: py0 + packH },
        { x: px0 + packW * 0.1, y: py0 + packH * 0.88 },
        { x: px0 - packW * 0.05, y: py0 + packH * 0.34 },
      ],
      def.pack,
      { dark: 0.2 },
    )
    brush.flat(
      rectPts(px0 + packW * 0.12, py0 + packH * 0.42, packW * 0.7, packH * 0.12),
      shade(def.pack, -0.3),
    )
  }

  // ---------------------------------------------------------------- torso
  const tw = torsoW / 2
  const torso: Pt[] = [
    { x: -tw * 0.84 + lean * 1.2, y: shoulderY },
    { x: tw * 0.84 + lean * 1.2, y: shoulderY },
    { x: tw, y: shoulderY + torsoH * 0.46 },
    { x: tw * 0.9, y: hipY },
    { x: -tw * 0.9, y: hipY },
    { x: -tw, y: shoulderY + torsoH * 0.46 },
  ]
  brush.facet(torso, def.top, { dark: 0.24, light: 0.14 })

  if (def.accent) {
    brush.flat(
      [
        { x: -tw * 0.4 + lean, y: shoulderY + torsoH * 0.24 },
        { x: tw * 0.5 + lean, y: shoulderY + torsoH * 0.24 },
        { x: tw * 0.44, y: hipY },
        { x: -tw * 0.34, y: hipY },
      ],
      def.accent,
    )
  }
  if (def.satchel) {
    brush.flat(
      [
        { x: -tw * 0.7 + lean * 1.1, y: shoulderY + torsoH * 0.02 },
        { x: -tw * 0.4 + lean * 1.1, y: shoulderY },
        { x: tw * 0.8, y: hipY + torsoH * 0.1 },
        { x: tw * 0.55, y: hipY + torsoH * 0.14 },
      ],
      def.satchel,
    )
    brush.facet(
      rectPts(tw * 0.5, hipY - torsoH * 0.06, tw * 0.7, torsoH * 0.34),
      def.satchel,
      { dark: 0.2 },
    )
  }

  // ----------------------------------------------------------------- head
  const headPts: Pt[] = [
    { x: hx - hw, y: headCy - hh * 0.4 },
    { x: hx - hw * 0.72, y: headCy - hh * 0.88 },
    { x: hx - hw * 0.28, y: headCy - hh },
    { x: hx + hw * 0.32, y: headCy - hh },
    { x: hx + hw * 0.74, y: headCy - hh * 0.86 },
    { x: hx + hw, y: headCy - hh * 0.36 },
    { x: hx + hw * 0.94, y: headCy + hh * 0.4 },
    { x: hx + hw * 0.54, y: headCy + hh * 0.92 },
    { x: hx - hw * 0.5, y: headCy + hh * 0.94 },
    { x: hx - hw * 0.94, y: headCy + hh * 0.42 },
  ]

  // Long hair sits behind the head.
  if (def.hairStyle === 'long' || def.hairStyle === 'bob' || def.hairStyle === 'ponytail') {
    const drop = def.hairStyle === 'long' ? hh * 1.55 : def.hairStyle === 'bob' ? hh * 0.8 : hh * 1.1
    brush.facet(
      [
        { x: hx - hw * 1.08, y: headCy - hh * 0.86 },
        { x: hx + hw * 1.08, y: headCy - hh * 0.86 },
        { x: hx + hw * 1.02, y: headCy + drop * 0.9 },
        { x: hx + hw * 0.46, y: headCy + drop * 0.78 },
        { x: hx - hw * 0.46, y: headCy + drop * 0.84 },
        { x: hx - hw * 1.02, y: headCy + drop },
      ],
      shade(def.hair, -0.12),
      { dark: 0.2 },
    )
  }
  if (def.hairStyle === 'ponytail') {
    brush.facet(
      [
        { x: hx - hw * 0.9, y: headCy - hh * 0.5 },
        { x: hx - hw * 1.5, y: headCy - hh * 0.1 },
        { x: hx - hw * 1.62, y: headCy + hh * 0.7 },
        { x: hx - hw * 1.2, y: headCy + hh * 0.5 },
        { x: hx - hw * 0.86, y: headCy + hh * 0.1 },
      ],
      def.hair,
      { dark: 0.24 },
    )
  }

  brush.facet(headPts, def.skin, { dark: 0.16, light: 0.12, split: 0.15 })

  // ----------------------------------------------------------------- hair
  if (def.hairStyle !== 'buzz' || def.hat === 'none') {
    brush.facet(hairShape(def.hairStyle, hx, headCy, hw, hh), def.hair, {
      dark: 0.24,
      light: 0.16,
    })
  }
  if (def.hairStyle === 'bun') {
    brush.blob(hx - hw * 0.5, headCy - hh * 1.12, hw * 0.36, hh * 0.34, shade(def.hair, 0.06))
  }

  // ------------------------------------------------------------------ hat
  drawHat(brush, def, hx, headCy, hw, hh)

  // ----------------------------------------------------------------- face
  const eyeW = hw * 0.4
  const eyeH = hh * 0.54
  const eyeY = headCy + hh * 0.08 + headTilt * 1.2
  const eyeSpread = hw * 0.42
  const eyeCx = hx + hw * 0.16

  if (def.eyewear && def.eyewear !== 'none') {
    drawEyewear(brush, def, eyeCx, eyeY, hh, eyeW, eyeSpread)
  } else if (eyes === 'hurt') {
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * eyeSpread
      const t = hh * 0.09
      brush.flat(
        [
          { x: ex - eyeW * 0.5, y: eyeY - eyeH * 0.3 },
          { x: ex + eyeW * 0.5, y: eyeY + eyeH * 0.1 },
          { x: ex + eyeW * 0.5, y: eyeY + eyeH * 0.1 + t },
          { x: ex - eyeW * 0.5, y: eyeY - eyeH * 0.3 + t },
        ],
        '#2b2723',
      )
      brush.flat(
        [
          { x: ex - eyeW * 0.5, y: eyeY + eyeH * 0.1 },
          { x: ex + eyeW * 0.5, y: eyeY - eyeH * 0.3 },
          { x: ex + eyeW * 0.5, y: eyeY - eyeH * 0.3 + t },
          { x: ex - eyeW * 0.5, y: eyeY + eyeH * 0.1 + t },
        ],
        '#2b2723',
      )
    }
  } else {
    const hgt = eyes === 'focus' ? eyeH * 0.66 : eyeH
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * eyeSpread
      brush.blob(ex, eyeY, eyeW * 0.5, hgt * 0.5, '#26221f')
      brush.blob(ex - eyeW * 0.16, eyeY - hgt * 0.2, eyeW * 0.17, hgt * 0.2, '#fdfbf5')
    }
  }

  if (def.headphones) {
    const band: Pt[] = []
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI
      band.push({ x: hx + Math.cos(a) * hw * 1.02, y: headCy - hh * 0.34 + Math.sin(a) * hh * 0.86 })
    }
    for (let i = 12; i >= 0; i--) {
      const a = Math.PI + (i / 12) * Math.PI
      band.push({
        x: hx + Math.cos(a) * hw * 0.84,
        y: headCy - hh * 0.34 + Math.sin(a) * hh * 0.68,
      })
    }
    brush.facet(band, def.headphones, { dark: 0.24 })
    brush.facet(
      rectPts(hx + hw * 0.68, headCy - hh * 0.42, hw * 0.42, hh * 0.62),
      def.headphones,
      { dark: 0.2 },
    )
    brush.facet(
      rectPts(hx - hw * 1.1, headCy - hh * 0.42, hw * 0.42, hh * 0.62),
      shade(def.headphones, -0.16),
      { flat: true },
    )
  }

  // ------------------------------------------------- front arm and the prop
  const shoulderX = torsoW * 0.2 + lean * 1.4
  const armAngle = Math.PI / 2 + armFront - 1.57
  const handX = shoulderX + Math.cos(armAngle) * armL
  const handY = shoulderY + torsoH * 0.16 + Math.sin(armAngle) * armL

  drawProp(brush, def, handX, handY, propAngle, h, pose)

  const frontSleeve = sleeves === 'tank' ? def.skin : def.top
  brush.facet(limb(shoulderX, shoulderY + torsoH * 0.16, armAngle, armL, armW, 0.85), frontSleeve, {
    dark: 0.18,
    light: 0.12,
  })
  if (sleeves === 'long') {
    brush.blob(handX, handY, armW * 0.55, armW * 0.55, def.skin)
  } else {
    brush.facet(
      limb(
        shoulderX + Math.cos(armAngle) * armL * 0.45,
        shoulderY + torsoH * 0.16 + Math.sin(armAngle) * armL * 0.45,
        armAngle,
        armL * 0.6,
        armW * 0.92,
        0.9,
      ),
      def.skin,
      { dark: 0.16 },
    )
  }

  ctx.globalAlpha = prevAlpha
}

// --------------------------------------------------------------------- hair

function hairShape(style: HairStyle, hx: number, cy: number, hw: number, hh: number): Pt[] {
  const top = cy - hh * 1.1
  switch (style) {
    case 'curly':
      return [
        { x: hx - hw * 1.08, y: cy - hh * 0.16 },
        { x: hx - hw * 1.14, y: cy - hh * 0.66 },
        { x: hx - hw * 0.74, y: top + hh * 0.12 },
        { x: hx - hw * 0.26, y: top - hh * 0.08 },
        { x: hx + hw * 0.24, y: top + hh * 0.14 },
        { x: hx + hw * 0.72, y: top - hh * 0.02 },
        { x: hx + hw * 1.12, y: cy - hh * 0.52 },
        { x: hx + hw * 1.04, y: cy - hh * 0.08 },
        { x: hx + hw * 0.62, y: cy - hh * 0.46 },
        { x: hx + hw * 0.16, y: cy - hh * 0.2 },
        { x: hx - hw * 0.32, y: cy - hh * 0.48 },
        { x: hx - hw * 0.7, y: cy - hh * 0.18 },
      ]
    case 'bob':
      return [
        { x: hx - hw * 1.04, y: cy - hh * 0.06 },
        { x: hx - hw * 1.04, y: cy - hh * 0.72 },
        { x: hx - hw * 0.52, y: top },
        { x: hx + hw * 0.54, y: top },
        { x: hx + hw * 1.04, y: cy - hh * 0.7 },
        { x: hx + hw * 1.04, y: cy - hh * 0.02 },
        { x: hx + hw * 0.5, y: cy - hh * 0.4 },
        { x: hx - hw * 0.18, y: cy - hh * 0.32 },
      ]
    case 'long':
    case 'ponytail':
      return [
        { x: hx - hw * 1.06, y: cy - hh * 0.2 },
        { x: hx - hw * 1.06, y: cy - hh * 0.76 },
        { x: hx - hw * 0.46, y: top },
        { x: hx + hw * 0.48, y: top },
        { x: hx + hw * 1.06, y: cy - hh * 0.68 },
        { x: hx + hw * 1.02, y: cy - hh * 0.02 },
        { x: hx + hw * 0.44, y: cy - hh * 0.52 },
        { x: hx - hw * 0.34, y: cy - hh * 0.34 },
      ]
    case 'bun':
    case 'buzz':
      return [
        { x: hx - hw * 1.02, y: cy - hh * 0.4 },
        { x: hx - hw * 0.86, y: cy - hh * 0.92 },
        { x: hx - hw * 0.2, y: top + hh * 0.04 },
        { x: hx + hw * 0.5, y: cy - hh * 0.94 },
        { x: hx + hw * 1.02, y: cy - hh * 0.44 },
        { x: hx + hw * 0.98, y: cy - hh * 0.2 },
        { x: hx - hw * 0.98, y: cy - hh * 0.24 },
      ]
    default:
      // Short and slightly spiky.
      return [
        { x: hx - hw * 1.04, y: cy - hh * 0.22 },
        { x: hx - hw * 1.1, y: cy - hh * 0.76 },
        { x: hx - hw * 0.54, y: top + hh * 0.08 },
        { x: hx - hw * 0.12, y: top - hh * 0.06 },
        { x: hx + hw * 0.36, y: top + hh * 0.06 },
        { x: hx + hw * 0.88, y: top - hh * 0.02 },
        { x: hx + hw * 1.1, y: cy - hh * 0.5 },
        { x: hx + hw * 1.0, y: cy - hh * 0.14 },
        { x: hx + hw * 0.42, y: cy - hh * 0.5 },
        { x: hx - hw * 0.22, y: cy - hh * 0.32 },
        { x: hx - hw * 0.62, y: cy - hh * 0.52 },
      ]
  }
}

// ---------------------------------------------------------------------- hats

function drawHat(brush: Brush, def: AvatarDef, hx: number, cy: number, hw: number, hh: number): void {
  const col = def.hatColor ?? '#f4f1e6'
  const accent = def.hatAccent ?? shade(col, -0.3)
  const hatY = cy - hh * 0.9

  switch (def.hat) {
    case 'toque':
      brush.facet(rectPts(hx - hw * 0.84, hatY - hh * 0.3, hw * 1.68, hh * 0.34), col, { dark: 0.16 })
      brush.facet(
        [
          { x: hx - hw * 0.88, y: hatY - hh * 0.28 },
          { x: hx - hw * 1.0, y: hatY - hh * 0.8 },
          { x: hx - hw * 0.56, y: hatY - hh * 1.18 },
          { x: hx - hw * 0.06, y: hatY - hh * 0.88 },
          { x: hx + hw * 0.44, y: hatY - hh * 1.2 },
          { x: hx + hw * 0.94, y: hatY - hh * 0.86 },
          { x: hx + hw * 0.9, y: hatY - hh * 0.28 },
        ],
        col,
        { dark: 0.18, light: 0.1 },
      )
      break

    case 'bucket':
      brush.facet(
        [
          { x: hx - hw * 1.36, y: hatY + hh * 0.16 },
          { x: hx - hw * 0.88, y: hatY - hh * 0.14 },
          { x: hx + hw * 0.9, y: hatY - hh * 0.14 },
          { x: hx + hw * 1.36, y: hatY + hh * 0.16 },
          { x: hx + hw * 0.84, y: hatY + hh * 0.36 },
          { x: hx - hw * 0.84, y: hatY + hh * 0.36 },
        ],
        col,
        { dark: 0.22 },
      )
      brush.facet(
        [
          { x: hx - hw * 0.82, y: hatY - hh * 0.06 },
          { x: hx - hw * 0.62, y: hatY - hh * 0.66 },
          { x: hx + hw * 0.6, y: hatY - hh * 0.66 },
          { x: hx + hw * 0.82, y: hatY - hh * 0.06 },
        ],
        col,
        { dark: 0.18, light: 0.12 },
      )
      break

    case 'safari':
      brush.facet(
        [
          { x: hx - hw * 1.5, y: hatY + hh * 0.2 },
          { x: hx - hw * 0.9, y: hatY - hh * 0.1 },
          { x: hx + hw * 0.92, y: hatY - hh * 0.1 },
          { x: hx + hw * 1.5, y: hatY + hh * 0.2 },
          { x: hx + hw * 0.86, y: hatY + hh * 0.44 },
          { x: hx - hw * 0.86, y: hatY + hh * 0.44 },
        ],
        col,
        { dark: 0.24 },
      )
      brush.facet(
        [
          { x: hx - hw * 0.84, y: hatY - hh * 0.02 },
          { x: hx - hw * 0.66, y: hatY - hh * 0.78 },
          { x: hx + hw * 0.64, y: hatY - hh * 0.78 },
          { x: hx + hw * 0.84, y: hatY - hh * 0.02 },
        ],
        col,
        { dark: 0.18, light: 0.12 },
      )
      brush.flat(rectPts(hx - hw * 0.84, hatY - hh * 0.26, hw * 1.68, hh * 0.22), accent)
      break

    case 'cap':
      brush.facet(
        [
          { x: hx - hw * 0.96, y: hatY + hh * 0.12 },
          { x: hx - hw * 0.76, y: hatY - hh * 0.62 },
          { x: hx + hw * 0.7, y: hatY - hh * 0.56 },
          { x: hx + hw * 0.96, y: hatY + hh * 0.1 },
        ],
        col,
        { dark: 0.2, light: 0.12 },
      )
      brush.facet(
        [
          { x: hx + hw * 0.6, y: hatY + hh * 0.02 },
          { x: hx + hw * 1.5, y: hatY + hh * 0.06 },
          { x: hx + hw * 1.48, y: hatY + hh * 0.24 },
          { x: hx + hw * 0.6, y: hatY + hh * 0.26 },
        ],
        accent,
        { flat: true },
      )
      break

    case 'visor':
      brush.flat(rectPts(hx - hw * 0.96, hatY - hh * 0.12, hw * 1.92, hh * 0.28), col)
      brush.facet(
        [
          { x: hx + hw * 0.5, y: hatY - hh * 0.06 },
          { x: hx + hw * 1.52, y: hatY },
          { x: hx + hw * 1.5, y: hatY + hh * 0.2 },
          { x: hx + hw * 0.5, y: hatY + hh * 0.2 },
        ],
        accent,
        { flat: true },
      )
      break

    case 'beanie':
      brush.facet(
        [
          { x: hx - hw * 1.02, y: hatY + hh * 0.28 },
          { x: hx - hw * 0.88, y: hatY - hh * 0.56 },
          { x: hx - hw * 0.3, y: hatY - hh * 0.86 },
          { x: hx + hw * 0.42, y: hatY - hh * 0.8 },
          { x: hx + hw * 0.88, y: hatY - hh * 0.5 },
          { x: hx + hw * 1.02, y: hatY + hh * 0.28 },
        ],
        col,
        { dark: 0.2, light: 0.12 },
      )
      brush.flat(rectPts(hx - hw * 1.04, hatY + hh * 0.16, hw * 2.08, hh * 0.3), shade(col, -0.16))
      break

    case 'helmet':
      brush.facet(
        [
          { x: hx - hw * 1.06, y: hatY + hh * 0.26 },
          { x: hx - hw * 1.0, y: hatY - hh * 0.5 },
          { x: hx - hw * 0.44, y: hatY - hh * 0.96 },
          { x: hx + hw * 0.4, y: hatY - hh * 0.92 },
          { x: hx + hw * 1.02, y: hatY - hh * 0.42 },
          { x: hx + hw * 1.24, y: hatY + hh * 0.24 },
          { x: hx + hw * 0.9, y: hatY + hh * 0.3 },
          { x: hx - hw * 0.9, y: hatY + hh * 0.32 },
        ],
        col,
        { dark: 0.22, light: 0.16 },
      )
      // Vents.
      for (let i = 0; i < 3; i++) {
        brush.flat(
          [
            { x: hx - hw * 0.6 + i * hw * 0.5, y: hatY - hh * 0.82 },
            { x: hx - hw * 0.36 + i * hw * 0.5, y: hatY - hh * 0.86 },
            { x: hx - hw * 0.42 + i * hw * 0.5, y: hatY - hh * 0.28 },
            { x: hx - hw * 0.62 + i * hw * 0.5, y: hatY - hh * 0.24 },
          ],
          accent,
        )
      }
      break

    case 'hood':
      brush.facet(
        [
          { x: hx - hw * 1.22, y: cy + hh * 0.9 },
          { x: hx - hw * 1.24, y: cy - hh * 0.5 },
          { x: hx - hw * 0.6, y: cy - hh * 1.24 },
          { x: hx + hw * 0.44, y: cy - hh * 1.2 },
          { x: hx + hw * 1.2, y: cy - hh * 0.42 },
          { x: hx + hw * 1.16, y: cy + hh * 0.5 },
          { x: hx + hw * 0.8, y: cy + hh * 1.0 },
          { x: hx - hw * 0.9, y: cy + hh * 1.02 },
        ],
        col,
        { dark: 0.24, light: 0.14 },
      )
      break

    default:
      break
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
  const col = def.eyewearColor ?? '#3b4a55'
  switch (def.eyewear) {
    case 'shades':
      brush.flat(
        rectPts(eyeCx - spread - eyeW * 0.7, eyeY - hh * 0.2, spread * 2 + eyeW * 1.4, hh * 0.42),
        col,
      )
      brush.flat(
        rectPts(eyeCx - spread - eyeW * 0.66, eyeY - hh * 0.16, eyeW * 0.5, hh * 0.12),
        'rgba(255,255,255,0.35)',
      )
      break
    case 'goggles':
    case 'snorkel': {
      brush.flat(
        rectPts(eyeCx - spread - eyeW * 0.9, eyeY - hh * 0.3, spread * 2 + eyeW * 1.8, hh * 0.6),
        col,
      )
      for (const side of [-1, 1]) {
        const ex = eyeCx + side * spread
        brush.blob(ex, eyeY, eyeW * 0.62, hh * 0.24, '#cfe9f2')
        brush.blob(ex - eyeW * 0.2, eyeY - hh * 0.06, eyeW * 0.2, hh * 0.08, '#ffffff')
      }
      if (def.eyewear === 'snorkel') {
        brush.facet(
          rectPts(eyeCx + spread + eyeW * 0.9, eyeY - hh * 0.9, eyeW * 0.42, hh * 1.5),
          '#e8dcc4',
          { flat: true },
        )
      }
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
    case 'pan': {
      const len = h * 0.26
      const r = h * 0.13
      brush.facet(limb(hx, hy, angle, len, h * 0.055), accent, { flat: true })
      const cx = hx + c * (len + r * 0.6)
      const cy = hy + s * (len + r * 0.6)
      const pan: Pt[] = []
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10
        pan.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.94 })
      }
      brush.facet(pan, col, { dark: 0.3, light: 0.2 })
      break
    }
    case 'staff': {
      const len = h * 0.94
      brush.facet(limb(hx - c * len * 0.34, hy - s * len * 0.34, angle, len, h * 0.055), col, {
        dark: 0.24,
      })
      break
    }
    case 'rod': {
      const len = h * 0.86
      brush.facet(limb(hx - c * len * 0.2, hy - s * len * 0.2, angle, len, h * 0.038, 0.5), col, {
        flat: true,
      })
      // Line and float.
      const tipX = hx + c * len * 0.8
      const tipY = hy + s * len * 0.8
      brush.flat(
        [
          { x: tipX, y: tipY },
          { x: tipX + h * 0.02, y: tipY },
          { x: tipX + h * 0.06, y: tipY + h * 0.3 },
          { x: tipX + h * 0.04, y: tipY + h * 0.3 },
        ],
        '#cfd6d2',
      )
      brush.blob(tipX + h * 0.05, tipY + h * 0.33, h * 0.035, h * 0.035, accent)
      break
    }
    case 'board': {
      const len = h * 0.92
      const wide = h * 0.2
      const bx = hx - c * len * 0.28
      const by = hy - s * len * 0.28
      const nx = -s
      const ny = c
      brush.facet(
        [
          { x: bx - nx * wide * 0.2, y: by - ny * wide * 0.2 },
          { x: bx + c * len * 0.5 - nx * wide * 0.5, y: by + s * len * 0.5 - ny * wide * 0.5 },
          { x: bx + c * len, y: by + s * len },
          { x: bx + c * len * 0.5 + nx * wide * 0.5, y: by + s * len * 0.5 + ny * wide * 0.5 },
          { x: bx + nx * wide * 0.2, y: by + ny * wide * 0.2 },
          { x: bx - c * len * 0.16, y: by - s * len * 0.16 },
        ],
        col,
        { dark: 0.24, light: 0.16 },
      )
      brush.flat(
        [
          { x: bx + c * len * 0.12, y: by + s * len * 0.12 },
          { x: bx + c * len * 0.9, y: by + s * len * 0.9 },
          { x: bx + c * len * 0.9 + nx * h * 0.03, y: by + s * len * 0.9 + ny * h * 0.03 },
          { x: bx + c * len * 0.12 + nx * h * 0.03, y: by + s * len * 0.12 + ny * h * 0.03 },
        ],
        accent,
      )
      break
    }
    case 'laptop': {
      const w = h * 0.3
      const d = h * 0.22
      const open = pose === 'swingFwd' || pose === 'swingUp' ? 0.5 : 1
      brush.facet(
        [
          { x: hx - w * 0.1, y: hy + d * 0.1 },
          { x: hx + w, y: hy + d * 0.1 },
          { x: hx + w * 0.9, y: hy + d * 0.28 },
          { x: hx - w * 0.2, y: hy + d * 0.28 },
        ],
        accent,
        { flat: true },
      )
      brush.facet(
        [
          { x: hx - w * 0.1, y: hy + d * 0.1 },
          { x: hx + w * 0.86, y: hy + d * 0.1 },
          { x: hx + w * 0.78, y: hy + d * 0.1 - d * open },
          { x: hx - w * 0.16, y: hy + d * 0.1 - d * open },
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
        '#9fd7e6',
      )
      break
    }
    case 'bottle': {
      brush.facet(rectPts(hx - h * 0.03, hy - h * 0.12, h * 0.07, h * 0.16), col, { dark: 0.2 })
      brush.flat(rectPts(hx - h * 0.02, hy - h * 0.16, h * 0.045, h * 0.05), accent)
      break
    }
    default:
      break
  }
}
