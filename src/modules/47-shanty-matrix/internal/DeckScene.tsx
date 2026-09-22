/**
 * Shanty Matrix in three dimensions, from above and behind.
 *
 * A pirate ship on a bright sea, rocking gently: a planked main deck inside low
 * rails - the arena - with a forecastle, a mast and a black flag at the bow to
 * the north, a raised quarterdeck and the wheel at the stern, and cannons poking
 * out along both sides. Enemy ships sit round the horizon.
 *
 * **Every cannonball is telegraphed.** The moment one is fired its lane lights
 * up red across the deck, as wide as the ball, with an arrow at the end it comes
 * in from, and the ball comes down out of a puff of smoke over the sea; a second
 * later it lands at the rail, rolls across the planks and flies off the far side
 * into the sea with a splash. The lanes and the balls come from the seed and the
 * clock alone, so every screen draws the same ones at the same moment.
 *
 * Everybody is the island's capsule in their colour; you have a white ring at
 * your feet and a faint arc in front of you as far as a shove reaches. A ball
 * flings whoever it hits tumbling over the rail and into the sea.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { DECK, SHOT, activeShots, ballAt, barrageFor, type Shot } from './deck'
import { COLOURS, PUSH, clock, isStanding, type Game } from './rules'

export const PALETTE = {
  sky: '#9fd6f2',
  sea: '#1f78a8',
  seaDeep: '#155d86',
  foam: '#e8f6ff',
  plank: '#b07b4a',
  plankDark: '#9a6a3e',
  hull: '#5b3620',
  hullDark: '#3f2515',
  rail: '#7a4b2a',
  iron: '#2a2a30',
  lane: '#ff3b30',
  smoke: '#f3eee6',
  sail: '#f1e6cf',
  flag: '#15131a',
} as const

/** Where the sea is, below the deck. */
export const SEA_Y = -2.2
/** How high the hull's sides stand above the waterline. */
const FREEBOARD = -SEA_Y

const shipShape = (() => {
  // In the shape's own plane: x is east, y is north (-Z), so the bow points up.
  const w = DECK.halfX + 0.7
  const stern = DECK.halfZ + 3.4
  const bowStart = DECK.halfZ + 1
  const shape = new Shape()
  shape.moveTo(-w, -stern)
  shape.lineTo(w, -stern)
  shape.lineTo(w, bowStart)
  shape.quadraticCurveTo(w, DECK.halfZ + 5, 0, DECK.halfZ + 8)
  shape.quadraticCurveTo(-w, DECK.halfZ + 5, -w, bowStart)
  shape.closePath()
  return shape
})()

let plankTexture: CanvasTexture | null = null

/** Planks running bow to stern, a quarter of a metre wide, with joins staggered along them. */
function planks(): CanvasTexture {
  if (plankTexture) return plankTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const c = canvas.getContext('2d')!
  const shades = ['#b07b4a', '#a8744399', '#b8844f', '#a5703f']
  for (let i = 0; i < 4; i++) {
    c.fillStyle = PALETTE.plank
    c.fillRect(i * 32, 0, 32, 256)
    c.fillStyle = shades[i]
    c.fillRect(i * 32, 0, 32, 256)
    c.fillStyle = PALETTE.plankDark
    c.fillRect(i * 32, 0, 2, 256)
    c.fillRect(i * 32, (i * 67) % 256, 32, 2)
  }
  plankTexture = new CanvasTexture(canvas)
  plankTexture.colorSpace = SRGBColorSpace
  plankTexture.wrapS = RepeatWrapping
  plankTexture.wrapT = RepeatWrapping
  // The shape's UVs are metres: one tile a metre across and two long.
  plankTexture.repeat.set(1, 0.5)
  return plankTexture
}

let waveTexture: CanvasTexture | null = null

