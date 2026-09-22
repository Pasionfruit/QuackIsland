/**
 * Musical Mayhem in three dimensions, lit and dressed like the island.
 *
 * A round dance floor out over the sea, a ring of deck chairs in the middle of
 * it, everybody on it as the island's own pill in their colour, and a pair of
 * speakers at the back that thump while the music plays and go still the
 * instant it stops.
 *
 * **The chairs close up as they go.** A chair is not moved to its new place on
 * the ring the moment a round ends - it slides there, so a ring of six becoming
 * a ring of five is something you watch happen rather than something that has
 * already happened by the time you look. A chair nobody is on glows while the
 * music is off, because a free chair is the only thing worth looking at then.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, DoubleSide, type DirectionalLight, type Group, type Mesh, type MeshBasicMaterial, type PerspectiveCamera } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { FOV, cameraFor } from './camera'
import { CHAIR, COLOURS, FLOOR, chairAt, isIn, isSafe, sitter, type Game, type Player } from './rules'

export const PALETTE = {
  floor: '#e8cf9e',
  floorDark: '#d4b37c',
  rim: '#b9935f',
  post: '#8a6a44',
  rope: '#f4e3bd',
  rock: '#7d6a58',
  sea: '#3f9fc4',
  background: '#9fc4dd',
  chair: '#f2f0ea',
  chairFrame: '#7c5a3a',
  speaker: '#2e2a33',
  cone: '#c8763a',
  glow: '#ffd75e',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
} as const

/**
 * How high the seat of a chair is, how far the back rises above it, and how wide
 * it is - wider than a body, or a sitter covers the chair and reads as standing
 * on it. Only the radius in `CHAIR` decides anything; this is what is drawn.
 */
const SEAT = { height: 0.46, back: 0.52, thickness: 0.08, width: 1.02 } as const
/** How quickly a chair slides to where the new, smaller ring wants it, per second. */
const CLOSE_RATE = 4.5
/** How far a sitting body drops into the chair. */
const SIT_SQUASH = 0.76

