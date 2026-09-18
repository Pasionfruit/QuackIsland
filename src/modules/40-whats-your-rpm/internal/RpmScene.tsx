/**
 * What's Your RPM? in three dimensions: the race, as a running track.
 *
 * A lane each, in the player's colour, the start on the left and the end of
 * the feed on the right, with a line across every ten reels. Everybody walks
 * along their lane as they scroll - bobbing while they move - holding their
 * phone up over their head. The phone's screen is the colour of the reel they
 * are on, and flashes red with an ad up, so you can see who is stuck.
 *
 * **Drawn from refs, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createAvatar } from '../../02-player'
import { TRACK, frameScene, laneZ, trackX } from './camera'
import { reelAt } from './reels'
import { COLOURS, FEED, blocked, type Game } from './rules'

export const PALETTE = {
  background: '#1d2433',
  ground: '#2c3446',
  track: '#3a4358',
  line: '#e9eef6',
  phone: '#15161b',
  ad: '#ff3b3b',
  sunColour: '#fff1dc',
  ambientColour: '#dfe9ff',
  skyColour: '#eaf2ff',
  groundColour: '#20242e',
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
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 60 })
    light.shadow.mapSize.set(2048, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-4, 18, 10]} intensity={2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.55} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.6} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The ground, the lanes, a line every ten reels, and a chequered finish. */
const Track = memo(function Track({ count }: { count: number }) {
  const lanes = Math.max(1, count)
  const depth = lanes * TRACK.lane
  const length = TRACK.half * 2
  const checks = Math.max(2, Math.round(depth / 0.375))
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      {Array.from({ length: lanes }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, laneZ(i, lanes)]} receiveShadow>
          <planeGeometry args={[length, TRACK.lane * 0.9]} />
          <meshStandardMaterial color={new Color(PALETTE.track).lerp(new Color(COLOURS[i % COLOURS.length]), 0.22)} roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: Math.floor(FEED.reels / 10) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[trackX(i * 10, FEED.reels), 0.005, 0]}>
          <planeGeometry args={[i === 0 ? 0.12 : 0.05, depth]} />
          <meshBasicMaterial color={PALETTE.line} transparent opacity={i === 0 ? 0.9 : 0.35} />
        </mesh>
      ))}
      {Array.from({ length: checks * 2 }, (_, i) => {
        const row = i % checks
        const col = Math.floor(i / checks)
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[TRACK.half + 0.1875 + col * 0.375, 0.006, -depth / 2 + (row + 0.5) * (depth / checks)]}>
            <planeGeometry args={[0.375, depth / checks]} />
            <meshBasicMaterial color={(row + col) % 2 === 0 ? '#ffffff' : '#111111'} />
          </mesh>
        )
      })}
    </group>
  )
})

/** One player: the pill in their colour, walking their lane, with their phone up. */
function Runner({ index, count, live }: { index: number; count: number; live: RefObject<Game> }) {
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const screen = useRef<MeshBasicMaterial>(null)
  const shown = useRef({ x: trackX(0, FEED.reels), progress: 0, reel: -1 })
  const red = useMemo(() => new Color(PALETTE.ad), [])
  const lit = useMemo(() => new Color(), [])
  const z = laneZ(index, count)

  useFrame(({ clock }, dt) => {
    const game = live.current
    const p = game.players[index]
    if (!p || !root.current) return
    root.current.visible = !p.left
    const was = shown.current.progress
    const target = trackX(p.progress, FEED.reels)
    shown.current.x += (target - shown.current.x) * Math.min(1, dt * 10)
    shown.current.progress = p.progress
    root.current.position.set(shown.current.x, 0, z)
    const moving = p.progress > was + 1e-4
    if (body.current) body.current.position.y = moving ? Math.abs(Math.sin(clock.elapsedTime * 14)) * 0.14 : 0
    const mat = screen.current
    if (!mat) return
    if (blocked(game, p)) {
      mat.color.copy(red).multiplyScalar(0.55 + 0.45 * Math.abs(Math.sin(clock.elapsedTime * 8)))
    } else {
      const reel = Math.min(FEED.reels - 1, Math.floor(p.progress))
      if (reel !== shown.current.reel) {
        shown.current.reel = reel
        lit.setHSL(reelAt(game.seed, reel).hue / 360, 0.7, 0.55)
      }
      mat.color.copy(lit)
    }
  })

  return (
    <group ref={root} position={[trackX(0, FEED.reels), 0, z]}>
      <group ref={body}>
        <group rotation={[0, Math.PI / 4, 0]}>
          <primitive object={avatar} />
        </group>
        <group position={[0, TRACK.phoneY, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.9, 0.06]} />
            <meshStandardMaterial color={PALETTE.phone} roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.032]}>
            <planeGeometry args={[0.42, 0.78]} />
            <meshBasicMaterial ref={screen} color={PALETTE.line} toneMapped={false} />
          </mesh>
          <mesh position={[0, -TRACK.phoneY / 2 + 0.25, -0.02]}>
            <boxGeometry args={[0.05, TRACK.phoneY - 0.95, 0.05]} />
            <meshStandardMaterial color={colour} roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function RpmScene({ live }: { live: RefObject<Game> }) {
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
  const count = game.players.length
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera />
      <Lights />
      <Track count={Math.max(1, count)} />
      {game.players.map((p, index) => (
        <Runner key={`${game.id}:${p.id}`} index={index} count={count} live={live} />
      ))}
    </>
  )
}
