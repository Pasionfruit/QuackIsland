/**
 * The four-legged and winged half of the roster.
 *
 * Same idea as the main cast: authored in local space (origin at the feet, +x
 * forward, -y up, sized in fractions of the character's height), shaded in
 * world space so the light never moves.
 */
import { ellipse, facet, fillPoly, limb, shade, softShadow, type FacetOpts, type Pt } from '../lib/draw'
import type { AvatarOpts, Pose } from './avatar'

export type CritterKind = 'cat' | 'dog' | 'bird'
export type TailStyle = 'long' | 'curl' | 'stub' | 'fan'

export interface CritterDef {
  kind: CritterKind
  body: string
  /** Underside / chest, usually lighter. */
  belly: string
  /** Optional second coat colour, for a calico or a corgi.  */
  patch?: string
  ear: string
  nose: string
  tail: TailStyle
  /** Beak and legs for birds, paws for the rest. */
  beak?: string
  feet?: string
  collar?: string
}

interface Brush {
  facet: (pts: Pt[], color: string, opts?: FacetOpts) => void
  flat: (pts: Pt[], color: string) => void
  blob: (cx: number, cy: number, rx: number, ry: number, color: string) => void
}

export function drawCritter(
  ctx: CanvasRenderingContext2D,
  def: CritterDef,
  x: number,
  y: number,
  o: AvatarOpts = {},
): void {
  const facing = o.facing ?? 1
  const h = o.height ?? 26
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
  if (o.shadow) softShadow(ctx, x, y + h * 0.02, h * 0.42, h * 0.09, 0.24)

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

  if (def.kind === 'bird') drawBird(brush, def, h, pose, phase)
  else drawQuadruped(brush, def, h, pose, phase)

  ctx.globalAlpha = prevAlpha
}

// ------------------------------------------------------------- quadrupeds

