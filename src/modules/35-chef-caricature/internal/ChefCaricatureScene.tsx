/**
 * Chef Caricature in three dimensions.
 *
 * A kitchen: an easel in the middle with a sheet of paper on it, **the hungry
 * duck** standing to its right with its beak towards it, and the chef whose turn
 * it is at its left, in a white hat. Everybody else stands along the bottom of
 * the picture with their backs to you, watching.
 *
 * The paper shows the outline to trace in grey, the parts of it already covered
 * in green, and the ink in the drawer's colour. When a drawing is accepted, it
 * peels off the paper and flies into the duck's open beak, and the duck gulps.
 * When an attempt is let go of, the paper flashes red and the ink is gone.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, Group, RepeatWrapping, SRGBColorSpace, type Mesh, type PerspectiveCamera } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { BOARD, CHEF, DUCK, FOV, cameraFor } from './camera'
import { outlineFor } from './outlines'
import { COLOURS, drawer, phase, type Game } from './rules'

export const PALETTE = {
  wall: '#f6e3c3',
  tiles: '#e9c9a0',
  tilesDark: '#d9b286',
  wood: '#9c6a3f',
  paper: '#fffdf6',
  guide: '#cdbfae',
  covered: '#5cc07a',
  duck: '#ffd23f',
  beak: '#ff8c1a',
  hat: '#ffffff',
  wiped: 'rgba(217, 68, 58, 0.35)',
} as const

/** How long a dish takes to fly to the duck, seconds. */
const FLIGHT = 0.6
/** The paper canvas's size, pixels. */
const PAPER = 1024

/** The still camera, fitted to the window. */
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

let floorTexture: CanvasTexture | null = null

function tiles(): CanvasTexture {
  if (floorTexture) return floorTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.tiles
  c.fillRect(0, 0, 128, 128)
  c.fillStyle = PALETTE.tilesDark
  c.fillRect(0, 0, 64, 64)
  c.fillRect(64, 64, 64, 64)
  floorTexture = new CanvasTexture(canvas)
  floorTexture.colorSpace = SRGBColorSpace
  floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping
  floorTexture.repeat.set(20, 20)
  return floorTexture
}

function Kitchen() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial map={tiles()} roughness={1} />
      </mesh>
      <mesh position={[0, 10, -3]} receiveShadow>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={1} />
      </mesh>
    </group>
  )
}

/** Board units to paper pixels. */
const px = (u: number) => ((u + 1) / 2) * PAPER
const py = (v: number) => ((1 - v) / 2) * PAPER

/** The easel, its paper drawn from the game whenever what is on it changes. */
function Easel({ live, colours }: { live: RefObject<Game>; colours: readonly string[] }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = PAPER
    c.height = PAPER
    return c
  }, [])
  const texture = useMemo(() => {
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  const drawn = useRef('')

  useFrame(() => {
    const g = live.current
    const now = phase(g)
    const stroke = g.stroke
    const wiped = g.erasedAt !== null && g.elapsed - g.erasedAt < 0.35
    const key = `${g.id}:${g.turn}:${g.outline}:${now}:${stroke?.id ?? '-'}:${stroke?.points.length ?? 0}:${wiped}:${colours[drawer(g)]}`
    if (key === drawn.current) return
    drawn.current = key
    const c = canvas.getContext('2d')!
    c.fillStyle = PALETTE.paper
    c.fillRect(0, 0, PAPER, PAPER)
    if (g.players.length > 0 && (now === 'intro' || now === 'drawing')) {
      const outline = outlineFor(g.seed, g.outline)
      const pts = outline.points
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.strokeStyle = PALETTE.guide
      c.lineWidth = 16
      c.setLineDash([26, 18])
      c.beginPath()
      pts.forEach((p, i) => (i === 0 ? c.moveTo(px(p.x), py(p.y)) : c.lineTo(px(p.x), py(p.y))))
      c.closePath()
      c.stroke()
      c.setLineDash([])
      if (stroke) {
        // The covered parts of the outline, in green.
        c.strokeStyle = PALETTE.covered
        c.lineWidth = 18
        c.beginPath()
        pts.forEach((p, i) => {
          const q = pts[(i + 1) % pts.length]
          if (stroke.covered[i] && stroke.covered[(i + 1) % pts.length]) {
            c.moveTo(px(p.x), py(p.y))
            c.lineTo(px(q.x), py(q.y))
          }
        })
        c.stroke()
        // The ink.
        c.strokeStyle = colours[drawer(g)]
        c.lineWidth = 12
        c.beginPath()
        for (let i = 0; i < stroke.points.length; i += 2) {
          const x = px(stroke.points[i])
          const y = py(stroke.points[i + 1])
          if (i === 0) c.moveTo(x, y)
          else c.lineTo(x, y)
        }
        if (stroke.points.length === 2) c.lineTo(px(stroke.points[0]) + 0.1, py(stroke.points[1]))
        c.stroke()
      }
    }
    if (wiped) {
      c.fillStyle = PALETTE.wiped
      c.fillRect(0, 0, PAPER, PAPER)
    }
    texture.needsUpdate = true
  })

  const size = BOARD.half * 2
  return (
    <group position={[BOARD.x, 0, BOARD.z]}>
      <mesh position={[0, BOARD.y, -0.06]} castShadow>
        <boxGeometry args={[size + 0.36, size + 0.36, 0.1]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.8} />
      </mesh>
      <mesh position={[0, BOARD.y, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (BOARD.half - 0.3), (BOARD.y - BOARD.half) / 2, -0.15]} rotation={[0, 0, side * 0.08]} castShadow>
          <boxGeometry args={[0.14, BOARD.y - BOARD.half + 0.2, 0.14]} />
          <meshStandardMaterial color={PALETTE.wood} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, BOARD.y - BOARD.half - 0.25, 0.05]} castShadow>
        <boxGeometry args={[size * 0.9, 0.1, 0.25]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.8} />
      </mesh>
    </group>
  )
}

