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
 * session, so a hundred avatars cost a hundred small meshes and not one
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
import { type FaceEmote } from './emote'

export const AVATAR = {
  bodyColour: '#e0563f',
  faceColour: '#2a1712',

  /** The body stops here; the head is a separate, movable round piece. */
  bodyHeight: 1.42,
  /** Centre and radius of the head, above the feet. */
  headY: PLAYER.height - PLAYER.radius,
  headRadius: PLAYER.radius,

  /** Height above the feet at which the eyes sit, in metres. */
  eyeY: 1.47,
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
  mouthY: 1.37,
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

  /**
   * The arms: one capsule a side, and where they hang.
   *
   * Temporary, and built the same way the rest of the body is - a primitive
   * rather than a model, because the failure modes of four numbers are the
   * ones you can see in the numbers. There is no rig and nothing swings: they
   * are merged into the body and come along with whatever it does, which is
   * all a stunned body tipping over actually needs.
   *
   * `armDrop` is where the shoulder sits below the eyes, and `armOut` how far
   * the hand swings away from the body - a small angle, so the silhouette
   * still reads as a pill with arms rather than a starfish.
   */
  shoulderY: 1.06,
  armLength: 0.46,
  armRadius: 0.075,
  /** How far out from the middle the shoulder is. Just proud of the body. */
  armSpread: 0.36,
  /** How far the arms swing out from straight down, in radians. */
  armOut: 0.34,
} as const

/** The front curve of the round head at a point on the face. */
function surfaceZ(x: number, y: number): number {
  const dy = y - AVATAR.headY
  const inside = AVATAR.headRadius * AVATAR.headRadius - x * x - dy * dy
  return inside > 0 ? Math.sqrt(inside) : 0
}

export interface FacePoint {
  x: number
  y: number
  z: number
  radius: number
}

function point(x: number, y: number, radius: number): FacePoint {
  return { x, y, z: surfaceZ(x, y) - radius * AVATAR.faceSink, radius }
}

function arc(y: number, radius: number, invert = false, dots: number = AVATAR.mouthDots, dotRadius: number = AVATAR.mouthDotRadius): FacePoint[] {
  const points: FacePoint[] = []
  for (let i = 0; i < dots; i++) {
    const angle = Math.PI + (Math.PI * i) / (dots - 1)
    const x = Math.cos(angle) * radius
    const atY = y + Math.sin(angle) * radius * (invert ? -1 : 1)
    points.push(point(x, atY, dotRadius))
  }
  return points
}

function ring(y: number, radius: number, dots: number = 8, dotRadius: number = AVATAR.mouthDotRadius): FacePoint[] {
  const points: FacePoint[] = []
  for (let i = 0; i < dots; i++) {
    const angle = (Math.PI * 2 * i) / dots
    points.push(point(Math.cos(angle) * radius, y + Math.sin(angle) * radius, dotRadius))
  }
  return points
}

function eyes(radius: number = AVATAR.eyeRadius, y: number = AVATAR.eyeY, spread: number = AVATAR.eyeSpread): FacePoint[] {
  return [-1, 1].map((side) => point(side * spread, y, radius))
}

