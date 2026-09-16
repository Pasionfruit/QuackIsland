/**
 * Probable Stop in three dimensions, lit and dressed like the island.
 *
 * A sandy ledge, three wooden bridges out over the sea to an island, and a
 * sandbank off to the left for everybody who has fallen. The bodies are the
 * island's own avatar. Where everything is comes from `place.ts`, worked out
 * from the game alone, so every browser draws the same moment.
 *
 * **The bridges are how you choose.** Point at one and it lights; click it to
 * stand on it, click it again to confirm. The same as the keys and the cards
 * under the view - three ways to do one thing.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, MathUtils, type DirectionalLight, type Mesh, type MeshStandardMaterial } from 'three'
import { createAvatar } from '../../02-player'
import { frameScene } from './camera'
import type { Game, Player } from './game'
import { BOUNDS, PLACE, bridgeDrop, spotFor, type Rect } from './place'

export const PALETTE = {
  sand: '#d0bd90',
  sandEdge: '#b9a476',
  sea: '#3f9fc4',
  wood: '#8a6440',
  woodDark: '#6b4a30',

  /** One colour per path, used on the bridge and on its card. */
  lanes: ['#e8735a', '#f2b33d', '#6fc2dd'] as readonly string[],
  safe: '#7bd96b',

  you: '#3f8fd0',
  player: '#5eb85b',
  fallen: '#9a948a',
  confirmed: '#ffd24d',

  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#8a7f6a',
  background: '#9fc4dd',
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
    const reach = 26
    Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 200 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[18, 40, 22]} intensity={2.4} color={PALETTE.sunColour} />
      <ambientLight intensity={0.45} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.85} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** A slab of sand, its top at y = 0 and its foot a metre under the sea. */
function Sand({ rect }: { rect: Rect }) {
  const height = 1 - PLACE.seaLevel
  return (
    <mesh position={[rect.x, -height / 2, rect.z]} receiveShadow>
      <boxGeometry args={[rect.width, height, rect.depth]} />
      <meshStandardMaterial color={PALETTE.sand} roughness={0.95} />
    </mesh>
  )
}

