/**
 * Duck Hunt in three dimensions, lit and dressed like the island.
 *
 * A sandy arena with a fence round it, balloons rising up the view, and the
 * players lined up along the near edge in their colours. Where every balloon is
 * comes from `balloonAt` and the game clock, so every browser draws the same
 * balloons in the same places without being told.
 *
 * **Shooting is here, because aiming needs the camera.** A click becomes a ray
 * from this browser's camera through the pointer, `pickBalloon` finds what it
 * hits, and the screen is handed the answer. Different windows have different
 * cameras; what counts is what was under the crosshair on the screen that fired.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CircleGeometry,
  Color,
  Group,
  MeshStandardMaterial,
  RingGeometry,
  Vector2,
  Vector3,
  type DirectionalLight,
  type Mesh,
  type BufferGeometry,
} from 'three'
import { createAvatar } from '../../02-player'
import { ARENA, BOUNDS, COLOURS, EMBLEMS, balloonAt, pickBalloon, type Balloon, type Emblem, type Point } from './arena'
import { frameScene } from './camera'
import type { Game } from './game'
import type { Trigger } from './useGameNet'

export const PALETTE = {
  sand: '#d0bd90',
  fence: '#8a6440',
  fenceTop: '#a57b52',
  background: '#9fc4dd',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
  emblem: '#ffffff',
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

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 160 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[14, 34, 26]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The floor and a low fence on three sides. */
const Arena = memo(function Arena() {
  const width = BOUNDS.maxX - BOUNDS.minX
  const depth = BOUNDS.maxZ - BOUNDS.minZ
  const middleX = (BOUNDS.minX + BOUNDS.maxX) / 2
  const middleZ = (BOUNDS.minZ + BOUNDS.maxZ) / 2
  const fence = (x: number, z: number, w: number, d: number, key: string) => (
    <group key={key} position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 1.2, d]} />
        <meshStandardMaterial color={PALETTE.fence} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[w + 0.1, 0.12, d + 0.1]} />
        <meshStandardMaterial color={PALETTE.fenceTop} roughness={0.8} />
      </mesh>
    </group>
  )
  return (
    <group>
      <mesh position={[middleX, -0.5, middleZ]} receiveShadow>
        <boxGeometry args={[width + 40, 1, depth + 30]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
      </mesh>
      {fence(middleX, BOUNDS.minZ, width, 0.4, 'back')}
      {fence(BOUNDS.minX, middleZ, 0.4, depth, 'left')}
      {fence(BOUNDS.maxX, middleZ, 0.4, depth, 'right')}
    </group>
  )
})

/** One material per colour, shared by every balloon in it. */
const skins = new Map<string, MeshStandardMaterial>()
function skin(colour: string): MeshStandardMaterial {
  let material = skins.get(colour)
  if (!material) {
    material = new MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.05 })
    skins.set(colour, material)
  }
  return material
}

/** A flat shape, one geometry per kind, facing +z, about a balloon's width across. */
const shapes = new Map<Emblem, BufferGeometry[]>()
function emblemParts(emblem: Emblem): BufferGeometry[] {
  let parts = shapes.get(emblem)
  if (parts) return parts
  const r = ARENA.radius * 0.42
  switch (emblem) {
    case 'dot':
      parts = [new CircleGeometry(r * 0.8, 24)]
      break
    case 'ring':
      parts = [new RingGeometry(r * 0.55, r, 28)]
      break
    case 'triangle':
      parts = [new CircleGeometry(r * 1.1, 3, Math.PI / 2)]
      break
    case 'square':
      parts = [new CircleGeometry(r * 1.05, 4, Math.PI / 4)]
      break
    case 'diamond':
      parts = [new CircleGeometry(r * 1.05, 4, 0)]
      break
    case 'hexagon':
      parts = [new CircleGeometry(r, 6)]
      break
    case 'star':
      parts = [new CircleGeometry(r * 1.1, 3, Math.PI / 2), new CircleGeometry(r * 1.1, 3, -Math.PI / 2)]
      break
    case 'cross': {
      const bar = new CircleGeometry(r, 4, Math.PI / 4)
      bar.scale(1.1, 0.32, 1)
      const upright = new CircleGeometry(r, 4, Math.PI / 4)
      upright.scale(0.32, 1.1, 1)
      parts = [bar, upright]
      break
    }
  }
  shapes.set(emblem, parts)
  return parts
}

const white = new MeshStandardMaterial({ color: PALETTE.emblem, roughness: 0.5 })

/** One balloon: a sphere in its owner's colour, their shape on the front, a string. */
function BalloonBody({ balloon, game }: { balloon: Balloon; game: Game }) {
  const holder = useRef<Group>(null)
  const colour = COLOURS[balloon.owner % COLOURS.length]
  const emblem = EMBLEMS[balloon.owner % EMBLEMS.length]
  useFrame(() => {
    const at = balloonAt(balloon, game.elapsed)
    if (holder.current && at) holder.current.position.set(at.x, at.y, at.z)
  })
  return (
    <group ref={holder}>
      <mesh material={skin(colour)} scale={[1, 1.15, 1]} castShadow>
        <sphereGeometry args={[ARENA.radius, 20, 16]} />
      </mesh>
      {/* Just in front of the balloon's surface, not on it: a flat shape at the
          sphere's own radius sits inside the curve everywhere but the very
          middle, and all that shows is its outline. */}
      {emblemParts(emblem).map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={white} position={[0, 0.05, ARENA.radius + 0.04 + i * 0.002]} />
      ))}
      <mesh position={[0, -ARENA.radius * 1.15 - 0.6, 0]} material={white}>
        <cylinderGeometry args={[0.02, 0.02, 1.2, 4]} />
      </mesh>
    </group>
  )
}