function drawQuadruped(brush: Brush, def: CritterDef, h: number, pose: Pose, phase: number): void {
  const dog = def.kind === 'dog'
  const legLen = h * 0.3
  const bodyH = h * 0.44
  const bodyLen = h * (dog ? 1.08 : 1.0)
  const bodyCy = -(legLen + bodyH * 0.5)
  const headR = h * (dog ? 0.3 : 0.28)
  const eyes: 'open' | 'hurt' | 'focus' =
    pose === 'hurt' || pose === 'tumble' ? 'hurt' : pose === 'idle' || pose === 'walk' ? 'open' : 'focus'

  // Pose parameters.
  const swing = Math.sin(phase * 0.32) * 0.5
  let frontSwing = 0.08
  let backSwing = -0.08
  let bodyTilt = 0
  let headLift = 0
  let tailAngle = -0.7 + Math.sin(phase * 0.06) * 0.18
  let pounce = 0

  switch (pose) {
    case 'walk':
      frontSwing = swing
      backSwing = -swing
      tailAngle = -0.9 + Math.sin(phase * 0.3) * 0.3
      break
    case 'jump':
      frontSwing = 0.7
      backSwing = -0.6
      bodyTilt = -0.22
      tailAngle = -1.3
      break
    case 'fall':
      frontSwing = -0.5
      backSwing = 0.5
      bodyTilt = 0.15
      tailAngle = -0.2
      break
    case 'hurt':
    case 'tumble':
      frontSwing = -0.8
      backSwing = 0.8
      bodyTilt = -0.3
      tailAngle = 0.4
      break
    case 'swingFwd':
      frontSwing = -0.95
      backSwing = 0.3
      bodyTilt = 0.3
      headLift = -h * 0.03
      pounce = h * 0.1
      tailAngle = -1.5
      break
    case 'swingUp':
      frontSwing = -1.5
      backSwing = 0.1
      bodyTilt = -0.5
      headLift = -h * 0.06
      tailAngle = -0.2
      break
    case 'swingDown':
      frontSwing = 0.9
      backSwing = -0.2
      bodyTilt = 0.45
      headLift = h * 0.04
      tailAngle = -1.8
      break
    case 'brace':
      frontSwing = 0.3
      backSwing = -0.3
      bodyTilt = 0.12
      break
    default:
      break
  }

  const tilt = (px: number, py: number): Pt => {
    const c = Math.cos(bodyTilt)
    const s = Math.sin(bodyTilt)
    const dx = px
    const dy = py - bodyCy
    return { x: dx * c - dy * s + pounce, y: bodyCy + dx * s + dy * c }
  }

  // ------------------------------------------------------------------ tail
  const tailBase = tilt(-bodyLen * 0.46, bodyCy - bodyH * 0.1)
  if (def.tail !== 'stub') {
    const len = def.tail === 'curl' ? h * 0.42 : h * 0.58
    const seg = 4
    const pts: Pt[] = []
    const back: Pt[] = []
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const curve = def.tail === 'curl' ? -1.5 * t * t : def.tail === 'fan' ? 0.4 * t : -0.9 * t * t
      const a = tailAngle + curve
      const px = tailBase.x - Math.cos(a) * len * t
      const py = tailBase.y + Math.sin(a) * len * t
      const w = h * 0.09 * (1 - t * 0.45)
      pts.push({ x: px, y: py - w })
      back.unshift({ x: px, y: py + w })
    }
    brush.facet([...pts, ...back], shade(def.body, -0.06), { dark: 0.22 })
  }

  // ------------------------------------------------------------- back legs
  const drawLeg = (atX: number, s: number, tone: number) => {
    const hip = tilt(atX, bodyCy + bodyH * 0.34)
    const ang = Math.PI / 2 - s
    brush.facet(limb(hip.x, hip.y, ang, legLen * 0.96, h * 0.12, 0.85), shade(def.body, tone), {
      dark: 0.2,
    })
    const paw = { x: hip.x + Math.cos(ang) * legLen * 0.92, y: hip.y + Math.sin(ang) * legLen * 0.92 }
    brush.blob(paw.x + h * 0.02, paw.y, h * 0.09, h * 0.055, def.feet ?? shade(def.body, 0.12))
  }
  drawLeg(-bodyLen * 0.3, backSwing, -0.2)
  drawLeg(bodyLen * 0.26, frontSwing, -0.2)

  // ------------------------------------------------------------------ body
  const bodyPts: Pt[] = [
    tilt(-bodyLen * 0.48, bodyCy - bodyH * 0.12),
    tilt(-bodyLen * 0.34, bodyCy - bodyH * 0.46),
    tilt(bodyLen * 0.2, bodyCy - bodyH * 0.52),
    tilt(bodyLen * 0.46, bodyCy - bodyH * 0.24),
    tilt(bodyLen * 0.5, bodyCy + bodyH * 0.2),
    tilt(bodyLen * 0.24, bodyCy + bodyH * 0.46),
    tilt(-bodyLen * 0.3, bodyCy + bodyH * 0.44),
    tilt(-bodyLen * 0.48, bodyCy + bodyH * 0.16),
  ]
  brush.facet(bodyPts, def.body, { dark: 0.24, light: 0.16 })

  // Belly and coat patches.
  brush.flat(
    [
      tilt(-bodyLen * 0.28, bodyCy + bodyH * 0.12),
      tilt(bodyLen * 0.36, bodyCy + bodyH * 0.06),
      tilt(bodyLen * 0.24, bodyCy + bodyH * 0.46),
      tilt(-bodyLen * 0.28, bodyCy + bodyH * 0.44),
    ],
    def.belly,
  )
  if (def.patch) {
    brush.flat(
      [
        tilt(-bodyLen * 0.34, bodyCy - bodyH * 0.44),
        tilt(-bodyLen * 0.02, bodyCy - bodyH * 0.5),
        tilt(bodyLen * 0.04, bodyCy + bodyH * 0.1),
        tilt(-bodyLen * 0.3, bodyCy + bodyH * 0.04),
      ],
      def.patch,
    )
  }

  // ------------------------------------------------------------- front legs
  const drawFrontLeg = (atX: number, s: number) => {
    const sh = tilt(atX, bodyCy + bodyH * 0.16)
    const ang = Math.PI / 2 - s
    brush.facet(limb(sh.x, sh.y, ang, legLen * 1.02, h * 0.115, 0.85), def.body, { dark: 0.18 })
    const paw = { x: sh.x + Math.cos(ang) * legLen, y: sh.y + Math.sin(ang) * legLen }
    brush.blob(paw.x + h * 0.02, paw.y, h * 0.09, h * 0.055, def.feet ?? shade(def.body, 0.12))
  }
  drawFrontLeg(-bodyLen * 0.22, backSwing * 0.8)
  drawFrontLeg(bodyLen * 0.34, frontSwing)

  // ------------------------------------------------------------------ head
  const headC = tilt(bodyLen * 0.52, bodyCy - bodyH * 0.42 + headLift)
  const hx = headC.x
  const hy = headC.y

  // Ears first so they sit behind the skull.
  const earH = headR * (dog ? 0.95 : 1.0)
  for (const side of [-1, 1]) {
    const ex = hx + side * headR * 0.52 + (side > 0 ? headR * 0.12 : 0)
    if (dog) {
      // Floppy, folded forward.
      brush.facet(
        [
          { x: ex - headR * 0.3, y: hy - headR * 0.66 },
          { x: ex + headR * 0.34, y: hy - headR * 0.8 },
          { x: ex + headR * 0.42, y: hy - headR * 0.02 },
          { x: ex - headR * 0.16, y: hy - headR * 0.12 },
        ],
        def.ear,
        { dark: 0.24 },
      )
    } else {
      brush.facet(
        [
          { x: ex - headR * 0.34, y: hy - headR * 0.5 },
          { x: ex + headR * 0.06, y: hy - earH * 1.24 },
          { x: ex + headR * 0.42, y: hy - headR * 0.44 },
        ],
        def.ear,
        { dark: 0.22 },
      )
      brush.flat(
        [
          { x: ex - headR * 0.1, y: hy - headR * 0.5 },
          { x: ex + headR * 0.05, y: hy - earH * 1.0 },
          { x: ex + headR * 0.22, y: hy - headR * 0.46 },
        ],
        shade(def.nose, 0.25),
      )
    }
  }

  const headPts: Pt[] = [
    { x: hx - headR, y: hy - headR * 0.2 },
    { x: hx - headR * 0.72, y: hy - headR * 0.82 },
    { x: hx + headR * 0.1, y: hy - headR * 1.0 },
    { x: hx + headR * 0.86, y: hy - headR * 0.66 },
    { x: hx + headR * 1.02, y: hy + headR * 0.1 },
    { x: hx + headR * 0.7, y: hy + headR * 0.78 },
    { x: hx - headR * 0.42, y: hy + headR * 0.86 },
    { x: hx - headR * 0.96, y: hy + headR * 0.34 },
  ]
  brush.facet(headPts, def.body, { dark: 0.2, light: 0.16, split: 0.1 })

  // Muzzle.
  const muzzleX = hx + headR * (dog ? 0.86 : 0.62)
  const muzzleY = hy + headR * 0.36
  brush.blob(muzzleX, muzzleY, headR * (dog ? 0.52 : 0.4), headR * (dog ? 0.4 : 0.3), def.belly)
  brush.blob(muzzleX + headR * 0.18, muzzleY - headR * 0.18, headR * 0.14, headR * 0.11, def.nose)

  if (def.collar) {
    brush.flat(
      [
        { x: hx - headR * 0.9, y: hy + headR * 0.7 },
        { x: hx + headR * 0.66, y: hy + headR * 0.62 },
        { x: hx + headR * 0.6, y: hy + headR * 0.92 },
        { x: hx - headR * 0.88, y: hy + headR * 1.0 },
      ],
      def.collar,
    )
  }

  // Eyes.
  const eyeY = hy - headR * 0.06
  const eyeR = headR * 0.19
  for (const side of [-1, 1]) {
    const ex = hx + headR * 0.22 + side * headR * 0.36
    if (eyes === 'hurt') {
      brush.flat(
        [
          { x: ex - eyeR, y: eyeY - eyeR * 0.5 },
          { x: ex + eyeR, y: eyeY + eyeR * 0.5 },
          { x: ex + eyeR, y: eyeY + eyeR * 0.9 },
          { x: ex - eyeR, y: eyeY - eyeR * 0.1 },
        ],
        '#2b2723',
      )
      brush.flat(
        [
          { x: ex - eyeR, y: eyeY + eyeR * 0.5 },
          { x: ex + eyeR, y: eyeY - eyeR * 0.5 },
          { x: ex + eyeR, y: eyeY - eyeR * 0.1 },
          { x: ex - eyeR, y: eyeY + eyeR * 0.9 },
        ],
        '#2b2723',
      )
    } else {
      const squint = eyes === 'focus' ? 0.62 : 1
      brush.blob(ex, eyeY, eyeR, eyeR * squint, '#26221f')
      brush.blob(ex - eyeR * 0.3, eyeY - eyeR * 0.34 * squint, eyeR * 0.32, eyeR * 0.28, '#fdfbf5')
    }
  }

  // A little tongue for the dog when it is having a good time.
  if (dog && (pose === 'idle' || pose === 'walk' || pose === 'jump')) {
    brush.flat(
      [
        { x: muzzleX + headR * 0.1, y: muzzleY + headR * 0.1 },
        { x: muzzleX + headR * 0.44, y: muzzleY + headR * 0.12 },
        { x: muzzleX + headR * 0.36, y: muzzleY + headR * 0.5 },
        { x: muzzleX + headR * 0.12, y: muzzleY + headR * 0.44 },
      ],
      '#e78b93',
    )
  }
}

