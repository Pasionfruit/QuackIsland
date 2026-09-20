/**
 * The party island: the land, the spiral of tiles, and the treasure.
 *
 * Always there, not conjured when a game starts. It is an island in the same
 * sea as the spawn island, so it should be visible across the water whether or
 * not anybody is playing on it - and a board that appeared out of nothing
 * would read as a bug rather than as a place.
 *
 * Five draw calls: the land, the tiles, the dotted line between them, the
 * crater rim, and the treasure. The tiles and the dots are each one instanced
 * mesh, so a hundred and twenty tiles and a thousand dots cost one call apiece.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ExtrudeGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Vector3,
} from 'three'
import { BOARD, buildBoard, connectorDots } from './board'
import { ISLAND, partyHeightLocalAt } from './island'
import { buildIslandMesh } from './mesh'

/**
 * The layer the board lives on.
 *
 * Kept off the ground on a layer of its own so anything that wants the track
 * without the island - a map, a minimap, a camera that looks only at the
 * board - can have it by enabling one layer. Layer 0 stays on as well, or the
 * default camera would stop drawing it.
 */
export const BOARD_LAYER = 1

/**
 * One tile: a rounded square, lying flat.
 *
 * Built as a flat shape and extruded, then tipped into the ground plane. The
 * corners are real arcs rather than a bevel, so a tile reads as rounded from
 * directly above - which is the angle almost every player sees it from.
 */
function buildTile(): ExtrudeGeometry {
  const half = BOARD.tileRadius
  const round = Math.min(half * 0.98, half * BOARD.tileRound * 2)
  const straight = half - round

  const shape = new Shape()
  shape.moveTo(-straight, -half)
  shape.lineTo(straight, -half)
  shape.absarc(straight, -straight, round, -Math.PI / 2, 0, false)
  shape.lineTo(half, straight)
  shape.absarc(straight, straight, round, 0, Math.PI / 2, false)
  shape.lineTo(-straight, half)
  shape.absarc(-straight, straight, round, Math.PI / 2, Math.PI, false)
  shape.lineTo(-half, -straight)
  shape.absarc(-straight, -straight, round, Math.PI, Math.PI * 1.5, false)

  const geometry = new ExtrudeGeometry(shape, {
    depth: BOARD.tileThickness,
    bevelEnabled: false,
    curveSegments: 6,
  })
  // Drawn in the XY plane and pushed along Z; the world wants it flat in XZ
  // with its face up, and centred on its own thickness so the lift means what
  // it says.
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, BOARD.tileThickness / 2, 0)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Which way is up where a tile sits.
 *
 * Central differences on the island's own height function, so a tile lies in
 * the slope rather than hovering over it. It matters here far more than it
 * would on flat ground: the cone runs to nearly forty degrees, and a flat tile
 * on that buries half a metre of its uphill corner.
 */
function groundNormalAt(x: number, z: number, out: Vector3): Vector3 {
  const step = 0.35
  const at = (px: number, pz: number) =>
    partyHeightLocalAt(Math.hypot(px, pz), Math.atan2(pz, px))
  const dx = (at(x + step, z) - at(x - step, z)) / (2 * step)
  const dz = (at(x, z + step) - at(x, z - step)) / (2 * step)
  return out.set(-dx, 1, -dz).normalize()
}

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
  const dotsMesh = useRef<InstancedMesh>(null)

  const land = useMemo(() => buildIsland(), [])
  const tileGeometry = useMemo(() => buildTile(), [])
  const tiles = useMemo(() => buildBoard(), [])
  const dots = useMemo(() => connectorDots(), [])
  const dotGeometry = useMemo(() => {
    // A flat disc, facing up; each dot is tipped into the slope it sits on.
    const geometry = new CircleGeometry(BOARD.dotRadius, 10)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }, [])
  const dotMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.6,
        metalness: 0,
        // A little light of its own, so the line still reads on the shaded side
        // of the cone.
        emissive: new Color('#ffffff'),
        emissiveIntensity: 0.25,
      }),
    [],
  )

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
    const normal = new Vector3()
    const up = new Vector3(0, 1, 0)

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]
      // Lifted along the slope's own normal rather than straight up, so the
      // clearance is the same all the way round the tile on ground this steep.
      groundNormalAt(tile.x, tile.z, normal)
      dummy.position.set(
        tile.x + normal.x * BOARD.tileLift,
        tile.y + normal.y * BOARD.tileLift,
        tile.z + normal.z * BOARD.tileLift,
      )
      // Lie in the slope, then turn to face along the track.
      dummy.quaternion.setFromUnitVectors(up, normal)
      dummy.rotateY(-tile.angle)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const first = i === 0
      const last = i === tiles.length - 1
      colour.set(first ? TILE_START : last ? TILE_END : tile.marked ? TILE_MARK : TILE)
      mesh.setColorAt(i, colour)
    }

    mesh.count = tiles.length
    mesh.layers.enable(BOARD_LAYER)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [tiles])

  useEffect(() => {
    const mesh = dotsMesh.current
    if (!mesh) return

    const dummy = new Object3D()
    const normal = new Vector3()
    const up = new Vector3(0, 1, 0)

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i]
      groundNormalAt(dot.x, dot.z, normal)
      dummy.position.set(
        dot.x + normal.x * BOARD.dotLift,
        dot.y + normal.y * BOARD.dotLift,
        dot.z + normal.z * BOARD.dotLift,
      )
      dummy.quaternion.setFromUnitVectors(up, normal)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.count = dots.length
    mesh.layers.enable(BOARD_LAYER)
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [dots])

  useEffect(() => {
    return () => {
      dotGeometry.dispose()
      dotMaterial.dispose()
      land.dispose()
      tileGeometry.dispose()
      sand.dispose()
      tileMaterial.dispose()
      rock.dispose()
      gold.dispose()
    }
  }, [dotGeometry, dotMaterial, land, tileGeometry, sand, tileMaterial, rock, gold])

  return (
    <group position={[ISLAND.centreX, 0, ISLAND.centreZ]}>
      <mesh geometry={land} material={sand} receiveShadow castShadow />

      <instancedMesh
        ref={tilesMesh}
        args={[tileGeometry, tileMaterial, BOARD.tiles]}
        receiveShadow
      />

      <instancedMesh
        ref={dotsMesh}
        args={[dotGeometry, dotMaterial, dots.length]}
      />

      {/* The crater rim: a low wall of rock round the flat top.

          It used to be a bare cap over the upper cone, which cannot stay now
          that the road runs up that cone - a rock shell at exactly the ground's
          height would z-fight the island and bury the last third of the track.
          A rim sits above everything instead, and reads more like a crater. */}
      <mesh material={rock} position={[0, ISLAND.summit + 2.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ISLAND.crater, ISLAND.crater * 1.04, 4.4, 48, 1, true]} />
      </mesh>

      {/* The treasure, in the middle of the crater floor. */}
      <group position={[0, ISLAND.summit + 0.05, 0]}>
        <mesh material={gold} castShadow>
          <boxGeometry args={[3, 1.8, 2]} />
        </mesh>
        <mesh material={gold} position={[0, 1.24, 0]} castShadow>
          <cylinderGeometry args={[1, 1, 3, 16, 1, false, 0, Math.PI]} />
        </mesh>
      </group>
    </group>
  )
}
