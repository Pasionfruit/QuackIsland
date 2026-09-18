/**
 * Feeding Time in three dimensions.
 *
 * Grass, a pond with a sandy edge and reeds, ducks paddling their loops, and
 * everybody on the near bank as the island's own pill in their colour, facing
 * the water. Crackers arc out from whoever threw them and land with a ripple;
 * a duck that gets one dips its head to eat, and a ring in the thrower's colour
 * spreads round it. Your aim is drawn on the ground: a line from your spot out
 * towards the pointer, a ring at the pointer, and - while the button is held -
 * a marker in your colour where the throw would land at the power held.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createRng, hashSeed } from '../../00-core'
import { createAvatar } from '../../02-player'
import { frameScene } from './camera'
import { COLOURS, POND, aimThrow, duckAt, ducksFor, landing, spotOf, type Cracker, type Game, type Point } from './rules'

export const PALETTE = {
  background: '#bfe4f2',
  grass: '#86c261',
  sand: '#e2cf9a',
  water: '#3f9fd0',
  reed: '#5f8c3a',
  duckBody: '#f4f1e8',
  duckWing: '#b69372',
  duckHead: '#2f8a4f',
  beak: '#f2a33a',
  cracker: '#e0b56a',
  sunColour: '#fff3e0',
  ambientColour: '#e8f3ff',
  skyColour: '#dff0ff',
  groundColour: '#6f8a4f',
} as const

export interface SceneHands {
  /** This browser's own cracker the host has not taken yet. */
  pending: () => Cracker | null
  /** Your aim: your spot, the point under the pointer, and the power held - null when not held. */
  aim: () => { from: Point; target: Point; power: number | null } | null
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

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 90 })
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-10, 26, 8]} intensity={2.1} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The grass, the pond and its sandy edge, and clumps of reeds round the far side. */
const Pond = memo(function Pond() {
  const reeds = useMemo(() => {
    const random = createRng(hashSeed(1, 'feeding-time:reeds'))
    return Array.from({ length: 70 }, () => {
      // Round the far half of the pond, just outside the water.
      const a = Math.PI + random() * Math.PI
      const r = 1.04 + random() * 0.12
      return {
        x: Math.cos(a) * POND.radiusX * r,
        z: POND.centreZ + Math.sin(a) * POND.radiusZ * r,
        h: 0.8 + random() * 1.2,
        lean: (random() - 0.5) * 0.4,
      }
    })
  }, [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, POND.centreZ / 2]} receiveShadow>
        <planeGeometry args={[140, 110]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, POND.centreZ]} scale={[POND.radiusX + 0.9, POND.radiusZ + 0.9, 1]} receiveShadow>
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, POND.centreZ]} scale={[POND.radiusX, POND.radiusZ, 1]} receiveShadow>
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial color={PALETTE.water} roughness={0.2} metalness={0.1} />
      </mesh>
      {reeds.map((reed, i) => (
        <mesh key={i} position={[reed.x, reed.h / 2, reed.z]} rotation={[reed.lean, 0, reed.lean]} castShadow>
          <cylinderGeometry args={[0.03, 0.05, reed.h, 5]} />
          <meshStandardMaterial color={PALETTE.reed} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
})

/** One duck, paddling its loop, dipping its head while it eats. */
function DuckBody({ index, live }: { index: number; live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const head = useRef<Group>(null)
  useFrame(({ clock }) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const duck = ducksFor(g.seed, g.eating.length)[index]
    if (!duck) return
    const at = duckAt(duck, g.elapsed)
    const eating = g.eating[index] > g.elapsed
    group.position.set(at.x, 0.02 + Math.sin(clock.elapsedTime * 3 + index) * 0.03, at.z)
    // Heading in the pond's x/z, as a turn about up: the duck's beak points along +x before turning.
    group.rotation.set(0, -at.heading, 0)
    if (head.current) head.current.rotation.z = eating ? -0.9 + Math.sin(clock.elapsedTime * 14) * 0.25 : 0
  })
  return (
    <group ref={holder}>
      <mesh position={[0, 0.28, 0]} scale={[1.35, 0.7, 0.9]} castShadow>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color={PALETTE.duckBody} roughness={0.7} />
      </mesh>
      <mesh position={[-0.08, 0.36, 0]} scale={[1.1, 0.45, 0.95]}>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshStandardMaterial color={PALETTE.duckWing} roughness={0.8} />
      </mesh>
      <group ref={head} position={[0.38, 0.42, 0]}>
        <mesh position={[0.06, 0.2, 0]} castShadow>
          <sphereGeometry args={[0.19, 14, 10]} />
          <meshStandardMaterial color={PALETTE.duckHead} roughness={0.5} />
        </mesh>
        <mesh position={[0.28, 0.17, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.07, 0.2, 8]} />
          <meshStandardMaterial color={PALETTE.beak} roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

/** One cracker: in the air on its arc, floating where it landed, or gone into a duck. */
function CrackerView({ cracker, live }: { cracker: Cracker; live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const ripple = useRef<Group>(null)
  const rippleMaterial = useRef<MeshBasicMaterial>(null)
  const colour = COLOURS[cracker.player % COLOURS.length]
  useFrame(() => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const now = g.elapsed
    const span = Math.max(0.01, cracker.lands - cracker.at)
    const t = Math.min(1, Math.max(0, (now - cracker.at) / span))
    const distance = Math.hypot(cracker.to.x - cracker.from.x, cracker.to.z - cracker.from.z)
    const x = cracker.from.x + (cracker.to.x - cracker.from.x) * t
    const z = cracker.from.z + (cracker.to.z - cracker.from.z) * t
    const y = 1.3 * (1 - t) + 0.06 + Math.sin(t * Math.PI) * (1.2 + distance * 0.22)
    const landed = now >= cracker.lands
    const fedDuck = cracker.fed !== null && cracker.fed >= 0
    group.visible = !(landed && fedDuck)
    group.position.set(x, landed ? 0.06 : y, z)
    group.rotation.set(t * 9, t * 5, 0)
    const box = ripple.current
    if (box && rippleMaterial.current) {
      const age = now - cracker.lands
      box.visible = landed && age < 0.8
      if (box.visible) {
        let at = cracker.to
        if (fedDuck && cracker.fed !== null) {
          const duck = ducksFor(g.seed, g.eating.length)[cracker.fed]
          if (duck) at = duckAt(duck, now)
        }
        box.position.set(at.x, 0.04, at.z)
        box.scale.setScalar(0.4 + age * (fedDuck ? 2.4 : 1.2))
        rippleMaterial.current.opacity = 1 - age / 0.8
        rippleMaterial.current.color.set(fedDuck ? colour : '#ffffff')
      }
    }
  })
  return (
    <>
      <group ref={holder}>
        <mesh castShadow>
          <boxGeometry args={[0.28, 0.06, 0.28]} />
          <meshStandardMaterial color={PALETTE.cracker} roughness={0.8} />
        </mesh>
      </group>
      <group ref={ripple} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 28]} />
          <meshBasicMaterial ref={rippleMaterial} transparent opacity={1} />
        </mesh>
      </group>
    </>
  )
}

/** How many dots make the aim line. */
const AIM_DOTS = 24

/** Your aim on the ground: dots out towards the pointer, a ring at it, and where the power held would land. */
function AimView({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const dots = useRef<Group>(null)
  const reticle = useRef<Group>(null)
  const lands = useRef<Group>(null)
  const landsMaterial = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const aim = hands.aim()
    const g = live.current
    const me = g.players.findIndex((p) => p.mine)
    const line = dots.current
    if (!line || !reticle.current || !lands.current) return
    const shown = !!aim && me >= 0
    line.visible = shown
    reticle.current.visible = shown
    lands.current.visible = shown && aim.power !== null
    if (!shown) return
    const thrown = aimThrow(aim.from, aim.target, aim.power ?? 0)
    // The line reaches the pointer, or the throw's landing if that is further.
    const reach = Math.min(POND.distance[1], Math.max(Math.hypot(aim.target.x - aim.from.x, aim.target.z - aim.from.z), aim.power === null ? 0 : thrown.distance))
    const drift = (clock.elapsedTime * 1.5) % 1
    line.children.forEach((dot, i) => {
      const at = landing(aim.from, { angle: thrown.angle, distance: ((i + drift) / AIM_DOTS) * reach })
      dot.position.set(at.x, 0.05, at.z)
    })
    reticle.current.position.set(aim.target.x, 0.05, aim.target.z)
    if (aim.power !== null) {
      const at = landing(aim.from, thrown)
      lands.current.position.set(at.x, 0.06, at.z)
      if (landsMaterial.current) landsMaterial.current.color.set(COLOURS[me % COLOURS.length])
    }
  })
  return (
    <>
      <group ref={dots} visible={false}>
        {Array.from({ length: AIM_DOTS }, (_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <group ref={reticle} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[POND.feed * 0.8, POND.feed * 0.8 + 0.12, 36]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </group>
      <group ref={lands} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.55, 28]} />
          <meshBasicMaterial ref={landsMaterial} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}

/** Everybody on the bank, facing the water, a ring under your own spot. */
function Feeders({ live }: { live: RefObject<Game> }) {
  const g = live.current
  return (
    <>
      {g.players.map((feeder, index) => (
        <FeederBody key={`${g.id}:${feeder.id}`} index={index} count={g.players.length} mine={feeder.mine} />
      ))}
    </>
  )
}

const FeederBody = memo(function FeederBody({ index, count, mine }: { index: number; count: number; mine: boolean }) {
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const spot = spotOf(index, count)
  return (
    <group position={[spot.x, 0, spot.z]}>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={avatar} />
      </group>
      {mine ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.55, 0.75, 28]} />
          <meshBasicMaterial color={colour} />
        </mesh>
      ) : null}
    </group>
  )
})

export function FeedingTimeScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const pending = hands.pending()
  const crackers = pending ? [...game.crackers, pending] : game.crackers
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 150]} />
      <FixedCamera />
      <Daylight />
      <Pond />
      {game.players.length > 0 ? game.eating.map((_, i) => <DuckBody key={`${game.id}:${i}`} index={i} live={live} />) : null}
      <Feeders live={live} />
      <AimView live={live} hands={hands} />
      {crackers.map((cracker) => (
        <CrackerView key={`${game.id}:${cracker.id}`} cracker={cracker} live={live} />
      ))}
    </>
  )
}
