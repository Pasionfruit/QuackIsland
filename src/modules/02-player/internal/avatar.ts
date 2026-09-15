/**
 * The body you walk around in: a red pill with a face on the front.
 *
 * Built out of primitives rather than loaded from a file. A model is a whole
 * category of silent failure - upside down, backwards, a hundred times too
 * big, a download that never arrives - and none of that can happen to four
 * numbers and a capsule. The one thing a featureless pill cannot do is show
 * which way it is pointing, so it gets a face: two eyes and a smile, on +Z,
 * which is the direction a heading of zero looks along.
 *
 * Everything is shared. The geometries and materials are built once for the
 * session, so a hundred avatars cost a hundred pairs of meshes and not one
 * extra buffer, and the face is baked into a single geometry so a whole body
 * is two draw calls.
 */
import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PLAYER } from './controller'

export const AVATAR = {
  bodyColour: '#e0563f',
  faceColour: '#2a1712',

  /** Height above the feet at which the eyes sit, in metres. */
  eyeY: 1.3,
  /** How far each eye is from the middle, left and right. */
  eyeSpread: 0.155,
  eyeRadius: 0.075,

  /**
   * The centre of the circle the smile is an arc of, above the feet.
   *
   * Held a hair below `eyeY - eyeRadius`, so the corners of the mouth - the
   * highest points on a "u" - sit just under the eyes rather than level with
   * them or lost far below.
   */
  mouthY: 1.21,
  /** The radius of that circle: small, so the smile is a small "u". */
  mouthRadius: 0.07,
  /**
   * How far round the circle the smile runs, in radians.
   *
   * A full half turn - the whole bottom of the circle, corner to corner -
   * which is what makes this a "u" rather than a shallow crescent: the two
   * ends sit level with `mouthY` and the middle dips a full radius below it.
   */
  mouthArc: Math.PI,
  /** The smile is drawn as overlapping dots; this is how many and how big. */
  mouthDots: 7,
  mouthDotRadius: 0.024,

  /**
   * How far each piece of the face sinks into the body, as a fraction of its
   * own radius.
   *
   * Every piece is placed against the curve of the body rather than on a flat
   * plane in front of it, and then pushed in by this much. At a half it sits
   * as a dome on the surface, whatever size it is: an eye and a dot of the
   * smile stand equally proud without either being given its own number.
   * Floating starts below about a third; pieces vanish above about four
   * fifths.
   */
  faceSink: 0.5,

  /**
   * How far the body tips forward when swimming, as a fraction of the quarter
   * turn the controller asks for.
   *
   * A pill swims the way it always did: flat out, face down, long axis along
   * the way it is going. Turn this down to keep the face out of the water -
   * 0.2 or so floats it upright and leans it into the stroke instead.
   */
  swimTip: 1,
} as const

/** The curve of the body at a given sideways offset, at face height. */
function surfaceZ(x: number): number {
  // The face lives on the straight part of the capsule, between the two caps,
  // so the body is a plain cylinder here and this is exact.
  const inside = PLAYER.radius * PLAYER.radius - x * x
  return inside > 0 ? Math.sqrt(inside) : 0
}

/** Where the eyes and every dot of the smile sit, in body space. */
export function facePoints(): { x: number; y: number; z: number; radius: number }[] {
  const points: { x: number; y: number; z: number; radius: number }[] = []

  for (const side of [-1, 1]) {
    const x = side * AVATAR.eyeSpread
    points.push({
      x,
      y: AVATAR.eyeY,
      z: surfaceZ(x) - AVATAR.eyeRadius * AVATAR.faceSink,
      radius: AVATAR.eyeRadius,
    })
  }

  // The bottom of a circle, swept from left to right: at a quarter turn past
  // half a turn the arc is at its lowest, which is what makes it a smile
  // rather than a frown.
  const start = Math.PI + (Math.PI - AVATAR.mouthArc) / 2
  for (let i = 0; i < AVATAR.mouthDots; i++) {
    const angle = start + (AVATAR.mouthArc * i) / (AVATAR.mouthDots - 1)
    const x = Math.cos(angle) * AVATAR.mouthRadius
    const y = AVATAR.mouthY + Math.sin(angle) * AVATAR.mouthRadius
    points.push({
      x,
      y,
      z: surfaceZ(x) - AVATAR.mouthDotRadius * AVATAR.faceSink,
      radius: AVATAR.mouthDotRadius,
    })
  }

  return points
}

/** Built on first use and then shared by every body in the world. */
let shared: { body: BufferGeometry; face: BufferGeometry; skin: MeshStandardMaterial; ink: MeshStandardMaterial } | null =
  null

function parts() {
  if (shared) return shared

  const body = new CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 12)
  // The capsule is built about its own middle and the controller keeps the
  // feet at zero, so lift it once here rather than everywhere it is used.
  body.translate(0, PLAYER.height / 2, 0)

  const pieces: BufferGeometry[] = []
  for (const point of facePoints()) {
    const sphere = new SphereGeometry(point.radius, 10, 8)
    sphere.translate(point.x, point.y, point.z)
    pieces.push(sphere)
  }
  const face = mergeGeometries(pieces, false) as BufferGeometry
  for (const piece of pieces) piece.dispose()

  shared = {
    body,
    face,
    skin: new MeshStandardMaterial({ color: AVATAR.bodyColour, roughness: 0.55 }),
    ink: new MeshStandardMaterial({ color: AVATAR.faceColour, roughness: 0.7 }),
  }
  return shared
}

/**
 * One body, standing on y = 0 and facing +Z.
 *
 * Every caller gets its own group - a local player and a remote one must not
 * share a transform - over the one set of geometries and materials.
 */
export function createAvatar(): Group {
  const { body, face, skin, ink } = parts()

  const pill = new Mesh(body, skin)
  pill.castShadow = true
  // It stands on sand it also shades, so it takes its own shadow too.
  pill.receiveShadow = true

  const smile = new Mesh(face, ink)
  // Left out of the shadow pass on purpose: the face is a few centimetres of
  // detail pressed against a body that is already casting, and nothing it
  // could add would be visible.
  smile.castShadow = false

  const avatar = new Group()
  avatar.add(pill)
  avatar.add(smile)
  avatar.name = 'avatar'
  return avatar
}

/**
 * How the body sits, given how far it has leaned into a swim.
 *
 * Standing, the origin is at the feet so the middle of the body is half a
 * height up; tipped over, the middle drops towards the surface. Both the local
 * body and every remote one are placed with this, so a remote player can never
 * float at a different height from the one driving them.
 */
export function bodyPose(lean: number, height: number, radius: number): { rise: number; tip: number } {
  const eased = Math.min(1, Math.max(0, lean))
  const tip = eased * AVATAR.swimTip
  return { rise: height / 2 - tip * (height / 2 - radius), tip }
}
