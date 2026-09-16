/**
 * Punch Buggy in three dimensions, lit and dressed like the island.
 *
 * A round platform of sand on a rocky underside, floating high over the sea,
 * and everybody on it as the island's own pill in their colour - with an arm
 * that shoots out the way they face and a fist on the end of it.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight, type Mesh } from 'three'
import { createAvatar } from '../../02-player'
import { frameScene } from './camera'
import { COLOURS, RING, type Fighter, type Round } from './rules'

export const PALETTE = {
  sand: '#d0bd90',
  rim: '#b9a476',
  rock: '#7d6a58',
  sea: '#3f9fc4',
  background: '#9fc4dd',
  fist: '#ffffff',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
} as const

/** How high the arm and fist are carried: about where a pill's arms are. */
const SHOULDER = 0.85
/** How long somebody takes to leave, once they are out. */
const GONE_AFTER = 1.2

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

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[12, 30, 16]} intensity={2.4} color={PALETTE.sunColour} />
      <ambientLight intensity={0.45} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.85} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The platform: a sand top, a darker rim so the edge reads, a rock underneath, the sea far below. */
const Platform = memo(function Platform() {
  return (
    <group>
      <mesh position={[0, -14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color={PALETTE.sea} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <cylinderGeometry args={[RING.radius, RING.radius, 0.8, 64]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RING.radius - 0.35, RING.radius, 64]} />
        <meshStandardMaterial color={PALETTE.rim} roughness={0.9} />
      </mesh>
      <mesh position={[0, -4, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[RING.radius * 0.97, 6.4, 40]} />
        <meshStandardMaterial color={PALETTE.rock} roughness={1} />
      </mesh>
    </group>
  )
})

/** A heading in the rules' flat x/y, as a turn about the world's up axis. */
function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

/**
 * One fighter: the pill in their colour, an arm out the way they face, a fist.
 *
 * Once out they leave: off the edge they drop; punched, they are thrown back
 * away from whoever hit them, spinning. Either way they are gone in a second.
 */
function FighterBody({ fighter, index, round }: { fighter: Fighter; index: number; round: Round }) {
  const holder = useRef<Group>(null)
  const arm = useRef<Mesh>(null)
  const fist = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(() => {
    const group = holder.current
    if (!group) return
    let x = fighter.x
    let y = 0
    let z = fighter.y
    let spin = 0
    if (!fighter.alive) {
      const t = round.elapsed - (fighter.outAt ?? round.elapsed)
      group.visible = t < GONE_AFTER
      if (fighter.how === 'fell') {
        y = -9 * t * t
      } else {
        const by = round.fighters.find((f) => f.id === fighter.by)
        const away = by ? Math.atan2(fighter.y - by.y, fighter.x - by.x) : fighter.facing + Math.PI
        x += Math.cos(away) * t * 9
        z += Math.sin(away) * t * 9
        y = 3 * t - 9 * t * t
        spin = t * 14
      }
    } else {
      group.visible = true
    }
    group.position.set(x, y, z)
    group.rotation.set(spin, headingToYaw(fighter.facing), 0)

    const along = RING.body + fighter.reach
    if (arm.current) {
      arm.current.visible = fighter.reach > 0.05
      arm.current.scale.set(1, Math.max(0.01, along), 1)
      arm.current.position.set(0, SHOULDER, along / 2)
    }
    if (fist.current) fist.current.position.set(0, SHOULDER, along)
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
      {/* A unit-long arm along the body's facing, stretched to the reach. */}
      <mesh ref={arm} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[RING.arm * 0.7, RING.arm * 0.7, 1, 10]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>
      <mesh ref={fist} castShadow>
        <sphereGeometry args={[RING.fist, 16, 12]} />
        <meshStandardMaterial color={PALETTE.fist} roughness={0.4} emissive={colour} emissiveIntensity={0.15} />
      </mesh>
    </group>
  )
}

/** A ring under your own fighter, so you can find yourself among eight. */
function YouMarker({ fighter, index }: { fighter: Fighter; index: number }) {
  const ring = useRef<Group>(null)
  useFrame(() => {
    if (!ring.current) return
    ring.current.visible = fighter.alive
    ring.current.position.set(fighter.x, 0.04, fighter.y)
  })
  return (
    <group ref={ring}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RING.body * 1.4, RING.body * 1.8, 28]} />
        <meshBasicMaterial color={COLOURS[index % COLOURS.length]} />
      </mesh>
    </group>
  )
}

export function PunchBuggyScene({ live }: { live: RefObject<Round> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const round = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const mineIndex = round.fighters.findIndex((f) => f.mine)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 180]} />
      <FixedCamera />
      <Daylight />
      <Platform />
      {mineIndex >= 0 ? <YouMarker fighter={round.fighters[mineIndex]} index={mineIndex} /> : null}
      {round.fighters.map((fighter, index) => (
        <FighterBody key={`${round.id}:${fighter.id}`} fighter={fighter} index={index} round={round} />
      ))}
    </>
  )
}