/** Glints on the water, scrolled slowly so the sea moves. */
function waves(): CanvasTexture {
  if (waveTexture) return waveTexture
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.sea
  c.fillRect(0, 0, 256, 256)
  // A fixed scatter, not Math.random: the same sea every time.
  let n = 12345
  const next = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 90; i++) {
    c.fillStyle = next() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(10,60,100,0.25)'
    c.fillRect(next() * 256, next() * 256, 8 + next() * 26, 2)
  }
  waveTexture = new CanvasTexture(canvas)
  waveTexture.colorSpace = SRGBColorSpace
  waveTexture.wrapS = RepeatWrapping
  waveTexture.wrapT = RepeatWrapping
  waveTexture.repeat.set(40, 40)
  return waveTexture
}

const want = new Vector3()
const look = new Vector3()
const looking = new Vector3()

function Rig({ live }: { live: RefObject<Game> }) {
  const placed = useRef(false)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const me = g.players.find((p) => p.mine)
    const watching = !me || !isStanding(me)
    if (watching) {
      look.set(0, 0, 0.5)
      want.set(0, 23, 17)
    } else {
      // The whole deck in view, leaning a little towards you.
      look.set(me.x * 0.2, 0, me.z * 0.2 + 0.8)
      want.set(me.x * 0.2, 20, me.z * 0.2 + 15)
    }
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 2 : 4))
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

function Sea() {
  const texture = useMemo(() => waves(), [])
  useFrame((_, delta) => {
    texture.offset.x = (texture.offset.x + Math.min(delta, 0.1) * 0.012) % 1
    texture.offset.y = (texture.offset.y + Math.min(delta, 0.1) * 0.02) % 1
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial map={texture} roughness={0.35} metalness={0.1} />
    </mesh>
  )
}

/** A sail: a cream sheet, bellied a little by bending its middle forward. */
function Sail({ width, height, y, z }: { width: number; height: number; y: number; z: number }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(width, height, 8, 4)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (width / 2)
      pos.setZ(i, -(1 - x * x) * 0.6)
    }
    g.computeVertexNormals()
    return g
  }, [width, height])
  return (
    <mesh geometry={geometry} position={[0, y, z]} castShadow>
      <meshStandardMaterial color={PALETTE.sail} side={DoubleSide} roughness={0.9} />
    </mesh>
  )
}

