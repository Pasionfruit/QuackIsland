/**
 * You're The Bomb in three dimensions, from above and behind.
 *
 * A long room with a tiled floor, low walls, a black hole in the floor at the
 * far end, and - out past the open south end - **the giant rolling pin**,
 * rumbling closer for 45 seconds, then rolling the length of the room.
 *
 * The bombs are not drawn - until **you scan**: a ring sweeps out from where you
 * stood, and every bomb inside it shows, red and ticking, for a few seconds, then
 * fades. A bomb that has gone off is a blast, then a scorch mark everybody sees.
 * Everybody is the island's capsule in their colour; you have a white ring at
 * your feet and a faint arc in front of you as far as a shove reaches. Dropping
 * through the hole sinks you out of sight; the pin flattens you.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { ROOM, roomFor } from './room'
import { BOMB, COLOURS, PIN, PUSH, SCAN, clock, inRoom, pinZ, type Game } from './rules'

export const PALETTE = {
  dark: '#1a1620',
  tile: '#6d6478',
  tileDark: '#5c5467',
  wall: '#3b3444',
  hole: '#000000',
  bomb: '#e0342c',
  scan: '#7fe0ff',
  pin: '#d9a86c',
  pinEnd: '#8a5a33',
  scorch: '#140f12',
  flame: '#ffb13b',
} as const

/** What your own scans are, for the scene: where you stood and when, by the game clock. */
export interface ScanRef {
  scans: { x: number; z: number; t: number }[]
}

let floorTexture: CanvasTexture | null = null

/** Tiles the size of a bomb's square, so the grid can be counted. */
function floor(): CanvasTexture {
  if (floorTexture) return floorTexture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.tile
  c.fillRect(0, 0, 64, 64)
  c.fillStyle = PALETTE.tileDark
  c.fillRect(0, 0, 32, 32)
  c.fillRect(32, 32, 32, 32)
  floorTexture = new CanvasTexture(canvas)
  floorTexture.colorSpace = SRGBColorSpace
  floorTexture.wrapS = RepeatWrapping
  floorTexture.wrapT = RepeatWrapping
  floorTexture.repeat.set(ROOM.halfX / ROOM.cell, ROOM.halfZ / ROOM.cell)
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
    const watching = !me || !inRoom(me)
    if (watching) {
      // Over whoever is furthest along still in the room, or the middle.
      const lead = g.players.filter(inRoom).sort((a, b) => a.z - b.z)[0]
      const z = lead ? lead.z : 0
      look.set(0, 0, z - 2)
      want.set(0, 26, z + 14)
    } else {
      look.set(0, 0, me.z - 2.5)
      want.set(me.x * 0.3, 15, me.z + 9)
    }
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 8))
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

