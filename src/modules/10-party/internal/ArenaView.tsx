/**
 * The board: an island in the sky, drawn only while a party is running.
 *
 * Deliberately plain geometry. This is a place to stand while the board game
 * is built, and every minute spent making it pretty now is a minute spent on
 * something that is about to be replaced by an actual board.
 */
import { useEffect, useMemo } from 'react'
import { CylinderGeometry, MeshStandardMaterial, TorusGeometry } from 'three'
import { PARTY } from './party'
import { useParty } from './state'

export function Arena() {
  const { phase } = useParty()

  const slab = useMemo(
    () => new CylinderGeometry(PARTY.radius, PARTY.radius * 0.86, PARTY.depth, 48),
    [],
  )
  // A lip round the rim, so the edge reads as an edge from on top rather than
  // as the horizon. It is the only thing between you and a long fall.
  const rim = useMemo(() => new TorusGeometry(PARTY.radius - 0.35, 0.35, 8, 56), [])

  const top = useMemo(
    () => new MeshStandardMaterial({ color: '#d8c9a4', roughness: 0.92, metalness: 0 }),
    [],
  )
  const edge = useMemo(
    () => new MeshStandardMaterial({ color: '#9c8a68', roughness: 0.85, metalness: 0 }),
    [],
  )

  useEffect(() => {
    return () => {
      slab.dispose()
      rim.dispose()
      top.dispose()
      edge.dispose()
    }
  }, [slab, rim, top, edge])

  // Nothing at all when there is no game. The arena is not a place that
  // exists and is empty; it is a place that appears.
  if (phase !== 'playing') return null

  return (
    <group position={[0, PARTY.height, 0]}>
      {/* The slab's origin is its middle, and the walkable surface is its top. */}
      <mesh geometry={slab} material={top} position={[0, -PARTY.depth / 2, 0]} receiveShadow castShadow />
      <mesh geometry={rim} material={edge} rotation={[Math.PI / 2, 0, 0]} castShadow />
    </group>
  )
}
