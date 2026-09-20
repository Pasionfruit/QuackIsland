/**
 * Helping Dad in three dimensions.
 *
 * A maze of low walls in the dark. **Only your own torch lights it**: a light
 * carried over your ring, and a pool of light in your colour on the floor.
 * Everybody else's torch is a ring and a glow you can see, but it lights nothing
 * for you. The finish glows green, so you know where you are going; the start is
 * a faint square.
 *
 * Your torch is a ring in your colour at the height of the wall tops - the ring
 * is what must not touch a wall. While you hold it, a small white ring shows
 * where the mouse is, which the torch is following. Dropped, the ring blinks;
 * stunned, it flickers red.
 *
 * Dad stands at the top edge, lit by a lamp of his own. When you touch a wall he
 * jumps.
 *
 * **The maze turns**, and everything in it turns with it: the walls, the two
 * pads, Dad's junk and every torch all live in one group whose heading is
 * `angleOf` off the game's own clock. The floor and Dad are outside it, because
 * they do not move. Nothing in the rules knows about any of this - a torch's
 * position is in the maze's own frame, and this is the only place it is turned.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  SRGBColorSpace,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import { createAvatar } from '../../02-player'
import { DAD, HOLD, frameScene } from './camera'
import { GRID, JUNK, junkAt, mazeFor, type Point } from './maze'
import { COLOURS, TORCH, angleOf, finishPoint, startPoint, type Game } from './rules'

export const PALETTE = {
  background: '#050409',
  floor: '#4a4358',
  wall: '#cfc3e0',
  finish: '#5fe06f',
  start: '#3a3350',
  junk: '#8a6a3a',
  rim: '#ffab3d',
  dad: '#8793a8',
  cap: '#3d4a63',
  aim: '#ffffff',
  stun: '#ff3b3b',
} as const

/** How far the floor is lit round your own torch, for the look. */
export const LIT = 2.6

let glowTexture: CanvasTexture | null = null

/** A soft round glow, white in the middle and gone at the edge. */
function glow(): CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, 128, 128)
  glowTexture = new CanvasTexture(canvas)
  glowTexture.colorSpace = SRGBColorSpace
  return glowTexture
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

/** The floor and the walls, for a seed. */
const Maze = memo(function Maze({ seed }: { seed: number }) {
  const walls = useRef<InstancedMesh>(null)
  const maze = mazeFor(seed)
  useLayoutEffect(() => {
    const mesh = walls.current
    if (!mesh) return
    const matrix = new Matrix4()
    const scale = new Matrix4()
    maze.boxes.forEach((b, i) => {
      matrix.makeTranslation((b.x0 + b.x1) / 2, GRID.height / 2, (b.z0 + b.z1) / 2)
      scale.makeScale(b.x1 - b.x0, GRID.height, b.z1 - b.z0)
      mesh.setMatrixAt(i, matrix.multiply(scale))
    })
    mesh.count = maze.boxes.length
    mesh.instanceMatrix.needsUpdate = true
  }, [maze])
  const start = startPoint(seed)
  const end = finishPoint(seed)
  return (
    <group>
      <instancedMesh ref={walls} args={[undefined, undefined, 400]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.7} />
      </instancedMesh>
      <mesh position={[start.x, 0.01, start.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID.cell - GRID.wall - 0.1, GRID.cell - GRID.wall - 0.1]} />
        <meshBasicMaterial color={PALETTE.start} />
      </mesh>
      <FinishPad at={end} />
    </group>
  )
})

/**
 * Dad's junk sliding up and down the corridors: a paint tin, turning slowly on
 * the spot as it goes.
 *
 * It is a dull thing in the dark like the walls are, lit only by whoever's torch
 * is near it - but for a faint band round its top, which catches the light from
 * further off, so a corridor with something in it is a thing you can see coming
 * rather than a thing you find with your face. It stands just under the wall
 * tops, and so just under the ring: a torch held still while one goes by is one
 * the tin slides under, which is the rule.
 */
const TIN = { height: GRID.height - 0.02 } as const

function Junk({ live }: { live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const pieces = mazeFor(live.current.seed).junk
  useFrame(() => {
    const t = live.current.elapsed
    group.current?.children.forEach((tin, i) => {
      const piece = pieces[i]
      if (!piece) return
      const at = junkAt(piece, t)
      tin.position.set(at.x, 0, at.z)
      tin.rotation.y = t * 0.6
    })
  })
  return (
    <group ref={group}>
      {pieces.map((_, i) => (
        <group key={i}>
          <mesh position={[0, TIN.height / 2, 0]} castShadow>
            <cylinderGeometry args={[JUNK.radius, JUNK.radius, TIN.height, 14]} />
            <meshStandardMaterial color={PALETTE.junk} roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, TIN.height - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[JUNK.radius, 0.014, 6, 20]} />
            <meshBasicMaterial color={PALETTE.rim} transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The finish: a green square that glows and pulses, seen from anywhere. */
function FinishPad({ at }: { at: Point }) {
  const pad = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const m = pad.current?.material as MeshBasicMaterial | undefined
    if (m) m.opacity = 0.55 + 0.35 * Math.sin(clock.elapsedTime * 3)
  })
  const size = GRID.cell - GRID.wall - 0.1
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh ref={pad} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={PALETTE.finish} transparent />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 2.2, size * 2.2]} />
        <meshBasicMaterial map={glow()} color={PALETTE.finish} transparent blending={AdditiveBlending} depthWrite={false} opacity={0.5} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
        <meshBasicMaterial color="#e8ffe8" />
      </mesh>
      <mesh position={[0.18, 0.8, 0]}>
        <planeGeometry args={[0.36, 0.22]} />
        <meshBasicMaterial color={PALETTE.finish} side={2} />
      </mesh>
    </group>
  )
}