/** The floor, the walls, the hole. */
function Hall() {
  const { halfX, halfZ } = ROOM
  const wall = { color: PALETTE.wall, roughness: 0.9 }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
        <meshStandardMaterial map={floor()} roughness={0.95} />
      </mesh>
      <mesh position={[-halfX - 0.3, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 1.2, halfZ * 2 + 1.2]} />
        <meshStandardMaterial {...wall} />
      </mesh>
      <mesh position={[halfX + 0.3, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 1.2, halfZ * 2 + 1.2]} />
        <meshStandardMaterial {...wall} />
      </mesh>
      <mesh position={[0, 0.6, -halfZ - 0.3]} castShadow receiveShadow>
        <boxGeometry args={[halfX * 2 + 1.2, 1.2, 0.6]} />
        <meshStandardMaterial {...wall} />
      </mesh>
      {/* The open south end: a low sill, and the floor carrying on outside where the pin waits. */}
      <mesh position={[0, 0.08, halfZ + 0.15]}>
        <boxGeometry args={[halfX * 2 + 1.2, 0.16, 0.3]} />
        <meshStandardMaterial color={PALETTE.bomb} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, halfZ + PIN.from / 2 + 3]}>
        <planeGeometry args={[halfX * 2 + 1.2, PIN.from + 6]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={1} />
      </mesh>
      {/* The hole. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM.hole.x, 0.01, ROOM.hole.z]}>
        <circleGeometry args={[ROOM.hole.radius, 40]} />
        <meshBasicMaterial color={PALETTE.hole} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM.hole.x, 0.02, ROOM.hole.z]}>
        <ringGeometry args={[ROOM.hole.radius, ROOM.hole.radius + 0.25, 40]} />
        <meshBasicMaterial color="#ffd23d" />
      </mesh>
    </group>
  )
}

const BOMB_BALL = new SphereGeometry(0.3, 14, 10)
const BOMB_LIGHT = new SphereGeometry(0.09, 8, 6)
const BURST = new SphereGeometry(1, 16, 12)

/** A bomb: a dark ball with a red light on top, on materials of its own so each can fade alone. */
function makeBomb(): Group {
  const g = new Group()
  const body = new Mesh(BOMB_BALL, new MeshStandardMaterial({ color: '#22202a', roughness: 0.4, metalness: 0.3, transparent: true }))
  body.position.y = 0.28
  const light = new Mesh(BOMB_LIGHT, new MeshBasicMaterial({ color: PALETTE.bomb, transparent: true }))
  light.position.y = 0.6
  g.add(body, light)
  return g
}

const RING = new RingGeometry(0.96, 1, 48)
const DISC = new CylinderGeometry(1, 1, 0.01, 48)

/**
 * The bombs your own scans have shown, while they last; the scan rings; and
 * every bomb that has gone off - a blast, then a scorch mark.
 */
function Bombs({ live, scans }: { live: RefObject<Game>; scans: RefObject<ScanRef> }) {
  const room = roomFor(live.current.seed)
  const shown = useMemo(() => room.bombs.map(() => makeBomb()), [room])
  const scorches = useMemo(
    () =>
      room.bombs.map(() => {
        const m = new Mesh(DISC, new MeshBasicMaterial({ color: PALETTE.scorch, transparent: true, opacity: 0.85 }))
        m.scale.set(0.9, 1, 0.9)
        m.visible = false
        return m
      }),
    [room],
  )
  const bursts = useMemo(
    () =>
      room.bombs.map(() => {
        const m = new Mesh(BURST, new MeshBasicMaterial({ color: PALETTE.flame, transparent: true, depthWrite: false }))
        m.visible = false
        return m
      }),
    [room],
  )
  const rings = useMemo(
    () =>
      Array.from({ length: 4 }, () => {
        const ring = new Mesh(RING, new MeshBasicMaterial({ color: PALETTE.scan, transparent: true, depthWrite: false, side: DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        const area = new Mesh(DISC, new MeshBasicMaterial({ color: PALETTE.scan, transparent: true, depthWrite: false, opacity: 0.08 }))
        ring.visible = false
        area.visible = false
        return { ring, area }
      }),
    [],
  )
  useFrame(({ clock: c }) => {
    const g = live.current
    const t = clock(g)
    const active = scans.current.scans.filter((s) => t - s.t >= 0 && t - s.t < SCAN.show)
    const blown = new Map(g.blown.map((b) => [b.bomb, b.at]))
    room.bombs.forEach((b, i) => {
      const bomb = shown[i]
      bomb.position.set(b.x, 0, b.z)
      const blownAt = blown.get(i)
      // The scan that shows it best: the newest one it is inside.
      let seen = -Infinity
      for (const s of active) if (Math.hypot(b.x - s.x, b.z - s.z) <= SCAN.radius) seen = Math.max(seen, s.t)
      const age = t - seen
      bomb.visible = blownAt === undefined && age < SCAN.show
      if (bomb.visible) {
        // It shows as the ring reaches it, and fades over the last second.
        const reached = Math.min(1, age / 0.35)
        const fade = Math.min(1, (SCAN.show - age) / 1)
        const body = bomb.children[0] as Mesh
        const light = bomb.children[1] as Mesh
        ;(body.material as MeshStandardMaterial).opacity = reached * fade
        ;(light.material as MeshBasicMaterial).opacity = reached * fade * (0.6 + 0.4 * Math.sin(c.elapsedTime * 10 + i))
        bomb.scale.setScalar(0.6 + 0.4 * reached)
      }
      const scorch = scorches[i]
      scorch.visible = blownAt !== undefined
      scorch.position.set(b.x, 0.015, b.z)
      const burst = bursts[i]
      const since = blownAt === undefined ? Infinity : g.elapsed - blownAt
      burst.visible = since >= 0 && since < 0.6
      if (burst.visible) {
        burst.position.set(b.x, 0.6, b.z)
        burst.scale.setScalar(0.4 + (since / 0.6) * BOMB.blast)
        ;(burst.material as MeshBasicMaterial).opacity = 0.9 * (1 - since / 0.6)
      }
    })
    rings.forEach(({ ring, area }, k) => {
      const s = active[active.length - 1 - k]
      ring.visible = !!s
      area.visible = !!s
      if (!s) return
      const age = t - s.t
      const grow = Math.min(1, age / 0.35)
      ring.position.set(s.x, 0.04, s.z)
      ring.scale.setScalar(SCAN.radius * grow)
      ;(ring.material as MeshBasicMaterial).opacity = 0.8 * (1 - age / SCAN.show)
      area.position.set(s.x, 0.02, s.z)
      area.scale.set(SCAN.radius * grow, 1, SCAN.radius * grow)
      ;(area.material as MeshBasicMaterial).opacity = 0.1 * (1 - age / SCAN.show)
    })
  })
  return (
    <group>
      {shown.map((m, i) => (
        <primitive key={`b${i}`} object={m} />
      ))}
      {scorches.map((m, i) => (
        <primitive key={`s${i}`} object={m} />
      ))}
      {bursts.map((m, i) => (
        <primitive key={`x${i}`} object={m} />
      ))}
      {rings.map(({ ring, area }, i) => (
        <group key={`r${i}`}>
          <primitive object={ring} />
          <primitive object={area} />
        </group>
      ))}
    </group>
  )
}

/** The rolling pin: across the room, rolling as it comes. */
function Pin({ live }: { live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const roll = useRef<Group>(null)
  useFrame(() => {
    const g = live.current
    const z = pinZ(clock(g))
    if (!group.current || !roll.current) return
    group.current.position.set(0, PIN.radius, z)
    // Rolling north: turning about the x axis, as far round as it has come.
    roll.current.rotation.x = -(ROOM.halfZ + PIN.radius + PIN.from - z) / PIN.radius
    group.current.visible = z > -ROOM.halfZ - PIN.radius * 2
  })
  const length = ROOM.halfX * 2 + 1
  return (
    <group ref={group}>
      <group ref={roll} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[PIN.radius, PIN.radius, length, 32]} />
          <meshStandardMaterial color={PALETTE.pin} roughness={0.6} />
        </mesh>
        {/* A stripe, so you can see it roll. */}
        <mesh>
          <cylinderGeometry args={[PIN.radius + 0.02, PIN.radius + 0.02, 0.5, 32, 1, true, 0, Math.PI / 3]} />
          <meshStandardMaterial color={PALETTE.pinEnd} side={DoubleSide} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, (s * (length + 1.6)) / 2, 0]}>
            <cylinderGeometry args={[0.45, 0.45, 1.6, 16]} />
            <meshStandardMaterial color={PALETTE.pinEnd} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Somebody: walking, sinking through the hole, blown up, or flattened. */
function Body({ index, live, colour }: { index: number; live: RefObject<Game>; colour: string }) {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const arc = useRef<Mesh>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !p) return
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 18)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    const sinking = p.escaped !== null ? Math.min(1, (g.elapsed - p.escaped) / 0.6) : 0
    const flat = p.how === 'pin'
    group.current.visible = !p.left && p.how !== 'bomb' && sinking < 1
    group.current.position.set(s.x, -sinking * 2, s.z)
    group.current.rotation.y = p.yaw + Math.PI
    group.current.scale.set(flat ? 1.6 : 1, flat ? 0.08 : 1, flat ? 1.6 : 1)
    const alive = inRoom(p)
    if (ring.current) ring.current.visible = p.mine && alive
    if (arc.current) arc.current.visible = p.mine && alive && !g.over
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.64, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={DoubleSide} depthWrite={false} />
      </mesh>
      {/* The reach of a shove, ahead: the body faces +Z in its own frame. */}
      <mesh ref={arc} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.7, PUSH.reach, 24, 1, -PUSH.arc, PUSH.arc * 2]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function RoomScene({ live, scans }: { live: RefObject<Game>; scans: RefObject<ScanRef> }) {
  // Only re-rendered when who is in the room changes; everything else moves itself.
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
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.dark, 30, 80]} />
      <hemisphereLight args={['#ffffff', '#3a3450', 1.3]} />
      <directionalLight
        position={[6, 20, 12]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <Rig live={live} />
      <Hall />
      {game.players.length > 0 ? <Bombs key={`${game.id}:${game.seed}`} live={live} scans={scans} /> : null}
      <Pin live={live} />
      {game.players.map((p, index) => (
        <Body key={`${game.id}:${p.id}`} index={index} live={live} colour={colours[index]} />
      ))}
    </>
  )
}
