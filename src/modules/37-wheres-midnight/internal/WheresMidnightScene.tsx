/**
 * The junkyard at night, drawn.
 *
 * Everything in here comes from `yard.ts`, which every browser lays out the
 * same way from the same seed - so what you are looking at is what everybody
 * else is looking at, from the same spot, and a find is a find.
 *
 * **The junk is instanced, five draw calls for the lot.** A hundred pieces of
 * junk is a couple of hundred parts, and a couple of hundred meshes would cost
 * more to submit than to draw. Every part is a box, a cylinder, a tyre or a
 * blob, so each of those is one `InstancedMesh` with a colour per instance,
 * built once per seed and never touched again. The handful of glowing parts -
 * reflectors, a dead television's standby light - are a second, unlit instance
 * of whichever shape they are.
 *
 * **It is dark on purpose.** Three sodium lamps, a low moon and very little
 * else: an all-black cat is only hard to find because most of the yard is dark
 * enough to hide her, and lighting it evenly would make the game trivial. Her
 * eyes catch the light, faintly, which is the reward for zooming in.
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
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
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
import { EYE, type View } from './view'
import { YARD, type Part, type Shape, type Yard, yardFor } from './yard'

export const PALETTE = {
  night: '#0b1018',
  ground: '#26221d',
  fence: '#1b1f24',
  rail: '#2a3038',
  lamp: '#ffd9a0',
  lampPost: '#2b2f33',
  moon: '#dbe6ff',
  cat: '#08080a',
  catSheen: '#15151a',
  eye: '#c8e070',
  found: '#6fe3a0',
} as const

/** The four shapes every piece of junk is made of, at unit size. */
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
  }
}

const SHAPES: readonly Shape[] = ['box', 'cylinder', 'tyre', 'blob']

/** Every part of every piece, as one instanced mesh per shape and per lit-or-not. */
function instanceJunk(yard: Yard): InstancedMesh[] {
  const parts: Part[] = yard.pieces.flatMap((piece) => piece.parts)
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

/** The yard lamps: the only real light there is, and the reason some corners are findable. */
const Lamps = memo(function Lamps({ seed }: { seed: number }) {
  const lamps = yardFor(seed).lamps
  return (
    <>
      {lamps.map((lamp, i) => (
        <group key={i} position={[lamp.x, 0, lamp.z]}>
          <mesh position={[0, lamp.height / 2, 0]}>
            <cylinderGeometry args={[0.07, 0.1, lamp.height, 6]} />
            <meshStandardMaterial color={PALETTE.lampPost} roughness={1} />
          </mesh>
          <mesh position={[0, lamp.height, 0]}>
            <sphereGeometry args={[0.26, 12, 8]} />
            <meshBasicMaterial color={PALETTE.lamp} toneMapped={false} />
          </mesh>
          <pointLight position={[0, lamp.height - 0.1, 0]} intensity={48} distance={22} decay={1.5} color={PALETTE.lamp} />
        </group>
      ))}
    </>
  )
})

/**
 * Midnight.
 *
 * Her three spheres are the ones a click is tested against, so she is drawn
 * from exactly those and nothing is added that a click would miss: the ears,
 * the tail and the paws hang off the same local frame, well inside her padding.
 * Her eyes are the one part of her that is not black, and they are two
 * centimetres across - at the widest zoom they are a pixel, which is the point.
 */
function Cat({ seed }: { seed: number }) {
  const cat = yardFor(seed).midnight
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
          <mesh key={side} position={[side * 0.036, 0.015, 0.078]}>
            <sphereGeometry args={[0.013, 8, 6]} />
            <meshStandardMaterial color={PALETTE.eye} emissive={PALETTE.eye} emissiveIntensity={0.55} toneMapped={false} />
          </mesh>
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
 * A ring that lights up over her once you have found her - and once the round
 * is over, for everybody, so whoever never found her gets to see where she was.
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

export function WheresMidnightScene({ live, view }: { live: RefObject<Game>; view: RefObject<View> }) {
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
      <Lamps key={`lamps:${seed}`} seed={seed} />
      <Junk key={`junk:${seed}`} seed={seed} />
      <Cat key={`cat:${seed}`} seed={seed} />
      <FoundMark key={`found:${seed}`} seed={seed} live={live} />
    </>
  )
}
