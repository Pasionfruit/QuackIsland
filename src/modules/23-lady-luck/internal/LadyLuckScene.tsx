/**
 * Lady Luck in three dimensions.
 *
 * A meadow seen from nearly above: grass, tufts, and two hundred and twenty
 * clovers, each three heart-shaped leaves round a middle - or four, for the
 * lucky ones. Every leaf in the field is one instance of one mesh, so the whole
 * meadow is a single draw call, and the tufts another. Four-leaf clovers are the
 * same size and the same greens as the rest: the only way to find one is to count
 * its leaves.
 *
 * A claimed clover gets a ring in its claimer's colour, landing with a pop; a
 * click that missed leaves a ring that fades; a click this browser hopes is a
 * claim is ringed in white until the host answers.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes. A click is turned
 * into a clover here: a ray from this camera through the pointer, where it meets
 * the ground, and the clover there.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Object3D,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type Group,
  type MeshBasicMaterial,
} from 'three'
import { createRng, hashSeed } from '../../00-core'
import { usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { HALF, frameScene, groundHit } from './camera'
import { COLOURS, FIELD, cloverAt, fieldFor, type Game } from './rules'

export const PALETTE = {
  background: '#9fcf86',
  grass: '#7fb865',
  grassDark: '#6aa653',
  tuft: '#5d9a49',
  leafA: '#3d8c3a',
  leafB: '#6fb04c',
  middle: '#d8e8b0',
  sunColour: '#fff6e2',
  ambientColour: '#eaf5ff',
  skyColour: '#e2f1ff',
  groundColour: '#6b8f4e',
} as const

/** A leaf's length from the clover's middle to the top of its lobes, before a clover's scale. */
const LEAF = 0.3
/** How many tufts of grass there are to look past. */
const TUFTS = 900

export interface SceneHands {
  onClick: (clover: number | null) => void
  claiming: () => number | null
}

function FixedCamera() {
  useFrame(({ camera, size }) => {
    const shot = frameScene(size.width / Math.max(1, size.height))
    if (camera.position.x === shot.x && camera.position.y === shot.y && camera.position.z === shot.z) return
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateProjectionMatrix()
  })
  return null
}

/** A heart-shaped leaflet, pointed end at the clover's middle, lying flat, lobes towards -z. */
function leafGeometry(): ShapeGeometry {
  const s = new Shape()
  const l = LEAF
  s.moveTo(0, 0)
  s.bezierCurveTo(-0.12 * l, 0.18 * l, -0.62 * l, 0.42 * l, -0.52 * l, 0.8 * l)
  s.bezierCurveTo(-0.44 * l, 1.06 * l, -0.12 * l, 1.08 * l, 0, 0.84 * l)
  s.bezierCurveTo(0.12 * l, 1.08 * l, 0.44 * l, 1.06 * l, 0.52 * l, 0.8 * l)
  s.bezierCurveTo(0.62 * l, 0.42 * l, 0.12 * l, 0.18 * l, 0, 0)
  const geometry = new ShapeGeometry(s, 10)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** A blade-ish tuft: a thin triangle standing a little off the ground. */
function tuftGeometry(): ShapeGeometry {
  const s = new Shape()
  s.moveTo(-0.05, 0)
  s.lineTo(0.05, 0)
  s.lineTo(0.01, 0.34)
  s.lineTo(-0.05, 0)
  const geometry = new ShapeGeometry(s)
  geometry.rotateX(-Math.PI / 2 + 0.5)
  return geometry
}

/** The ground and its tufts. Only changes with the field. */
const Meadow = memo(function Meadow({ seed }: { seed: number }) {
  const tufts = useRef<InstancedMesh>(null)
  const geometry = useMemo(tuftGeometry, [])
  useLayoutEffect(() => {
    const mesh = tufts.current
    if (!mesh) return
    const random = createRng(hashSeed(seed, 'lady-luck:tufts'))
    const dummy = new Object3D()
    const colour = new Color()
    for (let i = 0; i < TUFTS; i++) {
      dummy.position.set((random() * 2 - 1) * (HALF.x + 1), 0.005, (random() * 2 - 1) * (HALF.z + 1))
      dummy.rotation.set(0, random() * Math.PI * 2, 0)
      dummy.scale.setScalar(0.6 + random() * 0.9)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, colour.set(PALETTE.tuft).offsetHSL(0, 0, (random() - 0.5) * 0.08))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [seed])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={PALETTE.grassDark} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF.x * 2 + 1.2, HALF.z * 2 + 1.2]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <instancedMesh ref={tufts} args={[geometry, undefined, TUFTS]} frustumCulled={false}>
        <meshStandardMaterial side={DoubleSide} roughness={1} />
      </instancedMesh>
    </group>
  )
})

/**
 * Every clover's leaves. Laid out again only when a clover changes between three
 * leaves and four - `lucky` is the list of four-leaf ones.
 */
