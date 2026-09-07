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
  CircleGeometry,
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
 * A print is a darker oval sunk into the sand.
 *
 * Deliberately plain: a solid dark middle with the edge feathered off, and
 * nothing else. An earlier version added a bright lip around the rim to
 * suggest pushed-up sand, but a bright edge is what makes a thing read as
 * raised - it turned every print into an iris. Shadow alone is what says
 * "pressed in".
 *
 * Alpha comes in per instance, because the alternative is a material per print
 * and a draw call each.
 */
export function createPrintMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#4a3d2c',
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    // Sitting flush with the terrain, these would z-fight without a nudge.
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8,
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
        // The disc is laid flat at construction, so it spans XZ and this is
        // the offset from the middle of the print, before any scaling.
        vLocal = position.xz;`,
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
        // A solid oval with the edge feathered off - no ring, no gradient
        // through the middle, nothing that could read as an iris.
        float shape = 1.0 - smoothstep(0.62, 1.0, r);
        gl_FragColor.a *= vFade * shape * 0.72;
        if (gl_FragColor.a < 0.01) discard;`,
      )
  }
  material.customProgramCacheKey = () => 'localrot-footprint-v3'
  return material
}

export function Footprints() {
  const mesh = useRef<InstancedMesh>(null)
  const trail = useMemo(() => createTrail(), [])
  const material = useMemo(() => createPrintMaterial(), [])

  // CircleGeometry is built standing up in the XY plane, so its normal is +Z.
  // Everything here reasons in terms of +Y being up - aligning the disc's "up"
  // to the ground normal left every print standing on its edge. Laying it flat
  // once at construction is cheaper and clearer than compensating per print.
  const disc = useMemo(() => {
    const g = new CircleGeometry(1, 14)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

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
      disc.dispose()
    }
  }, [fades, material, disc])

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
      // Sunk into the surface, not resting on it. The polygon offset is what
      // keeps it winning the depth test rather than any lift.
      dummy.position.set(print.x, print.y - 0.01, print.z)
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
      args={[disc, material, TRAIL.capacity]}
      frustumCulled={false}
      receiveShadow
    />
  )
}
