/**
 * Footprints pressed into the sand.
 *
 * One InstancedMesh for the whole trail, so however many prints are on the
 * ground it stays a single draw call. Fading is a per-instance attribute read
 * by the shader rather than a material per print - the alternative is a draw
 * call each and a sorting problem.
 *
 * Each print lies flat against the ground it was left on, using the terrain's
 * own normal, so prints on a dune slope lie along the slope.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { SEA_LEVEL, heightAt, sampleAt } from '../../01-terrain'
import { getPlayerState } from '../../02-player'
import { TRAIL, createTrail, fadeOf, stepTrail } from './trail'

const UP = new Vector3(0, 1, 0)

/**
 * A print reads as a hollow rather than a sticker.
 *
 * The trick is entirely in the shading: dark and soft in the middle where the
 * sand is compressed and in shadow, with a thin bright lip around it where the
 * sand has been pushed up and catches the light. A flat disc with a uniform
 * colour reads as something lying on the surface no matter how thin it is.
 *
 * Alpha comes in per instance, because the alternative is a material per print
 * and a draw call each.
 */
function createPrintMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#6b5a41',
    roughness: 0.98,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    // Sitting flush with the terrain, these would z-fight without a nudge.
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  })

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aFade;
        varying float vFade;
        varying vec2 vLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFade = aFade;
        // The disc is built in its own XY plane, so this is the offset from the
        // middle of the print, before any scaling.
        vLocal = position.xy;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vFade;
        varying vec2 vLocal;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float r = length(vLocal);
        // Hollow: dark through the middle, easing out.
        float hollow = 1.0 - smoothstep(0.0, 0.86, r);
        // Lip: the ridge of sand pushed up around the edge.
        float lip = smoothstep(0.72, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 2.35, lip);
        float shape = max(hollow, lip * 0.85);
        gl_FragColor.a *= vFade * shape * 0.8;
        if (gl_FragColor.a < 0.01) discard;`,
      )
  }
  material.customProgramCacheKey = () => 'localrot-footprint-v2'
  return material
}

export function Footprints() {
  const mesh = useRef<InstancedMesh>(null)
  const trail = useMemo(() => createTrail(), [])
  const material = useMemo(() => createPrintMaterial(), [])

  const fades = useMemo(() => new Float32Array(TRAIL.capacity), [])
  const dummy = useMemo(() => new Object3D(), [])
  const normal = useMemo(() => new Vector3(), [])
  const quat = useMemo(() => new Quaternion(), [])
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    m.geometry.setAttribute('aFade', new InstancedBufferAttribute(fades, 1))
    return () => {
      material.dispose()
    }
  }, [fades, material])

  useGameFrame((_state, delta) => {
    const m = mesh.current
    if (!m) return

    const player = getPlayerState()
    // Only print on land: there is no water yet, but prints on the seabed
    // would still be wrong.
    const walker =
      player && heightAt(player.x, player.z) > SEA_LEVEL
        ? { x: player.x, z: player.z, facing: player.facing, grounded: player.grounded, speed: player.speed }
        : null

    stepTrail(trail, walker, delta, heightAt, TRAIL)

    const attr = m.geometry.getAttribute('aFade') as InstancedBufferAttribute | undefined
    for (let i = 0; i < TRAIL.capacity; i++) {
      const print = trail.prints[i]
      const fade = fadeOf(print, TRAIL)
      fades[i] = fade
      if (fade <= 0) {
        m.setMatrixAt(i, hidden)
        continue
      }
      // Lie along the ground rather than flat, so a print on a slope sits in it.
      const sample = sampleAt(print.x, print.z)
      normal.set(sample.normalX, sample.normalY, sample.normalZ)
      quat.setFromUnitVectors(UP, normal)
      // Flush with the ground. The polygon offset keeps it out of a
      // z-fight; lifting it was what made the prints look stuck on top.
      dummy.position.set(print.x, print.y + 0.004, print.z)
      dummy.quaternion.copy(quat)
      dummy.rotateY(print.facing)
      // A footprint is longer than it is wide, and the two feet mirror.
      dummy.scale.set(0.3 * print.side, 1, 0.46)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }

    m.instanceMatrix.needsUpdate = true
    if (attr) attr.needsUpdate = true
  }, PRIORITY.world)

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, TRAIL.capacity]}
      material={material}
      frustumCulled={false}
      receiveShadow
    >
      <circleGeometry args={[1, 14]} />
    </instancedMesh>
  )
}
