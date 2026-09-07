import { readFileSync } from 'node:fs'
import { Box3, Group, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLAYER } from '../internal/controller'
import { DUCK, fitToHeight } from '../internal/duck'
import { normaliseDuck, repairFeet } from '../internal/DuckModel'

/**
 * These load the real file off disk.
 *
 * A model is exactly the kind of thing that goes wrong silently - upside down,
 * facing backwards, a hundred times too big - and every one of those failures
 * still renders something, so nothing but looking would catch it. Here it is
 * cheap to check, because the model has no textures and GLTFLoader will parse
 * a GLB in Node without a canvas.
 */
const FILE = `public/assets/${DUCK.asset}`

let raw: Group
let duck: Group

beforeAll(async () => {
  const buffer = readFileSync(FILE)
  const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const gltf = await new GLTFLoader().parseAsync(array as ArrayBuffer, '')
  raw = gltf.scene as Group
  duck = normaliseDuck(raw.clone())
})

const boxOf = (o: Group) => new Box3().setFromObject(o)

function meshes(o: Group): Mesh[] {
  const found: Mesh[] = []
  o.traverse((child) => {
    if ((child as Mesh).isMesh) found.push(child as Mesh)
  })
  return found
}

function triangles(o: Group): number {
  return meshes(o).reduce((sum, m) => {
    const g = m.geometry
    return sum + (g.index ? g.index.count : g.attributes.position.count) / 3
  }, 0)
}

describe('the file on disk', () => {
  it('is there, and is the duck the player module asks for', () => {
    expect(raw).toBeTruthy()
    expect(meshes(raw).length).toBeGreaterThan(0)
  })

  it('is authored Z-up and facing -Y, which is what the rotation assumes', () => {
    // Stated rather than detected, so this is the check that the statement is
    // still true of the file. If someone re-exports the duck Y-up, the constant
    // is wrong and the duck ends up on its back - and it would still render.
    const box = boxOf(raw)
    const size = box.getSize(new Vector3())
    // Tallest along Z: it is a standing duck, so its own up axis is its longest.
    expect(size.z).toBeGreaterThan(size.x)
    expect(size.z).toBeGreaterThan(size.y)
    // The beak is the furthest-forward thing on a duck, and it is at -Y.
    const beak = raw.getObjectByName('Beak_Top')
    const tail = raw.getObjectByName('Tail_Center')
    expect(beak).toBeTruthy()
    expect(tail).toBeTruthy()
    const beakY = boxOf(beak as Group).getCenter(new Vector3()).y
    const tailY = boxOf(tail as Group).getCenter(new Vector3()).y
    expect(beakY).toBeLessThan(0)
    expect(tailY).toBeGreaterThan(beakY)
    // And the feet are at the bottom in Z.
    const foot = raw.getObjectByName('Foot_L')
    expect(boxOf(foot as Group).min.z).toBeLessThan(box.min.z + size.z * 0.1)
  })

  it('has no skeleton or animation, which is what makes merging safe', () => {
    // Merging bakes each part's transform into its vertices. That is only
    // sound while the parts cannot move relative to each other.
    let skinned = 0
    raw.traverse((o) => {
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned++
    })
    expect(skinned).toBe(0)
  })
})

