/**
 * The island on screen.
 *
 * One mesh per chunk, so three culls them individually, each rebuilt only when
 * its level of detail actually changes. The material is shared across every
 * chunk - one program, one upload.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, type MeshStandardMaterial } from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { buildChunkGeometry, chunkCentre, lodForDistance } from './chunk'
import { TERRAIN } from './island'
import { createSandMaterial } from './sand-material'

function geometryFor(cx: number, cz: number, lod: number): BufferGeometry {
  const data = buildChunkGeometry(cx, cz, lod)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(data.positions, 3))
  g.setAttribute('normal', new BufferAttribute(data.normals, 3))
  g.setAttribute('uv', new BufferAttribute(data.uvs, 2))
  g.setIndex(new BufferAttribute(data.indices, 1))
  g.computeBoundingSphere()
  return g
}

interface ChunkState {
  cx: number
  cz: number
  lod: number
}

export function Terrain({ wireframe = false }: { wireframe?: boolean }) {
  const camera = useThree((s) => s.camera)
  const material = useMemo(() => createSandMaterial(), [])

  const total = TERRAIN.chunksPerSide * TERRAIN.chunksPerSide
  const [chunks, setChunks] = useState<ChunkState[]>(() => {
    const out: ChunkState[] = []
    for (let cz = 0; cz < TERRAIN.chunksPerSide; cz++) {
      for (let cx = 0; cx < TERRAIN.chunksPerSide; cx++) out.push({ cx, cz, lod: 0 })
    }
    return out
  })

  // Geometry is cached per chunk and level, so moving back and forth across a
  // level boundary does not rebuild the same mesh over and over.
  const cache = useRef(new Map<string, BufferGeometry>())
  const geometries = chunks.map(({ cx, cz, lod }) => {
    const key = `${cx}:${cz}:${lod}`
    let g = cache.current.get(key)
    if (!g) {
      g = geometryFor(cx, cz, lod)
      cache.current.set(key, g)
    }
    return { key, cx, cz, g }
  })

  useEffect(() => {
    const held = cache.current
    return () => {
      for (const g of held.values()) g.dispose()
      held.clear()
      material.dispose()
    }
  }, [material])

  useEffect(() => {
    ;(material as MeshStandardMaterial).wireframe = wireframe
  }, [material, wireframe])

  // Re-pick levels of detail as the camera moves, and only touch state when
  // something actually changed.
  useGameFrame(() => {
    let dirty = false
    const next = chunks.map((c) => {
      const { x, z } = chunkCentre(c.cx, c.cz)
      const dx = camera.position.x - x
      const dz = camera.position.z - z
      const lod = lodForDistance(Math.sqrt(dx * dx + dz * dz))
      if (lod !== c.lod) dirty = true
      return lod === c.lod ? c : { ...c, lod }
    })
    if (dirty) setChunks(next)
  }, PRIORITY.world)

  return (
    <group name={`terrain-${total}-chunks`}>
      {geometries.map(({ key, g }) => (
        <mesh key={key} geometry={g} material={material} receiveShadow castShadow={false} />
      ))}
    </group>
  )
}
