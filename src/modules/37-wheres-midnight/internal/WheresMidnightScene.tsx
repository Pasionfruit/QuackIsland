/**
 * The junkyard at night, drawn.
 *
 * Everything in here comes from `yard.ts`, which every browser lays out the
 * same way from the same seed - so what you are looking at is what everybody
 * else is looking at, from the same spot, and a find is a find.
 *
 * **The junk is instanced, five draw calls for the lot.** A hundred and fifty
 * pieces of junk and a few hundred bits of litter is several hundred parts,
 * and several hundred meshes would cost
 * more to submit than to draw. Every part is a box, a cylinder, a tyre or a
 * blob, so each of those is one `InstancedMesh` with a colour per instance,
 * built once per seed and never touched again. The handful of glowing parts -
 * reflectors, a dead television's standby light - are a second, unlit instance
 * of whichever shape they are.
 *
 * **It is dark on purpose.** No lamps: a low moon and very little else. An
 * all-black cat is only hard to find because the yard is dark enough to hide
 * him. Zoomed in, a flashlight follows the middle of the view - the one real
 * light there is. His eyes glow faintly, and so do a dozen and a half pairs
 * that are not his, looking out from the junk.
 *
 * **The camera never moves.** It sits at `EYE` and only ever turns and zooms -
 * that is the whole of the brief's "holding a camera". It is driven from a ref
 * the screen mutates, so a drag is felt on the next frame rather than the next
 * React render.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  type SpotLight,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial as BasicMaterial,
  type PerspectiveCamera,
} from 'three'
import type { Game } from './rules'
import { EYE, direction, type View } from './view'
import { COATS, EYE_OFFSET, YARD, catFeet, catParts, eyeAt, type Part, type Shape, type Yard, yardFor } from './yard'

export const PALETTE = {
  night: '#0b1018',
  ground: '#26221d',
  fence: '#1b1f24',
  rail: '#2a3038',
  torch: '#fff1d6',
  moon: '#dbe6ff',
  cat: '#08080a',
  catSheen: '#15151a',
  eye: '#c8e070',
  found: '#6fe3a0',
} as const

/** The shapes every piece of junk and every cat is made of, at unit size. */
function geometryFor(shape: Shape): BufferGeometry {
  switch (shape) {
    case 'box':
      return new BoxGeometry(1, 1, 1)
    case 'cylinder':
      return new CylinderGeometry(0.5, 0.5, 1, 12)
    case 'tyre':
      // Faces +Z, outer radius a shade under a half - the same as its box.
      return new TorusGeometry(0.3, 0.12, 6, 14)
    case 'blob':
      return new IcosahedronGeometry(0.5, 0)
    case 'sphere':
      return new SphereGeometry(0.5, 14, 10)
    case 'cone':
      // Standing on its base, like an ear on a head.
      return new ConeGeometry(0.5, 1, 5)
  }
}

const SHAPES: readonly Shape[] = ['box', 'cylinder', 'tyre', 'blob', 'sphere', 'cone']

/** Every part of every piece, as one instanced mesh per shape and per lit-or-not. */
function instanceJunk(yard: Yard): InstancedMesh[] {
  return instanceParts([...yard.pieces.flatMap((piece) => piece.parts), ...yard.litter])
}

/** A list of parts as one instanced mesh per shape and per lit-or-not. */
function instanceParts(parts: readonly Part[]): InstancedMesh[] {
  const out: InstancedMesh[] = []
  const matrix = new Matrix4()
  const position = new Vector3()
  const scale = new Vector3()
  const euler = new Euler()
  const quaternion = new Quaternion()
  const colour = new Color()

  for (const shape of SHAPES) {
    for (const glow of [false, true]) {
      const mine = parts.filter((p) => p.shape === shape && !!p.glow === glow)
      if (mine.length === 0) continue
      const material: Material = glow
        ? new MeshBasicMaterial({ toneMapped: false })
        : new MeshStandardMaterial({ roughness: 0.92, metalness: 0.06 })
      const mesh = new InstancedMesh(geometryFor(shape), material, mine.length)
      mine.forEach((part, i) => {
        position.set(part.p.x, part.p.y, part.p.z)
        scale.set(part.s.x, part.s.y, part.s.z)
        // The same order three.js uses for a part's own rotation: Y, then X, then Z.
        euler.set(part.r.x, part.r.y, part.r.z, 'YXZ')
        quaternion.setFromEuler(euler)
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
        mesh.setColorAt(i, colour.set(part.colour))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      // One view, everything in it: culling each instanced batch buys nothing.
      mesh.frustumCulled = false
      out.push(mesh)
    }
  }
  return out
}

/** The junk, built once for a seed and thrown away when the seed changes. */
const Junk = memo(function Junk({ seed }: { seed: number }) {
  const meshes = useMemo(() => instanceJunk(yardFor(seed)), [seed])
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose()
        ;(mesh.material as Material).dispose()
        mesh.dispose()
      }
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  )
})