const Clovers = memo(function Clovers({ seed, lucky }: { seed: number; lucky: string }) {
  const leaves = useRef<InstancedMesh>(null)
  const middles = useRef<InstancedMesh>(null)
  const field = fieldFor(seed)
  const geometry = useMemo(leafGeometry, [])
  useLayoutEffect(() => {
    const mesh = leaves.current
    const dots = middles.current
    if (!mesh || !dots) return
    const four = new Set(lucky === '' ? [] : lucky.split(',').map(Number))
    const dummy = new Object3D()
    const colour = new Color()
    const a = new Color(PALETTE.leafA)
    const b = new Color(PALETTE.leafB)
    let n = 0
    field.forEach((clover, index) => {
      const count = four.has(index) ? 4 : 3
      // Four leaves drawn a touch smaller, so a four-leaf clover is no bigger than the rest.
      const size = clover.scale * (count === 4 ? 0.9 : 1)
      const random = createRng(hashSeed(seed, `lady-luck:leaves:${index}`))
      for (let leaf = 0; leaf < count; leaf++) {
        dummy.position.set(clover.x, 0.02 + index * 0.00002, clover.z)
        dummy.rotation.set(0, clover.angle + (leaf * Math.PI * 2) / count + (random() - 0.5) * 0.25, 0)
        dummy.scale.setScalar(size * (0.92 + random() * 0.16))
        dummy.updateMatrix()
        mesh.setMatrixAt(n, dummy.matrix)
        mesh.setColorAt(n, colour.copy(a).lerp(b, clover.tint * 0.8 + random() * 0.2))
        n += 1
      }
      dummy.position.set(clover.x, 0.025 + index * 0.00002, clover.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.setScalar(clover.scale)
      dummy.updateMatrix()
      dots.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    dots.instanceMatrix.needsUpdate = true
  }, [seed, lucky, field])
  return (
    <>
      <instancedMesh ref={leaves} args={[geometry, undefined, field.length * 4]} frustumCulled={false} castShadow>
        <meshStandardMaterial side={DoubleSide} roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={middles} args={[undefined, undefined, field.length]} frustumCulled={false}>
        <circleGeometry args={[0.035, 8]} />
        <meshBasicMaterial color={PALETTE.middle} />
      </instancedMesh>
    </>
  )
})

/** A ring round a clover: a claim, landing with a pop, in the claimer's colour. */
function ClaimRing({ clover, colour, at, live, seed }: { clover: number; colour: string; at: number; live: RefObject<Game>; seed: number }) {
  const group = useRef<Group>(null)
  const spot = fieldFor(seed)[clover]
  useFrame(() => {
    if (!group.current) return
    const g = live.current
    const age = g.elapsed - at
    // Not while the clock is stopped at the end, or a last-second claim stays popped.
    const pop = !g.over && age < 0.35 ? 1 + (1 - age / 0.35) * 0.8 : 1
    group.current.scale.setScalar(pop)
  })
  return (
    <group ref={group} position={[spot.x, 0.04, spot.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FIELD.reach * 0.92, FIELD.reach * 1.18, 40]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <ringGeometry args={[FIELD.reach * 0.86, FIELD.reach * 1.24, 40]} />
        <meshBasicMaterial color="#1d2b18" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

/** A click that did not claim: a ring in the clicker's colour that shrinks and fades. */
function MissRing({ index, colour, live }: { index: number; colour: string; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    const g = live.current
    const hunter = g.players[index]
    const box = group.current
    if (!box || !material.current) return
    const miss = hunter?.miss
    const age = miss ? g.elapsed - miss.at : Infinity
    box.visible = !!miss && miss.clover !== null && age >= 0 && age < 0.6
    if (!box.visible || !miss || miss.clover === null) return
    const spot = fieldFor(g.seed)[miss.clover]
    if (!spot) return
    box.position.set(spot.x, 0.05, spot.z)
    box.scale.setScalar(1 - age * 0.6)
    material.current.opacity = 0.9 * (1 - age / 0.6)
  })
  return (
    <group ref={group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FIELD.reach * 0.8, FIELD.reach, 32]} />
        <meshBasicMaterial ref={material} color={colour} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/** A click this browser hopes is a claim, ringed in white until the host answers. */
function Claiming({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    const box = group.current
    if (!box) return
    const clover = hands.claiming()
    box.visible = clover !== null
    if (clover === null) return
    const spot = fieldFor(live.current.seed)[clover]
    box.position.set(spot.x, 0.045, spot.z)
    box.scale.setScalar(1 + Math.sin(clock.elapsedTime * 20) * 0.06)
  })
  return (
    <group ref={group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FIELD.reach * 0.92, FIELD.reach * 1.1, 40]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

/** Clicks on the canvas, turned into clovers. */
function Trigger({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const pointer = new Vector2()
    const direction = new Vector3()
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      direction.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position)
      const hit = groundHit(camera.position, direction)
      hands.onClick(hit ? cloverAt(live.current.seed, hit.x, hit.z) : null)
    }
    canvas.addEventListener('pointerdown', down)
    return () => canvas.removeEventListener('pointerdown', down)
  }, [camera, gl, hands, live])
  return null
}

export function LadyLuckScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const ready = game.players.length > 0
  const lucky = [...game.lucky.map((l) => l.clover), ...game.claims.map((c) => c.clover)].sort((x, y) => x - y).join(',')
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <directionalLight castShadow position={[-8, 30, 12]} intensity={2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.6} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.7} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
      <FixedCamera />
      <Meadow seed={game.seed} />
      {ready ? <Clovers seed={game.seed} lucky={lucky} /> : null}
      {game.claims.map((c) => (
        <ClaimRing key={`${game.id}:${c.clover}`} clover={c.clover} colour={colours[c.player]} at={c.at} live={live} seed={game.seed} />
      ))}
      {game.players.map((p, index) => (
        <MissRing key={`${game.id}:${p.id}`} index={index} colour={colours[index]} live={live} />
      ))}
      <Claiming live={live} hands={hands} />
      <Trigger live={live} hands={hands} />
    </>
  )
}
