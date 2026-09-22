/**
 * Make The Cut in three dimensions.
 *
 * A stone tower standing in the grass, a round wooden top, and a web of strings
 * from knobs round its rim out and up to tall poles standing round it. Everybody is the island's
 * own pill in their colour on the tower top; whoever's turn it is has a marker
 * over their head, and on your own turn a ring on the boards shows how far you
 * can reach.
 *
 * Strings look alike until they are cut. A string being cut strains first -
 * shivering harder, thinning and paling through the suspense - and then snaps: one end hangs from
 * the rim, the other from its pole - pale for a normal string, red for an
 * eliminating one, and whoever cut an eliminating one is launched off the tower,
 * spinning.
 *
 * The string under the pointer on your turn lights up: gold if you can reach
 * it, grey if you need to walk closer.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, Quaternion, Vector2, Vector3, type DirectionalLight, type Mesh, type MeshStandardMaterial } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { frameScene } from './camera'
import { COLOURS, TOWER, aimAt, inReach, webFor, whoseTurn, type Cutter, type Game, type Strand } from './rules'

export const PALETTE = {
  background: '#bfe0f0',
  grass: '#8cc063',
  stone: '#a59c8e',
  stoneDark: '#857c70',
  boards: '#c79a62',
  rim: '#8a6a44',
  knob: '#6b6f76',
  post: '#7a5a3a',
  rope: '#efe3c6',
  ropeCut: '#b9ad92',
  deadly: '#e0392f',
  aimed: '#ffcc33',
  farAimed: '#9aa4ad',
  reach: '#ffffff',
  sunColour: '#fff3e0',
  ambientColour: '#e8f3ff',
  skyColour: '#dff0ff',
  groundColour: '#7b8f5a',
} as const

const STRAINED = new Color('#ffffff')

/** How thick a string is drawn. Aiming allows for more - see `TOWER.aim`. */
const ROPE = 0.06
/** How long a snapped end hangs from the rim. */
const DANGLE = 1.6
/** How far a straining string shivers, at its worst. */
const SHIVER = 0.09
/** How long a launched cutter stays in view. */
const FLIGHT = 3

export interface SceneHands {
  /** Whether this browser can cut right now: its turn, not paused, nothing waiting. */
  canCut: () => boolean
  /** The string the pointer is on, written by the scene every frame, whoever's turn it is. */
  aimed: { current: number | null }
  onCut: (string: number) => void
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
    Object.assign(light.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 120 })
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-14, 34, 16]} intensity={2.2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The grass, the tower, its top and rim. */
const Tower = memo(function Tower() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <mesh position={[0, TOWER.height / 2 - 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TOWER.radius - 0.3, TOWER.radius + 0.4, TOWER.height - 0.4, 40]} />
        <meshStandardMaterial color={PALETTE.stone} roughness={0.95} />
      </mesh>
      {[1.5, 3.5, 5.5, 7.5].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[TOWER.radius + 0.42 - (y / TOWER.height) * 0.7, TOWER.radius + 0.42 - (y / TOWER.height) * 0.7, 0.12, 40]} />
          <meshStandardMaterial color={PALETTE.stoneDark} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, TOWER.height - 0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[TOWER.radius, TOWER.radius, 0.4, 48]} />
        <meshStandardMaterial color={PALETTE.boards} roughness={0.85} />
      </mesh>
      <mesh position={[0, TOWER.height + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TOWER.radius - 0.25, TOWER.radius, 48]} />
        <meshStandardMaterial color={PALETTE.rim} roughness={0.9} />
      </mesh>
    </group>
  )
})

/** Places a unit-long cylinder so it runs from `a` to `b`. */
function span(mesh: Mesh, a: Vector3, b: Vector3): void {
  const along = new Vector3().subVectors(b, a)
  const length = along.length()
  mesh.position.copy(a).addScaledVector(along, 0.5)
  mesh.scale.set(1, Math.max(0.001, length), 1)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), along.normalize()))
}

/**
 * One string, whole or snapped, with its knob on the rim and its pole.
 */
