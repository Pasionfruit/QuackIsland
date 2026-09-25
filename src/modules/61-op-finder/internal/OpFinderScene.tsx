/**
 * OP Finder in three dimensions: a line of racers, each with a progress bar
 * of their own floating over their head, and nothing to click on - the whole
 * game happens in the DOM panel drawn over this.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The
 * canvas itself is rendered once by the screen; see Duck Hunt's notes for
 * why a `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { COLOURS, STAGE_COUNT, type Player, type Round } from './rules'

export const PALETTE = {
  sky: '#cfe0f6',
  ground: '#e9e0f0',
  fog: '#dfe6f4',
  sun: '#fff3e0',
  ambient: '#cfe3ff',
  hemi: '#bcd6ff',
} as const

/** How far apart racers stand, and how far back the camera is. */
const SPACING = 2.6

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  return (
    <>
      <directionalLight ref={sun} castShadow position={[10, 14, 10]} intensity={2.1} color={PALETTE.sun} />
      <ambientLight intensity={0.55} color={PALETTE.ambient} />
      <hemisphereLight intensity={0.8} color={PALETTE.hemi} groundColor={PALETTE.ground} />
    </>
  )
}

function Ground() {
  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[24, 48]} />
      <meshStandardMaterial color={PALETTE.ground} roughness={0.9} />
    </mesh>
  )
}

/** How wide a full progress bar is, and how high off the ground it floats. */
const BAR_WIDTH = 1.6
const BAR_Y = 2.3

/** One racer: the island's pill in their colour, a progress bar over their head, a small hop once they finish. */
function Racer({ player, x, colour }: { player: Player; x: number; colour: string }) {
  const holder = useRef<Group>(null)
  const fill = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const fillColour = useMemo(() => new Color(colour), [colour])

  useFrame(({ clock }) => {
    const group = holder.current
    if (!group) return
    const bob = player.finishAt === null ? Math.sin(clock.elapsedTime * 2 + x) * 0.04 : 0.35
    group.position.set(x, bob, 0)
    const share = Math.max(0.02, player.stage / STAGE_COUNT)
    if (fill.current) {
      fill.current.scale.x = share
      fill.current.position.x = -(BAR_WIDTH * (1 - share)) / 2
    }
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
      <mesh position={[0, BAR_Y, 0]}>
        <boxGeometry args={[BAR_WIDTH, 0.12, 0.05]} />
        <meshBasicMaterial color="#00000022" />
      </mesh>
      <group ref={fill} position={[0, BAR_Y, 0.01]}>
        <mesh>
          <boxGeometry args={[BAR_WIDTH, 0.12, 0.05]} />
          <meshBasicMaterial color={fillColour} />
        </mesh>
      </group>
    </group>
  )
}

export function OpFinderScene({ live }: { live: RefObject<Round> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const round = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers))
  const count = round.players.length || 1
  const start = -((count - 1) * SPACING) / 2

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.fog, 20, 60]} />
      <Daylight />
      <Ground />
      {round.players.map((player, index) => (
        <Racer key={`${round.id}:${player.id}`} player={player} x={start + index * SPACING} colour={colours[index]} />
      ))}
    </>
  )
}
