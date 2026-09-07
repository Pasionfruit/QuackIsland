/**
 * Loading the duck, and getting it down to a sensible number of draw calls.
 *
 * The model arrives as twenty-four separate meshes - body, head, each eye, each
 * toe - sharing six materials between them. Drawn as authored that is
 * twenty-four draw calls for one character, permanently on screen. Merging the
 * parts that share a material brings it to six, costs nothing at runtime, and
 * is safe here because the parts never move relative to each other: there is no
 * skeleton and no animation in the file.
 *
 * Loaded imperatively rather than through `useLoader`, because that suspends
 * and there is no Suspense boundary above the canvas. This way a slow or
 * missing asset leaves the placeholder body on screen instead of blanking the
 * scene, and a failure says so in the console rather than unmounting the world.
 */
import { useEffect, useState } from 'react'
import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { assetUrl } from '../../00-core'
import { DUCK, fitToHeight } from './duck'
import { PLAYER } from './controller'

/**
 * Puts the toes back on the feet.
 *
 * The model has every toe floating in front of its foot with a visible gap,
 * and hovering at shin height rather than sitting on the ground. It is a
 * defect in the asset, not in anything here - the parts are simply placed
 * wrong - but it is very visible, so this closes the gap on the way in.
 *
 * Measured rather than hardcoded, and it does nothing when there is nothing
 * wrong: fix the model and this quietly becomes a no-op. It is keyed to the
 * part names in this particular file, so a different duck it does not
 * recognise passes through untouched.
 *
 * Returns how many toes it moved, which is what the tests assert on.
 */
export function repairFeet(root: Group): number {
  root.updateMatrixWorld(true)
  let moved = 0

  for (const side of ['L', 'R']) {
    const foot = root.getObjectByName(`Foot_${side}`)
    if (!foot) continue
    const footBox = new Box3().setFromObject(foot)

    for (let i = 0; i < 8; i++) {
      const toe = root.getObjectByName(`Toe_${side}_${i}`)
      if (!toe) continue
      const box = new Box3().setFromObject(toe)
      // The model faces -Y, so a toe is in front of its foot when the toe's
      // greatest Y is still below the foot's least Y. That difference is the
      // hole between them.
      const gap = footBox.min.y - box.max.y
      // And the model is Z-up, so this is how far the toe floats off the sole.
      const hover = box.min.z - footBox.min.z
      if (gap <= 0 && hover <= 0) continue
      // Pull it back into the foot, with a little to spare so the join is not
      // a seam, and drop it onto the sole.
      if (gap > 0) toe.position.y += gap + TOE_OVERLAP
      if (hover > 0) toe.position.z -= hover
      moved++
    }
  }

  root.updateMatrixWorld(true)
  return moved
}

/** How far a toe is pushed into its foot, in model units, to hide the join. */
const TOE_OVERLAP = 0.05

/**
 * Bakes every mesh into one per material.
 *
 * Each part's world matrix is applied to its geometry first, so this does not
 * care whether the parts carry transforms - it only cares that they do not
 * change, which for a model with no skin and no animation they cannot.
 */
function mergeByMaterial(root: Group): Group {
  root.updateMatrixWorld(true)

  const byMaterial = new Map<Material, BufferGeometry[]>()
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    const list = byMaterial.get(material)
    if (list) list.push(geometry)
    else byMaterial.set(material, [geometry])
  })

  const merged = new Group()
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries, false)
    for (const g of geometries) g.dispose()
    if (!geometry) continue
    // The file carries no normals at all, so glTF says to shade it flat and
    // the loader duly does. On a duck made of low-polygon spheres that reads
    // as a bundle of facets - which is what "flat" looks like in practice.
    // Every part here is a subdivided icosahedron with its vertices shared
    // between faces, so averaging the face normals at each vertex rounds them
    // all off properly. Nothing is meant to have a hard edge.
    geometry.computeVertexNormals()

    const rounded = (material as MeshStandardMaterial).clone()
    rounded.flatShading = false
    rounded.needsUpdate = true

    const mesh = new Mesh(geometry, rounded)
    mesh.castShadow = true
    // The duck stands on sand it also shades, so it takes its own shadow too.
    mesh.receiveShadow = true
    merged.add(mesh)
  }
  return merged
}

/**
 * Turns the raw model into a duck standing on y = 0, the right way up, the
 * right way round, and `PLAYER.height` tall.
 */
export function normaliseDuck(scene: Group): Group {
  repairFeet(scene)
  const parts = mergeByMaterial(scene)

  // Measured in the model's own space, before anything is rotated - which is
  // why `fitToHeight` reads the height off Z rather than Y.
  const box = new Box3().setFromObject(parts)
  const { scale, liftY } = fitToHeight(
    {
      minX: box.min.x,
      minY: box.min.y,
      minZ: box.min.z,
      maxX: box.max.x,
      maxY: box.max.y,
      maxZ: box.max.z,
    },
    PLAYER.height,
  )

  const duck = new Group()
  duck.add(parts)
  duck.rotation.x = DUCK.rotationX
  duck.scale.setScalar(scale)
  duck.position.y = liftY
  duck.name = 'duck'
  return duck
}

/** One load for the whole session, however many things ask for a duck. */
let pending: Promise<Group> | null = null

export function loadDuck(): Promise<Group> {
  if (!pending) {
    pending = new GLTFLoader()
      .loadAsync(assetUrl(DUCK.asset))
      .then((gltf) => normaliseDuck(gltf.scene as Group))
  }
  return pending
}

/**
 * The duck, or `null` until it has loaded.
 *
 * Every caller gets its own clone of the normalised model, so two of them
 * could not end up sharing one transform. The geometry and materials are
 * shared by the clone, which is the point.
 */
export function useDuck(): Group | null {
  const [duck, setDuck] = useState<Group | null>(null)

  useEffect(() => {
    let live = true
    loadDuck()
      .then((model) => {
        if (live) setDuck(model.clone())
      })
      .catch((error) => {
        console.error(`[02-player] could not load ${DUCK.asset}; keeping the placeholder body`, error)
      })
    return () => {
      live = false
    }
  }, [])

  return duck
}

/** Only used by the tests, to measure what actually got built. */
export function measure(object: Group): { size: Vector3; min: Vector3; max: Vector3 } {
  const box = new Box3().setFromObject(object)
  return { size: box.getSize(new Vector3()), min: box.min.clone(), max: box.max.clone() }
}