describe('the feet, which the model gets wrong', () => {
  it('ships with every toe floating in front of its foot and off the ground', () => {
    // Not a complaint, a record: this is why `repairFeet` exists, and if the
    // model is ever fixed this test is the one that says so by failing.
    const fresh = raw.clone()
    fresh.updateMatrixWorld(true)
    const foot = boxOf(fresh.getObjectByName('Foot_L') as Group)
    const toe = boxOf(fresh.getObjectByName('Toe_L_0') as Group)
    // The model faces -Y, so this is a hole between the toe and the foot.
    expect(foot.min.y - toe.max.y).toBeGreaterThan(0.05)
    // And Z is up, so the toe hovers well above the sole.
    expect(toe.min.z - foot.min.z).toBeGreaterThan(0.1)
  })

  it('joins them back on and stands them on the sole', () => {
    const fixed = raw.clone()
    expect(repairFeet(fixed)).toBe(6)
    const foot = boxOf(fixed.getObjectByName('Foot_L') as Group)
    const toe = boxOf(fixed.getObjectByName('Toe_L_0') as Group)
    // Overlapping now, not merely touching, so the join is not a visible seam.
    expect(foot.min.y - toe.max.y).toBeLessThan(0)
    expect(toe.min.z).toBeCloseTo(foot.min.z, 6)
  })

  it('leaves a model that is already right alone', () => {
    // Running twice must not walk the toes back through the foot, and a duck
    // whose feet are correct must come out untouched. That is what makes this
    // safe to leave in once the asset is fixed.
    const fixed = raw.clone()
    repairFeet(fixed)
    expect(repairFeet(fixed)).toBe(0)
  })

  it('ignores a model whose parts it does not recognise', () => {
    const anonymous = new Group()
    expect(repairFeet(anonymous)).toBe(0)
  })
})

describe('standing the duck up', () => {
  it('makes it exactly as tall as the body the controller moves', () => {
    const size = boxOf(duck).getSize(new Vector3())
    expect(size.y).toBeCloseTo(PLAYER.height, 4)
  })

  it('stands it on the ground rather than in it or above it', () => {
    // The controller keeps `y` at the feet, so the model has to bottom out at
    // zero. Sunk into the sand or hovering over it are both one sign apart.
    const box = boxOf(duck)
    expect(box.min.y).toBeCloseTo(0, 4)
    expect(box.max.y).toBeCloseTo(PLAYER.height, 4)
  })

  it('faces +Z, which is what a heading of zero means here', () => {
    // The body group is turned by `state.facing`, and `atan2(dx, dz)` makes a
    // heading of zero point down +Z. A duck facing backwards would walk
    // tail-first for the whole game, which is the sort of thing that looks
    // like a controls bug rather than an import bug.
    //
    // The parts are merged by now, so this goes by shape: a duck's beak sticks
    // out further in front than its tail does behind.
    const box = boxOf(duck)
    expect(box.max.z).toBeGreaterThan(0)
    expect(box.max.z).toBeGreaterThan(Math.abs(box.min.z))
  })

  it('is the right way up, with the narrow crest on top', () => {
    // A bounding box cannot tell a duck from an upside-down duck, so this goes
    // by width. The top tenth of a duck is its crest and nothing else, which is
    // far narrower than anything lower down; the bottom tenth is its feet,
    // which are not. Comparing the waist to the crown is what makes this fail
    // when the model comes in inverted - an earlier version compared two
    // middling slices and passed either way up.
    const crown = widthBetween(duck, 0.9, 1)
    const waist = widthBetween(duck, 0.4, 0.6)
    expect(crown).toBeGreaterThan(0)
    expect(crown).toBeLessThan(waist * 0.4)
  })

  it('keeps the proportions, rather than squashing it to fit', () => {
    const before = boxOf(raw).getSize(new Vector3())
    const after = boxOf(duck).getSize(new Vector3())
    // Model Z became world Y, model X stayed X, model Y became world Z.
    const ratio = after.y / before.z
    expect(after.x / before.x).toBeCloseTo(ratio, 4)
    expect(after.z / before.y).toBeCloseTo(ratio, 4)
  })

  it('is a duck-shaped duck: taller than it is wide, wider than it is deep-ish', () => {
    const size = boxOf(duck).getSize(new Vector3())
    expect(size.y).toBeGreaterThan(size.x)
    expect(size.x).toBeGreaterThan(0.5)
    expect(size.x).toBeLessThan(size.y)
  })
})

