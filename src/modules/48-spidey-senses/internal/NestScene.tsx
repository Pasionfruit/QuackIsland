/**
 * Spidey Senses in three dimensions, over your shoulder.
 *
 * A dim stone cellar lit by one lantern hanging over **the trapdoor** in the
 * middle of the floor: old boards with iron bands and a ring to pull. Chalk
 * rings on the floor every two metres, so everybody can see who is nearest.
 * Cobwebs in the corners.
 *
 * **The lid tells you everything.** Now and then it gives a little twitch - a
 * false alarm, and never red. When it **springs** it pops up a hand's width and
 * chatters there, red eyes glint in the gap, and a red glow spills out across
 * the floor. When the moment has passed the lid flies
 * open and **the spider leaps out** onto whoever it is taking, wraps them in web
 * and drags them down into the nest.
 *
 * Everybody is the island's capsule in their colour, always facing the
 * trapdoor. You have a ring at your feet - white while you can creep, amber once
 * you have stopped; everybody who has stopped has an amber dot over their head.
 * The camera sits behind you looking at the trapdoor, rising as you creep in so
 * it always sees the lid over your head; once you are out it rises over the
 * whole cellar.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { createAvatar } from '../../02-player'
import { CELLAR, rattle, when } from './nest'
import { COLOURS, distance, isStanding, type Game, type Player } from './rules'

export const PALETTE = {
  dark: '#0d0a0f',
  board: '#5a4330',
  boardDark: '#46331f',
  stone: '#3a3540',
  chalk: '#d8d2c4',
  lid: '#6b4a2c',
  iron: '#2b2a2e',
  pit: '#000000',
  lantern: '#ffb65c',
  spider: '#1c1520',
  eye: '#ff2020',
  web: '#f2f0ea',
  stopped: '#ffb13b',
} as const

/** How long the spider takes to leap from the pit onto its victim, seconds. */
export const LEAP = 0.35
/** When, after the spider comes out, it drags its victims down, and how long that takes. */
export const DRAG = { from: 1.3, length: 1 } as const

let floorTexture: CanvasTexture | null = null

/** Old boards, a third of a metre wide. */
function boards(): CanvasTexture {
  if (floorTexture) return floorTexture
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 256
  const c = canvas.getContext('2d')!
  const shades = [PALETTE.board, '#533d2b', '#5f4733']
  for (let i = 0; i < 3; i++) {
    c.fillStyle = shades[i]
    c.fillRect(i * 32, 0, 32, 256)
    c.fillStyle = PALETTE.boardDark
    c.fillRect(i * 32, 0, 2, 256)
    c.fillRect(i * 32, (i * 97) % 256, 32, 3)
  }
  floorTexture = new CanvasTexture(canvas)
  floorTexture.colorSpace = SRGBColorSpace
  floorTexture.wrapS = RepeatWrapping
  floorTexture.wrapT = RepeatWrapping
  floorTexture.repeat.set(CELLAR.half * 2, CELLAR.half / 1.3)
  return floorTexture
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
      look.set(0, 0, 0)
      want.set(0, 15, 11)
    } else {
      // Behind you, looking past you at the trapdoor - and higher the closer you get,
      // so it always looks down over your head at the lid: the lid is the only warning.
      const r = Math.max(distance(me), 0.01)
      const ux = me.x / r
      const uz = me.z / r
      const back = 4.4
      want.set(me.x + ux * back, 2.8 + (CELLAR.far - r) * 0.7, me.z + uz * back)
      look.set(0, 0.2, 0)
    }
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 2 : 6))
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

/**
 * The railing round the trapdoor: iron posts and two ropes at `CELLAR.rail`, so it
 * is plain that nobody gets to the trapdoor - the nearest anybody can stand is
 * against it.
 */
function Railing() {
  const posts = 20
  return (
    <group>
      {Array.from({ length: posts }, (_, k) => {
        const a = (k / posts) * Math.PI * 2
        return (
          <mesh key={k} position={[Math.sin(a) * CELLAR.rail, 0.5, Math.cos(a) * CELLAR.rail]} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 1, 6]} />
            <meshStandardMaterial color={PALETTE.iron} roughness={0.7} />
          </mesh>
        )
      })}
      {[0.9, 0.5].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[CELLAR.rail, 0.03, 6, 96]} />
          <meshStandardMaterial color="#b9a27a" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

