/**
 * The party island: the land, the spiral of tiles, and the treasure.
 *
 * Always there, not conjured when a game starts. It is an island in the same
 * sea as the spawn island, so it should be visible across the water whether or
 * not anybody is playing on it - and a board that appeared out of nothing
 * would read as a bug rather than as a place.
 *
 * Four draw calls: the land, the tiles, the crater rim, and the treasure.
 * The tiles are one instanced mesh, so a hundred and twenty of them cost the
 * same as one.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { BOARD, buildBoard } from './board'
import { ISLAND } from './island'
import { buildIslandMesh } from './mesh'

/** Wraps the island's arrays into a geometry. The shape itself is in `mesh.ts`. */
function buildIsland(): BufferGeometry {
  const { positions, indices } = buildIslandMesh()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const SAND = '#d8c9a4'
const ROCK = '#6d5f57'
const TILE = '#c9b892'
const TILE_MARK = '#b0894f'
const TILE_START = '#7fbf8a'
const TILE_END = '#e0a05a'
const GOLD = '#f0c34a'

export function Arena() {
  const tilesMesh = useRef<InstancedMesh>(null)

  const land = useMemo(() => buildIsland(), [])
  const tileGeometry = useMemo(
    () => new CylinderGeometry(BOARD.tileRadius, BOARD.tileRadius * 0.92, 0.18, 14),
    [],
  )
  const tiles = useMemo(() => buildBoard(), [])

  const sand = useMemo(
    () => new MeshStandardMaterial({ color: SAND, roughness: 0.95, metalness: 0 }),
    [],
  )
  const tileMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0 }),
    [],
  )
  const rock = useMemo(
    () => new MeshStandardMaterial({ color: ROCK, roughness: 0.98, metalness: 0, flatShading: true }),
    [],
  )
  const gold = useMemo(
    () =>
      new MeshStandardMaterial({
        color: GOLD,
        roughness: 0.32,
        metalness: 0.75,
        // A little light of its own, so it can be picked out from the beach.
        emissive: new Color('#6b4a05'),
      }),
    [],
  )

  useEffect(() => {
    const mesh = tilesMesh.current
    if (!mesh) return

    const dummy = new Object3D()
    const colour = new Color()

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]
      dummy.position.set(tile.x, tile.y + BOARD.tileLift, tile.z)
      dummy.rotation.set(0, -tile.angle, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const first = i === 0
      const last = i === tiles.length - 1
      colour.set(first ? TILE_START : last ? TILE_END : tile.marked ? TILE_MARK : TILE)
      mesh.setColorAt(i, colour)
    }

    mesh.count = tiles.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [tiles])

  useEffect(() => {
    return () => {
      land.dispose()
      tileGeometry.dispose()
      sand.dispose()
      tileMaterial.dispose()
      rock.dispose()
      gold.dispose()
    }
  }, [land, tileGeometry, sand, tileMaterial, rock, gold])

  return (
    <group position={[ISLAND.centreX, 0, ISLAND.centreZ]}>
      <mesh geometry={land} material={sand} receiveShadow castShadow />

      <instancedMesh
        ref={tilesMesh}
        args={[tileGeometry, tileMaterial, BOARD.tiles]}
        receiveShadow
      />

      {/* The crater rim: a low wall of rock round the flat top.

          It used to be a bare cap over the upper cone, which cannot stay now
          that the road runs up that cone - a rock shell at exactly the ground's
          height would z-fight the island and bury the last third of the track.
          A rim sits above everything instead, and reads more like a crater. */}
      <mesh material={rock} position={[0, ISLAND.summit + 1.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ISLAND.crater, ISLAND.crater * 1.06, 2.6, 32, 1, true]} />
      </mesh>

      {/* The treasure, on the flat top. */}
      <group position={[0, ISLAND.summit + 0.05, 0]}>
        <mesh material={gold} castShadow>
          <boxGeometry args={[1.5, 0.9, 1]} />
        </mesh>
        <mesh material={gold} position={[0, 0.62, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.5, 1.5, 12, 1, false, 0, Math.PI]} />
        </mesh>
      </group>
    </group>
  )
}
