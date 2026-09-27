/**
 * Mama Tank in three dimensions, from each player's own point of view.
 *
 * **Both roles share the same camera rig**: third person, behind and above
 * your own tank, turned by the mouse - Jackal's own `RunnerCamera` is the
 * direct template. Unlike Jackal (first person for its Sniper) or Big Backs
 * (first person for both), nobody here is first person, so **every
 * player's own body renders from the start** - the bug Jackal's own
 * `JackalScene` had to be fixed for after the fact this session (a runner's
 * own body was skipped unconditionally) has no equivalent case to repeat
 * here, since there is no first-person role to skip a body for at all.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live round each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, InstancedMesh, Matrix4, Mesh, Vector3, type DirectionalLight } from 'three'
import { usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { FIELD, arenaFor, hillHeightAt, type Block } from './arena'
import { COLOURS, MAMA, MINI, type Role, type Round } from './rules'

export const PALETTE = {
  sky: '#cfe0ea',
  ground: '#8a8367',
  groundDark: '#7a7458',
  wall: '#6d7480',
  rock: '#867d72',
  rockDark: '#6f665c',
  hill: '#8f9364',
  hillDark: '#767a4f',
  hull: '#4a5560',
  turret: '#3c4650',
  barrel: '#2c343c',
  muzzle: '#ffd15c',
  hitRing: '#ff3b30',
} as const

/** The mouse's own look, kept by the screen. */
export interface LookRef {
  yaw: number
  pitch: number
}

const CAM_UP = 2.2
export const PITCH = { min: -0.55, max: 0.95 } as const

const target = new Vector3()
const eye = new Vector3()

/**
 * Third person, behind and above your own tank - the same rig Jackal's own
 * runners use, sized up for a bigger, slower-turning body. Pulls back to
 * watch the whole field once you are down, gone, or the round has decided.
 */
function TankCamera({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
  const at = useRef<Vector3 | null>(null)
  useFrame(({ camera }, delta) => {
    const round = live.current
    const mine = round.players.find((p) => p.id === me)
    const watching = !mine || mine.left || (mine.role === 'mini' && !mine.alive) || round.over
    const { yaw, pitch } = look.current
    const dims = mine?.role === 'mama' ? MAMA : MINI
    const back = dims.radius * 3.4 + 2.5
    const distance = watching ? 62 : back
    if (watching) target.set(0, FIELD.hillHeight, 0)
    else target.set(mine.x, hillHeightAt(mine.x, mine.z) + dims.height * 0.85, mine.z)
    eye.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance + CAM_UP + (watching ? 18 : 0), target.z + Math.cos(yaw) * Math.cos(pitch) * distance)
    if (!at.current) at.current = eye.clone()
    else at.current.lerp(eye, 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 12)))
    camera.position.copy(at.current)
    camera.lookAt(target)
  })
  return null
}

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        position={[24, 40, 14]}
        intensity={2.1}
        color="#fff3da"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-FIELD.half - 4}
        shadow-camera-right={FIELD.half + 4}
        shadow-camera-top={FIELD.half + 4}
        shadow-camera-bottom={-FIELD.half - 4}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
      <ambientLight intensity={0.6} color="#cfe3ff" />
      <hemisphereLight intensity={0.7} color={PALETTE.sky} groundColor={PALETTE.ground} />
    </>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[(FIELD.half + FIELD.wallThickness) * 2, (FIELD.half + FIELD.wallThickness) * 2]} />
      <meshStandardMaterial color={PALETTE.ground} roughness={1} />
    </mesh>
  )
}