// -------------------------------------------------------------------- birds

function drawBird(brush: Brush, def: CritterDef, h: number, pose: Pose, phase: number): void {
  const legLen = h * 0.24
  const bodyCy = -(legLen + h * 0.28)
  const bodyRx = h * 0.4
  const bodyRy = h * 0.3
  const headR = h * 0.21
  const eyes: 'open' | 'hurt' | 'focus' =
    pose === 'hurt' || pose === 'tumble' ? 'hurt' : pose === 'idle' || pose === 'walk' ? 'open' : 'focus'

  let flap = Math.sin(phase * 0.12) * 0.18
  let wingSpread = 0.25
  let tilt = 0
  let headX = h * 0.3
  let headY = bodyCy - h * 0.26

  switch (pose) {
    case 'jump':
    case 'fall':
      flap = Math.sin(phase * 0.5) * 0.75
      wingSpread = 1
      break
    case 'walk':
      flap = Math.sin(phase * 0.3) * 0.14
      break
    case 'hurt':
    case 'tumble':
      flap = 0.9
      wingSpread = 0.8
      tilt = 0.4
      break
    case 'swingFwd':
      flap = -0.5
      wingSpread = 1.15
      tilt = 0.25
      headX = h * 0.36
      break
    case 'swingUp':
      flap = -1.15
      wingSpread = 1.1
      tilt = -0.3
      headY = bodyCy - h * 0.32
      break
    case 'swingDown':
      flap = 1.0
      wingSpread = 1.05
      tilt = 0.45
      headY = bodyCy - h * 0.18
      break
    case 'brace':
      wingSpread = 0.5
      break
    default:
      break
  }

  // Legs.
  for (const side of [-1, 1]) {
    const lx = h * 0.1 + side * h * 0.09
    brush.flat(
      [
        { x: lx - h * 0.02, y: bodyCy + bodyRy * 0.5 },
        { x: lx + h * 0.02, y: bodyCy + bodyRy * 0.5 },
        { x: lx + h * 0.02, y: -h * 0.02 },
        { x: lx - h * 0.02, y: -h * 0.02 },
      ],
      def.feet ?? '#e8a33c',
    )
    brush.flat(
      [
        { x: lx - h * 0.07, y: 0 },
        { x: lx + h * 0.11, y: 0 },
        { x: lx + h * 0.09, y: -h * 0.04 },
        { x: lx - h * 0.06, y: -h * 0.04 },
      ],
      def.feet ?? '#e8a33c',
    )
  }

  // Far wing, behind the body.
  drawWing(brush, def, bodyCy, bodyRx, bodyRy, flap * 0.8, wingSpread, -1, tilt)

  // Tail feathers.
  brush.facet(
    [
      { x: -bodyRx * 0.7, y: bodyCy - bodyRy * 0.3 },
      { x: -bodyRx * 1.55, y: bodyCy - bodyRy * 0.05 + tilt * h * 0.2 },
      { x: -bodyRx * 1.5, y: bodyCy + bodyRy * 0.42 + tilt * h * 0.2 },
      { x: -bodyRx * 0.6, y: bodyCy + bodyRy * 0.5 },
    ],
    shade(def.body, -0.1),
    { dark: 0.2 },
  )

  // Body.
  brush.blob(0, bodyCy, bodyRx, bodyRy, def.body)
  brush.blob(-bodyRx * 0.1, bodyCy + bodyRy * 0.28, bodyRx * 0.78, bodyRy * 0.6, def.belly)

  // Head and beak.
  brush.blob(headX, headY, headR, headR * 1.02, def.body)
  brush.facet(
    [
      { x: headX + headR * 0.5, y: headY - headR * 0.12 },
      { x: headX + headR * 1.7, y: headY + headR * 0.12 },
      { x: headX + headR * 0.5, y: headY + headR * 0.44 },
    ],
    def.beak ?? '#e8a33c',
    { dark: 0.24 },
  )

  const eyeX = headX + headR * 0.34
  const eyeY = headY - headR * 0.12
  const eyeR = headR * 0.26
  if (eyes === 'hurt') {
    brush.flat(
      [
        { x: eyeX - eyeR, y: eyeY - eyeR * 0.6 },
        { x: eyeX + eyeR, y: eyeY + eyeR * 0.6 },
        { x: eyeX + eyeR, y: eyeY + eyeR },
        { x: eyeX - eyeR, y: eyeY - eyeR * 0.2 },
      ],
      '#26221f',
    )
    brush.flat(
      [
        { x: eyeX - eyeR, y: eyeY + eyeR * 0.6 },
        { x: eyeX + eyeR, y: eyeY - eyeR * 0.6 },
        { x: eyeX + eyeR, y: eyeY - eyeR * 0.2 },
        { x: eyeX - eyeR, y: eyeY + eyeR },
      ],
      '#26221f',
    )
  } else {
    brush.blob(eyeX, eyeY, eyeR, eyeR * (eyes === 'focus' ? 0.62 : 1), '#26221f')
    brush.blob(eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.3, eyeR * 0.26, '#fdfbf5')
  }

  // Near wing, in front.
  drawWing(brush, def, bodyCy, bodyRx, bodyRy, flap, wingSpread, 1, tilt)
}