describe('what it costs to draw', () => {
  it('collapses two dozen parts down to one mesh per material', () => {
    const before = meshes(raw).length
    const after = meshes(duck).length
    expect(before).toBeGreaterThan(20)
    expect(after).toBeLessThanOrEqual(8)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })

  it('loses no triangles doing it', () => {
    expect(triangles(duck)).toBe(triangles(raw))
  })

  it('is a cheap model to have on screen at all times', () => {
    expect(triangles(duck)).toBeLessThan(20000)
  })

  it('casts a shadow', () => {
    for (const mesh of meshes(duck)) expect(mesh.castShadow).toBe(true)
  })

  it('is shaded round rather than faceted', () => {
    // The file carries no normals, so glTF says shade it flat and the loader
    // does - which on a duck made of low-poly spheres is what "looks flat"
    // actually is. Every part is a subdivided icosahedron with shared
    // vertices, so averaging at each vertex rounds it off properly.
    for (const mesh of meshes(duck)) {
      expect(mesh.geometry.attributes.normal).toBeTruthy()
      expect((mesh.material as { flatShading?: boolean }).flatShading).toBe(false)
    }
  })

  it('has normals that are actually normalised and actually vary', () => {
    // A geometry can carry a normal attribute full of zeroes and still pass a
    // "has normals" check, and it would render black.
    const mesh = meshes(duck)[0]
    const n = mesh.geometry.attributes.normal
    const seen = new Set<string>()
    for (let i = 0; i < n.count; i++) {
      const v = new Vector3().fromBufferAttribute(n, i)
      expect(v.length()).toBeCloseTo(1, 4)
      seen.add(v.toArray().map((c) => c.toFixed(2)).join(','))
    }
    expect(seen.size).toBeGreaterThan(20)
  })
})

describe('fitting to a height', () => {
  it('scales by the model height and lifts the feet to zero', () => {
    const b = { minX: -1, minY: -1, minZ: 0.5, maxX: 1, maxY: 1, maxZ: 4.5 }
    const { scale, liftY } = fitToHeight(b, 2)
    expect(scale).toBeCloseTo(0.5, 9)
    expect(liftY).toBeCloseTo(-0.25, 9)
  })

  it('handles a model whose feet are below its own origin', () => {
    const b = { minX: -1, minY: -1, minZ: -0.02, maxX: 1, maxY: 1, maxZ: 3.384 }
    const { scale, liftY } = fitToHeight(b, PLAYER.height)
    expect(scale * (b.maxZ - b.minZ)).toBeCloseTo(PLAYER.height, 9)
    expect(liftY).toBeGreaterThan(0)
    // Lifting by the lift puts the lowest point at zero.
    expect(b.minZ * scale + liftY).toBeCloseTo(0, 9)
  })

  it('refuses to divide by nothing', () => {
    const flat = { minX: 0, minY: 0, minZ: 1, maxX: 0, maxY: 0, maxZ: 1 }
    expect(fitToHeight(flat, 2)).toEqual({ scale: 1, liftY: 0 })
    const b = { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 2 }
    expect(fitToHeight(b, 0)).toEqual({ scale: 1, liftY: 0 })
  })
})

describe('how far it tips when swimming', () => {
  it('leans into the paddle rather than lying on its face', () => {
    // A capsule swims flat; a duck floats upright and leans. The controller's
    // `lean` still runs 0 to 1 - this is only how far a duck takes it.
    expect(DUCK.swimTip).toBeGreaterThan(0)
    expect(DUCK.swimTip).toBeLessThan(0.4)
    const degrees = DUCK.swimTip * 90
    expect(degrees).toBeGreaterThan(5)
    expect(degrees).toBeLessThan(30)
  })
})

/**
 * How wide the duck is across a horizontal slice, given as fractions of its
 * height. Works in world space, so it sees the duck as it will be drawn.
 */
function widthBetween(o: Group, from: number, to: number): number {
  o.updateMatrixWorld(true)
  const box = new Box3().setFromObject(o)
  const low = box.min.y + (box.max.y - box.min.y) * from
  const high = box.min.y + (box.max.y - box.min.y) * to
  let minX = Infinity
  let maxX = -Infinity
  const v = new Vector3()
  for (const mesh of meshes(o)) {
    const pos = mesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      if (v.y < low || v.y > high) continue
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
    }
  }
  return Number.isFinite(minX) ? maxX - minX : 0
}
