/**
 * The rocks, as three instanced meshes.
 *
 * One per size class, so the whole island costs three draw calls whatever is
 * on it, with colour, tumble and a non-uniform stretch per instance.
 *
 * The geometry is an icosahedron with its vertices pushed about by the seeded
 * generator. A plain icosahedron reads as a low-polygon ball however you scale
 * it; the same shape with its points knocked off centre reads as stone, and
 * costs one pass over a few dozen vertices at startup.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
} from 'three'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { halfExtents } from './collide'
import { getRocks } from './field'
import { ROCKS, ROCK_COLOURS, type Rock, type RockClass } from './rocks'

/** An icosahedron with its vertices knocked about, so it reads as stone. */
function buildRock(rockClass: RockClass): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, rockClass.detail)
  const position = geometry.getAttribute('position')
  const random = createRng(hashSeed(CONVENTIONS.worldSeed, `rock:${rockClass.size}`))

  // Vertices are shared between faces by position but not by index here, so
  // the same point has to be pushed the same way from every face it belongs
  // to - otherwise the surface tears open along the seams.
  const moved = new Map<string, number>()
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
    let push = moved.get(key)
    if (push === undefined) {
      push = 1 - rockClass.jag * random()
      moved.set(key, push)
    }
    position.setXYZ(i, x * push, y * push, z * push)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function Scattered({ rocks, rockClass }: { rocks: Rock[]; rockClass: RockClass }) {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => buildRock(rockClass), [rockClass])
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.95,
        metalness: 0,
        // Faceted on purpose: stone has edges, and smoothing them makes a
        // boulder look inflated.
        flatShading: true,
      }),
    [],
  )

  useEffect(() => {
    const m = mesh.current
    if (!m) return

    const dummy = new Object3D()
    const colour = new Color()

    for (let i = 0; i < rocks.length; i++) {
      const rock = rocks[i]
      // `y` is where the bottom rests and the geometry is centred, so the
      // middle sits half a rock above it - where "half a rock" is the height
      // of the *tumbled* ellipsoid, not its `scaleY`. Using `scaleY` is only
      // right for a rock that has not been turned, and every other one was
      // floating or buried by the difference.
      dummy.position.set(rock.x, rock.y + halfExtents(rock).y, rock.z)
      dummy.rotation.set(rock.turnX, rock.turnY, rock.turnZ)
      dummy.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colour.set(ROCK_COLOURS[rock.tint]))
    }

    m.count = rocks.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()

    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [rocks, geometry, material])

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(1, rocks.length)]}
      castShadow
      receiveShadow
    />
  )
}

export function Rocks() {
  // The same list the collision uses. One scatter, one answer about where the
  // rocks are - two would be two islands that looked identical and were not.
  const all = useMemo(() => getRocks(), [])

  return (
    <>
      {ROCKS.classes.map((rockClass) => (
        <Scattered
          key={rockClass.size}
          rockClass={rockClass}
          rocks={all.filter((r) => r.size === rockClass.size)}
        />
      ))}
    </>
  )
}