/** Dad at the top edge, under his own lamp; he jumps when your torch touches a wall. */
function Dad({ live }: { live: RefObject<Game> }) {
  const body = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(PALETTE.dad), [])
  useFrame(() => {
    const g = live.current
    const mine = g.players.find((p) => p.mine)
    if (!body.current) return
    const yell = mine && mine.stunned > 0 ? TORCH.stun - mine.stunned : -1
    body.current.position.y = yell >= 0 && yell < 0.6 ? Math.abs(Math.sin(yell * 16)) * 0.35 : 0
    body.current.rotation.z = yell >= 0 && yell < 0.6 ? Math.sin(yell * 30) * 0.08 : 0
    body.current.rotation.x = -DAD.lean
  })
  return (
    <group position={[0, 0, DAD.z]}>
      {/* High and a little behind him, reaching his face but not the maze. */}
      <pointLight position={[0, 4.5, -1.6]} intensity={7} distance={4.6} decay={1} color="#ffe2b8" />
      <group ref={body} rotation={[-DAD.lean, 0, 0]}>
        <group scale={DAD.scale}>
          <primitive object={avatar} />
          {/* A flat cap. */}
          <mesh position={[0, 1.8, 0.04]}>
            <cylinderGeometry args={[0.42, 0.44, 0.1, 20]} />
            <meshStandardMaterial color={PALETTE.cap} roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.77, 0.38]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.5, 0.04, 0.3]} />
            <meshStandardMaterial color={PALETTE.cap} roughness={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** One player's torch: its ring and glow, and - your own - the light it casts and where the mouse is. */
function TorchView({ index, live, aim }: { index: number; live: RefObject<Game>; aim: RefObject<Point | null> }) {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const pool = useRef<Mesh>(null)
  const lamp = useRef<PointLight>(null)
  const cursor = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const lampColour = useMemo(() => new Color('#ffffff').lerp(new Color(colour), 0.35), [colour])
  useFrame(({ clock }) => {
    const g = live.current
    const torch = g.players[index]
    if (!group.current || !torch) return
    const gone = torch.left || torch.finished !== null
    group.current.visible = !gone
    group.current.position.set(torch.x, 0, torch.z)
    const t = clock.elapsedTime
    const ringMaterial = ring.current?.material as MeshBasicMaterial | undefined
    if (ringMaterial) {
      if (torch.stunned > 0) ringMaterial.color.set(Math.floor(t * 12) % 2 === 0 ? PALETTE.stun : '#ffffff')
      else ringMaterial.color.set(colour)
      ringMaterial.opacity = !torch.held && torch.stunned <= 0 ? 0.55 + 0.45 * Math.sin(t * 8) : 1
    }
    if (pool.current) {
      const flicker = torch.stunned > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 25)) : 1
      ;(pool.current.material as MeshBasicMaterial).opacity = (torch.mine ? 0.55 : 0.4) * flicker
    }
    if (lamp.current) lamp.current.intensity = torch.stunned > 0 ? 3 + 3 * Math.abs(Math.sin(t * 25)) : 7
    if (cursor.current) {
      const at = aim.current
      cursor.current.visible = !!at && torch.held && !gone
      if (at) cursor.current.position.set(at.x - torch.x, HOLD + 0.02, at.z - torch.z)
    }
  })
  const g = live.current
  const mine = g.players[index]?.mine ?? false
  // Everybody starts in the same cell and often walks the same way: your own ring is drawn over theirs.
  const over = mine ? 3 : 0
  return (
    <group ref={group}>
      {mine ? <pointLight ref={lamp} position={[0, 1.2, 0]} intensity={7} distance={LIT + 0.8} decay={1.6} color={lampColour} /> : null}
      <mesh ref={pool} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={mine ? [LIT * 1.6, LIT * 1.6] : [1.3, 1.3]} />
        <meshBasicMaterial map={glow()} color={colour} transparent blending={AdditiveBlending} depthWrite={false} opacity={0.5} />
      </mesh>
      <mesh ref={ring} position={[0, HOLD + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3 + over}>
        <ringGeometry args={[TORCH.radius - 0.05, TORCH.radius, 40]} />
        <meshBasicMaterial color={colour} transparent depthTest={false} />
      </mesh>
      <mesh position={[0, HOLD + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3 + over}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color="#ffffff" transparent depthTest={false} />
      </mesh>
      {mine ? (
        <mesh ref={cursor} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4 + over} visible={false}>
          <ringGeometry args={[0.05, 0.075, 20]} />
          <meshBasicMaterial color={PALETTE.aim} transparent opacity={0.7} depthTest={false} />
        </mesh>
      ) : null}
    </group>
  )
}

/** The maze and everything standing in it, turned together. */
function Turning({ live, children }: { live: RefObject<Game>; children: React.ReactNode }) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.rotation.y = angleOf(live.current)
  })
  return <group ref={group}>{children}</group>
}

export function HelpingDadScene({ live, aim }: { live: RefObject<Game>; aim: RefObject<Point | null> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera />
      {/* The ground the maze stands on, which does not turn with it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.95} />
      </mesh>
      <Dad live={live} />
      {game.players.length > 0 ? (
        <Turning live={live}>
          <Maze seed={game.seed} />
          <Junk live={live} />
          {game.players.map((torch, index) => (
            <TorchView key={`${game.id}:${torch.id}`} index={index} live={live} aim={aim} />
          ))}
        </Turning>
      ) : null}
    </>
  )
}

