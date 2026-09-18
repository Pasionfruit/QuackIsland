/**
 * Zombie Tag in three dimensions: a walled graveyard, at night.
 *
 * The rules are flat - `round.ts` works in x and y on a plane and has never
 * heard of a camera. This turns that plane into a room: the arena's y becomes
 * the world's z, bodies stand up out of the floor, the moon lights it from
 * behind the far wall, and lamps on the walls pool warm light on the grass.
 * The barriers the rules call obstacles are drawn as graves.
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
import { ARENA, HALF_H, HALF_W, OBSTACLES, type Obstacle } from './arena'
import { FLOOR, frameArena, headingToYaw } from './camera'
import type { Body, Round } from './round'

/**
 * The palette: a graveyard at night.
 *
 * Cool moonlight from above, warm lamps on the walls, and gravestones where
 * the crates used to be. The three body colours are the daytime arena's,
 * unchanged - they are how you tell who is chasing whom, and that has to
 * survive the dark - so everything around them is kept low and cool for them
 * to stand out against.
 */
export const PALETTE = {
  grass: '#2b3b22',
  wall: '#474a52',
  wallCap: '#5c606a',
  plot: '#3a3833',
  stone: '#8f929a',
  stoneDark: '#6c6f78',
  iron: '#1c1c20',
  lampGlow: '#ffc873',

  you: '#3f8fd0',
  runner: '#5eb85b',
  zombie: '#9c4bb0',
  stunned: '#ffd24d',

  moonColour: '#b9c8ff',
  lampColour: '#ffb259',
  ambientColour: '#5a6a9c',
  skyColour: '#3a4a8a',
  groundColour: '#0e1410',
  background: '#070b1a',
  fog: '#0b1224',
} as const

/**
 * What colour a body is painted, which is the only thing telling them apart.
 *
 * A body mid-turn is already a zombie to the rules, but it keeps the colour it
 * was caught in through the beat and the first half of the spin, and comes out
 * of the spin purple.
 */
export function colourOf(body: Body): string {
  const own = body.mine ? PALETTE.you : PALETTE.runner
  if (body.side === 'player') return own
  return body.turning > ARENA.turnSpin / 2 ? own : PALETTE.zombie
}

/**
 * Where a turn is, as a spin and a hop, given how long it has been going.
 *
 * Nothing for the first `turnDelay` - the beat of being caught - and then two
 * full turns over `turnSpin`, eased in and out, with a hop at the top.
 */
export function turnPose(sinceCaught: number): { spin: number; hop: number } {
  const t = (sinceCaught - ARENA.turnDelay) / ARENA.turnSpin
  if (t <= 0 || t >= 1) return { spin: 0, hop: 0 }
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
  return { spin: eased * Math.PI * 4, hop: Math.sin(t * Math.PI) * 0.6 }
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

/** How high a lamp's lantern hangs: a little above the top of the wall. */
const LAMP_HEIGHT = FLOOR.wallHeight + 1.3

/**
 * Where the lamps stand: the four corners of the wall and halfway along the
 * two long sides. On the wall rather than in the room, so they light the
 * floor without being something to run into.
 */
const LAMPS: readonly (readonly [number, number])[] = (() => {
  const x = HALF_W + FLOOR.wallThickness / 2
  const z = HALF_H + FLOOR.wallThickness / 2
  return [
    [-x, -z],
    [0, -z],
    [x, -z],
    [-x, z],
    [0, z],
    [x, z],
  ] as const
})()

/**
 * Moonlight, and the lamps.
 *
 * The moon is the only light that casts shadows - one shadow map over the
 * arena, the same budget the daylight had. The lamps are warm pools on the
 * grass with no shadows of their own, which is what makes six of them cheap.
 */
function Nightlight() {
  const moon = useRef<DirectionalLight>(null)

  useEffect(() => {
    const light = moon.current
    if (!light) return
    // Tight to the arena: a shadow camera covering the whole world would spend
    // its resolution on empty sky and give the gravestones soft, wrong edges.
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
      {/* From over your shoulder, so the faces of the headstones catch it. */}
      <directionalLight
        ref={moon}
        castShadow
        position={[18, 46, 36]}
        intensity={1.7}
        color={PALETTE.moonColour}
      />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight
        intensity={0.9}
        color={PALETTE.skyColour}
        groundColor={PALETTE.groundColour}
      />
      {/* Hung a little in from each lantern, over the grass: from the
          lantern itself, the wall's capstone right under it burns white. */}
      {LAMPS.map(([x, z], i) => (
        <pointLight
          key={i}
          position={[x * 0.9, LAMP_HEIGHT + 1, z * 0.86]}
          color={PALETTE.lampColour}
          intensity={40}
          distance={20}
          decay={1.5}
        />
      ))}
    </>
  )
}

/** A lamp post: an iron post up out of the wall, and a lantern that glows. */
function LampPost({ x, z }: { x: number; z: number }) {
  const post = LAMP_HEIGHT - FLOOR.wallHeight
  return (
    <group position={[x, FLOOR.wallHeight, z]}>
      <mesh position={[0, post / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, post, 8]} />
        <meshStandardMaterial color={PALETTE.iron} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, post + 0.05, 0]}>
        <boxGeometry args={[0.42, 0.5, 0.42]} />
        <meshStandardMaterial
          color={PALETTE.lampGlow}
          emissive={PALETTE.lampGlow}
          emissiveIntensity={2.2}
        />
      </mesh>
      <mesh position={[0, post + 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.38, 0.3, 4]} />
        <meshStandardMaterial color={PALETTE.iron} roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}

/**
 * A little variety per stone, from where it is rather than from a random
 * number, so every browser draws the same graveyard. Between -0.5 and 0.5.
 */
function wobble(i: number, j: number): number {
  return ((i * 37 + j * 13) % 7) / 6 - 0.5
}

/**
 * One barrier, as a grave plot: a low stone kerb over exactly the footprint
 * the rules collide with, and gravestones stood on it.
 *
 * A long plot is a row of headstones along its back edge; a square one is an
 * obelisk. The kerb is what keeps the drawing honest - the
 * gaps between headstones look walkable and are not, and the kerb says so.
 */
function Plot({ box, index }: { box: Obstacle; index: number }) {
  const square = Math.abs(box.width - box.height) < 0.5
  // Laid out along local x, and turned when the plot runs down the room.
  const along = box.width >= box.height
  const long = along ? box.width : box.height
  const short = along ? box.height : box.width
  const count = Math.max(2, Math.round(long / 2.3))
  const spacing = long / count
  const width = spacing * 0.62
  const back = -short / 2 + 0.4

  return (
    <group position={[box.x, 0, box.y]}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[box.width, 0.24, box.height]} />
        <meshStandardMaterial color={PALETTE.plot} roughness={0.95} />
      </mesh>

      {square ? (
        <group>
          <mesh position={[0, 0.49, 0]} castShadow receiveShadow>
            <boxGeometry args={[box.width * 0.75, 0.5, box.height * 0.75]} />
            <meshStandardMaterial color={PALETTE.stoneDark} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.74 + 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.66, 2.6, 4]} />
            <meshStandardMaterial color={PALETTE.stone} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.74 + 2.6 + 0.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.42, 0.5, 4]} />
            <meshStandardMaterial color={PALETTE.stone} roughness={0.85} />
          </mesh>
        </group>
      ) : (
        <group rotation={[0, along ? 0 : Math.PI / 2, 0]}>
          {Array.from({ length: count }, (_, i) => {
            const height = 1.35 + wobble(i, index) * 0.4
            const shaft = height - width / 2
            const x = -long / 2 + spacing * (i + 0.5)
            return (
              <group key={i}>
                {/* Leaning a touch, each its own way: an old graveyard. */}
                <group
                  position={[x, 0.24, back]}
                  rotation={[wobble(index, i) * 0.14, 0, wobble(i + 3, index) * 0.12]}
                >
                  <mesh position={[0, shaft / 2, 0]} castShadow receiveShadow>
                    <boxGeometry args={[width, shaft, 0.3]} />
                    <meshStandardMaterial color={PALETTE.stone} roughness={0.9} />
                  </mesh>
                  {/* A rounded top, so it reads as a headstone and not a slab. */}
                  <mesh position={[0, shaft, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <cylinderGeometry args={[width / 2, width / 2, 0.3, 16, 1, false, Math.PI / 2, Math.PI]} />
                    <meshStandardMaterial color={PALETTE.stone} roughness={0.9} />
                  </mesh>
                </group>
              </group>
            )
          })}
        </group>
      )}
    </group>
  )
}