/** The camera: still at the eye, turned and zoomed by the screen's view. */
function Eye({ view }: { view: RefObject<View> }) {
  useFrame(({ camera }) => {
    const v = view.current
    if (!v) return
    const perspective = camera as PerspectiveCamera
    camera.position.set(EYE.x, EYE.y, EYE.z)
    camera.rotation.set(v.pitch, v.yaw, 0, 'YXZ')
    if (perspective.fov !== v.fov) {
      perspective.fov = v.fov
      perspective.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
  })
  return null
}

/** The ground, the fence round the back, and a moon to put a rim on things. */
const Setting = memo(function Setting() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[YARD.fence + 6, 48]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[YARD.fence, YARD.fence, 2.8, 48, 1, true]} />
        <meshStandardMaterial color={PALETTE.fence} roughness={1} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 2.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[YARD.fence, 0.06, 5, 48]} />
        <meshStandardMaterial color={PALETTE.rail} roughness={1} />
      </mesh>
      {/* The moon: low over the back fence, and the only thing up there. */}
      <mesh position={[-16, 17, -54]}>
        <sphereGeometry args={[1.8, 20, 14]} />
        <meshBasicMaterial color={PALETTE.moon} toneMapped={false} />
      </mesh>
      {/* A halo, so it reads as a moon rather than as a hole in the sky. */}
      <mesh position={[-16, 17, -54.2]}>
        <sphereGeometry args={[3.2, 16, 12]} />
        <meshBasicMaterial color={PALETTE.moon} transparent opacity={0.11} toneMapped={false} />
      </mesh>
      {/* Enough moon to put an edge on things, and no more: the far end of the
          yard has to stay somewhere a black cat could be. */}
      <directionalLight position={[-16, 17, -54]} intensity={0.6} color="#9fb4e8" />
      <ambientLight intensity={0.17} color="#7f8fb0" />
      <hemisphereLight intensity={0.22} color="#33405c" groundColor="#100d0a" />
    </group>
  )
})

/**
 * The flashlight: a cone from the eye down the middle of the view, a little
 * narrower than the screen, so what you are looking at is lit and the rest of
 * the yard stays dark. Always in the scene and turned down to nothing when off,
 * so switching it does not make three.js rebuild every material's shader.
 */
function Torch({ view, torch }: { view: RefObject<View>; torch: RefObject<boolean> }) {
  const light = useRef<SpotLight>(null)
  useFrame(() => {
    const l = light.current
    const v = view.current
    if (!l || !v) return
    const d = direction(v.yaw, v.pitch)
    l.position.set(EYE.x, EYE.y, EYE.z)
    l.target.position.set(EYE.x + d.x * 10, EYE.y + d.y * 10, EYE.z + d.z * 10)
    l.target.updateMatrixWorld()
    l.angle = ((v.fov / 2) * Math.PI) / 180 * 0.8
    l.intensity = torch.current ? 3.2 : 0
  })
  return <spotLight ref={light} color={PALETTE.torch} intensity={0} distance={0} decay={0} penumbra={0.55} />
}

/** One eye, the same sphere and the same glow for his and for every decoy's. */
const EYE_GEOMETRY = new SphereGeometry(0.013, 8, 6)
function eyeMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: PALETTE.eye, emissive: PALETTE.eye, emissiveIntensity: 0.55, toneMapped: false })
}

/**
 * The other cats: the same body he has, in a colour that is not black, with the
 * same eyes glowing out of it.
 *
 * Instanced like the junk rather than drawn as eighteen little models - a cat
 * is a dozen parts, and eighteen of them a frame is the difference between a
 * scene that costs what the junk costs and one that costs three times it.
 */
const Decoys = memo(function Decoys({ seed }: { seed: number }) {
  const meshes = useMemo(() => {
    const decoys = yardFor(seed).decoys
    const bodies = instanceParts(
      decoys.flatMap((decoy) => {
        const feet = catFeet(decoy)
        return catParts(decoy.pose, feet.x, feet.y, feet.z, decoy.heading, COATS[decoy.coat % COATS.length])
      }),
    )
    const eyes = new InstancedMesh(EYE_GEOMETRY, eyeMaterial(), Math.max(1, decoys.length * 2))
    eyes.count = decoys.length * 2
    const dummy = new Object3D()
    decoys.forEach((decoy, i) => {
      for (const [k, side] of [-1, 1].entries()) {
        const at = eyeAt(decoy, decoy.heading, side)
        dummy.position.set(at.x, at.y, at.z)
        dummy.updateMatrix()
        eyes.setMatrixAt(i * 2 + k, dummy.matrix)
      }
    })
    eyes.instanceMatrix.needsUpdate = true
    eyes.frustumCulled = false
    return [...bodies, eyes]
  }, [seed])
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        ;(mesh.material as Material).dispose()
        mesh.dispose()
      }
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  )
})

/**
 * Midnight.
 *
 * His three spheres are the ones a click is tested against, so he is drawn
 * from exactly those and nothing is added that a click would miss: the ears,
 * the tail and the paws hang off the same local frame, well inside his padding.
 * His eyes are the one part of him that is not black, and they are two
 * centimetres across - at the widest zoom they are a pixel, which is the point.
 */