function StringView({ strand, index, live, hands }: { strand: Strand; index: number; live: RefObject<Game>; hands: SceneHands }) {
  const whole = useRef<Mesh>(null)
  const top = useRef<Mesh>(null)
  const bottom = useRef<Mesh>(null)
  const wholeMaterial = useRef<MeshStandardMaterial>(null)
  const topMaterial = useRef<MeshStandardMaterial>(null)
  const bottomMaterial = useRef<MeshStandardMaterial>(null)
  const strained = useRef(false)
  const rim = useMemo(() => new Vector3(strand.rim.x, strand.rim.y + 0.25, strand.rim.z), [strand])
  const end = useMemo(() => new Vector3(strand.end.x, strand.end.y + 0.2, strand.end.z), [strand])

  useLayoutEffect(() => {
    if (whole.current) span(whole.current, rim, end)
  }, [rim, end])

  useFrame(({ clock }) => {
    const g = live.current
    const cut = g.cut[index]
    if (whole.current) whole.current.visible = !cut
    if (top.current) top.current.visible = !!cut
    if (bottom.current) bottom.current.visible = !!cut
    if (!cut && g.phase === 'suspense' && g.pending?.string === index) {
      // Straining: shivering side to side, faster and harder, thinning as it frays.
      const t = Math.min(1, g.clock / TOWER.suspense)
      const strain = t * t
      const beat = clock.elapsedTime * (18 + 40 * strain)
      const across = new Vector3().subVectors(end, rim).cross(new Vector3(0, 1, 0)).normalize()
      if (whole.current) {
        span(whole.current, rim, end)
        whole.current.position.addScaledVector(across, Math.sin(beat) * SHIVER * (0.25 + strain))
        whole.current.position.y += Math.cos(beat * 1.3) * SHIVER * 0.5 * strain
        whole.current.scale.x = whole.current.scale.z = 1.6 - 0.9 * strain
      }
      wholeMaterial.current?.color.set(PALETTE.rope).lerp(STRAINED, strain)
      if (wholeMaterial.current) wholeMaterial.current.emissiveIntensity = 0
      strained.current = true
      return
    }
    if (!cut) {
      // Back in place if a strain ended without a snap - somebody left mid-suspense.
      if (strained.current && whole.current) span(whole.current, rim, end)
      strained.current = false
      const aimedHere = hands.aimed.current === index && hands.canCut()
      const mine = g.players.findIndex((p) => p.mine)
      const reachable = aimedHere && mine >= 0 && inReach(g, mine, index)
      wholeMaterial.current?.color.set(aimedHere ? (reachable ? PALETTE.aimed : PALETTE.farAimed) : PALETTE.rope)
      if (wholeMaterial.current) wholeMaterial.current.emissiveIntensity = aimedHere && reachable ? 0.6 : 0
      if (whole.current) whole.current.scale.x = whole.current.scale.z = aimedHere ? 2.2 : 1
      return
    }
    // Snapped: each end swings down, from the rim and from the pole.
    const age = Math.max(0, g.elapsed - cut.at)
    const fall = Math.min(1, age * 3)
    const outward = new Vector3(strand.rim.x, 0, strand.rim.z).normalize()
    const swing = Math.sin(clock.elapsedTime * 3 + index) * 0.15 * Math.exp(-age * 0.8)
    const hang = new Vector3()
      .copy(rim)
      .addScaledVector(outward, (0.6 + swing) * fall + (1 - fall) * 1.2)
      .add(new Vector3(0, -DANGLE * fall, 0))
    if (top.current) span(top.current, rim, hang)
    const toward = new Vector3().subVectors(rim, end).setY(0).normalize()
    const hangingFromPole = new Vector3()
      .copy(end)
      .addScaledVector(toward, (0.5 - swing) * fall + (1 - fall) * 1.2)
      .add(new Vector3(0, -DANGLE * fall, 0))
    if (bottom.current) span(bottom.current, end, hangingFromPole)
    const colour = cut.deadly ? PALETTE.deadly : PALETTE.ropeCut
    topMaterial.current?.color.set(colour)
    bottomMaterial.current?.color.set(colour)
  })

  return (
    <group>
      <mesh ref={whole} castShadow>
        <cylinderGeometry args={[ROPE, ROPE, 1, 6]} />
        <meshStandardMaterial ref={wholeMaterial} color={PALETTE.rope} emissive={PALETTE.aimed} emissiveIntensity={0} roughness={0.8} />
      </mesh>
      <mesh ref={top} visible={false}>
        <cylinderGeometry args={[ROPE, ROPE, 1, 6]} />
        <meshStandardMaterial ref={topMaterial} color={PALETTE.ropeCut} roughness={0.8} />
      </mesh>
      <mesh ref={bottom} visible={false}>
        <cylinderGeometry args={[ROPE, ROPE, 1, 6]} />
        <meshStandardMaterial ref={bottomMaterial} color={PALETTE.ropeCut} roughness={0.8} />
      </mesh>
      <mesh position={[strand.rim.x, strand.rim.y + 0.2, strand.rim.z]} castShadow>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color={PALETTE.knob} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[strand.end.x, (strand.end.y + 0.3) / 2, strand.end.z]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, strand.end.y + 0.3, 8]} />
        <meshStandardMaterial color={PALETTE.post} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A heading on the tower top's x/y, as a turn about the world's up axis. */
