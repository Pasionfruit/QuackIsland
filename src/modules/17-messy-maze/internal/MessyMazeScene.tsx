/**
 * Messy Maze in three dimensions, lit and dressed like the island.
 *
 * The rules are flat: `race.ts` works in x and y on a plane. This stands that
 * plane up - maze y becomes world z - with the island's sun, the island's sand,
 * and the island's avatar for every racer, painted a colour each.
 *
 * **Every wall in the maze is one draw call.** There are a few hundred of them,
 * all boxes, all the same material, so they are one instanced mesh with a
 * transform each - built once per maze and never touched again.
 *
 * It renders into its own canvas. The minigame screen is opaque, so the world
 * is never visible at the same time, and a canvas of its own means this game
 * owns its camera and its light outright.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Matrix4, type DirectionalLight, type Mesh } from 'three'
import { createAvatar } from '../../02-player'
import { SLAB, WALL_HEIGHT, frameMaze, headingToYaw } from './camera'
import { HALF, MAZE, mazeFor, type Maze, type Platform } from './maze'
import { goalOpen, type Race, type Racer } from './race'

/** The island's palette, plus the few colours a race needs to tell things apart. */
export const PALETTE = {
  sand: '#d0bd90',
  wall: '#8a7048',

  platform: '#f08a3c',
  stripe: '#ffd24d',
  platformDone: '#b7a37a',
  stripeDone: '#cdbb92',

  goalShut: '#9c9486',
  goalOpen: '#ffc94d',
  goalRing: '#fff1b8',

  you: '#3f8fd0',
  racer: '#5eb85b',

  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
  background: '#9fc4dd',
  fog: '#a8c8dd',
} as const

function FixedCamera() {
  useFrame(({ camera, size }) => {
    const shot = frameMaze(size.width / Math.max(1, size.height))
    if (camera.position.x === shot.x && camera.position.y === shot.y && camera.position.z === shot.z) {
      return
    }
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
    const reach = HALF * 1.3
    light.shadow.camera.left = -reach
    light.shadow.camera.right = reach
    light.shadow.camera.top = reach
    light.shadow.camera.bottom = -reach
    light.shadow.camera.near = 1
    light.shadow.camera.far = 220
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        position={[30, 60, 22]}
        intensity={2.5}
        color={PALETTE.sunColour}
      />
      <ambientLight intensity={0.4} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.9} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

const Floor = memo(function Floor() {
  return (
    <mesh position={[0, -SLAB / 2, 0]} receiveShadow>
      <boxGeometry args={[HALF * 2, SLAB, HALF * 2]} />
      <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
    </mesh>
  )
})

/** Every wall of one maze, as one instanced mesh. Rebuilt only for a new maze. */
const Walls = memo(function Walls({ maze }: { maze: Maze }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const walls = mesh.current
    if (!walls) return
    const matrix = new Matrix4()
    maze.walls.forEach((box, i) => {
      matrix.makeScale(box.width, WALL_HEIGHT, box.height)
      matrix.setPosition(box.x, WALL_HEIGHT / 2, box.y)
      walls.setMatrixAt(i, matrix)
    })
    walls.count = maze.walls.length
    walls.instanceMatrix.needsUpdate = true
    walls.computeBoundingSphere()
  }, [maze])

  return (
    <instancedMesh
      // Keyed on the seed by the parent, so a new maze gets a mesh sized for it.
      ref={mesh}
      args={[undefined, undefined, maze.walls.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
    </instancedMesh>
  )
})

/**
 * One spinning platform: a disc with a cross on it, turning.
 *
 * Faded for you once you have stood on it, because the thing you want to know
 * at a glance is where the ones you still need are.
 */
function SpinningPlatform({ platform, done }: { platform: Platform; done: boolean }) {
  const spinner = useRef<Group>(null)
  useFrame((_state, delta) => {
    if (spinner.current) spinner.current.rotation.y += delta * (done ? 0.8 : 2.6)
  })
  const radius = MAZE.platformRadius * 0.92
  return (
    <group position={[platform.at.x, 0, platform.at.y]}>
      <group ref={spinner}>
        <mesh position={[0, 0.07, 0]} receiveShadow>
          <cylinderGeometry args={[radius, radius, 0.14, 32]} />
          <meshStandardMaterial color={done ? PALETTE.platformDone : PALETTE.platform} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[radius * 1.8, 0.03, 0.28]} />
          <meshStandardMaterial color={done ? PALETTE.stripeDone : PALETTE.stripe} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.28, 0.03, radius * 1.8]} />
          <meshStandardMaterial color={done ? PALETTE.stripeDone : PALETTE.stripe} roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * The finish, in the middle. Grey and still while it will not have you; gold,
 * with a ring breathing round it, once you have your two platforms.
 */
function Goal({ open }: { open: boolean }) {
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const r = ring.current
    if (!r) return
    r.visible = open
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08
    r.scale.set(pulse, pulse, 1)
  })
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <cylinderGeometry args={[MAZE.goalRadius, MAZE.goalRadius, 0.12, 36]} />
        <meshStandardMaterial
          color={open ? PALETTE.goalOpen : PALETTE.goalShut}
          emissive={open ? PALETTE.goalOpen : '#000000'}
          emissiveIntensity={open ? 0.35 : 0}
          roughness={0.5}
        />
      </mesh>
      <mesh ref={ring} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[MAZE.goalRadius * 1.05, MAZE.goalRadius * 1.3, 40]} />
        <meshBasicMaterial color={PALETTE.goalRing} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/**
 * One racer: the island's avatar, turned to face where it is going, and
 * whirling while it spins.
 */
function RacerPill({ racer }: { racer: Racer }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(
    () => createAvatar(racer.mine ? PALETTE.you : PALETTE.racer),
    [racer.id, racer.mine],
  )
  useFrame((_state, delta) => {
    const group = holder.current
    if (!group) return
    group.position.set(racer.x, 0, racer.y)
    if (racer.spin > 0) group.rotation.y += delta * 22
    else group.rotation.y = headingToYaw(racer.facing)
  })
  return (
    <group ref={holder}>
      <primitive object={avatar} />
    </group>
  )
}

/** A ring under your own racer, so you can find yourself among four capsules. */
function YouMarker({ racer }: { racer: Racer }) {
  const ring = useRef<Group>(null)
  useFrame(() => ring.current?.position.set(racer.x, 0.2, racer.y))
  return (
    <group ref={ring}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[MAZE.radius * 1.35, MAZE.radius * 1.7, 28]} />
        <meshBasicMaterial color={PALETTE.you} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

export function MessyMazeScene({ race }: { race: Race }) {
  const background = useMemo(() => new Color(PALETTE.background), [])
  const you = race.racers.find((r) => r.mine) ?? null
  // A guest with no snapshot yet has no maze to draw - only the floor, rather
  // than a guessed maze that would jump when the real one arrived.
  const ready = race.racers.length > 0
  const maze = ready ? mazeFor(race.seed) : null

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.fog, 110, 300]} />
      <FixedCamera />
      <Daylight />
      <Floor />
      {maze ? (
        <>
          <Walls key={maze.seed} maze={maze} />
          {maze.platforms.map((platform) => (
            <SpinningPlatform
              key={platform.id}
              platform={platform}
              done={you !== null && (you.touched & (1 << platform.id)) !== 0}
            />
          ))}
          <Goal open={you !== null && goalOpen(you)} />
        </>
      ) : null}
      {you ? <YouMarker racer={you} /> : null}
      {race.racers.map((racer) => (
        <RacerPill key={racer.id} racer={racer} />
      ))}
    </>
  )
}