function Cat({ seed }: { seed: number }) {
  const cat = yardFor(seed).midnight
  const eyes = useMemo(eyeMaterial, [])
  useEffect(() => () => eyes.dispose(), [eyes])
  const sit = cat.pose === 'sit'
  const head: [number, number, number] = sit ? [0, 0.46, 0.1] : [0, 0.24, 0.27]
  const mid: [number, number, number] = sit ? [0, 0.3, 0.06] : [0, 0.14, 0.12]
  const body: [number, number, number] = sit ? [0, 0.17, -0.04] : [0, 0.14, -0.05]
  const tail: [number, number, number][] = sit
    ? [
        [0.02, 0.06, -0.17],
        [0.09, 0.05, -0.22],
        [0.16, 0.08, -0.19],
        [0.19, 0.14, -0.12],
      ]
    : [
        [0.04, 0.09, -0.19],
        [0.13, 0.07, -0.21],
        [0.21, 0.06, -0.15],
        [0.26, 0.06, -0.05],
      ]
  const paws: [number, number, number][] = sit
    ? [
        [0.08, 0.03, 0.13],
        [-0.08, 0.03, 0.13],
      ]
    : [
        [0.1, 0.05, 0.13],
        [-0.1, 0.05, 0.13],
      ]
  return (
    <group position={[cat.x, cat.y, cat.z]} rotation={[0, cat.heading, 0]}>
      <mesh position={body}>
        <sphereGeometry args={[0.16, 14, 10]} />
        <meshStandardMaterial color={PALETTE.cat} roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={mid} scale={sit ? [1, 1, 1] : [1, 0.9, 1.2]}>
        <sphereGeometry args={[sit ? 0.12 : 0.14, 14, 10]} />
        <meshStandardMaterial color={PALETTE.catSheen} roughness={0.72} metalness={0.02} />
      </mesh>
      <group position={head}>
        <mesh>
          <sphereGeometry args={[0.095, 14, 10]} />
          <meshStandardMaterial color={PALETTE.catSheen} roughness={0.66} metalness={0.02} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.055, 0.085, 0]} rotation={[0, 0, side * -0.25]}>
            <coneGeometry args={[0.035, 0.08, 5]} />
            <meshStandardMaterial color={PALETTE.cat} roughness={0.8} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * EYE_OFFSET.x, EYE_OFFSET.y, EYE_OFFSET.z]} geometry={EYE_GEOMETRY} material={eyes} />
        ))}
      </group>
      {tail.map((at, i) => (
        <mesh key={i} position={at}>
          <sphereGeometry args={[0.035 - i * 0.004, 8, 6]} />
          <meshStandardMaterial color={PALETTE.cat} roughness={0.8} />
        </mesh>
      ))}
      {paws.map((at, i) => (
        <mesh key={i} position={at}>
          <sphereGeometry args={[0.042, 8, 6]} />
          <meshStandardMaterial color={PALETTE.cat} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * A ring that lights up over him once you have found him - and once the round
 * is over, for everybody, so whoever never found him gets to see where he was.
 */
function FoundMark({ seed, live }: { seed: number; live: RefObject<Game> }) {
  const rig = useRef<Group>(null)
  const cat = yardFor(seed).midnight
  useFrame(() => {
    const g = rig.current
    const game = live.current
    if (!g || !game) return
    const mine = game.players.find((p) => p.mine)
    const show = game.over || (mine?.foundAt ?? null) !== null
    g.visible = show
    if (!show) return
    const bob = Math.sin(game.elapsed * 3) * 0.05
    g.position.set(cat.x, cat.y + 0.7 + bob, cat.z)
    g.rotation.y = game.elapsed * 1.4
    const material = (g.children[0] as Mesh | undefined)?.material as BasicMaterial | undefined
    if (material) material.opacity = 0.55 + Math.sin(game.elapsed * 4) * 0.25
  })
  return (
    <group ref={rig} visible={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.035, 6, 20]} />
        <meshBasicMaterial color={PALETTE.found} transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function WheresMidnightScene({ live, view, torch }: { live: RefObject<Game>; view: RefObject<View>; torch: RefObject<boolean> }) {
  // Redrawn every frame from inside the canvas, the same as the other games:
  // the round lives in a ref, and this is how a new seed - a guest hearing the
  // host for the first time, or "again" - reaches the yard that gets built.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const seed = live.current.seed
  const background = useMemo(() => new Color(PALETTE.night), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.night, 26, 78]} />
      <Eye view={view} />
      <Setting />
      <Torch view={view} torch={torch} />
      <Junk key={`junk:${seed}`} seed={seed} />
      <Decoys key={`decoys:${seed}`} seed={seed} />
      <Cat key={`cat:${seed}`} seed={seed} />
      <FoundMark key={`found:${seed}`} seed={seed} live={live} />
    </>
  )
}