/** The ship: hull, planked deck, rails, forecastle and mast, quarterdeck and wheel, cannons. */
function Ship() {
  const { halfX, halfZ, rail } = DECK
  const hull = useMemo(() => new ExtrudeGeometry(shipShape, { depth: FREEBOARD + 1.2, bevelEnabled: false }), [])
  const deck = useMemo(() => new ShapeGeometry(shipShape), [])
  const posts = useMemo(() => {
    const out: [number, number][] = []
    for (let x = -halfX; x <= halfX + 1e-6; x += halfX / 5) out.push([x, -halfZ - 0.1], [x, halfZ + 0.1])
    for (let z = -halfZ + halfZ / 7; z < halfZ - 1e-6; z += halfZ / 7) out.push([-halfX - 0.1, z], [halfX + 0.1, z])
    return out
  }, [halfX, halfZ])
  const railMat = { color: PALETTE.rail, roughness: 0.8 }
  const bowZ = -halfZ - 3
  const sternZ = halfZ + 1.9
  return (
    <group>
      <mesh geometry={hull} rotation={[-Math.PI / 2, 0, 0]} position={[0, -FREEBOARD - 1.2 - 0.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.hull} roughness={0.85} />
      </mesh>
      <mesh geometry={deck} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial map={planks()} roughness={0.9} />
      </mesh>
      {/* A dark line round the waterline. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y + 0.02, 0]} scale={[1.04, 1.03, 1]}>
        <shapeGeometry args={[shipShape]} />
        <meshBasicMaterial color={PALETTE.hullDark} />
      </mesh>

      {/* The rails round the main deck. */}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, rail / 2, z]} castShadow>
          <boxGeometry args={[0.16, rail, 0.16]} />
          <meshStandardMaterial {...railMat} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (halfX + 0.1), rail, 0]} castShadow>
            <boxGeometry args={[0.22, 0.14, halfZ * 2 + 0.4]} />
            <meshStandardMaterial {...railMat} />
          </mesh>
          <mesh position={[0, rail, s * (halfZ + 0.1)]} castShadow>
            <boxGeometry args={[halfX * 2 + 0.4, 0.14, 0.22]} />
            <meshStandardMaterial {...railMat} />
          </mesh>
        </group>
      ))}

      {/* The forecastle, the mast and the flag, at the bow. */}
      <mesh position={[0, 0.5, -halfZ - 2]} castShadow receiveShadow>
        <boxGeometry args={[10, 1, 3]} />
        <meshStandardMaterial color={PALETTE.plankDark} roughness={0.9} />
      </mesh>
      <mesh position={[0, 7, bowZ]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 14, 12]} />
        <meshStandardMaterial color={PALETTE.hullDark} roughness={0.8} />
      </mesh>
      <mesh position={[0, 9.8, bowZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 9, 8]} />
        <meshStandardMaterial color={PALETTE.hullDark} />
      </mesh>
      <mesh position={[0, 5.2, bowZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 10, 8]} />
        <meshStandardMaterial color={PALETTE.hullDark} />
      </mesh>
      <Sail width={8.4} height={4.3} y={7.6} z={bowZ - 0.2} />
      <mesh position={[0, 12.2, bowZ]}>
        <cylinderGeometry args={[0.7, 0.55, 0.6, 12, 1, true]} />
        <meshStandardMaterial color={PALETTE.hullDark} side={DoubleSide} />
      </mesh>
      <Flag at={[0.9, 13.4, bowZ]} />

      {/* The quarterdeck and the wheel, at the stern. */}
      <mesh position={[0, 0.55, sternZ]} castShadow receiveShadow>
        <boxGeometry args={[halfX * 2 + 1.2, 1.1, 2.6]} />
        <meshStandardMaterial color={PALETTE.plankDark} roughness={0.9} />
      </mesh>
      <group position={[0, 1.9, sternZ + 0.2]}>
        <mesh>
          <torusGeometry args={[0.55, 0.06, 8, 24]} />
          <meshStandardMaterial color={PALETTE.rail} />
        </mesh>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} rotation={[0, 0, (k * Math.PI) / 4]}>
            <boxGeometry args={[1.5, 0.07, 0.07]} />
            <meshStandardMaterial color={PALETTE.rail} />
          </mesh>
        ))}
        <mesh position={[0, -0.5, 0.2]}>
          <boxGeometry args={[0.2, 1, 0.2]} />
          <meshStandardMaterial color={PALETTE.hullDark} />
        </mesh>
      </group>

      {/* Cannons out of both sides: the ship shoots back, or would. */}
      {[-1, 1].map((s) =>
        [-6, -2, 2, 6].map((z) => (
          <mesh key={`${s}:${z}`} position={[s * (halfX + 1.0), -0.5, z]} rotation={[0, 0, (s * Math.PI) / 2]} castShadow>
            <cylinderGeometry args={[0.2, 0.28, 1.3, 12]} />
            <meshStandardMaterial color={PALETTE.iron} metalness={0.5} roughness={0.45} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** A black flag with a white skull and bones, flapping. */
function Flag({ at }: { at: [number, number, number] }) {
  const flag = useRef<Group>(null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 80
    const c = canvas.getContext('2d')!
    c.fillStyle = PALETTE.flag
    c.fillRect(0, 0, 128, 80)
    c.fillStyle = '#ffffff'
    c.strokeStyle = '#ffffff'
    c.lineWidth = 8
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(40, 58)
    c.lineTo(88, 72)
    c.moveTo(88, 58)
    c.lineTo(40, 72)
    c.stroke()
    c.beginPath()
    c.arc(64, 34, 20, 0, Math.PI * 2)
    c.fill()
    c.fillRect(54, 44, 20, 14)
    c.fillStyle = PALETTE.flag
    c.beginPath()
    c.arc(56, 32, 5, 0, Math.PI * 2)
    c.arc(72, 32, 5, 0, Math.PI * 2)
    c.fill()
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  useFrame(({ clock: c }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(c.elapsedTime * 3) * 0.25
  })
  return (
    <group position={at}>
      <group ref={flag}>
        <mesh position={[0.8, 0, 0]}>
          <planeGeometry args={[1.6, 1]} />
          <meshStandardMaterial map={texture} side={DoubleSide} roughness={1} />
        </mesh>
      </group>
    </group>
  )
}

/** Ships round the horizon, dark and small, bobbing - who is doing the shooting. */
function Enemies() {
  const group = useRef<Group>(null)
  const ships = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ angle: (i / 6) * Math.PI * 2 + 0.4, r: 70 + (i % 3) * 9 })), [])
  useFrame(({ clock: c }) => {
    group.current?.children.forEach((child, i) => {
      child.position.y = SEA_Y + Math.sin(c.elapsedTime * 0.8 + i) * 0.3
      child.rotation.z = Math.sin(c.elapsedTime * 0.6 + i * 2) * 0.05
    })
  })
  return (
    <group ref={group}>
      {ships.map(({ angle, r }, i) => (
        <group key={i} position={[Math.cos(angle) * r, SEA_Y, Math.sin(angle) * r]} rotation={[0, -angle, 0]}>
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[3, 2, 10]} />
            <meshStandardMaterial color={PALETTE.hullDark} />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 9, 6]} />
            <meshStandardMaterial color={PALETTE.hullDark} />
          </mesh>
          <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[6, 4.5]} />
            <meshStandardMaterial color="#d8ccb4" side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const BALL = new SphereGeometry(1, 28, 18)
const LANE = new PlaneGeometry(1, 1)
const ARROW = new CircleGeometry(1, 3)
const PUFF = new SphereGeometry(1, 14, 10)
const SPLASH = new RingGeometry(0.7, 1, 32)

/** How many balls can be in the air at once, drawn. */
const POOL = 18
const AXIS = new Vector3()
const Q = new Quaternion()

interface Drawn {
  ball: Mesh
  lane: Mesh
  arrow: Mesh
  puff: Mesh
  splash: Mesh
}

/** When a ball flying off the deck reaches the sea, on the round's clock. */
function splashAt(shot: Shot): number {
  const past = Math.sqrt((shot.radius - SEA_Y) / SHOT.sink)
  return shot.fire + SHOT.warn + (shot.sOut - shot.sIn + past) / shot.speed
}

/**
 * The balls: each one's lane lit across the deck and an arrow where it comes in,
 * a puff of smoke where it appears, the ball itself rolling across, and a
 * splash where it goes into the sea.
 */
function Cannonballs({ live }: { live: RefObject<Game> }) {
  const pool = useMemo<Drawn[]>(
    () =>
      Array.from({ length: POOL }, () => {
        const ball = new Mesh(BALL, new MeshStandardMaterial({ color: PALETTE.iron, metalness: 0.55, roughness: 0.35 }))
        ball.castShadow = true
        const lane = new Mesh(LANE, new MeshBasicMaterial({ color: PALETTE.lane, transparent: true, depthWrite: false, side: DoubleSide }))
        lane.rotation.order = 'YXZ'
        lane.renderOrder = 2
        const arrow = new Mesh(ARROW, new MeshBasicMaterial({ color: PALETTE.lane, transparent: true, depthWrite: false, side: DoubleSide }))
        arrow.rotation.order = 'YXZ'
        arrow.renderOrder = 3
        const puff = new Mesh(PUFF, new MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, depthWrite: false }))
        const splash = new Mesh(SPLASH, new MeshBasicMaterial({ color: PALETTE.foam, transparent: true, depthWrite: false, side: DoubleSide }))
        splash.rotation.x = -Math.PI / 2
        for (const m of [ball, lane, arrow, puff, splash]) m.visible = false
        return { ball, lane, arrow, puff, splash }
      }),
    [],
  )
  useFrame(({ clock: c }) => {
    const g = live.current
    const t = clock(g)
    const ready = g.players.length > 0
    // Those in the air, and those that splashed down just now.
    const shots = ready ? activeShots(g.seed, t) : []
    if (ready) {
      const all = barrageFor(g.seed)
      for (const s of all) {
        if (s.fire > t) break
        const since = t - splashAt(s)
        if (since >= 0 && since < 1 && !shots.includes(s)) shots.push(s)
      }
    }
    pool.forEach((d, i) => {
      const shot = shots[i]
      if (!shot) {
        d.ball.visible = d.lane.visible = d.arrow.visible = d.puff.visible = d.splash.visible = false
        return
      }
      const ball = ballAt(shot, t)
      const yaw = Math.atan2(shot.dx, shot.dz)
      const sinceFire = t - shot.fire

      // The ball: out of the smoke, down onto the deck, rolling, off into the sea.
      d.ball.visible = !!ball && ball.y > SEA_Y - shot.radius
      if (ball && d.ball.visible) {
        d.ball.position.set(ball.x, ball.y, ball.z)
        d.ball.scale.setScalar(shot.radius * Math.min(1, 0.3 + sinceFire * 3))
        AXIS.set(shot.dz, 0, -shot.dx).normalize()
        Q.setFromAxisAngle(AXIS, ball.s / shot.radius)
        d.ball.quaternion.copy(Q)
      }

      // The lane: flickering in while it comes, steady as it crosses, gone once it is off the deck.
      const s = ball ? ball.s : Infinity
      const warm = Math.min(1, sinceFire / 0.25)
      const gone = ball ? Math.max(0, (s - shot.sOut) / 4) : 1
      const laneOpacity = warm * (1 - Math.min(1, gone)) * (ball && ball.stage === 'incoming' ? 0.3 + 0.18 * Math.sin(c.elapsedTime * 22 + i) : 0.28)
      d.lane.visible = laneOpacity > 0.01
      if (d.lane.visible) {
        const mid = (shot.sIn + shot.sOut) / 2
        d.lane.position.set(shot.cx + shot.dx * mid, 0.04 + i * 0.002, shot.cz + shot.dz * mid)
        d.lane.rotation.set(-Math.PI / 2, yaw, 0)
        d.lane.scale.set(shot.radius * 2, shot.sOut - shot.sIn, 1)
        ;(d.lane.material as MeshBasicMaterial).opacity = laneOpacity
      }
      // An arrow at the end it comes in from, pointing the way it will roll.
      d.arrow.visible = d.lane.visible && !!ball && ball.stage === 'incoming'
      if (d.arrow.visible) {
        const at = shot.sIn + shot.radius * 0.8
        d.arrow.position.set(shot.cx + shot.dx * at, 0.06, shot.cz + shot.dz * at)
        // The triangle's point is along its own +X; laid flat and turned along the line.
        d.arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-shot.dz, shot.dx))
        d.arrow.scale.setScalar(shot.radius * 0.7)
        ;(d.arrow.material as MeshBasicMaterial).opacity = Math.min(0.85, laneOpacity * 2.4)
      }

      // A puff of smoke where it appears.
      d.puff.visible = sinceFire >= 0 && sinceFire < 0.7
      if (d.puff.visible) {
        const from = ballAt(shot, shot.fire)!
        d.puff.position.set(from.x, from.y, from.z)
        d.puff.scale.setScalar(shot.radius * (1 + sinceFire * 3))
        ;(d.puff.material as MeshBasicMaterial).opacity = 0.75 * (1 - sinceFire / 0.7)
      }

      // A splash where it goes into the sea.
      const splashed = t - splashAt(shot)
      d.splash.visible = splashed >= 0 && splashed < 1
      if (d.splash.visible) {
        const past = Math.sqrt((shot.radius - SEA_Y) / SHOT.sink)
        d.splash.position.set(shot.cx + shot.dx * (shot.sOut + past), SEA_Y + 0.05, shot.cz + shot.dz * (shot.sOut + past))
        d.splash.scale.setScalar(shot.radius * (1 + splashed * 3))
        ;(d.splash.material as MeshBasicMaterial).opacity = 0.9 * (1 - splashed)
      }
    })
  })
  return (
    <group>
      {pool.map((d, i) => (
        <group key={i}>
          <primitive object={d.ball} />
          <primitive object={d.lane} />
          <primitive object={d.arrow} />
          <primitive object={d.puff} />
          <primitive object={d.splash} />
        </group>
      ))}
    </group>
  )
}