/** Where an expression's eyes and mouth sit, in head space. */
export function facePoints(emote: FaceEmote = 'smile'): FacePoint[] {
  if (emote === 'mad') {
    return [
      ...eyes(),
      point(-0.2, 1.56, 0.022), point(-0.155, 1.545, 0.022), point(-0.11, 1.53, 0.022),
      point(0.11, 1.53, 0.022), point(0.155, 1.545, 0.022), point(0.2, 1.56, 0.022),
      ...Array.from({ length: 5 }, (_, i) => point(-0.08 + i * 0.04, 1.32, 0.022)),
    ]
  }
  if (emote === 'scared') return [...eyes(0.098, 1.48), ...ring(1.34, 0.064)]
  if (emote === 'laugh') {
    return [
      point(-0.19, 1.47, 0.021), point(-0.155, 1.46, 0.021), point(-0.12, 1.47, 0.021),
      point(0.12, 1.47, 0.021), point(0.155, 1.46, 0.021), point(0.19, 1.47, 0.021),
      ...arc(1.36, 0.09, false, 8, 0.032),
    ]
  }
  if (emote === 'sad') return [...eyes(), ...arc(1.34, AVATAR.mouthRadius, true)]
  if (emote === 'surprised') return [...eyes(0.09, 1.48), ...ring(1.34, 0.055, 8, 0.026)]
  if (emote === 'mog') {
    return [
      ...eyes(0.052, 1.465, 0.14),
      point(-0.19, 1.54, 0.02), point(-0.15, 1.555, 0.02), point(-0.11, 1.54, 0.02),
      point(0.11, 1.54, 0.02), point(0.15, 1.555, 0.02), point(0.19, 1.54, 0.02),
      ...Array.from({ length: 7 }, (_, i) => point(-0.105 + i * 0.035, 1.32, 0.02)),
    ]
  }

  return [...eyes(), ...arc(AVATAR.mouthY, AVATAR.mouthRadius)]
}

/**
 * Where each arm hangs: the middle of the capsule, and how far it is swung out.
 *
 * Pure, so the thing that is easy to get wrong - an arm inside the body, or
 * floating a hand's width off it - is checked by a test rather than by looking
 * at it. Swung out by `armOut` about the shoulder, so the middle of the arm
 * moves out and up by exactly the half-length it pivots through.
 */
export function armPoints(): { x: number; y: number; roll: number }[] {
  const half = AVATAR.armLength / 2
  return [-1, 1].map((side) => ({
    x: side * (AVATAR.armSpread + Math.sin(AVATAR.armOut) * half),
    y: AVATAR.shoulderY - Math.cos(AVATAR.armOut) * half,
    // Positive roll swings the +X arm away from the body, so the sign follows
    // the side it is on.
    roll: -side * AVATAR.armOut,
  }))
}

/** Built on first use and then shared by every body in the world. */
let shared: { body: BufferGeometry; head: BufferGeometry; faces: Record<FaceEmote, BufferGeometry>; ink: MeshStandardMaterial } | null = null

function parts() {
  if (shared) return shared

  const trunk = new CapsuleGeometry(PLAYER.radius, AVATAR.bodyHeight - PLAYER.radius * 2, 6, 12)
  // The capsule is built about its own middle and the controller keeps the
  // feet at zero, so lift it once here rather than everywhere it is used.
  trunk.translate(0, AVATAR.bodyHeight / 2, 0)

  // The arms are merged into the trunk rather than hung off it as their own
  // meshes: nothing animates them separately, so two more meshes would be two
  // more draw calls for a body that is still standing at exactly one pose.
  const limbs: BufferGeometry[] = [trunk]
  for (const arm of armPoints()) {
    const limb = new CapsuleGeometry(AVATAR.armRadius, AVATAR.armLength - AVATAR.armRadius * 2, 4, 8)
    limb.rotateZ(arm.roll)
    limb.translate(arm.x, arm.y, 0)
    limbs.push(limb)
  }
  const body = mergeGeometries(limbs, false) as BufferGeometry
  for (const limb of limbs) limb.dispose()

  const faces = {} as Record<FaceEmote, BufferGeometry>
  for (const emote of ['smile', 'mad', 'scared', 'laugh', 'sad', 'surprised', 'mog'] as const) {
    const pieces: BufferGeometry[] = []
    for (const point of facePoints(emote)) {
      const sphere = new SphereGeometry(point.radius, 10, 8)
      sphere.translate(point.x, point.y, point.z)
      pieces.push(sphere)
    }
    faces[emote] = mergeGeometries(pieces, false) as BufferGeometry
    for (const piece of pieces) piece.dispose()
  }

  const head = new SphereGeometry(AVATAR.headRadius, 12, 10)

  shared = {
    body,
    head,
    faces,
    ink: new MeshStandardMaterial({ color: AVATAR.faceColour, roughness: 0.7 }),
  }
  return shared
}

