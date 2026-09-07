/**
 * The sea.
 *
 * One plane at sea level, one draw call, with the swell displaced on the GPU
 * and its normals worked out per fragment rather than per vertex - the vertex
 * grid is far too coarse to carry a calm sea, but lighting at full resolution
 * carries it easily. That is most of why it reads as water at all.
 *
 * Depth is baked into the mesh once, from the terrain's own height function,
 * so the shallows can go pale and the shoreline can fade out instead of ending
 * in a hard line. It is baked rather than sampled per frame because the sea
 * floor never moves.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three'
import { PRIORITY, getDayTime, tideAt, useGameFrame } from '../../00-core'
import { SEA_LEVEL, heightAt } from '../../01-terrain'
import { swellGlsl } from './swell'

/** What onBeforeCompile actually hands over. three no longer exports a type for it. */
interface CompiledShader {
  vertexShader: string
  fragmentShader: string
  uniforms: Record<string, { value: unknown }>
}

/** Half the width of the sea, in metres. Fog swallows the edge long before it. */
export const WATER_HALF = 900
/**
 * Grid resolution.
 *
 * The normals are worked out per fragment, so this only has to carry the
 * *shape* of the swell - but it does have to carry it. A quad here is 5 m, and
 * the shortest wave in the table is 43 m, so the shortest swell gets about
 * eight vertices per wavelength. Below that the crests start to alias into
 * moving facets, so there is a test tying this to `SWELL`.
 */
export const WATER_SEGMENTS = 360
/** Past this depth the water is as dark as it gets. */
export const DEEP_AT = 9

const SHALLOW = new Color('#7fc2c0')
const DEEP = new Color('#1f4f63')

/**
 * A plane lying flat at sea level, carrying how deep the water is at each
 * vertex.
 */
function buildWater(): PlaneGeometry {
  const g = new PlaneGeometry(WATER_HALF * 2, WATER_HALF * 2, WATER_SEGMENTS, WATER_SEGMENTS)
  g.rotateX(-Math.PI / 2)

  const pos = g.getAttribute('position')
  const depth = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    // How far the sea bed sits below the *datum*, which is what does not move.
    // Deliberately not clamped at zero: the tide has to be able to put ground
    // that stands above the mean line under water, and a clamped value has
    // already thrown away how far above it was.
    depth[i] = SEA_LEVEL - heightAt(pos.getX(i), pos.getZ(i))
  }
  g.setAttribute('aDepth', new BufferAttribute(depth, 1))
  return g
}

function createWaterMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#4d8fa0',
    roughness: 0.16,
    metalness: 0.06,
    transparent: true,
    // Water writing depth would hide anything under it, including the sea bed
    // it is supposed to be showing through.
    depthWrite: false,
    side: DoubleSide,
  })

  material.onBeforeCompile = (shader: CompiledShader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uTide = { value: 0 }
    shader.uniforms.uShallow = { value: SHALLOW }
    shader.uniforms.uDeep = { value: DEEP }
    shader.uniforms.uDeepAt = { value: DEEP_AT }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uTide;
        attribute float aDepth;
        varying float vDepth;
        varying vec2 vSurface;
        ${swellGlsl()}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Depth under the water as it stands now, which is the bed's depth
        // below the datum plus however far the tide has raised the datum.
        vDepth = max(0.0, aDepth + uTide);
        // The rest position, which is what parameterises the wave. The vertex
        // itself is about to be moved sideways as well as up.
        vSurface = position.xz;
        // Flatten the swell out as the water shallows, so it does not heave
        // through the beach at the water's edge. Deeper than the old sea:
        // these waves are most of a metre tall.
        float shore = smoothstep(0.0, 6.0, vDepth);
        transformed += swellDisplace(position.xz, uTime) * shore;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uDeepAt;
        varying float vDepth;
        varying vec2 vSurface;
        ${swellGlsl()}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        // Per-fragment, so a calm sea still glints. The vertex grid is far too
        // coarse to carry this.
        normal = normalize((viewMatrix * vec4(swellNormal(vSurface, uTime), 0.0)).xyz);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float deep = smoothstep(0.0, uDeepAt, vDepth);
        diffuseColor.rgb = mix(uShallow, uDeep, deep);
        // Fade out where it meets the sand, so the shoreline is a wet edge
        // rather than a cut line.
        diffuseColor.a *= smoothstep(0.0, 0.85, vDepth) * 0.82;`,
      )

    material.userData.shader = shader
  }

  material.customProgramCacheKey = () => 'localrot-water-v2'
  return material
}

export function Water() {
  const mesh = useRef<Mesh>(null)
  const geometry = useMemo(() => buildWater(), [])
  const material = useMemo(() => createWaterMaterial(), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useGameFrame((state) => {
    const tide = tideAt(getDayTime())
    const shader = material.userData.shader as CompiledShader | undefined
    if (shader) {
      shader.uniforms.uTime.value = state.clock.elapsedTime
      // The shader needs the tide too, to know where the shallows are now.
      shader.uniforms.uTide.value = tide
    }
    // The whole sheet rides up and down with the tide. The swell is displaced
    // about wherever it has got to.
    if (mesh.current) mesh.current.position.y = SEA_LEVEL + tide
  }, PRIORITY.world)

  // Starts at the datum; the frame above moves it to wherever the tide is.
  return <mesh ref={mesh} geometry={geometry} material={material} position={[0, SEA_LEVEL, 0]} renderOrder={1} />
}