/** The cellar: boards, stone walls, chalk rings, cobwebs, and the lantern swinging over the trapdoor. */
function Cellar() {
  const half = CELLAR.half
  const lantern = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (lantern.current) lantern.current.rotation.z = Math.sin(t * 0.9) * 0.06
    // A flame's flicker.
    if (light.current) light.current.intensity = 55 + Math.sin(t * 13) * 4 + Math.sin(t * 7.3) * 3
  })
  const wall = { color: PALETTE.stone, roughness: 1 }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshStandardMaterial map={boards()} roughness={0.95} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.sin((k * Math.PI) / 2) * half, 3, Math.cos((k * Math.PI) / 2) * half]} rotation={[0, (k * Math.PI) / 2, 0]} receiveShadow>
          <boxGeometry args={[half * 2, 6, 0.6]} />
          <meshStandardMaterial {...wall} />
        </mesh>
      ))}
      {/* Chalk rings every two metres, and the ring everybody starts on. */}
      {[2, 4, 6, 8, CELLAR.far].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r - 0.03, r + 0.03, 96]} />
          <meshBasicMaterial color={PALETTE.chalk} transparent opacity={r === CELLAR.far ? 0.5 : 0.22} />
        </mesh>
      ))}
      <Railing />
      {/* Cobwebs across the corners. */}
      {[0, 1, 2, 3].map((k) => (
        <mesh key={`w${k}`} position={[Math.sign(Math.sin((k * Math.PI) / 2 + Math.PI / 4)) * (half - 1.3), 4.6, Math.sign(Math.cos((k * Math.PI) / 2 + Math.PI / 4)) * (half - 1.3)]} rotation={[0, (k * Math.PI) / 2 + Math.PI / 4, 0]}>
          <circleGeometry args={[2.2, 8]} />
          <meshBasicMaterial color={PALETTE.web} transparent opacity={0.12} side={DoubleSide} wireframe />
        </mesh>
      ))}
      <group ref={lantern} position={[0, 6, 0]}>
        <mesh position={[0, -1, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 2, 4]} />
          <meshBasicMaterial color={PALETTE.iron} />
        </mesh>
        <mesh position={[0, -2.1, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 0.4, 8]} />
          <meshBasicMaterial color={PALETTE.lantern} />
        </mesh>
        <pointLight ref={light} position={[0, -2.2, 0]} color={PALETTE.lantern} intensity={55} distance={30} decay={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      </group>
    </group>
  )
}

/**
 * The trapdoor: a lid hinged on its north edge over a black pit, twitching,
 * rattling once it springs with red eyes under it, and flung open when the
 * spider comes out.
 */
