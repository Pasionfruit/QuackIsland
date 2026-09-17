/**
 * The five animals, built out of primitives.
 *
 * Each one is a `Group` facing **+Z**, standing with its feet on `y = 0`, with
 * the parts that move handed back so the scene can run them: the legs swing,
 * the tail wags, the ears stream back, and the fish flops.
 *
 * Built as three.js objects rather than as JSX, the same way the island builds
 * its avatar, because the scene wants references to the legs and reaching into
 * a JSX tree for them is worse than making it here.
 *
 * **The shapes carry the stats.** A rabbit is mostly hind legs and ears, a
 * hamster is a ball with feet, a cat is long and low, a dog is the middle of
 * all of them - so a glance at the start line tells you who picked what, which
 * matters when the HUD can only name so many of eight racers.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Color, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import type { PetId } from './pets'
import { petById } from './pets'

const BOX = new BoxGeometry(1, 1, 1)
const BALL = new SphereGeometry(0.5, 12, 9)
const ROD = new CylinderGeometry(0.5, 0.5, 1, 8)
const SPIKE = new ConeGeometry(0.5, 1, 8)

export interface PetRig {
  root: Group
  /** Front left, front right, back left, back right - whichever the animal has. */
  legs: Object3D[]
  tail: Object3D | null
  ears: Object3D[]
  /** The part that leans and bobs: everything but the legs. */
  body: Group
}

type Shape = 'box' | 'ball' | 'rod' | 'spike'

const GEOMETRY = { box: BOX, ball: BALL, rod: ROD, spike: SPIKE } as const