/** The dish that was just accepted, flying off the paper into the duck's beak. */
function Dish({ live, colours }: { live: RefObject<Game>; colours: readonly string[] }) {
  const mesh = useRef<Mesh>(null)
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    return c
  }, [])
  const texture = useMemo(() => {
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [canvas])
  const shown = useRef<unknown>(null)

  useFrame(() => {
    const g = live.current
    const dish = g.dish
    if (!mesh.current) return
    const age = dish ? g.elapsed - dish.at : Infinity
    mesh.current.visible = !!dish && age >= 0 && age < FLIGHT
    if (!dish || !mesh.current.visible) return
    if (shown.current !== dish) {
      shown.current = dish
      const c = canvas.getContext('2d')!
      c.clearRect(0, 0, 256, 256)
      c.fillStyle = PALETTE.paper
      c.beginPath()
      c.arc(128, 128, 124, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = colours[drawer(g)]
      c.lineWidth = 7
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      for (let i = 0; i < dish.points.length; i += 2) {
        const x = ((dish.points[i] + 1) / 2) * 256
        const y = ((1 - dish.points[i + 1]) / 2) * 256
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()
      texture.needsUpdate = true
    }
    const k = age / FLIGHT
    const ease = k * k * (3 - 2 * k)
    const beak = beakPoint()
    mesh.current.position.set(BOARD.x + (beak.x - BOARD.x) * ease, BOARD.y + (beak.y - BOARD.y) * ease + Math.sin(k * Math.PI) * 1.2, 0.3 + (beak.z - 0.3) * ease)
    mesh.current.scale.setScalar(BOARD.half * 2 * (1 - 0.9 * ease))
    mesh.current.rotation.z = ease * 2.5
  })

  return (
    <mesh ref={mesh} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Where the duck's beak is, in the world. */
function beakPoint() {
  return { x: DUCK.x - 0.85 * DUCK.scale, y: 1.67 * DUCK.scale, z: DUCK.z + 0.1 }
}

/** The hungry duck: bobs while it waits, opens wide for a dish, and gulps. */
function Duck({ live }: { live: RefObject<Game> }) {
  const head = useRef<Group>(null)
  const jaw = useRef<Group>(null)
  const body = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = live.current
    const t = clock.elapsedTime
    const age = g.dish ? g.elapsed - g.dish.at : Infinity
    const flying = age >= 0 && age < FLIGHT
    const gulp = age >= FLIGHT && age < FLIGHT + 0.45 ? (age - FLIGHT) / 0.45 : -1
    // Positive opens: the jaw points along -X, and turning about Z swings it down.
    if (jaw.current) jaw.current.rotation.z = flying ? 0.55 * Math.min(1, age / 0.2) : gulp >= 0 ? 0.55 * (1 - gulp) : 0.12 + 0.08 * Math.max(0, Math.sin(t * 3))
    if (head.current) head.current.position.y = 1.62 + (gulp >= 0 ? Math.sin(gulp * Math.PI) * 0.18 : Math.sin(t * 2) * 0.03)
    if (body.current) body.current.scale.set(1, gulp >= 0 ? 1 - Math.sin(gulp * Math.PI) * 0.08 : 1, 1)
  })
  return (
    <group position={[DUCK.x, 0, DUCK.z]} scale={DUCK.scale}>
      <group ref={body}>
        <mesh position={[0.15, 0.72, 0]} scale={[1.05, 0.8, 0.8]} castShadow>
          <sphereGeometry args={[0.75, 28, 20]} />
          <meshStandardMaterial color={PALETTE.duck} roughness={0.6} />
        </mesh>
        <mesh position={[0.3, 0.82, 0.52]} rotation={[0.2, 0, -0.3]} scale={[0.55, 0.35, 0.12]} castShadow>
          <sphereGeometry args={[0.75, 16, 12]} />
          <meshStandardMaterial color="#f2c230" roughness={0.6} />
        </mesh>
        <mesh position={[0.92, 0.92, 0]} rotation={[0, 0, 0.6]} scale={[0.35, 0.18, 0.3]}>
          <sphereGeometry args={[0.75, 12, 10]} />
          <meshStandardMaterial color={PALETTE.duck} roughness={0.6} />
        </mesh>
        {[-0.22, 0.22].map((z) => (
          <mesh key={z} position={[0, 0.05, z]} scale={[0.32, 0.06, 0.2]}>
            <sphereGeometry args={[0.75, 12, 8]} />
            <meshStandardMaterial color={PALETTE.beak} roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* The neck, joining head to body. */}
      <mesh position={[-0.28, 1.25, 0]} rotation={[0, 0, -0.25]} castShadow>
        <cylinderGeometry args={[0.26, 0.36, 0.6, 16]} />
        <meshStandardMaterial color={PALETTE.duck} roughness={0.6} />
      </mesh>
      <group ref={head} position={[-0.38, 1.62, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.5, 24, 18]} />
          <meshStandardMaterial color={PALETTE.duck} roughness={0.6} />
        </mesh>
        {[-0.22, 0.22].map((z) => (
          <mesh key={z} position={[-0.25, 0.15, z * 1.8]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color="#1c1a22" roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[-0.55, 0.02, 0]} scale={[0.42, 0.08, 0.26]}>
          <sphereGeometry args={[0.75, 14, 10]} />
          <meshStandardMaterial color={PALETTE.beak} roughness={0.5} />
        </mesh>
        <group ref={jaw} position={[-0.3, -0.05, 0]}>
          <mesh position={[-0.25, -0.03, 0]} scale={[0.38, 0.06, 0.22]}>
            <sphereGeometry args={[0.75, 14, 10]} />
            <meshStandardMaterial color="#e87a10" roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** A chef's hat, for whoever is drawing. */
function Hat() {
  return (
    <group position={[0, 1.85, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.32, 20]} />
        <meshStandardMaterial color={PALETTE.hat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0]} scale={[1, 0.75, 1]} castShadow>
        <sphereGeometry args={[0.42, 20, 14]} />
        <meshStandardMaterial color={PALETTE.hat} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** One player: at the easel with a hat on while it is their turn, otherwise watching from the back wall either side of it. */
function PlayerView({ index, live, colour }: { index: number; live: RefObject<Game>; colour: string }) {
  const group = useRef<Group>(null)
  const hat = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  useFrame(({ clock }) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !p) return
    group.current.visible = !p.left
    const drawing = drawer(g) === index && !g.over
    if (hat.current) hat.current.visible = drawing
    if (drawing) {
      group.current.position.set(CHEF.x, 0, CHEF.z)
      // Facing the easel, leaning in while the pen is down.
      group.current.rotation.set(0, Math.PI / 2 + 0.25, g.stroke ? -0.08 + Math.sin(clock.elapsedTime * 9) * 0.02 : 0)
    } else {
      const crowd = g.players.map((_, i) => i).filter((i) => i !== drawer(g))
      const slot = crowd.indexOf(index)
      // Alternately left of the easel and right of it, working outwards.
      const side = slot % 2 === 0 ? -1 : 1
      const out = Math.floor(slot / 2)
      const x = side < 0 ? BOARD.x - BOARD.half - 1.1 - out * 1.05 : BOARD.x + BOARD.half + 1.1 + out * 1.05
      group.current.position.set(x, 0, -2.2)
      group.current.rotation.set(0, Math.sin(clock.elapsedTime * 1.3 + index) * 0.15, 0)
    }
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
      <group ref={hat} visible={false}>
        <Hat />
      </group>
    </group>
  )
}

export function ChefCaricatureScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is in the kitchen changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.wall), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <hemisphereLight args={['#fff4e0', '#c79a6a', 1.2]} />
      <directionalLight position={[-5, 12, 10]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-4} />
      <FixedCamera />
      <Kitchen />
      <Easel live={live} colours={colours} />
      <Duck live={live} />
      <Dish live={live} colours={colours} />
      {game.players.map((p, index) => (
        <PlayerView key={`${game.id}:${p.id}`} index={index} live={live} colour={colours[index]} />
      ))}
    </>
  )
}
