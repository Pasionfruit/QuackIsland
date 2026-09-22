/**
 * I'll Just Wait in three dimensions.
 *
 * A stage with a wall behind it and a big wall clock hanging on it - **yours**:
 * its hands are your own winding. In front, everybody in a row as the island's
 * own pill in their colour, each with a small clock over their head, rimmed in
 * their colour, showing exactly what theirs reads - yours included. Three pips
 * over each small clock light green as that player gets each target.
 *
 * The faces are painted once onto a canvas - sixty minute marks, the
 * five-minute ones heavier, and the twelve numerals - because a face read to
 * the minute wants crisp marks, and a canvas texture is crisp at any size for
 * one draw. Every clock shares the one texture.
 *
 * **Drawn from refs, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, Group, SRGBColorSpace, type DirectionalLight, type MeshStandardMaterial } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { STAGE, frameScene, standX } from './camera'
import { COLOURS, handAngles, type Game, type Hand } from './rules'
import { TARGETS } from './wording'

export const PALETTE = {
  background: '#23303a',
  floor: '#6b4a33',
  wall: '#2f5d62',
  rim: '#c9a25a',
  face: '#fbf8f1',
  tick: '#262626',
  hand: '#1f1f24',
  pipOff: '#4a4852',
  pipOn: '#47d16f',
  sunColour: '#fff1dc',
  ambientColour: '#dfe9ff',
  skyColour: '#eaf2ff',
  groundColour: '#3a2a22',
} as const

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

function Lights() {
  const spot = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = spot.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -4, near: 1, far: 60 })
    light.shadow.mapSize.set(2048, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={spot} castShadow position={[3, 16, 12]} intensity={2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.55} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.6} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

let painted: CanvasTexture | null = null

/** A clock's face: marks and numerals, painted once and shared by every clock. */
function paintFace(): CanvasTexture | null {
  if (painted) return painted
  if (typeof document === 'undefined') return null
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const c = size / 2
  ctx.fillStyle = PALETTE.face
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = PALETTE.tick
  ctx.lineCap = 'round'
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const major = i % 5 === 0
    const outer = c * 0.95
    const inner = c * (major ? 0.83 : 0.89)
    ctx.lineWidth = major ? 12 : 5
    ctx.beginPath()
    ctx.moveTo(c + Math.sin(a) * inner, c - Math.cos(a) * inner)
    ctx.lineTo(c + Math.sin(a) * outer, c - Math.cos(a) * outer)
    ctx.stroke()
  }
  ctx.fillStyle = PALETTE.tick
  ctx.font = `700 ${Math.round(size * 0.1)}px ui-rounded, 'Segoe UI', system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2
    const r = c * 0.68
    ctx.fillText(String(h), c + Math.sin(a) * r, c - Math.cos(a) * r + size * 0.006)
  }
  painted = new CanvasTexture(canvas)
  painted.colorSpace = SRGBColorSpace
  painted.anisotropy = 8
  return painted
}

/**
 * One clock: a rim, the face, and a pair of hands pivoting on the middle, set
 * every frame from `read`. Faces +Z; `radius` scales everything.
 */
function Clock({ radius, rim, read }: { radius: number; rim: string; read: () => number }) {
  const face = useMemo(() => paintFace(), [])
  const hour = useRef<Group>(null)
  const minute = useRef<Group>(null)
  useFrame(() => {
    const a = handAngles(read())
    if (hour.current) hour.current.rotation.z = -a.hour
    if (minute.current) minute.current.rotation.z = -a.minute
  })
  const depth = radius * 0.16
  return (
    <group>
      {/* No shadow: on the wall right behind it, it is a dark blot the size of the clock. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 1.09, radius * 1.09, depth, 48]} />
        <meshStandardMaterial color={rim} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.005]}>
        <circleGeometry args={[radius, 48]} />
        {face ? <meshBasicMaterial map={face} toneMapped={false} /> : <meshBasicMaterial color={PALETTE.face} />}
      </mesh>
      <group position={[0, 0, depth / 2 + 0.02]}>
        <group ref={hour}>
          <mesh position={[0, radius * 0.25, 0]}>
            <boxGeometry args={[radius * 0.065, radius * 0.62, radius * 0.012]} />
            <meshStandardMaterial color={PALETTE.hand} roughness={0.4} />
          </mesh>
        </group>
        <group ref={minute}>
          <mesh position={[0, radius * 0.39, radius * 0.015]}>
            <boxGeometry args={[radius * 0.032, radius * 0.92, radius * 0.012]} />
            <meshStandardMaterial color={PALETTE.hand} roughness={0.4} />
          </mesh>
        </group>
        <mesh position={[0, 0, radius * 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius * 0.06, radius * 0.06, radius * 0.025, 16]} />
          <meshStandardMaterial color={rim} roughness={0.3} metalness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

/** The wall and the floor. */
const Room = memo(function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 9, -6]} receiveShadow>
        <planeGeometry args={[60, 18]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={1} />
      </mesh>
    </group>
  )
})

/** One player: the pill, their small clock, and a pip for each target. */
function Player({
  index,
  count,
  live,
  hand,
  colour,
}: {
  index: number
  count: number
  live: RefObject<Game>
  hand: RefObject<Hand>
  colour: string
}) {
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const pips = useRef<(MeshStandardMaterial | null)[]>([])
  const root = useRef<Group>(null)
  const x = standX(index, count)
  const on = useMemo(() => new Color(PALETTE.pipOn), [])
  const off = useMemo(() => new Color(PALETTE.pipOff), [])
  const read = () => {
    const p = live.current.players[index]
    if (!p) return 0
    // Your own clock straight from your hands, a frame ahead of the game.
    return p.mine ? hand.current.minutes : p.minutes
  }
  useFrame(() => {
    const p = live.current.players[index]
    if (!p) return
    pips.current.forEach((pip, stage) => {
      if (!pip) return
      const got = p.solved[stage] !== null
      pip.color.copy(got ? on : off)
      pip.emissive.copy(got ? on : off)
      pip.emissiveIntensity = got ? 0.8 : 0.05
    })
    if (root.current) root.current.visible = !p.left
  })
  const R = STAGE.smallRadius
  return (
    <group position={[x, 0, STAGE.rowZ]} ref={root}>
      <primitive object={avatar} />
      <group position={[0, STAGE.smallY, 0]}>
        <Clock radius={R} rim={colour} read={read} />
        {Array.from({ length: TARGETS }, (_, stage) => (
          <mesh key={stage} position={[(stage - (TARGETS - 1) / 2) * 0.3, R + 0.28, 0]}>
            <sphereGeometry args={[0.1, 12, 10]} />
            <meshStandardMaterial ref={(m) => void (pips.current[stage] = m)} color={PALETTE.pipOff} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

export function IllJustWaitScene({ live, hand }: { live: RefObject<Game>; hand: RefObject<Hand> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const roster = useRef('')
  // Only the roster changing needs React; everything else is set on the frame.
  useFrame(() => {
    const key = `${live.current.id}:${live.current.players.length}`
    if (key !== roster.current) {
      roster.current = key
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const mine = () => hand.current.minutes
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera />
      <Lights />
      <Room />
      <group position={[0, STAGE.clockY, STAGE.clockZ]}>
        <Clock radius={STAGE.clockRadius} rim={PALETTE.rim} read={mine} />
      </group>
      {game.players.map((p, index) => (
        <Player key={`${game.id}:${p.id}`} index={index} count={game.players.length} live={live} hand={hand} colour={colours[index]} />
      ))}
    </>
  )
}
