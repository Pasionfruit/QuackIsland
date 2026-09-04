/**
 * The Polyland cast: chunky low-poly chibi people, drawn facet by facet into
 * the low-resolution pixel buffer.
 *
 * Everything is authored in "local" space - origin at the feet, +x forward,
 * -y up, sized in units of the character's height - and then placed into the
 * world with facing, squash and spin applied. That means one definition draws
 * a character in any game, at any size.
 */
import { fillPoly, type Pt } from '../lib/pixel'
import { GROUND_SHADOW } from './palette'

export type HairStyle = 'short' | 'long' | 'curly' | 'bob'
export type HatStyle = 'none' | 'toque' | 'bucket' | 'cap' | 'beanie'
export type Accessory = 'none' | 'pan' | 'staff' | 'rod'

export interface AvatarDef {
  skin: string
  skinShade: string
  hair: string
  hairShade: string
  hairStyle: HairStyle
  top: string
  topShade: string
  legs: string
  legsShade: string
  hat: HatStyle
  hatColor: string
  hatShade: string
  accessory: Accessory
  accessoryColor: string
  accessoryShade: string
  /** Backpack colour; omit for no pack. */
  pack?: string
  /** Apron / scarf / trim highlight. */
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
  /** Total height in pixels. */
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

/** Clips a polygon to one side of a vertical line (Sutherland-Hodgman). */
function clipX(pts: Pt[], cut: number, keep: 1 | -1): Pt[] {
  const inside = (p: Pt) => (keep > 0 ? p.x >= cut : p.x <= cut)
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ain = inside(a)
    const bin = inside(b)
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (cut - a.x) / (b.x - a.x)
      out.push({ x: cut, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function rect(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/** Quad from a start point along an angle: the chibi limb primitive. */
function limb(ox: number, oy: number, angle: number, len: number, w: number): Pt[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const nx = -s * (w / 2)
  const ny = c * (w / 2)
  const ex = ox + c * len
  const ey = oy + s * len
  return [
    { x: ox + nx, y: oy + ny },
    { x: ex + nx, y: ey + ny },
    { x: ex - nx, y: ey - ny },
    { x: ox - nx, y: oy - ny },
  ]
}

interface Painter {
  /** Fills a local-space polygon. */
  poly: (pts: Pt[], color: string) => void
  /** Fills a polygon and shades its trailing side, the low-poly look. */
  facet: (pts: Pt[], color: string, shade: string, cutAt?: number) => void
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  def: AvatarDef,
  x: number,
  y: number,
  opts: AvatarOpts = {},
): void {
  const facing = opts.facing ?? 1
  const h = opts.height ?? 32
  const pose = opts.pose ?? 'idle'
  const phase = opts.phase ?? 0
  const squash = opts.squash ?? 0
  const spin = opts.spin ?? 0
  const sx = 1 + squash * 0.18
  const sy = 1 - squash * 0.2
  const pivotY = (-h / 2) * sy
  const cos = Math.cos(spin)
  const sin = Math.sin(spin)

  const place = (pts: Pt[]): Pt[] =>
    pts.map((p) => {
      const lx = p.x * facing * sx
      const ly = p.y * sy
      const dx = lx
      const dy = ly - pivotY
      return { x: x + dx * cos - dy * sin, y: y + pivotY + dx * sin + dy * cos }
    })

  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha

  const paint: Painter = {
    poly: (pts, color) => fillPoly(ctx, place(pts), opts.tint ?? color),
    facet: (pts, color, shade, cutAt = 0.4) => {
      fillPoly(ctx, place(pts), opts.tint ?? color)
      if (opts.tint) return
      let min = Infinity
      let max = -Infinity
      for (const p of pts) {
        if (p.x < min) min = p.x
        if (p.x > max) max = p.x
      }
      const cut = min + (max - min) * cutAt
      const back = clipX(pts, cut, -1)
      if (back.length >= 3) fillPoly(ctx, place(back), shade)
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

  // Pose parameters.
  const walkSwing = Math.sin(phase * 0.3) * 0.45
  let legFront = 0
  let legBack = 0
  let armFront = 1.35
  let armBack = 1.75
  let lean = 0
  let accessoryAngle = 0.5
  let eyes: 'open' | 'hurt' | 'focus' | 'shut' = 'open'

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
      accessoryAngle = -0.15
      eyes = 'focus'
      break
    case 'swingUp':
      legFront = 0.2
      legBack = -0.2
      armFront = -1.35
      armBack = 2.0
      lean = -0.4
      accessoryAngle = -1.45
      eyes = 'focus'
      break
    case 'swingDown':
      legFront = 0.15
      legBack = -0.15
      armFront = 1.05
      armBack = 2.3
      lean = 0.6
      accessoryAngle = 1.25
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
      legFront = 0.06
      legBack = -0.06
      armFront = 1.35 + Math.sin(phase * 0.08) * 0.06
      armBack = 1.78 - Math.sin(phase * 0.08) * 0.06
  }

  const headTilt = lean * 0.5

  // ---------------------------------------------------------------- back arm
  paint.facet(
    limb(-torsoW * 0.16, shoulderY + torsoH * 0.16, Math.PI / 2 + armBack - 1.57, armL, armW),
    def.topShade,
    def.topShade,
  )

  // ------------------------------------------------------------------- legs
  const drawLeg = (swing: number, color: string, shade: string) => {
    const ox = swing >= 0 ? legW * 0.35 : -legW * 0.35
    paint.facet(limb(ox, hipY, Math.PI / 2 - swing, legH * 1.06, legW), color, shade, 0.45)
    // Shoe.
    const footX = ox + Math.cos(Math.PI / 2 - swing) * legH
    const footY = hipY + Math.sin(Math.PI / 2 - swing) * legH
    paint.facet(rect(footX - legW * 0.55, footY - legW * 0.28, legW * 1.45, legW * 0.62), shade, shade)
  }
  drawLeg(legBack, def.legsShade, def.legsShade)
  drawLeg(legFront, def.legs, def.legsShade)

  // ----------------------------------------------------------------- pack
  if (def.pack) {
    const packW = torsoW * 0.55
    const packH = torsoH * 1.05
    const px0 = -torsoW * 0.52 - packW * 0.55
    const py0 = shoulderY + torsoH * 0.06
    paint.facet(
      [
        { x: px0 + packW * 0.18, y: py0 },
        { x: px0 + packW, y: py0 - packH * 0.06 },
        { x: px0 + packW, y: py0 + packH },
        { x: px0, y: py0 + packH * 0.86 },
        { x: px0 - packW * 0.06, y: py0 + packH * 0.3 },
      ],
      def.pack,
      def.pack,
    )
  }

  // ----------------------------------------------------------------- torso
  const tw = torsoW / 2
  const torso: Pt[] = [
    { x: -tw * 0.86 + lean * 1.2, y: shoulderY },
    { x: tw * 0.86 + lean * 1.2, y: shoulderY },
    { x: tw, y: shoulderY + torsoH * 0.45 },
    { x: tw * 0.9, y: hipY },
    { x: -tw * 0.9, y: hipY },
    { x: -tw, y: shoulderY + torsoH * 0.45 },
  ]
  paint.facet(torso, def.top, def.topShade)
  if (def.accent) {
    // Apron / front panel.
    paint.poly(
      [
        { x: -tw * 0.42 + lean, y: shoulderY + torsoH * 0.24 },
        { x: tw * 0.5 + lean, y: shoulderY + torsoH * 0.24 },
        { x: tw * 0.44, y: hipY },
        { x: -tw * 0.36, y: hipY },
      ],
      def.accent,
    )
  }

  // ------------------------------------------------------------------ head
  const hx = lean * 1.9
  const headPts: Pt[] = [
    { x: hx - hw, y: headCy - hh * 0.42 },
    { x: hx - hw * 0.6, y: headCy - hh },
    { x: hx + hw * 0.6, y: headCy - hh },
    { x: hx + hw, y: headCy - hh * 0.42 },
    { x: hx + hw, y: headCy + hh * 0.48 },
    { x: hx + hw * 0.58, y: headCy + hh },
    { x: hx - hw * 0.58, y: headCy + hh },
    { x: hx - hw, y: headCy + hh * 0.48 },
  ]

  // Long hair sits behind the head.
  if (def.hairStyle === 'long' || def.hairStyle === 'bob') {
    const drop = def.hairStyle === 'long' ? hh * 1.5 : hh * 0.75
    paint.facet(
      [
        { x: hx - hw * 1.08, y: headCy - hh * 0.9 },
        { x: hx + hw * 1.08, y: headCy - hh * 0.9 },
        { x: hx + hw * 1.02, y: headCy + drop },
        { x: hx + hw * 0.5, y: headCy + drop * 0.82 },
        { x: hx - hw * 0.5, y: headCy + drop * 0.86 },
        { x: hx - hw * 1.02, y: headCy + drop },
      ],
      def.hair,
      def.hairShade,
      0.34,
    )
  }

  paint.facet(headPts, def.skin, def.skinShade, 0.34)

  // ------------------------------------------------------------------ hair
  const hairTop: Pt[] = (() => {
    const top = headCy - hh * 1.12
    switch (def.hairStyle) {
      case 'curly':
        return [
          { x: hx - hw * 1.06, y: headCy - hh * 0.18 },
          { x: hx - hw * 1.1, y: headCy - hh * 0.62 },
          { x: hx - hw * 0.72, y: top + hh * 0.1 },
          { x: hx - hw * 0.3, y: top - hh * 0.06 },
          { x: hx + hw * 0.2, y: top + hh * 0.12 },
          { x: hx + hw * 0.68, y: top - hh * 0.02 },
          { x: hx + hw * 1.1, y: headCy - hh * 0.5 },
          { x: hx + hw * 1.04, y: headCy - hh * 0.1 },
          { x: hx + hw * 0.66, y: headCy - hh * 0.44 },
          { x: hx + hw * 0.2, y: headCy - hh * 0.2 },
          { x: hx - hw * 0.28, y: headCy - hh * 0.46 },
          { x: hx - hw * 0.68, y: headCy - hh * 0.2 },
        ]
      case 'bob':
        return [
          { x: hx - hw * 1.04, y: headCy - hh * 0.1 },
          { x: hx - hw * 1.04, y: headCy - hh * 0.7 },
          { x: hx - hw * 0.56, y: top },
          { x: hx + hw * 0.58, y: top },
          { x: hx + hw * 1.04, y: headCy - hh * 0.7 },
          { x: hx + hw * 1.04, y: headCy - hh * 0.06 },
          { x: hx + hw * 0.52, y: headCy - hh * 0.36 },
          { x: hx - hw * 0.2, y: headCy - hh * 0.3 },
        ]
      case 'long':
        return [
          { x: hx - hw * 1.06, y: headCy - hh * 0.2 },
          { x: hx - hw * 1.06, y: headCy - hh * 0.74 },
          { x: hx - hw * 0.5, y: top },
          { x: hx + hw * 0.5, y: top },
          { x: hx + hw * 1.06, y: headCy - hh * 0.66 },
          { x: hx + hw * 1.02, y: headCy - hh * 0.02 },
          { x: hx + hw * 0.46, y: headCy - hh * 0.5 },
          { x: hx - hw * 0.36, y: headCy - hh * 0.32 },
        ]
      default:
        // Short and spiky, like the hoodie kid in the reference sheet.
        return [
          { x: hx - hw * 1.04, y: headCy - hh * 0.24 },
          { x: hx - hw * 1.08, y: headCy - hh * 0.78 },
          { x: hx - hw * 0.58, y: top + hh * 0.06 },
          { x: hx - hw * 0.16, y: top - hh * 0.08 },
          { x: hx + hw * 0.34, y: top + hh * 0.04 },
          { x: hx + hw * 0.86, y: top - hh * 0.04 },
          { x: hx + hw * 1.08, y: headCy - hh * 0.5 },
          { x: hx + hw * 1.0, y: headCy - hh * 0.16 },
          { x: hx + hw * 0.44, y: headCy - hh * 0.5 },
          { x: hx - hw * 0.24, y: headCy - hh * 0.34 },
          { x: hx - hw * 0.64, y: headCy - hh * 0.52 },
        ]
    }
  })()
  paint.facet(hairTop, def.hair, def.hairShade, 0.36)

  // ------------------------------------------------------------------- hat
  const hatY = headCy - hh * 0.92
  switch (def.hat) {
    case 'toque': {
      paint.facet(rect(hx - hw * 0.86, hatY - hh * 0.3, hw * 1.72, hh * 0.34), def.hatColor, def.hatShade)
      paint.facet(
        [
          { x: hx - hw * 0.9, y: hatY - hh * 0.28 },
          { x: hx - hw * 1.02, y: hatY - hh * 0.78 },
          { x: hx - hw * 0.6, y: hatY - hh * 1.14 },
          { x: hx - hw * 0.1, y: hatY - hh * 0.86 },
          { x: hx + hw * 0.42, y: hatY - hh * 1.16 },
          { x: hx + hw * 0.96, y: hatY - hh * 0.84 },
          { x: hx + hw * 0.92, y: hatY - hh * 0.28 },
        ],
        def.hatColor,
        def.hatShade,
        0.32,
      )
      break
    }
    case 'bucket': {
      paint.facet(
        [
          { x: hx - hw * 1.34, y: hatY + hh * 0.16 },
          { x: hx - hw * 0.9, y: hatY - hh * 0.12 },
          { x: hx + hw * 0.9, y: hatY - hh * 0.12 },
          { x: hx + hw * 1.34, y: hatY + hh * 0.16 },
          { x: hx + hw * 0.86, y: hatY + hh * 0.34 },
          { x: hx - hw * 0.86, y: hatY + hh * 0.34 },
        ],
        def.hatColor,
        def.hatShade,
        0.3,
      )
      paint.facet(
        [
          { x: hx - hw * 0.84, y: hatY - hh * 0.06 },
          { x: hx - hw * 0.66, y: hatY - hh * 0.62 },
          { x: hx + hw * 0.62, y: hatY - hh * 0.62 },
          { x: hx + hw * 0.84, y: hatY - hh * 0.06 },
        ],
        def.hatColor,
        def.hatShade,
        0.32,
      )
      break
    }
    case 'cap': {
      paint.facet(
        [
          { x: hx - hw * 0.94, y: hatY + hh * 0.12 },
          { x: hx - hw * 0.72, y: hatY - hh * 0.56 },
          { x: hx + hw * 0.7, y: hatY - hh * 0.5 },
          { x: hx + hw * 0.94, y: hatY + hh * 0.1 },
        ],
        def.hatColor,
        def.hatShade,
        0.34,
      )
      paint.facet(
        rect(hx + hw * 0.6, hatY + hh * 0.02, hw * 0.86, hh * 0.22),
        def.hatShade,
        def.hatShade,
      )
      break
    }
    case 'beanie': {
      paint.facet(
        [
          { x: hx - hw * 1.0, y: hatY + hh * 0.26 },
          { x: hx - hw * 0.86, y: hatY - hh * 0.5 },
          { x: hx + hw * 0.84, y: hatY - hh * 0.5 },
          { x: hx + hw * 1.0, y: hatY + hh * 0.26 },
        ],
        def.hatColor,
        def.hatShade,
        0.34,
      )
      paint.facet(
        rect(hx - hw * 1.02, hatY + hh * 0.18, hw * 2.04, hh * 0.3),
        def.hatShade,
        def.hatShade,
      )
      break
    }
    default:
      break
  }

  // ------------------------------------------------------------------ eyes
  const eyeW = Math.max(2, hw * 0.44)
  const eyeH = Math.max(2, hh * 0.56)
  const eyeY = headCy + hh * 0.06 + headTilt * 1.2
  const eyeSpread = hw * 0.44
  const eyeCx = hx + hw * 0.18

  if (eyes === 'hurt') {
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * eyeSpread
      paint.poly(rect(ex - eyeW / 2, eyeY - eyeH * 0.2, eyeW, Math.max(1, eyeH * 0.22)), '#2b2723')
      paint.poly(
        rect(ex - eyeW * 0.3, eyeY - eyeH * 0.5, Math.max(1, eyeW * 0.6), Math.max(1, eyeH * 0.22)),
        '#2b2723',
      )
    }
  } else {
    const hgt = eyes === 'focus' ? eyeH * 0.68 : eyeH
    for (const side of [-1, 1]) {
      const ex = eyeCx + side * eyeSpread
      paint.poly(
        [
          { x: ex - eyeW / 2, y: eyeY - hgt / 2 + hgt * 0.18 },
          { x: ex - eyeW * 0.28, y: eyeY - hgt / 2 },
          { x: ex + eyeW * 0.28, y: eyeY - hgt / 2 },
          { x: ex + eyeW / 2, y: eyeY - hgt / 2 + hgt * 0.18 },
          { x: ex + eyeW / 2, y: eyeY + hgt / 2 - hgt * 0.18 },
          { x: ex + eyeW * 0.28, y: eyeY + hgt / 2 },
          { x: ex - eyeW * 0.28, y: eyeY + hgt / 2 },
          { x: ex - eyeW / 2, y: eyeY + hgt / 2 - hgt * 0.18 },
        ],
        '#26221f',
      )
      paint.poly(
        rect(ex - eyeW * 0.36, eyeY - hgt * 0.34, Math.max(1, eyeW * 0.3), Math.max(1, hgt * 0.3)),
        '#fdfbf5',
      )
    }
  }

  // ------------------------------------------------------- front arm + prop
  const shoulderX = torsoW * 0.2 + lean * 1.4
  const armAngle = Math.PI / 2 + armFront - 1.57
  const handX = shoulderX + Math.cos(armAngle) * armL
  const handY = shoulderY + torsoH * 0.16 + Math.sin(armAngle) * armL

  drawAccessory(paint, def, handX, handY, accessoryAngle, h)
  paint.facet(
    limb(shoulderX, shoulderY + torsoH * 0.16, armAngle, armL, armW),
    def.top,
    def.topShade,
    0.36,
  )
  paint.facet(
    rect(handX - armW * 0.55, handY - armW * 0.5, armW * 1.1, armW * 1.0),
    def.skin,
    def.skinShade,
  )

  if (opts.shadow) {
    const w = h * 0.5
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.3
    fillPoly(
      ctx,
      [
        { x: x - w / 2, y: y - 1 },
        { x: x + w / 2, y: y - 1 },
        { x: x + w / 2.6, y: y + 2 },
        { x: x - w / 2.6, y: y + 2 },
      ],
      GROUND_SHADOW,
    )
    ctx.globalAlpha = opts.alpha ?? 1
  }

  ctx.globalAlpha = 1
}

function drawAccessory(
  paint: Painter,
  def: AvatarDef,
  hx: number,
  hy: number,
  angle: number,
  h: number,
): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  switch (def.accessory) {
    case 'pan': {
      const len = h * 0.26
      const r = h * 0.13
      paint.poly(limb(hx, hy, angle, len, h * 0.055), def.accessoryShade)
      const cx = hx + c * (len + r * 0.6)
      const cy = hy + s * (len + r * 0.6)
      const pan: Pt[] = []
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8
        pan.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.92 })
      }
      paint.facet(pan, def.accessoryColor, def.accessoryShade, 0.36)
      break
    }
    case 'staff': {
      const len = h * 0.92
      paint.facet(
        limb(hx - c * len * 0.34, hy - s * len * 0.34, angle, len, h * 0.06),
        def.accessoryColor,
        def.accessoryShade,
        0.4,
      )
      break
    }
    case 'rod': {
      const len = h * 0.8
      paint.poly(limb(hx - c * len * 0.2, hy - s * len * 0.2, angle, len, h * 0.04), def.accessoryColor)
      break
    }
    default:
      break
  }
}
