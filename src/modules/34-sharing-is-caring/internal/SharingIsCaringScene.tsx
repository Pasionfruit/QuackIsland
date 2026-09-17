/**
 * Sharing Is Caring in three dimensions, lit and dressed like the island.
 *
 * A round arena of sand with a low wall, floating over the sea; everybody in it
 * as the island's own pill in their colour; and a gold crown that spins over a
 * glowing disc in the middle until somebody takes it, then rides on their head.
 * When it changes hands it hops across rather than blinking, so a steal is
 * something you see.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, DoubleSide, Group, type DirectionalLight, type Mesh, type MeshBasicMaterial } from 'three'
import { PLAYER, createAvatar } from '../../02-player'
import { frameScene } from './camera'
import { ARENA, COLOURS, canTake, holderOf, type Round, type Wearer } from './rules'

export const PALETTE = {
  sand: '#d0bd90',
  wall: '#b9a476',
  rock: '#7d6a58',
  sea: '#3f9fc4',
  background: '#9fc4dd',
  gold: '#ffc83a',
  goldGlow: '#ffb000',
  jewel: '#d8344a',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
} as const

/** How high the crown floats in the middle, and how high it sits on a head. */
const FLOAT_Y = 0.9
const HEAD_Y = PLAYER.height + 0.02
/** How quickly the crown hops to where it belongs, per second. */
const HOP_RATE = 12
const WALL_HEIGHT = 0.55

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

