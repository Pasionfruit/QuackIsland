/**
 * Zombie Tag in three dimensions, lit and dressed like the island.
 *
 * The rules are flat - `round.ts` works in x and y on a plane and has never
 * heard of a camera. This turns that plane into a room: the arena's y becomes
 * the world's z, bodies stand up out of the floor, and the light comes from
 * the same sun at the same angle as the island the lobby is on. Getting the
 * game to look like the rest of the build is mostly a matter of not inventing
 * a second palette.
 *
 * **The bodies are the island's own avatar**, from `02-player` - the same
 * capsule, the same face, the same arms - painted a colour each so you can
 * tell who is chasing whom. Nothing about a body here is a second
 * implementation of a body there.
 *
 * It renders into its own canvas rather than into the world's. The two never
 * appear at once - the minigame screen is opaque and covers the world - and
 * keeping them apart means this game owns its camera and its lights outright,
 * with no arbitration against a player controller that is not running.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Color, Group, MathUtils, type DirectionalLight } from 'three'
import { createAvatar } from '../../02-player'
import { ARENA, HALF_H, HALF_W, OBSTACLES } from './arena'
import { FLOOR, frameArena, headingToYaw } from './camera'
import type { Body, Round } from './round'

/**
 * The palette, taken from the island rather than picked again.
 *
 * `sand` and the lighting numbers are the daylight preset `00-core` uses for
 * the world; the crates are the same wood as Garden Goofs' planter. The three
 * body colours are the only thing invented here, because the world has no
 * opinion about how to tell eight players apart.
 */
export const PALETTE = {
  sand: '#d0bd90',
  sandEdge: '#b9a476',
  wall: '#8a7048',
  crate: '#6b4a30',
  crateTop: '#8a5f3c',

  you: '#3f8fd0',
  runner: '#5eb85b',
  zombie: '#9c4bb0',
  stunned: '#ffd24d',

  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
  background: '#9fc4dd',
  fog: '#a8c8dd',
} as const

/** What colour a body is painted, which is the only thing telling them apart. */
export function colourOf(body: Body): string {
  if (body.side === 'zombie') return PALETTE.zombie
  return body.mine ? PALETTE.you : PALETTE.runner
}

/**
 * The camera, placed once and then left alone.
 *
 * Re-placed only when the window changes shape, because that changes what
 * fits - not because anything in the game moved. There is no follow, no
 * easing and no look-at drift: the frame you start the round with is the frame
 * you finish it with.
 */
function FixedCamera() {
  useFrame(({ camera, size }) => {
    const shot = frameArena(size.width / Math.max(1, size.height))
    if (camera.position.x === shot.x && camera.position.y === shot.y && camera.position.z === shot.z) {
      return
    }
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateProjectionMatrix()
  })
  return null
}

/** The island's daylight, and a shadow camera sized to the arena and no wider. */
function Daylight() {
  const sun = useRef<DirectionalLight>(null)

  useEffect(() => {
    const light = sun.current
    if (!light) return
    // Tight to the arena: a shadow camera covering the whole world would spend
    // its resolution on empty sky and give the crates soft, wrong edges.
    const reach = Math.max(HALF_W, HALF_H) * 1.4
    light.shadow.camera.left = -reach
    light.shadow.camera.right = reach
    light.shadow.camera.top = reach
    light.shadow.camera.bottom = -reach
    light.shadow.camera.near = 1
    light.shadow.camera.far = 200
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])

  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        position={[34, 54, 26]}
        intensity={2.6}
        color={PALETTE.sunColour}
      />
      <ambientLight intensity={0.35} color={PALETTE.ambientColour} />
      <hemisphereLight
        intensity={0.9}
        color={PALETTE.skyColour}
        groundColor={PALETTE.groundColour}
      />
    </>
  )
}

/**
 * The floor, the four walls, and the crates. All of it fixed for the round.
 *
 * Memoised, and that is not a micro-optimisation: the round is stepped and
 * handed to React every frame, so without this the fourteen boxes that make up
 * the room would be reconciled sixty times a second to describe a room that
 * has not changed since it was built.
 */
