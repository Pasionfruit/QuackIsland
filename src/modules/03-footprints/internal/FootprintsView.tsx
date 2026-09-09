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
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { PRIORITY, getDayTime, tideAt, useGameFrame } from '../../00-core'
import { SEA_LEVEL, heightAt, sampleAt } from '../../01-terrain'
import { getPlayerState } from '../../02-player'
import { duckFootGlsl } from './foot'
import { SELF, TRAIL, createTrail, fadeOf, forgetWalker, stepTrails, type Walker } from './trail'

/**
 * Anybody else who leaves prints.
 *
 * A registry rather than this module reaching for the network: footprints know
 * about walkers, and a walker is `{ x, z, facing, grounded, speed }` whether it
 * is being driven by a keyboard or arriving over a socket. `09-net` registers
 * each peer as they join and drops them when they go.
 *
 * Everyone shares one ring of prints, so however many people are on the beach
 * it stays a single draw call. A print in the sand does not care who made it.
 */
const sources = new Map<string, () => Walker | null>()

export function addWalker(id: string, source: () => Walker | null): void {
  sources.set(id, source)
}

export function removeWalker(id: string): void {
  sources.delete(id)
}

const UP = new Vector3(0, 1, 0)

/**
 * A print is a webbed duck foot pressed into the sand.
 *
 * The shape is a distance field evaluated in the fragment shader rather than a
 * texture: three toes running out from a heel, joined by a smooth-minimum that
 * fills the wedge between them. That fill is the webbing, and it comes out
 * scalloped - concave between the toe tips - which is exactly what a duck's
 * web looks like from above. No texture means no asset, no atlas, and no
 * filtering to go soft when you stand right over it.
 *
 * The middle toe is longer than the outer two and the two outer toes differ
 * slightly, so a foot has a handedness. Left and right are the same shape
 * mirrored, which the instance matrix does with a negative scale.
 *
 * Still deliberately plain shading: a solid dark middle with the edge
 * feathered off, and nothing else. An earlier version added a bright lip
 * around the rim to suggest pushed-up sand, but a bright edge is what makes a
 * thing read as raised - it turned every print into an iris. Shadow alone is
 * what says "pressed in".
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
        // The quad is laid flat at construction, so it spans XZ and this is
        // the offset from the middle of the print, before any scaling. Z is
        // forward, because the instance matrix turns the print by its heading
        // and a heading of zero points down +Z.
        vLocal = position.xz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vFade;
        varying vec2 vLocal;
        ${duckFootGlsl()}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float d = duckFoot(vLocal);
        // Solid inside, feathered off at the edge - no ring, no gradient
        // through the middle, nothing that could read as an iris.
        float shape = 1.0 - smoothstep(-0.06, 0.05, d);
        gl_FragColor.a *= vFade * shape * 0.72;
        if (gl_FragColor.a < 0.01) discard;`,
      )
  }
  material.customProgramCacheKey = () => 'localrot-footprint-v5'
  return material
}

export interface FootprintsProps {
  /**
   * The ground prints land on, if it is not the island.
   *
   * Passed in rather than switched here: which world you are in is a question
   * for whatever is running the game, and this module only needs to know how
   * high the sand is under each foot.
   */
  groundAt?: (x: number, z: number) => number
  /**
   * Whether ground at a point can hold a print at all.
   *
   * Sand takes a footprint; the top of a boulder does not. Passed in rather
   * than worked out here for the usual reason - this module has never heard of
   * a rock - and it is a *veto*, not a height: somewhere unprintable leaves no
   * print, rather than leaving one at some other height.
   *
   * Left out, everything prints, which is what a bare beach should do.
   */
  printableAt?: (x: number, z: number) => boolean
}

export function Footprints({ groundAt = heightAt, printableAt }: FootprintsProps) {
  const mesh = useRef<InstancedMesh>(null)
  const trail = useMemo(() => createTrail(), [])
  const material = useMemo(() => createPrintMaterial(), [])

  // PlaneGeometry is built standing up in the XY plane, so its normal is +Z.
  // Everything here reasons in terms of +Y being up - aligning the quad's "up"
  // to the ground normal left every print standing on its edge. Laying it flat
  // once at construction is cheaper and clearer than compensating per print.
  //
  // A quad rather than a disc because the shape is cut out by the distance
  // field, so all the geometry has to do is cover the unit square the field is
  // drawn in - and two triangles do that exactly, with no corner clipping the
  // toes.
  const disc = useMemo(() => {
    const g = new PlaneGeometry(2, 2)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  // Read through a ref, so moving to another world does not re-run the frame
  // callback mid-stride.
  const ground = useRef(groundAt)
  ground.current = groundAt

  const printable = useRef(printableAt)
  printable.current = printableAt

  const fades = useMemo(() => new Float32Array(TRAIL.capacity), [])
  // Rebuilt in place each frame rather than allocated, since this runs at sixty
  // hertz and holds one entry per person on the island.
  const walking = useMemo<Array<readonly [string, Walker | null]>>(() => [], [])
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

    // Only print on land, and where the waterline is *now* - the tide moves it
    // several metres up and down the beach, and prints under water would wash
    // out rather than sit there. The same rule for everybody.
    // Nor on anything that is not sand. Standing on a boulder, the ground
    // under the walker *is* the top of the boulder, so a print left there would
    // sit on the rock - and it would sit flat, because the tilt comes from the
    // island's normal, which knows nothing about what is piled on top of it.
    const waterline = SEA_LEVEL + tideAt(getDayTime())
    const veto = printable.current
    const onSand = (w: Walker | null): Walker | null => {
      if (!w) return null
      if (ground.current(w.x, w.z) <= waterline) return null
      if (veto && !veto(w.x, w.z)) return null
      return w
    }

    const player = getPlayerState()
    walking.length = 0
    walking.push([
      SELF,
      onSand(
        player
          ? {
              x: player.x,
              z: player.z,
              facing: player.facing,
              grounded: player.grounded,
              speed: player.speed,
            }
          : null,
      ),
    ])
    for (const [id, source] of sources) walking.push([id, onSand(source())])

    // Anyone who has gone takes their stride bookkeeping with them; the prints
    // they left stay until they fade, which is what should happen.
    for (const id of trail.walkers.keys()) {
      if (id !== SELF && !sources.has(id)) forgetWalker(trail, id)
    }

    stepTrails(trail, walking, delta, ground.current, TRAIL)

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
      // On the island the surface normal tips each print into the slope; on a
      // flat board there is nothing to tip into, and sampling the island under
      // it would lie about which way the ground faces.
      const sample = sampleAt(print.x, print.z)
      normal.set(sample.normalX, sample.normalY, sample.normalZ)
      quat.setFromUnitVectors(UP, normal)
      // Sunk into the surface, not resting on it. The polygon offset is what
      // keeps it winning the depth test rather than any lift.
      dummy.position.set(print.x, print.y - 0.01, print.z)
      dummy.quaternion.copy(quat)
      dummy.rotateY(print.facing)
      // A duck's foot is nearly as wide as it is long - it is a paddle. The
      // negative X scale on one side is what mirrors the shape into a left
      // foot and a right foot.
      dummy.scale.set(0.24 * print.side, 1, 0.28)
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