/** The arena: a sand floor, a low wall round it, a rock underneath, the sea far below. */
const Arena = memo(function Arena() {
  return (
    <group>
      <mesh position={[0, -14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color={PALETTE.sea} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <cylinderGeometry args={[ARENA.radius + 0.25, ARENA.radius + 0.25, 0.8, 64]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ARENA.radius + 0.1, ARENA.radius + 0.1, WALL_HEIGHT, 64, 1, true]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} side={DoubleSide} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ARENA.radius + 0.1, 0.12, 8, 64]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      <mesh position={[0, -4, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[ARENA.radius * 0.97, 6.4, 40]} />
        <meshStandardMaterial color={PALETTE.rock} roughness={1} />
      </mesh>
    </group>
  )
})

/** A heading in the rules' flat x/y, as a turn about the world's up axis. */
function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

function PlayerBody({ player, index }: { player: Wearer; index: number }) {
  const holder = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  useFrame(() => {
    const group = holder.current
    if (!group) return
    group.position.set(player.x, 0, player.y)
    group.rotation.set(0, headingToYaw(player.facing), 0)
  })
  return (
    <group ref={holder}>
      <primitive object={avatar} />
    </group>
  )
}

const SPIKES = 5

/** A crown from primitives: a band, five points with a ball on each, and a jewel on the front. */
const CrownModel = memo(function CrownModel() {
  const band = 0.3
  return (
    <group>
      <mesh castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[band, band * 0.92, 0.2, 24, 1, true]} />
        <meshStandardMaterial color={PALETTE.gold} metalness={0.6} roughness={0.3} emissive={PALETTE.goldGlow} emissiveIntensity={0.25} side={DoubleSide} />
      </mesh>
      {Array.from({ length: SPIKES }, (_, i) => {
        const a = (i / SPIKES) * Math.PI * 2
        const x = Math.sin(a) * band * 0.95
        const z = Math.cos(a) * band * 0.95
        return (
          <group key={i} position={[x, 0.3, z]}>
            <mesh castShadow>
              <coneGeometry args={[0.08, 0.22, 8]} />
              <meshStandardMaterial color={PALETTE.gold} metalness={0.6} roughness={0.3} emissive={PALETTE.goldGlow} emissiveIntensity={0.25} />
            </mesh>
            <mesh position={[0, 0.13, 0]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshStandardMaterial color={PALETTE.gold} metalness={0.6} roughness={0.3} emissive={PALETTE.goldGlow} emissiveIntensity={0.4} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.1, band * 0.97]}>
        <sphereGeometry args={[0.06, 12, 8]} />
        <meshStandardMaterial color={PALETTE.jewel} roughness={0.2} emissive={PALETTE.jewel} emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
})

/**
 * The crown, where it belongs: spinning over the middle until somebody takes it,
 * then on their head. Blinks while it cannot be taken, so a player can see why
 * a bump just now did nothing.
 */
function Crown({ live }: { live: RefObject<Round> }) {
  const group = useRef<Group>(null)
  const scale = useRef<Group>(null)
  const primed = useRef(false)
  useFrame((_, dt) => {
    const g = group.current
    const round = live.current
    if (!g || !round) return
    const wearer = holderOf(round)
    const t = round.elapsed
    const tx = wearer ? wearer.x : 0
    const tz = wearer ? wearer.y : 0
    const ty = wearer ? HEAD_Y : FLOAT_Y + Math.sin(t * 2.4) * 0.12
    if (!primed.current) {
      g.position.set(tx, ty, tz)
      primed.current = true
    } else {
      const k = 1 - Math.exp(-HOP_RATE * Math.min(dt, 0.1))
      const far = Math.hypot(tx - g.position.x, tz - g.position.z)
      g.position.x += (tx - g.position.x) * k
      g.position.z += (tz - g.position.z) * k
      // An arc on the way over, so a steal reads as the crown hopping heads.
      g.position.y += (ty + Math.min(1.2, far * 0.6) - g.position.y) * k
    }
    g.rotation.y += dt * (wearer ? 0.8 : 1.6)
    const s = scale.current
    if (s) {
      const size = wearer ? 1 : 1.5
      s.scale.setScalar(size)
      s.visible = canTake(round) || Math.floor(t * 10) % 2 === 0
    }
  })
  return (
    <group ref={group}>
      <group ref={scale}>
        <CrownModel />
      </group>
    </group>
  )
}

/** A glowing disc where the crown waits, gone once somebody has it. */
function Pedestal({ live }: { live: RefObject<Round> }) {
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    const m = mesh.current
    const round = live.current
    if (!m || !round) return
    m.visible = round.holder === null
    ;(m.material as MeshBasicMaterial).opacity = 0.45 + Math.sin(round.elapsed * 3) * 0.15
  })
  return (
    <mesh ref={mesh} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[ARENA.crown + ARENA.body, 32]} />
      <meshBasicMaterial color={PALETTE.gold} transparent opacity={0.5} />
    </mesh>
  )
}

/** A gold ring under whoever wears the crown, so it can be found at a glance. */
function WearerRing({ live }: { live: RefObject<Round> }) {
  const ring = useRef<Mesh>(null)
  useFrame(() => {
    const m = ring.current
    const round = live.current
    if (!m || !round) return
    const wearer = holderOf(round)
    m.visible = wearer !== null
    if (!wearer) return
    m.position.set(wearer.x, 0.05, wearer.y)
    m.scale.setScalar(1 + Math.sin(round.elapsed * 6) * 0.08)
  })
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[ARENA.body * 1.9, ARENA.body * 2.4, 32]} />
      <meshBasicMaterial color={PALETTE.gold} />
    </mesh>
  )
}

/** A ring under your own body, so you can find yourself among eight. */
function YouMarker({ player, index }: { player: Wearer; index: number }) {
  const ring = useRef<Group>(null)
  useFrame(() => {
    if (!ring.current) return
    ring.current.position.set(player.x, 0.04, player.y)
  })
  return (
    <group ref={ring}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA.body * 1.2, ARENA.body * 1.6, 28]} />
        <meshBasicMaterial color={COLOURS[index % COLOURS.length]} />
      </mesh>
    </group>
  )
}

export function SharingIsCaringScene({ live }: { live: RefObject<Round> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const round = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const mineIndex = round.players.findIndex((p) => p.mine)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 180]} />
      <FixedCamera />
      <Daylight />
      <Arena />
      <Pedestal live={live} />
      <WearerRing live={live} />
      {mineIndex >= 0 ? <YouMarker player={round.players[mineIndex]} index={mineIndex} /> : null}
      {round.players.map((player, index) => (
        <PlayerBody key={`${round.id}:${player.id}`} player={player} index={index} />
      ))}
      {round.players.length > 0 ? <Crown key={round.id} live={live} /> : null}
    </>
  )
}