function drawWing(
  brush: Brush,
  def: CritterDef,
  bodyCy: number,
  bodyRx: number,
  bodyRy: number,
  flap: number,
  spread: number,
  side: 1 | -1,
  tilt: number,
): void {
  const lift = flap * bodyRy * 1.9
  const reach = bodyRx * (0.9 + spread * 0.8)
  const color = side > 0 ? shade(def.body, -0.06) : shade(def.body, -0.22)
  brush.facet(
    [
      { x: -bodyRx * 0.24, y: bodyCy - bodyRy * 0.36 },
      { x: -bodyRx * 0.7 - reach * 0.36, y: bodyCy - bodyRy * 0.2 - lift * 1.1 + tilt * bodyRy },
      { x: -bodyRx * 0.3 - reach * 0.72, y: bodyCy + bodyRy * 0.16 - lift + tilt * bodyRy * 1.4 },
      { x: bodyRx * 0.18, y: bodyCy + bodyRy * 0.5 - lift * 0.3 },
      { x: bodyRx * 0.3, y: bodyCy - bodyRy * 0.1 },
    ],
    color,
    { dark: 0.2, light: 0.12 },
  )
  brush.flat(
    [
      { x: -bodyRx * 0.6 - reach * 0.4, y: bodyCy - bodyRy * 0.16 - lift * 1.05 + tilt * bodyRy },
      { x: -bodyRx * 0.3 - reach * 0.72, y: bodyCy + bodyRy * 0.16 - lift + tilt * bodyRy * 1.4 },
      { x: -bodyRx * 0.2 - reach * 0.5, y: bodyCy + bodyRy * 0.24 - lift * 0.8 },
    ],
    shade(def.body, -0.4),
  )
}