interface Burst {
  key: number
  at: Point
  colour: string
  born: number
}

/** Bits of balloon flying out, for a moment, wherever something popped. */
function Bursts({ game }: { game: Game }) {
  const seen = useRef(new Set<number>())
  const bursts = useRef<Burst[]>([])
  const holder = useRef<Group>(null)

  // Anything newly popped since last time gets a burst where it was.
  for (const [id] of game.popped) {
    if (seen.current.has(id)) continue
    seen.current.add(id)
    const balloon = game.balloons[id]
    const at = balloon && balloonAt(balloon, game.elapsed)
    if (at) bursts.current.push({ key: id, at, colour: COLOURS[balloon.owner % COLOURS.length], born: performance.now() })
  }
  // A new game starts the list again.
  if (game.popped.size === 0 && seen.current.size > 0) seen.current.clear()

  useFrame(() => {
    const now = performance.now()
    bursts.current = bursts.current.filter((b) => now - b.born < 450)
    const group = holder.current
    if (!group) return
    group.children.forEach((child, i) => {
      const burst = bursts.current[i]
      child.visible = !!burst
      if (!burst) return
      const t = (now - burst.born) / 450
      child.position.set(burst.at.x, burst.at.y, burst.at.z)
      child.scale.setScalar(0.6 + t * 2.4)
      ;((child as Mesh).material as MeshStandardMaterial).opacity = 1 - t
      ;((child as Mesh).material as MeshStandardMaterial).color.set(burst.colour)
    })
  })

  // A small pool: more pops at once than this is not something anybody sees.
  return (
    <group ref={holder}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} visible={false}>
          <icosahedronGeometry args={[ARENA.radius * 0.7, 0]} />
          <meshStandardMaterial transparent wireframe opacity={1} />
        </mesh>
      ))}
    </group>
  )
}

/** Where each player's last shot landed, as a flash in their colour. Misses too. */
function ShotFlashes({ game }: { game: Game }) {
  return (
    <>
      {game.players.map((player, index) => {
        const shot = player.lastShot
        const age = shot ? game.elapsed - shot.at : Infinity
        if (!shot || age < 0 || age > 0.35) return null
        const t = age / 0.35
        return (
          <mesh key={player.id} position={[shot.x, shot.y, shot.z + 0.05]} scale={0.4 + t * 0.8}>
            <ringGeometry args={[0.35, 0.5, 24]} />
            <meshBasicMaterial color={COLOURS[index % COLOURS.length]} transparent opacity={1 - t} />
          </mesh>
        )
      })}
    </>
  )
}

/** The players, lined up along the near edge in their colours, watching. */
function Shooters({ game }: { game: Game }) {
  const count = game.players.length
  return (
    <>
      {game.players.map((player, index) => (
        <ShooterPill key={player.id} index={index} count={count} mine={player.mine} />
      ))}
    </>
  )
}

function ShooterPill({ index, count, mine }: { index: number; count: number; mine: boolean }) {
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const spacing = 2.2
  const x = (index - (count - 1) / 2) * spacing
  const z = BOUNDS.maxZ - 1.2
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <primitive object={avatar} />
      {/* On the sand on the camera's side of them, where it can be seen. */}
      {emblemParts(EMBLEMS[index % EMBLEMS.length]).map((geometry, i) => (
        <mesh key={i} geometry={geometry} position={[0, 0.03 + i * 0.002, -1.1]} rotation={[-Math.PI / 2, 0, Math.PI]} scale={1.3}>
          <meshBasicMaterial color={colour} />
        </mesh>
      ))}
      {mine ? (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.7, 28]} />
          <meshBasicMaterial color={colour} />
        </mesh>
      ) : null}
    </group>
  )
}

/**
 * Turns a click on the canvas into a shot: a ray from this camera through the
 * pointer, and whatever balloon it meets first. A miss lands on the floor, or
 * far off along the ray if it went up into the sky.
 */
function Trigger({ game, onShoot }: { game: Game; onShoot: (trigger: Trigger) => void }) {
  const { camera, gl } = useThree()
  const live = useRef(game)
  live.current = game
  const shoot = useRef(onShoot)
  shoot.current = onShoot

  useEffect(() => {
    const canvas = gl.domElement
    const pointer = new Vector2()
    const direction = new Vector3()
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      direction.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize()
      const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
      const d = { x: direction.x, y: direction.y, z: direction.z }
      const g = live.current
      const hit = pickBalloon(g.balloons, g.popped, origin, d, g.elapsed)
      if (hit) return shoot.current({ balloon: hit.balloon.id, point: hit.point })
      const along = d.y < -0.01 ? -origin.y / d.y : 40
      shoot.current({ balloon: null, point: { x: origin.x + d.x * along, y: origin.y + d.y * along, z: origin.z + d.z * along } })
    }
    canvas.addEventListener('pointerdown', down)
    return () => canvas.removeEventListener('pointerdown', down)
  }, [camera, gl])
  return null
}

export function DuckHuntScene({ game, onShoot }: { game: Game; onShoot: (trigger: Trigger) => void }) {
  const background = useMemo(() => new Color(PALETTE.background), [])
  const up = game.balloons.filter((b) => !game.popped.has(b.id) && balloonAt(b, game.elapsed) !== null)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 160]} />
      <FixedCamera />
      <Daylight />
      <Arena />
      {up.map((balloon) => (
        <BalloonBody key={`${game.id}:${balloon.id}`} balloon={balloon} game={game} />
      ))}
      <Bursts game={game} />
      <ShotFlashes game={game} />
      <Shooters game={game} />
      <Trigger game={game} onShoot={onShoot} />
    </>
  )
}