/** Somebody: walking, lunging when they shove, flung tumbling overboard when a ball gets them. */
function Body({ index, live, colour }: { index: number; live: RefObject<Game>; colour: string }) {
  const group = useRef<Group>(null)
  const lean = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const arc = useRef<Mesh>(null)
  const splash = useRef<Mesh>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  const wet = useRef<{ x: number; z: number; at: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !lean.current || !p) return
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || p.out !== null || Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 18)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    const under = p.y < SEA_Y - 0.4
    group.current.visible = !p.left && !under
    group.current.position.set(s.x, p.y, s.z)
    group.current.rotation.y = p.yaw + Math.PI
    const since = g.elapsed - p.pushedAt
    const lunge = since >= 0 && since < 0.3 ? Math.sin((since / 0.3) * Math.PI) * 0.45 : 0
    const tumble = p.out !== null ? (g.elapsed - p.out) * 9 : 0
    lean.current.rotation.x = lunge + tumble
    const alive = isStanding(p)
    if (ring.current) ring.current.visible = p.mine && alive
    if (arc.current) arc.current.visible = p.mine && alive && !g.over
    // Into the sea: a splash where they went in.
    if (p.out === null) wet.current = null
    else if (under && !wet.current) wet.current = { x: s.x, z: s.z, at: g.elapsed }
    if (splash.current) {
      const w = wet.current
      const age = w ? g.elapsed - w.at : Infinity
      splash.current.visible = age >= 0 && age < 1
      if (w && splash.current.visible) {
        splash.current.position.set(w.x, SEA_Y + 0.06, w.z)
        splash.current.scale.setScalar(0.6 + age * 2.2)
        ;(splash.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - age)
      }
    }
  })
  return (
    <>
      <group ref={group}>
        <group ref={lean} position={[0, 0.9, 0]}>
          <group position={[0, -0.9, 0]}>
            <primitive object={avatar} />
          </group>
        </group>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false}>
          <ringGeometry args={[0.5, 0.64, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={DoubleSide} depthWrite={false} />
        </mesh>
        {/* The reach of a shove, ahead: the body faces +Z in its own frame. */}
        <mesh ref={arc} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[0, 0.05, 0]} visible={false}>
          <ringGeometry args={[0.7, PUSH.reach, 24, 1, -PUSH.arc, PUSH.arc * 2]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={splash} geometry={SPLASH} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <meshBasicMaterial color={PALETTE.foam} transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </>
  )
}

/** The ship and all aboard, rocking on the swell. Purely for the eye: the rules know nothing of it. */
function Swell({ children }: { children: React.ReactNode }) {
  const group = useRef<Group>(null)
  useFrame(({ clock: c }) => {
    if (!group.current) return
    group.current.rotation.z = Math.sin(c.elapsedTime * 0.55) * 0.018
    group.current.rotation.x = Math.sin(c.elapsedTime * 0.4 + 1) * 0.012
    group.current.position.y = Math.sin(c.elapsedTime * 0.7) * 0.08
  })
  return <group ref={group}>{children}</group>
}

export function DeckScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is aboard changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.seed}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.sky, 45, 140]} />
      <hemisphereLight args={['#fff6e6', '#2d6f95', 1.3]} />
      <directionalLight
        position={[9, 24, 10]}
        intensity={2.2}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      <Rig live={live} />
      <Sea />
      <Enemies />
      <Swell>
        <Ship />
        {game.players.length > 0 ? <Cannonballs key={`${game.id}:${game.seed}`} live={live} /> : null}
        {game.players.map((p, index) => (
          <Body key={`${game.id}:${p.id}`} index={index} live={live} colour={colours[index]} />
        ))}
      </Swell>
    </>
  )
}