/**
 * The skin for a colour, built once per colour and then shared.
 *
 * A minigame that wants a body per player wants a body per *colour*, and a
 * fresh material each time would be a fresh shader program each time. Keyed by
 * the colour string, so eight blue players cost one material between them.
 */
const skins = new Map<string, MeshStandardMaterial>()

function skinFor(colour: string): MeshStandardMaterial {
  const had = skins.get(colour)
  if (had) return had
  const made = new MeshStandardMaterial({ color: colour, roughness: 0.55 })
  skins.set(colour, made)
  return made
}

/**
 * One body, standing on y = 0 and facing +Z.
 *
 * Every caller gets its own group - a local player and a remote one must not
 * share a transform - over the one set of geometries and materials.
 *
 * `colour` is for anything that needs to tell bodies apart at a glance: the
 * world only ever has red ones, but a minigame full of them needs a colour per
 * player. Geometry is shared whatever colour it is painted.
 */
export function createAvatar(colour: string = AVATAR.bodyColour): Group {
  const { body, head: headGeometry, faces, ink } = parts()
  const skin = skinFor(colour)

  const pill = new Mesh(body, skin)
  pill.castShadow = true
  // It stands on sand it also shades, so it takes its own shadow too.
  pill.receiveShadow = true

  const smile = new Mesh(faces.smile, ink)
  smile.name = 'avatar-face'
  // Left out of the shadow pass on purpose: the face is a few centimetres of
  // detail pressed against a body that is already casting, and nothing it
  // could add would be visible.
  smile.castShadow = false

  // The face is attached to a real head, so turning and nodding moves a whole
  // coloured head with its features rather than only a floating smile.
  const head = new Group()
  head.name = 'avatar-head'
  head.position.y = AVATAR.headY
  const skull = new Mesh(headGeometry, skin)
  skull.castShadow = true
  skull.receiveShadow = true
  head.add(skull)
  smile.position.y = -AVATAR.headY
  head.add(smile)

  const avatar = new Group()
  avatar.add(pill)
  avatar.add(head)
  avatar.name = 'avatar'
  return avatar
}

/** Turns the visible head and face without moving the player's body. */
export function setAvatarHeadLook(avatar: Group, yaw: number, pitch: number): void {
  const head = avatar.getObjectByName('avatar-head')
  if (!head) return
  head.rotation.set(Math.max(-1.35, Math.min(1.35, pitch)), yaw, 0)
}

/** Replaces the one face mesh's shared geometry with the requested expression. */
export function setAvatarEmote(avatar: Group, emote: FaceEmote): void {
  const face = avatar.getObjectByName('avatar-face') as Mesh | undefined
  if (face) face.geometry = parts().faces[emote]
}

/**
 * How the body sits, given how far it has leaned into a swim and how far it
 * has been knocked over.
 *
 * Standing, the origin is at the feet so the middle of the body is half a
 * height up; tipped over either way, the middle drops towards the ground.
 * Both the local body and every remote one are placed with this, so a remote
 * player can never float at a different height from the one driving them.
 *
 * **The two tip opposite ways, on purpose.** A swimmer goes face down, which
 * is how anybody swims. A body that has been knocked over goes on its back,
 * so the face stays pointing at the room - being able to see whose it is is
 * most of what makes a stun readable from across an arena.
 *
 * They are not added together. A body cannot be both face down and on its
 * back, so whichever is further over wins and decides the height as well.
 * `fall` is optional, so every caller that only knows about swimming - see
 * the remote bodies in `09-net` - carries on unchanged.
 */
export function bodyPose(
  lean: number,
  height: number,
  radius: number,
  fall = 0,
): { rise: number; tip: number } {
  const swim = Math.min(1, Math.max(0, lean)) * AVATAR.swimTip
  const knocked = Math.min(1, Math.max(0, fall))
  const over = Math.max(swim, knocked)
  return { rise: height / 2 - over * (height / 2 - radius), tip: knocked > swim ? -knocked : swim }
}
