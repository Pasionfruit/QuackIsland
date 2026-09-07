/**
 * Shells and pebbles along the water's edge.
 *
 * One instanced mesh per kind, so the whole beach is three draw calls however
 * many things are on it, and the colours ride along as a per-instance
 * attribute rather than as a material each.
 *
 * The shapes are geometry, not models. A pebble is a squashed icosahedron, a
 * clam is a flattened half-sphere, a cone shell is a cone with few sides —
 * all of which read correctly at the size these are actually seen at, and none
 * of which needs an asset, an atlas, or a trip through the loader.
 *
 * Nothing here moves. The scatter runs once, the matrices are written once,
 * and after that it costs three draw calls and no frame time at all.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  ConeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type BufferGeometry,
} from 'three'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { heightAt, slopeAt, worldBounds } from '../../01-terrain'
import { PALETTES, SHORE, scatterKind, type Placement, type ShoreKind } from './scatter'

/** How big each kind is at scale 1, in metres. */
const SIZE: Record<ShoreKind, number> = {
  pebble: 0.17,
  clam: 0.15,
  cone: 0.11,
}

function buildGeometry(kind: ShoreKind): BufferGeometry {
  if (kind === 'pebble') {
    // Detail 0 is twenty faces: an angular pebble, and flat-shaded it reads as
    // chipped stone rather than as a low-polygon ball.
    const g = new IcosahedronGeometry(1, 0)
    g.scale(1, 0.62, 0.85)
    return g
  }
  if (kind === 'clam') {
    // Half a squashed sphere, domed side up.
    const g = new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)
    g.scale(1, 0.42, 0.86)
    return g
  }
  // A cone shell, lying on its side rather than standing on its point.
  const g = new ConeGeometry(1, 3.1, 7, 1)
  g.rotateX(Math.PI / 2)
  g.scale(1, 1, 1)
  return g
}

function buildMaterial(kind: ShoreKind): MeshStandardMaterial {
  return new MeshStandardMaterial({
    // Overwritten per instance; this is only what an un-tinted one would be.
    color: '#ffffff',
    roughness: kind === 'pebble' ? 0.92 : 0.55,
    metalness: 0,
    // Pebbles are faceted on purpose; shells are meant to be smooth.
    flatShading: kind === 'pebble',
  })
}

function Scattered({ kind, count }: { kind: ShoreKind; count: number }) {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => buildGeometry(kind), [kind])
  const material = useMemo(() => buildMaterial(kind), [kind])

  const placements = useMemo<Placement[]>(() => {
    const bounds = worldBounds()
    // One stream per kind, so adding pebbles cannot move the shells.
    const random = createRng(hashSeed(CONVENTIONS.worldSeed, `shore:${kind}`))
    return scatterKind(kind, count, { heightAt, slopeAt }, {
      reach: Math.min(bounds.maxX, bounds.maxZ),
      random,
    })
  }, [kind, count])

  useEffect(() => {
    const m = mesh.current
    if (!m) return

    const dummy = new Object3D()
    const colour = new Color()
    const palette = PALETTES[kind]
    const size = SIZE[kind]

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]
      const scale = size * p.scale
      dummy.position.set(p.x, p.y - scale * p.sink, p.z)
      dummy.rotation.set(0, p.turn, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colour.set(palette[p.tint]))
    }
    // Anything past the count that actually got placed is left at a zero
    // matrix, which draws nothing.
    m.count = placements.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()

    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [placements, kind, geometry, material])

  return (
    <instancedMesh ref={mesh} args={[geometry, material, Math.max(1, count)]} castShadow receiveShadow />
  )
}

export function Shore() {
  return (
    <>
      <Scattered kind="pebble" count={SHORE.pebbles} />
      <Scattered kind="clam" count={SHORE.clams} />
      <Scattered kind="cone" count={SHORE.cones} />
    </>
  )
}