const Room = memo(function Room() {
  return (
    <group>
      {/* A slab rather than a plane, so the arena has a visible edge from a
          tilted view instead of ending in nothing. */}
      <mesh position={[0, -FLOOR.thickness / 2, 0]} receiveShadow>
        <boxGeometry args={[FLOOR.width, FLOOR.thickness, FLOOR.depth]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
      </mesh>

      {walls().map((wall, i) => (
        <mesh
          key={i}
          position={[wall.x, FLOOR.wallHeight / 2, wall.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wall.width, FLOOR.wallHeight, wall.depth]} />
          <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
        </mesh>
      ))}

      {OBSTACLES.map((box, i) => (
        <group key={i} position={[box.x, 0, box.y]}>
          <mesh position={[0, FLOOR.crateHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[box.width, FLOOR.crateHeight, box.height]} />
            <meshStandardMaterial color={PALETTE.crate} roughness={0.85} />
          </mesh>
          {/* A lighter lid, so a crate reads as a box and not as a slab. */}
          <mesh position={[0, FLOOR.crateHeight + 0.06, 0]} castShadow>
            <boxGeometry args={[box.width * 0.94, 0.12, box.height * 0.94]} />
            <meshStandardMaterial color={PALETTE.crateTop} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
})

/** The four walls, as boxes. Overlapped at the corners so there are no seams. */
function walls(): { x: number; z: number; width: number; depth: number }[] {
  const t = FLOOR.wallThickness
  const outerW = FLOOR.width + t * 2
  return [
    { x: 0, z: -HALF_H - t / 2, width: outerW, depth: t },
    { x: 0, z: HALF_H + t / 2, width: outerW, depth: t },
    { x: -HALF_W - t / 2, z: 0, width: t, depth: FLOOR.depth },
    { x: HALF_W + t / 2, z: 0, width: t, depth: FLOOR.depth },
  ]
}

/**
 * One body: the island's avatar, painted, stood on the floor and turned to
 * face where it is going.
 *
 * The group is built once per body and then only ever moved. Rebuilding an
 * avatar every frame would be thirteen new meshes a frame for a game whose
 * whole point is that the bodies are the same bodies moving about.
 */
function BodyPill({ body }: { body: Body }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colourOf(body)), [body.id, body.side, body.mine])

  useFrame(() => {
    const group = holder.current
    if (!group) return
    group.position.set(body.x, 0, body.y)
    group.rotation.y = headingToYaw(body.facing)
    // Knocked down: tipped onto its back, the same way the world's body does
    // it, so being stunned reads the same wherever you are.
    const down = body.stun > 0
    group.rotation.x = MathUtils.lerp(group.rotation.x, down ? -Math.PI / 2.1 : 0, 0.35)
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
      {body.stun > 0 ? (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ARENA.radius * 1.1, ARENA.radius * 1.5, 24]} />
          <meshBasicMaterial color={PALETTE.stunned} transparent opacity={0.85} />
        </mesh>
      ) : null}
    </group>
  )
}

/**
 * A ring under the body this browser is driving.
 *
 * Thirteen capsules on a sand floor from across the room is thirteen capsules;
 * this is how you find yourself in the second after a round starts, and again
 * every time you look away from your own corner.
 */
function YouMarker({ body }: { body: Body }) {
  const ring = useRef<Group>(null)
  useFrame(() => ring.current?.position.set(body.x, 0.05, body.y))
  return (
    <group ref={ring}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA.radius * 1.55, ARENA.radius * 1.9, 28]} />
        <meshBasicMaterial color={colourOf(body)} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

export function ZombieTagScene({ round }: { round: Round }) {
  const you = round.bodies.find((b) => b.mine) ?? null
  const background = useMemo(() => new Color(PALETTE.background), [])

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.fog, 90, 260]} />
      <FixedCamera />
      <Daylight />
      <Room />
      {you ? <YouMarker body={you} /> : null}
      {round.bodies.map((body) => (
        <BodyPill key={body.id} body={body} />
      ))}
    </>
  )
}