/**
 * The ground, the four walls, the lamps, and the graves. All of it fixed for
 * the round.
 *
 * Memoised, and that is not a micro-optimisation: the round is stepped and
 * handed to React every frame, so without this the room would be reconciled
 * sixty times a second to describe a room that has not changed since it was
 * built.
 */
const Room = memo(function Room() {
  return (
    <group>
      {/* A slab rather than a plane, so the arena has a visible edge from a
          tilted view instead of ending in nothing. */}
      <mesh position={[0, -FLOOR.thickness / 2, 0]} receiveShadow>
        <boxGeometry args={[FLOOR.width, FLOOR.thickness, FLOOR.depth]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>

      {walls().map((wall, i) => (
        <group key={i}>
          <mesh position={[wall.x, FLOOR.wallHeight / 2, wall.z]} castShadow receiveShadow>
            <boxGeometry args={[wall.width, FLOOR.wallHeight, wall.depth]} />
            <meshStandardMaterial color={PALETTE.wall} roughness={0.95} />
          </mesh>
          {/* A capstone along the top, a little proud of the wall. */}
          <mesh position={[wall.x, FLOOR.wallHeight + 0.08, wall.z]} receiveShadow>
            <boxGeometry args={[wall.width + 0.12, 0.16, wall.depth + 0.12]} />
            <meshStandardMaterial color={PALETTE.wallCap} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {LAMPS.map(([x, z], i) => (
        <LampPost key={i} x={x} z={z} />
      ))}

      {OBSTACLES.map((box, i) => (
        <Plot key={i} box={box} index={i} />
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
 * whole point is that the bodies are the same bodies moving about. The one
 * exception is the middle of a turn, where the paint changes and the avatar
 * is swapped for one in the new colour - hidden by the spin.
 */
function BodyPill({ body }: { body: Body }) {
  const holder = useRef<Group>(null)
  const colour = colourOf(body)
  const avatar = useMemo(() => createAvatar(colour), [body.id, colour])
  // How long this body has been turning, by this browser's own clock. A
  // guest hears `turning` twenty times a second, which is too coarse to spin
  // by; this ticks every frame and starts when the turn does.
  const turned = useRef(0)

  useFrame((_, delta) => {
    const group = holder.current
    if (!group) return
    turned.current = body.turning > 0 ? turned.current + delta : 0
    const pose = turnPose(turned.current)
    group.position.set(body.x, pose.hop, body.y)
    group.rotation.y = headingToYaw(body.facing) + pose.spin
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
 * Thirteen capsules in a dark graveyard from across the room is thirteen
 * capsules; this is how you find yourself in the second after a round starts,
 * and again every time you look away from your own corner.
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
      <Nightlight />
      <Room />
      {you ? <YouMarker body={you} /> : null}
      {round.bodies.map((body) => (
        <BodyPill key={body.id} body={body} />
      ))}
    </>
  )
}