function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

/**
 * One cutter: on the tower top, or - out on an eliminating string - launched
 * outward and up, spinning, and down into the grass beyond the web.
 */
function CutterBody({ cutter, index, live, colour }: { cutter: Cutter; index: number; live: RefObject<Game>; colour: string }) {
  const holder = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(({ clock }) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    let x = cutter.x
    let y: number = TOWER.height
    let z = cutter.y
    let spin = 0
    if (cutter.out) {
      const t = Math.max(0, g.elapsed - cutter.out.at)
      group.visible = cutter.out.string >= 0 && t < FLIGHT
      const away = Math.atan2(cutter.y, cutter.x)
      const dx = Math.hypot(cutter.x, cutter.y) < 0.01 ? 1 : Math.cos(away)
      const dz = Math.hypot(cutter.x, cutter.y) < 0.01 ? 0 : Math.sin(away)
      x += dx * t * 7
      z += dz * t * 7
      y = Math.max(0.2, TOWER.height + 9 * t - 7 * t * t)
      spin = t * 10
    } else {
      group.visible = true
    }
    group.position.set(x, y, z)
    group.rotation.set(spin, headingToYaw(cutter.facing), spin * 0.4)

    if (marker.current) {
      marker.current.visible = !cutter.out && whoseTurn(g) === index
      marker.current.position.set(x, y + 2.3 + Math.sin(clock.elapsedTime * 4) * 0.15, z)
      marker.current.rotation.y = clock.elapsedTime * 2
    }
  })

  return (
    <>
      <group ref={holder}>
        <primitive object={avatar} />
      </group>
      <group ref={marker} visible={false}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.32, 0.6, 4]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
      </group>
    </>
  )
}

/** On your own turn, a ring on the boards showing how far you can reach. */
function ReachRing({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const ring = useRef<Group>(null)
  useFrame(() => {
    const box = ring.current
    if (!box) return
    const g = live.current
    const mine = g.players.find((p) => p.mine)
    box.visible = !!mine && !mine.out && hands.canCut()
    if (mine) box.position.set(mine.x, TOWER.height + 0.03, mine.y)
  })
  return (
    <group ref={ring} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TOWER.reach - 0.06, TOWER.reach, 64]} />
        <meshBasicMaterial color={PALETTE.reach} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

/** The pointer and clicks, turned into a string. */
function Aim({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const { camera, gl } = useThree()
  const ndc = useRef<Vector2 | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }
    const move = (e: PointerEvent) => {
      ndc.current = at(e)
    }
    const leave = () => {
      ndc.current = null
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !hands.canCut()) return
      const point = at(e)
      const direction = new Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
      const string = aimAt(live.current, camera.position, direction)
      if (string !== null) hands.onCut(string)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
    }
  }, [camera, gl, hands, live])

  useFrame(() => {
    const point = ndc.current
    if (!point) {
      hands.aimed.current = null
      return
    }
    const direction = new Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
    hands.aimed.current = aimAt(live.current, camera.position, direction)
  })
  return null
}

export function MakeTheCutScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const web = game.players.length > 0 ? webFor(game.seed, game.count) : []
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 70, 160]} />
      <FixedCamera />
      <Daylight />
      <Tower />
      {web.map((strand, index) => (
        <StringView key={`${game.id}:${game.seed}:${index}`} strand={strand} index={index} live={live} hands={hands} />
      ))}
      {game.players.map((cutter, index) => (
        <CutterBody key={`${game.id}:${cutter.id}`} cutter={cutter} index={index} live={live} colour={colours[index]} />
      ))}
      <ReachRing live={live} hands={hands} />
      <Aim live={live} hands={hands} />
    </>
  )
}