const Ground = memo(function Ground() {
  const middleX = (BOUNDS.minX + BOUNDS.maxX) / 2
  return (
    <group>
      <mesh position={[middleX, PLACE.seaLevel, (BOUNDS.minZ + BOUNDS.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color={PALETTE.sea} roughness={0.35} metalness={0.05} />
      </mesh>
      <Sand rect={PLACE.ledge} />
      <Sand rect={PLACE.island} />
      <Sand rect={PLACE.bank} />
    </group>
  )
})

/**
 * One bridge. Drops away on the reveal if it did not hold, glows if it did,
 * lights up under the pointer, and wears its path's colour at the near end.
 */
function Bridge({
  lane,
  game,
  mine,
  hovered,
  onPick,
  onHover,
}: {
  lane: number
  game: Game
  mine: boolean
  hovered: boolean
  onPick: (lane: number) => void
  onHover: (lane: number | null) => void
}) {
  const holder = useRef<Group>(null)
  const deck = useRef<MeshStandardMaterial>(null)
  const length = PLACE.bridgeNear - PLACE.bridgeFar
  const middleZ = (PLACE.bridgeNear + PLACE.bridgeFar) / 2
  const colour = PALETTE.lanes[lane]
  const glow = useMemo(() => new Color(), [])

  useFrame(() => {
    const group = holder.current
    if (!group) return
    const drop = bridgeDrop(game, lane)
    // A shiver before it goes, so there is a moment of "is it mine?".
    const shiver = drop === 0 && game.phase === 'reveal' && !game.safe.includes(lane) ? Math.sin(performance.now() / 30) * 0.04 : 0
    group.position.set(PLACE.lanes[lane] + shiver, -drop * 9, middleZ)
    group.rotation.z = drop * (lane === 0 ? -0.6 : 0.6)
    group.rotation.x = drop * 0.25

    const material = deck.current
    if (!material) return
    const heldUp = game.phase !== 'choosing' && game.safe.includes(lane)
    glow.set(heldUp ? PALETTE.safe : colour)
    material.emissive.copy(glow)
    material.emissiveIntensity = heldUp ? 0.45 : mine ? 0.3 : hovered ? 0.18 : 0
  })

  return (
    <group ref={holder}>
      <mesh
        position={[0, -PLACE.bridgeThickness / 2, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation()
          onPick(lane)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(lane)
        }}
        onPointerOut={() => onHover(null)}
      >
        <boxGeometry args={[PLACE.bridgeWidth, PLACE.bridgeThickness, length]} />
        <meshStandardMaterial ref={deck} color={PALETTE.wood} roughness={0.85} />
      </mesh>
      {/* Rails, and a coloured band at the near end so the path's colour
          matches its card under the view. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * PLACE.bridgeWidth) / 2, 0.25, 0]} castShadow>
          <boxGeometry args={[0.15, 0.5, length]} />
          <meshStandardMaterial color={PALETTE.woodDark} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, length / 2 - 0.6]}>
        <boxGeometry args={[PLACE.bridgeWidth - 0.2, 0.06, 1]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>
    </group>
  )
}

/** One player: the island's avatar, walking to wherever `spotFor` says. */
function PlayerPill({ game, player }: { game: Game; player: Player }) {
  const holder = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const placed = useRef(false)
  const colour = !player.alive ? PALETTE.fallen : player.mine ? PALETTE.you : PALETTE.player
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame((_state, delta) => {
    const group = holder.current
    if (!group) return
    const spot = spotFor(game, player)
    // Put straight there the first time, and after anything too far to have
    // walked - the fallen reappearing on the bank, a new game dealing everybody
    // back to the ledge. Anything else is eased towards, so a guest's
    // ten-a-second snapshots look like walking.
    const far = Math.hypot(spot.x - group.position.x, spot.z - group.position.z) > 8
    if (!placed.current || (far && spot.y === 0)) {
      group.position.set(spot.x, spot.y, spot.z)
      placed.current = true
    }
    const rate = 1 - Math.exp(-12 * Math.min(delta, 0.1))
    const was = group.position.clone()
    group.position.x = MathUtils.lerp(group.position.x, spot.x, rate)
    group.position.z = MathUtils.lerp(group.position.z, spot.z, rate)
    // Falling is not eased: it is falling.
    group.position.y = spot.y < group.position.y ? spot.y : MathUtils.lerp(group.position.y, spot.y, rate)
    const dx = group.position.x - was.x
    const dz = group.position.z - was.z
    if (Math.hypot(dx, dz) > 0.002) group.rotation.y = Math.atan2(dx, dz)
    else if (game.phase === 'choosing') group.rotation.y = MathUtils.lerp(group.rotation.y, Math.PI, rate)

    if (ring.current) ring.current.visible = player.mine && player.alive
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
      <mesh ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.72, 28]} />
        <meshBasicMaterial color={player.confirmed ? PALETTE.confirmed : PALETTE.you} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

export function ProbableStopScene({
  game,
  hovered,
  onPick,
  onHover,
}: {
  game: Game
  hovered: number | null
  onPick: (lane: number) => void
  onHover: (lane: number | null) => void
}) {
  const background = useMemo(() => new Color(PALETTE.background), [])
  const me = game.players.find((p) => p.mine) ?? null
  const choosing = game.phase === 'choosing' && me !== null && me.alive

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 70, 200]} />
      <FixedCamera />
      <Daylight />
      <Ground />
      {PLACE.lanes.map((_, lane) => (
        <Bridge
          key={lane}
          lane={lane}
          game={game}
          mine={choosing && me.pick === lane}
          hovered={choosing && hovered === lane}
          onPick={onPick}
          onHover={onHover}
        />
      ))}
      {game.players.map((player) => (
        <PlayerPill key={player.id} game={game} player={player} />
      ))}
    </>
  )
}