/** The cosmetic hill at the middle - Mama Tank's own spawn sits at its top. Never collided with: see `arena.ts`. */
function Hill() {
  return (
    <mesh position={[0, FIELD.hillHeight / 2, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[FIELD.hillRadius * 0.35, FIELD.hillRadius, FIELD.hillHeight, 24]} />
      <meshStandardMaterial color={PALETTE.hill} roughness={1} />
    </mesh>
  )
}

const M = new Matrix4()
const S = new Matrix4()

/** Lays out one instanced mesh's worth of blocks: a shared transform and colour per instance. */
function layoutBlocks(mesh: InstancedMesh, blocks: readonly Block[], colour: string): void {
  const c = new Color(colour)
  blocks.forEach((b, i) => {
    M.makeTranslation((b.x0 + b.x1) / 2, b.height / 2, (b.z0 + b.z1) / 2)
    S.makeScale(b.x1 - b.x0, b.height, b.z1 - b.z0)
    mesh.setMatrixAt(i, M.multiply(S))
    mesh.setColorAt(i, c)
  })
  mesh.count = blocks.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/** The walls and every rock, instanced. */
function FieldView({ seed }: { seed: number }) {
  const walls = useRef<InstancedMesh>(null)
  const rocks = useRef<InstancedMesh>(null)
  const arena = arenaFor(seed)
  const wallBlocks = useMemo(() => arena.blocks.filter((b) => b.wall), [arena])
  const rockBlocks = useMemo(() => arena.blocks.filter((b) => !b.wall), [arena])

  useLayoutEffect(() => {
    if (walls.current) layoutBlocks(walls.current, wallBlocks, PALETTE.wall)
  }, [wallBlocks])
  useLayoutEffect(() => {
    if (rocks.current) layoutBlocks(rocks.current, rockBlocks, PALETTE.rock)
  }, [rockBlocks])

  return (
    <group>
      <instancedMesh ref={walls} args={[undefined, undefined, Math.max(1, wallBlocks.length)]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, Math.max(1, rockBlocks.length)]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  )
}

/** How long a muzzle flash glows for after a shot, seconds. */
const FLASH_LIFE = 0.12

/**
 * A tank body: a hull, a turret that turns with `yaw`, and a barrel that
 * elevates with `pitch` - drawn for every player, including your own, since
 * both roles watch their own tank from behind rather than through its eyes.
 */
function TankView({ index, live, colours, role }: { index: number; live: RefObject<Round>; colours: readonly string[]; role: Role }) {
  const group = useRef<Group>(null)
  const barrel = useRef<Mesh>(null)
  const flash = useRef<Mesh>(null)
  const colour = colours[index]
  const dims = role === 'mama' ? MAMA : MINI
  const lastShotAt = useRef<number | null>(null)
  const flashUntil = useRef(-Infinity)

  const barrelLength = dims.radius * 1.7
  const barrelTip = -(dims.radius * 0.5 + barrelLength / 2)

  useFrame(({ clock }) => {
    const round = live.current
    const p = round.players[index]
    if (!group.current || !barrel.current || !p) return
    group.current.visible = !p.left && (role === 'mama' || p.alive)
    group.current.position.set(p.x, hillHeightAt(p.x, p.z), p.z)
    group.current.rotation.y = p.yaw
    barrel.current.rotation.x = -Math.PI / 2 + p.pitch

    if (lastShotAt.current === null) lastShotAt.current = p.shotAt
    else if (p.shotAt !== lastShotAt.current) {
      lastShotAt.current = p.shotAt
      flashUntil.current = clock.elapsedTime + FLASH_LIFE
    }
    if (flash.current) flash.current.visible = clock.elapsedTime < flashUntil.current
  })

  return (
    <group ref={group}>
      <mesh position={[0, dims.height * 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[dims.radius * 1.7, dims.height * 0.55, dims.radius * 2.3]} />
        <meshStandardMaterial color={colour} roughness={0.7} />
      </mesh>
      <mesh position={[0, dims.height * 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[dims.radius * 1.05, dims.height * 0.42, dims.radius * 1.15]} />
        <meshStandardMaterial color={PALETTE.turret} roughness={0.6} />
      </mesh>
      <mesh ref={barrel} position={[0, dims.height * 0.62, -dims.radius * 0.5]}>
        <cylinderGeometry args={[dims.radius * 0.11, dims.radius * 0.13, barrelLength, 8]} />
        <meshStandardMaterial color={PALETTE.barrel} roughness={0.5} />
      </mesh>
      <mesh ref={flash} visible={false} position={[0, dims.height * 0.62, barrelTip]}>
        <sphereGeometry args={[dims.radius * 0.28, 10, 8]} />
        <meshBasicMaterial color={PALETTE.muzzle} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function MamaScene({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const round = live.current
    const key = `${round.id}:${round.players.map((p) => `${p.id}${p.mine ? '*' : ''}`).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const round = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(() => round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)), [round.players, myColour, peers])

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.sky, 34, 150]} />
      <Daylight />
      <TankCamera live={live} look={look} me={me} />
      <Ground />
      {round.players.length > 0 ? <FieldView seed={round.seed} /> : null}
      {round.players.length > 0 ? <Hill /> : null}
      {round.players.map((p, index) => (
        <TankView key={`${round.id}:${p.id}`} index={index} live={live} colours={colours} role={p.role} />
      ))}
    </>
  )
}