function Trapdoor({ live }: { live: RefObject<Game> }) {
  const lid = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const s = CELLAR.lid
  useFrame(({ clock }) => {
    const g = live.current
    if (!lid.current || !eyes.current) return
    const e = g.elapsed
    const w = when(g.seed, e)
    const shake = g.players.length > 0 ? rattle(g.seed, e) : 0
    let open = 0
    if (w.phase === 'reveal') {
      // Flung open, then slowly closing as the reveal ends.
      const t = w.t
      open = t < 0.15 ? t / 0.15 : t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.7) : 1
    }
    // A twitch lifts it a little; the spring pops it up a hand's width and it chatters there.
    const pop = shake >= 1 ? 0.3 : shake * 0.3
    const chatter = shake * 0.1 * Math.abs(Math.sin(clock.elapsedTime * 41))
    lid.current.rotation.x = -(open * 1.9 + pop + chatter)
    lid.current.position.y = shake * 0.04 * Math.abs(Math.sin(clock.elapsedTime * 31))
    // The eyes show from the spring: in the gap while it rattles, then glaring out of the pit.
    eyes.current.visible = e >= w.round.springs && (w.phase === 'creep' || w.t < 0.3)
  })
  return (
    <group>
      {/* The pit under it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[s * 2, s * 2]} />
        <meshBasicMaterial color={PALETTE.pit} />
      </mesh>
      {/* A frame round it. */}
      {[
        [0, -s - 0.1, s * 2 + 0.4, 0.2],
        [0, s + 0.1, s * 2 + 0.4, 0.2],
        [-s - 0.1, 0, 0.2, s * 2],
        [s + 0.1, 0, 0.2, s * 2],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.04, z]} receiveShadow>
          <boxGeometry args={[w, 0.08, d]} />
          <meshStandardMaterial color={PALETTE.iron} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {/* The eyes in the gap, and a red glow spilling out across the floor: only ever for the real thing. */}
      <group ref={eyes} position={[0, 0.12, s * 0.7]} visible={false}>
        {[-0.18, 0.18, -0.38, 0.38].map((x, i) => (
          <mesh key={i} position={[x, i < 2 ? 0.03 : 0, i < 2 ? 0 : -0.06]}>
            <sphereGeometry args={[i < 2 ? 0.09 : 0.06, 10, 8]} />
            <meshBasicMaterial color={PALETTE.eye} />
          </mesh>
        ))}
        <pointLight color={PALETTE.eye} position={[0, 0.3, 0.4]} intensity={22} distance={7} decay={1.5} />
      </group>
      {/* The lid, hinged on the north edge. */}
      <group position={[0, 0.06, -s]}>
        <group ref={lid}>
          <mesh position={[0, 0.05, s]} castShadow receiveShadow>
            <boxGeometry args={[s * 2, 0.1, s * 2]} />
            <meshStandardMaterial color={PALETTE.lid} roughness={0.9} />
          </mesh>
          {[-0.55, 0.55].map((z) => (
            <mesh key={z} position={[0, 0.11, s + z]}>
              <boxGeometry args={[s * 2 + 0.02, 0.02, 0.16]} />
              <meshStandardMaterial color={PALETTE.iron} metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.12, s * 1.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.03, 8, 20]} />
            <meshStandardMaterial color={PALETTE.iron} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

const ABDOMEN = new SphereGeometry(0.62, 18, 14)
const HEAD = new SphereGeometry(0.36, 16, 12)
const EYE = new SphereGeometry(0.07, 10, 8)
/** A leg segment along its own +X from the joint, so it turns about the joint. */
function segment(length: number): CylinderGeometry {
  const g = new CylinderGeometry(0.045, 0.035, length, 6)
  g.rotateZ(Math.PI / 2)
  g.translate(length / 2, 0, 0)
  return g
}
const UPPER = segment(0.8)
const LOWER = segment(1)
/** How far each leg on a side is fanned forward, front to back, radians. */
const FAN = [0.75, 0.25, -0.2, -0.7] as const

/**
 * The spider, facing its own -Z: a fat dark body and a head, four red eyes, a
 * red hourglass on its back and eight legs, each a hip that can twitch.
 */
function makeSpider(): { group: Group; legs: Group[] } {
  const group = new Group()
  const skin = new MeshStandardMaterial({ color: PALETTE.spider, roughness: 0.55, metalness: 0.1 })
  const red = new MeshBasicMaterial({ color: PALETTE.eye })
  const body = new Mesh(ABDOMEN, skin)
  body.scale.set(1, 0.8, 1.25)
  body.position.set(0, 0.6, 0.6)
  body.castShadow = true
  const head = new Mesh(HEAD, skin)
  head.position.set(0, 0.5, -0.3)
  const mark = new Mesh(EYE, red)
  mark.scale.set(1.4, 0.4, 2.4)
  mark.position.set(0, 1.1, 0.65)
  group.add(body, head, mark)
  for (const [x, y, r] of [
    [-0.12, 0.66, 0.07],
    [0.12, 0.66, 0.07],
    [-0.24, 0.58, 0.05],
    [0.24, 0.58, 0.05],
  ]) {
    const eye = new Mesh(EYE, red)
    eye.scale.setScalar(r / 0.07)
    eye.position.set(x, y, -0.6)
    group.add(eye)
  }
  const legs: Group[] = []
  for (const side of [1, -1]) {
    FAN.forEach((fan, k) => {
      const hip = new Group()
      hip.position.set(side * 0.2, 0.5, -0.3 + k * 0.25)
      // Out along +X on the right, -X on the left, and fanned towards the front.
      hip.rotation.y = side > 0 ? fan : Math.PI - fan
      const upper = new Mesh(UPPER, skin)
      upper.rotation.z = 0.7
      const lower = new Mesh(LOWER, skin)
      lower.position.set(0.8 * Math.cos(0.7), 0.8 * Math.sin(0.7), 0)
      lower.rotation.z = -1.1
      hip.add(upper, lower)
      group.add(hip)
      legs.push(hip)
    })
  }
  group.scale.setScalar(1.25)
  group.visible = false
  return { group, legs }
}

/** Who the spider took in the round just judged, nearest the trapdoor first. */
function takenIn(g: Game, round: number): Player[] {
  return g.players.filter((p) => p.out === round && !p.left).sort((a, b) => distance(a) - distance(b))
}

/** The spider: up out of the pit and onto its first victim, then back down with them. */
function Spider({ live }: { live: RefObject<Game> }) {
  const made = useMemo(() => makeSpider(), [])
  useFrame(({ clock }) => {
    const g = live.current
    const w = when(g.seed, g.elapsed)
    const { group, legs } = made
    const taken = w.phase === 'reveal' ? takenIn(g, w.round.round) : []
    const prey = taken[0]
    group.visible = !!prey && w.t < DRAG.from + DRAG.length
    if (!prey || !group.visible) return
    const t = w.t
    const from = { x: 0, y: -0.8, z: 0 }
    const r = Math.max(distance(prey), 0.01)
    // Onto them, but on the trapdoor side.
    const onto = { x: prey.x - (prey.x / r) * 0.6, z: prey.z - (prey.z / r) * 0.6 }
    let x: number
    let y: number
    let z: number
    if (t < LEAP) {
      const k = t / LEAP
      x = from.x + (onto.x - from.x) * k
      z = from.z + (onto.z - from.z) * k
      y = from.y + (0 - from.y) * k + Math.sin(k * Math.PI) * 2.2
    } else if (t < DRAG.from) {
      x = onto.x
      z = onto.z
      y = 0
    } else {
      // Back down the pit, dragging.
      const k = Math.min(1, (t - DRAG.from) / DRAG.length)
      x = onto.x * (1 - k)
      z = onto.z * (1 - k)
      y = -Math.max(0, k - 0.6) * 5
    }
    group.position.set(x, y, z)
    // Facing its prey on the way out, the pit on the way back.
    group.rotation.y = t < DRAG.from ? Math.atan2(-onto.x, -onto.z) : Math.atan2(onto.x, onto.z)
    legs.forEach((leg, i) => (leg.rotation.z = Math.sin(clock.elapsedTime * 24 + i * 1.7) * (t < LEAP || t > DRAG.from ? 0.3 : 0.1)))
  })
  return <primitive object={made.group} />
}

/** Somebody: creeping, stopped, or webbed up and dragged into the nest. */
function Body({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const dot = useRef<Mesh>(null)
  const web = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !p) return
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || Math.hypot(p.x - s.x, p.z - s.z) > 2) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 14)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    let x = s.x
    let z = s.z
    let y = 0
    let webbed = 0
    let gone = p.left
    if (p.out !== null && p.outAt !== null) {
      const since = g.elapsed - p.outAt
      webbed = Math.min(1, Math.max(0, (since - LEAP) / 0.4))
      if (since > DRAG.from) {
        // Dragged to the pit and down it.
        const k = Math.min(1, (since - DRAG.from) / DRAG.length)
        x *= 1 - k
        z *= 1 - k
        y = -Math.max(0, k - 0.6) * 5
      }
      gone = gone || since > DRAG.from + DRAG.length
    }
    group.current.visible = !gone
    group.current.position.set(x, y, z)
    group.current.rotation.y = Math.atan2(x, z) + Math.PI
    const alive = isStanding(p)
    if (ring.current) {
      ring.current.visible = p.mine && alive
      ;(ring.current.material as MeshBasicMaterial).color.set(p.stoppedAt !== null ? PALETTE.stopped : '#ffffff')
    }
    if (dot.current) dot.current.visible = alive && p.stoppedAt !== null
    if (web.current) {
      web.current.visible = webbed > 0
      web.current.scale.set(1, webbed, 1)
      ;(web.current.material as MeshBasicMaterial).opacity = 0.75 * webbed
    }
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.64, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={dot} position={[0, 2.25, 0]} visible={false}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color={PALETTE.stopped} />
      </mesh>
      {/* Web, wound round them from the feet up. */}
      <mesh ref={web} position={[0, 0, 0]} visible={false}>
        <cylinderGeometry args={[0.5, 0.5, 2, 12, 6, true]} />
        <meshBasicMaterial color={PALETTE.web} transparent wireframe side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function NestScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is in the cellar changes; everything else moves itself.
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
  const background = useMemo(() => new Color(PALETTE.dark), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.dark, 14, 34]} />
      <ambientLight intensity={0.35} color="#8a7fa0" />
      <hemisphereLight args={['#5a5070', '#1a1210', 0.4]} />
      <Rig live={live} />
      <Cellar />
      <Trapdoor live={live} />
      <Spider live={live} />
      {game.players.map((p, index) => (
        <Body key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
    </>
  )
}