function part(shape: Shape, colour: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(GEOMETRY[shape], new MeshStandardMaterial({ color: new Color(colour), roughness: 0.82 }))
  mesh.scale.set(sx, sy, sz)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** A leg, hung from a hip so that turning it about X swings the foot. */
function leg(colour: string, width: number, length: number, x: number, z: number, hip: number): Object3D {
  const pivot = new Object3D()
  pivot.position.set(x, hip, z)
  const limb = part('rod', colour, width, length, width, 0, -length / 2, 0)
  pivot.add(limb)
  return pivot
}

/** Mixes a player's colour into the animal's own, so eight dogs are still eight players. */
function coat(pet: PetId, playerColour: string): { fur: string; dark: string; pale: string } {
  const own = new Color(petById(pet).colour)
  const theirs = new Color(playerColour)
  const fur = own.clone().lerp(theirs, 0.45)
  return {
    fur: `#${fur.getHexString()}`,
    dark: `#${fur.clone().multiplyScalar(0.62).getHexString()}`,
    pale: `#${fur.clone().lerp(new Color('#ffffff'), 0.55).getHexString()}`,
  }
}

function buildDog(c: { fur: string; dark: string; pale: string }): PetRig {
  const root = new Group()
  const body = new Group()
  const legs = [
    leg(c.dark, 0.13, 0.42, -0.22, 0.32, 0.42),
    leg(c.dark, 0.13, 0.42, 0.22, 0.32, 0.42),
    leg(c.dark, 0.13, 0.42, -0.22, -0.3, 0.42),
    leg(c.dark, 0.13, 0.42, 0.22, -0.3, 0.42),
  ]
  body.add(part('box', c.fur, 0.5, 0.42, 1.05, 0, 0.62, 0))
  body.add(part('box', c.fur, 0.38, 0.36, 0.36, 0, 0.82, 0.58))
  body.add(part('box', c.pale, 0.24, 0.2, 0.28, 0, 0.74, 0.8))
  body.add(part('ball', '#241a14', 0.07, 0.07, 0.07, 0, 0.77, 0.94))
  const ears = [part('box', c.dark, 0.1, 0.26, 0.16, -0.17, 0.82, 0.55), part('box', c.dark, 0.1, 0.26, 0.16, 0.17, 0.82, 0.55)]
  const tail = part('rod', c.fur, 0.09, 0.42, 0.09, 0, 0.78, -0.5)
  tail.rotation.x = -0.9
  for (const ear of ears) body.add(ear)
  body.add(tail)
  root.add(body, ...legs)
  return { root, legs, tail, ears, body }
}

function buildCat(c: { fur: string; dark: string; pale: string }): PetRig {
  const root = new Group()
  const body = new Group()
  const legs = [
    leg(c.dark, 0.1, 0.38, -0.17, 0.3, 0.38),
    leg(c.dark, 0.1, 0.38, 0.17, 0.3, 0.38),
    leg(c.dark, 0.1, 0.38, -0.17, -0.28, 0.38),
    leg(c.dark, 0.1, 0.38, 0.17, -0.28, 0.38),
  ]
  body.add(part('box', c.fur, 0.38, 0.34, 1, 0, 0.53, 0))
  body.add(part('ball', c.fur, 0.34, 0.32, 0.32, 0, 0.68, 0.53))
  body.add(part('ball', '#2a2a30', 0.06, 0.06, 0.06, -0.09, 0.7, 0.66))
  body.add(part('ball', '#2a2a30', 0.06, 0.06, 0.06, 0.09, 0.7, 0.66))
  const ears = [part('spike', c.dark, 0.16, 0.2, 0.1, -0.11, 0.86, 0.5), part('spike', c.dark, 0.16, 0.2, 0.1, 0.11, 0.86, 0.5)]
  // A long tail in two lengths, so it can curl rather than only swing.
  const tail = new Object3D()
  tail.position.set(0, 0.62, -0.48)
  const tail1 = part('rod', c.fur, 0.075, 0.42, 0.075, 0, 0.21, 0)
  const tail2 = new Object3D()
  tail2.position.set(0, 0.42, 0)
  tail2.rotation.x = 0.5
  tail2.add(part('rod', c.pale, 0.065, 0.34, 0.065, 0, 0.17, 0))
  tail.add(tail1, tail2)
  tail.rotation.x = -0.55
  for (const ear of ears) body.add(ear)
  body.add(tail)
  root.add(body, ...legs)
  return { root, legs, tail, ears, body }
}

function buildRabbit(c: { fur: string; dark: string; pale: string }): PetRig {
  const root = new Group()
  const body = new Group()
  // Small front paws, big hind legs: the shape says which end does the work.
  const legs = [
    leg(c.dark, 0.1, 0.26, -0.15, 0.26, 0.28),
    leg(c.dark, 0.1, 0.26, 0.15, 0.26, 0.28),
    leg(c.dark, 0.17, 0.42, -0.2, -0.22, 0.44),
    leg(c.dark, 0.17, 0.42, 0.2, -0.22, 0.44),
  ]
  body.add(part('ball', c.fur, 0.56, 0.5, 0.82, 0, 0.5, -0.05))
  body.add(part('ball', c.fur, 0.4, 0.38, 0.4, 0, 0.66, 0.42))
  body.add(part('ball', '#2a2018', 0.07, 0.07, 0.07, -0.12, 0.7, 0.52))
  body.add(part('ball', '#2a2018', 0.07, 0.07, 0.07, 0.12, 0.7, 0.52))
  const ears = [part('box', c.pale, 0.11, 0.52, 0.07, -0.11, 1.06, 0.3), part('box', c.pale, 0.11, 0.52, 0.07, 0.11, 1.06, 0.3)]
  for (const ear of ears) {
    ear.rotation.x = -0.15
    body.add(ear)
  }
  const tail = part('ball', '#f4f0ea', 0.16, 0.16, 0.16, 0, 0.56, -0.44)
  body.add(tail)
  root.add(body, ...legs)
  return { root, legs, tail, ears, body }
}

function buildHamster(c: { fur: string; dark: string; pale: string }): PetRig {
  const root = new Group()
  const body = new Group()
  const legs = [
    leg(c.dark, 0.11, 0.17, -0.19, 0.2, 0.2),
    leg(c.dark, 0.11, 0.17, 0.19, 0.2, 0.2),
    leg(c.dark, 0.11, 0.17, -0.19, -0.18, 0.2),
    leg(c.dark, 0.11, 0.17, 0.19, -0.18, 0.2),
  ]
  // Mostly one ball: a hamster is a tank with feet.
  body.add(part('ball', c.fur, 0.76, 0.66, 0.86, 0, 0.42, 0))
  body.add(part('ball', c.pale, 0.5, 0.36, 0.34, 0, 0.3, 0.3))
  body.add(part('ball', '#2a1c12', 0.07, 0.07, 0.07, -0.14, 0.5, 0.35))
  body.add(part('ball', '#2a1c12', 0.07, 0.07, 0.07, 0.14, 0.5, 0.35))
  body.add(part('ball', '#3a2418', 0.06, 0.05, 0.06, 0, 0.42, 0.44))
  const ears = [part('ball', c.dark, 0.18, 0.18, 0.08, -0.22, 0.72, 0.1), part('ball', c.dark, 0.18, 0.18, 0.08, 0.22, 0.72, 0.1)]
  for (const ear of ears) body.add(ear)
  root.add(body, ...legs)
  return { root, legs, tail: null, ears, body }
}

function buildFish(c: { fur: string; dark: string; pale: string }): PetRig {
  const root = new Group()
  const body = new Group()
  // On its side on the grass, which is the entire joke.
  body.add(part('ball', c.fur, 0.82, 0.44, 0.44, 0, 0.22, 0))
  body.add(part('ball', c.pale, 0.6, 0.2, 0.3, 0, 0.12, 0.05))
  const tail = part('spike', c.dark, 0.5, 0.42, 0.06, -0.52, 0.24, 0)
  tail.rotation.z = Math.PI / 2
  body.add(tail)
  body.add(part('spike', c.dark, 0.3, 0.2, 0.05, 0.05, 0.42, 0))
  body.add(part('ball', '#ffffff', 0.12, 0.12, 0.12, 0.3, 0.3, 0.14))
  body.add(part('ball', '#1a1a1a', 0.07, 0.07, 0.07, 0.33, 0.3, 0.17))
  root.add(body)
  return { root, legs: [], tail, ears: [], body }
}

const BUILDERS: Record<PetId, (c: { fur: string; dark: string; pale: string }) => PetRig> = {
  dog: buildDog,
  cat: buildCat,
  rabbit: buildRabbit,
  hamster: buildHamster,
  fish: buildFish,
}

/** One animal, in a player's colour, ready to be put on the course. */
export function buildPet(pet: PetId, playerColour: string): PetRig {
  return BUILDERS[pet](coat(pet, playerColour))
}

/** Throws away everything a rig made. Called when a racer changes pet, which they may do all through the choosing. */
export function disposePet(rig: PetRig): void {
  rig.root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh) (mesh.material as MeshStandardMaterial).dispose()
  })
  rig.root.clear()
}