function FixedCamera() {
  useFrame(({ camera, size }) => {
    const fitted = cameraFor(size.width / Math.max(1, size.height))
    if (camera.position.equals(fitted.position)) return
    camera.position.copy(fitted.position)
    camera.quaternion.copy(fitted.quaternion)
    ;(camera as PerspectiveCamera).fov = FOV
    ;(camera as PerspectiveCamera).updateProjectionMatrix()
  })
  return null
}

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[10, 28, 18]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The dance floor: boards laid in a disc, a rim round it, a rock under it and the sea far below. */
const Floor = memo(function Floor() {
  const posts = 16
  return (
    <group>
      <mesh position={[0, -16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color={PALETTE.sea} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.35, 0]} receiveShadow>
        <cylinderGeometry args={[FLOOR.radius, FLOOR.radius, 0.7, 72]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.9} />
      </mesh>
      {/* Boards: wedges of a slightly darker floor, every other one, so the
          disc reads as a floor rather than as a coin. */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, (i / 6) * Math.PI]}>
          <circleGeometry args={[FLOOR.radius - 0.05, 12, 0, Math.PI / 12]} />
          <meshStandardMaterial color={PALETTE.floorDark} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[FLOOR.radius - 0.03, 0.09, 8, 72]} />
        <meshStandardMaterial color={PALETTE.rim} roughness={0.85} />
      </mesh>
      <mesh position={[0, -3.6, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[FLOOR.radius * 0.95, 5.8, 40]} />
        <meshStandardMaterial color={PALETTE.rock} roughness={1} />
      </mesh>
      {/* Posts and a rope round the edge: they say where the floor stops. */}
      {Array.from({ length: posts }, (_, i) => {
        const a = (i / posts) * Math.PI * 2
        return (
          <mesh key={i} castShadow position={[Math.sin(a) * (FLOOR.radius - 0.2), 0.45, Math.cos(a) * (FLOOR.radius - 0.2)]}>
            <cylinderGeometry args={[0.07, 0.08, 0.9, 6]} />
            <meshStandardMaterial color={PALETTE.post} roughness={0.9} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.88, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[FLOOR.radius - 0.2, 0.025, 6, 72]} />
        <meshStandardMaterial color={PALETTE.rope} roughness={1} />
      </mesh>
    </group>
  )
})

/**
 * The speakers the tune comes out of: they thump in time while the music plays,
 * and stand dead still the moment it stops. Somebody playing with the sound off
 * still has something to watch for.
 */
function Speakers({ live }: { live: RefObject<Game> }) {
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  useFrame(() => {
    const game = live.current
    if (!game) return
    const on = game.phase === 'music' && !game.over
    // A little over two beats a second, which is the tune's tempo.
    const thump = on ? 1 + Math.abs(Math.sin(game.elapsed * 8.8)) * 0.12 : 1
    for (const rig of [left.current, right.current]) rig?.scale.set(thump, 1 / thump, thump)
  })
  // Standing on the floor at the far rim, well outside the running line, turned
  // in towards the middle. Off the edge they would hang over the sea.
  const at = FLOOR.radius - 0.7
  const spread = 0.8
  return (
    <>
      {([
        [-Math.sin(spread) * at, -Math.cos(spread) * at, left],
        [Math.sin(spread) * at, -Math.cos(spread) * at, right],
      ] as const).map(([x, z, ref], i) => (
        <group key={i} ref={ref} position={[x, 0, z]} rotation={[0, Math.atan2(-x, -z), 0]}>
          <mesh castShadow position={[0, 0.9, 0]}>
            <boxGeometry args={[1.1, 1.8, 0.9]} />
            <meshStandardMaterial color={PALETTE.speaker} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.2, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.33, 0.33, 0.04, 20]} />
            <meshStandardMaterial color={PALETTE.cone} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.55, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} />
            <meshStandardMaterial color={PALETTE.cone} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/**
 * One chair, sliding to where the ring wants it.
 *
 * It knows its own index and asks the game where that index stands now, which
 * is the whole of "the chairs close up": the ring shrinks, every chair's place
 * moves, and each one walks there over a few frames. A chair past the end of
 * the ring is gone - it drops through the floor rather than blinking out.
 */
function Chair({ index, live }: { index: number; live: RefObject<Game> }) {
  const rig = useRef<Group>(null)
  const glow = useRef<Mesh>(null)
  const primed = useRef(false)
  useFrame((_, dt) => {
    const g = rig.current
    const game = live.current
    if (!g || !game) return
    const there = index < game.chairs
    const at = chairAt(game.chairs, index)
    const sunk = there ? 0 : -1.6
    if (!primed.current) {
      g.position.set(at.x, sunk, at.z)
      g.rotation.y = at.facing
      primed.current = true
    } else {
      const k = 1 - Math.exp(-CLOSE_RATE * Math.min(dt, 0.1))
      g.position.x += (at.x - g.position.x) * k
      g.position.z += (at.z - g.position.z) * k
      g.position.y += (sunk - g.position.y) * k
      const turn = Math.atan2(Math.sin(at.facing - g.rotation.y), Math.cos(at.facing - g.rotation.y))
      g.rotation.y += turn * k
    }
    g.visible = g.position.y > -1.5
    const ring = glow.current
    if (ring) {
      // A free chair, while the music is off: the only thing worth looking at.
      const free = there && game.phase === 'scramble' && sitter(game, index) < 0
      ring.visible = free
      if (free) {
        ;(ring.material as MeshBasicMaterial).opacity = 0.35 + Math.abs(Math.sin(game.elapsed * 7)) * 0.4
        ring.scale.setScalar(1 + Math.sin(game.elapsed * 7) * 0.06)
      }
    }
  })
  return (
    <group ref={rig}>
      <mesh ref={glow} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[CHAIR.radius + 0.18, CHAIR.radius + 0.42, 28]} />
        <meshBasicMaterial color={PALETTE.glow} transparent opacity={0.6} side={DoubleSide} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, SEAT.height, 0]}>
        <boxGeometry args={[SEAT.width, SEAT.thickness, SEAT.width]} />
        <meshStandardMaterial color={PALETTE.chair} roughness={0.8} />
      </mesh>
      {/* The back is on the inside of the ring, so everybody sits facing out. */}
      <mesh castShadow position={[0, SEAT.height + SEAT.back / 2, -SEAT.width / 2 + SEAT.thickness / 2]}>
        <boxGeometry args={[SEAT.width, SEAT.back, SEAT.thickness]} />
        <meshStandardMaterial color={PALETTE.chair} roughness={0.8} />
      </mesh>
      {([
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const).map(([sx, sz], i) => (
        <mesh key={i} castShadow position={[(sx * SEAT.width) / 2.6, SEAT.height / 2, (sz * SEAT.width) / 2.6]}>
          <cylinderGeometry args={[0.045, 0.045, SEAT.height, 6]} />
          <meshStandardMaterial color={PALETTE.chairFrame} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * One player: the island's pill in their colour, running while the music plays,
 * dropped into a chair when they sit, reeling on the spot while stunned, and
 * gone from the floor once they are out.
 */
function PlayerBody({ index, live, colour }: { index: number; live: RefObject<Game>; colour: string }) {
  const rig = useRef<Group>(null)
  const squash = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  useFrame(({ clock }) => {
    const g = rig.current
    const game = live.current
    const p: Player | undefined = game?.players[index]
    if (!g || !game || !p) return
    // Whoever has just gone out stays until the result has been read.
    const shown = isIn(p) || (p.out === game.round && game.phase === 'result')
    g.visible = shown
    if (!shown) return
    const t = clock.elapsedTime
    const reel = p.stunned > 0 ? Math.min(1, p.stunned * 3) : 0
    const sitting = p.seat !== null
    g.position.set(p.x, sitting ? SEAT.height - 0.06 : 0, p.z)
    g.rotation.set(Math.sin(t * 17) * 0.2 * reel, p.facing + reel * t * 8, Math.cos(t * 13) * 0.2 * reel)
    const s = squash.current
    if (s) {
      // Sitting squashes the pill onto the seat; a sitter who is not yet safe
      // fidgets, and stops the moment they are.
      const bob = sitting && !isSafe(game, p) ? Math.sin(t * 9) * 0.02 : 0
      s.scale.set(1, (sitting ? SIT_SQUASH : 1) + bob, 1)
    }
  })
  return (
    <group ref={rig}>
      <group ref={squash}>
        <primitive object={avatar} />
      </group>
    </group>
  )
}

/** A ring under your own body, so you can find yourself among eight. */
function YouMarker({ index, live }: { index: number; live: RefObject<Game> }) {
  const ring = useRef<Mesh>(null)
  useFrame(() => {
    const m = ring.current
    const game = live.current
    const p = game?.players[index]
    if (!m || !game || !p) return
    m.visible = isIn(p)
    m.position.set(p.x, (p.seat !== null ? SEAT.height : 0) + 0.05, p.z)
  })
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.52, 0.66, 28]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
    </mesh>
  )
}

export function MusicalMayhemScene({ live }: { live: RefObject<Game> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const mineIndex = game.players.findIndex((p) => p.mine)
  // As many chairs as the first round had: the ones that go sink and stay sunk.
  const chairs = Math.max(0, game.players.length - 1)
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 190]} />
      <FixedCamera />
      <Daylight />
      <Floor />
      <Speakers live={live} />
      {Array.from({ length: chairs }, (_, i) => (
        <Chair key={`${game.id}:${i}`} index={i} live={live} />
      ))}
      {mineIndex >= 0 ? <YouMarker key={`${game.id}:you`} index={mineIndex} live={live} /> : null}
      {game.players.map((p, index) => (
        <PlayerBody key={`${game.id}:${p.id}`} index={index} live={live} colour={colours[index]} />
      ))}
    </>
  )
}
