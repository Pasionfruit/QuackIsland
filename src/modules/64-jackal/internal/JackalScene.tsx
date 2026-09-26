/**
 * Jackal in three dimensions, from each player's own point of view.
 *
 * **The Sniper** looks down the lane from the tower's platform, first person,
 * scoping in narrows the view. **A runner** is behind and above their own
 * body, third person, the camera turned by the mouse the same way
 * `58-breaking-the-ice` turns its. Everybody sees the same thing besides: a
 * beam from the Sniper's eyes to wherever it currently ends, cover the colour
 * of what it is, and the tower itself.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live round each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type DirectionalLight } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { FIELD, SPAWN_Z, TOWER_Z, arenaFor, type Block } from './arena'
import { BODY, COLOURS, INVULN, laserOf, sniperOf, type Round } from './rules'

export const PALETTE = {
  sky: '#bcd9ec',
  ground: '#7a9463',
  groundDark: '#6d8858',
  wall: '#8a95a6',
  crate: '#c98f55',
  barrel: '#a3462f',
  tree: '#3f6b3f',
  treeTrunk: '#5c4530',
  tower: '#5a5f6b',
  platform: '#767c8a',
  base: '#ffd35c',
  laser: '#ff3b30',
  laserCore: '#fff0d0',
  hit: '#ffffff',
} as const

/** The mouse's own look, kept by the screen. */
export interface LookRef {
  yaw: number
  pitch: number
}

/** How far behind a runner the camera sits, and how it climbs with the pitch. */
const CAM_BACK = 6.5
const CAM_UP = 1.4
export const PITCH = { min: -0.2, max: 1.1 } as const

const target = new Vector3()
const eye = new Vector3()

/** First person, from the Sniper's eyes: scoping in narrows the field of view. */
function SniperCamera({ live, look }: { live: RefObject<Round>; look: RefObject<LookRef> }) {
  useFrame(({ camera }) => {
    const round = live.current
    const sniper = sniperOf(round)
    const cam = camera as unknown as { fov: number; updateProjectionMatrix: () => void }
    if (!sniper) {
      camera.position.set(0, FIELD.towerHeight + BODY.eye + 30, TOWER_Z + 30)
      camera.lookAt(0, FIELD.towerHeight, TOWER_Z)
      return
    }
    camera.position.set(sniper.x, sniper.y + BODY.eye, sniper.z)
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ')
    camera.updateMatrixWorld()
    const wantFov = sniper.scoped ? 24 : 68
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov = wantFov
      cam.updateProjectionMatrix()
    }
  })
  return null
}

/** Third person, behind and above your own runner: pulled back to watch the whole lane once you are down or the round has decided. */
function RunnerCamera({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
  const at = useRef<Vector3 | null>(null)
  useFrame(({ camera }, delta) => {
    const round = live.current
    const mine = round.players.find((p) => p.id === me)
    const watching = !mine || !mine.alive || round.over
    const { yaw, pitch } = look.current
    const distance = watching ? 44 : CAM_BACK
    if (watching) target.set(0, FIELD.towerHeight * 0.4, (SPAWN_Z + TOWER_Z) / 2)
    else target.set(mine.x, mine.y + BODY.height * 0.75, mine.z)
    eye.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance + CAM_UP + (watching ? 14 : 0), target.z + Math.cos(yaw) * Math.cos(pitch) * distance)
    if (!at.current) at.current = eye.clone()
    else at.current.lerp(eye, 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 14)))
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
        position={[18, 34, 10]}
        intensity={2.2}
        color="#fff6e0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-FIELD.halfWidth - 4}
        shadow-camera-right={FIELD.halfWidth + 4}
        shadow-camera-top={FIELD.length / 2 + 4}
        shadow-camera-bottom={-FIELD.length / 2 - 4}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <ambientLight intensity={0.55} color="#cfe3ff" />
      <hemisphereLight intensity={0.7} color={PALETTE.sky} groundColor={PALETTE.ground} />
    </>
  )
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FIELD.halfWidth * 2, FIELD.length + 8]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={PALETTE.groundDark} roughness={1} />
      </mesh>
      {/* The base zone: a ring on the ground at the tower's foot. */}
      <mesh position={[0, 0.02, TOWER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FIELD.baseRadius - 0.35, FIELD.baseRadius, 40]} />
        <meshBasicMaterial color={PALETTE.base} transparent opacity={0.75} />
      </mesh>
    </>
  )
}

const M = new Matrix4()
const S = new Matrix4()
const colourOf = (kind: Block['kind']): string =>
  kind === 'wall' ? PALETTE.wall : kind === 'tower' ? PALETTE.tower : kind === 'crate' ? PALETTE.crate : kind === 'barrel' ? PALETTE.barrel : PALETTE.treeTrunk

/** The walls, the tower's shaft and the cover, instanced - and its platform and canopies drawn once each. */
function LaneView({ seed }: { seed: number }) {
  const boxes = useRef<InstancedMesh>(null)
  const canopies = useRef<InstancedMesh>(null)
  const arena = arenaFor(seed)
  const trees = useMemo(() => arena.blocks.filter((b) => b.kind === 'tree'), [arena])
  useLayoutEffect(() => {
    const mesh = boxes.current
    if (!mesh) return
    const colour = new Color()
    arena.blocks.forEach((b, i) => {
      M.makeTranslation((b.x0 + b.x1) / 2, b.height / 2, (b.z0 + b.z1) / 2)
      S.makeScale(b.x1 - b.x0, b.height, b.z1 - b.z0)
      mesh.setMatrixAt(i, M.multiply(S))
      mesh.setColorAt(i, colour.set(colourOf(b.kind)))
    })
    mesh.count = arena.blocks.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [arena])
  useLayoutEffect(() => {
    const mesh = canopies.current
    if (!mesh) return
    const colour = new Color(PALETTE.tree)
    trees.forEach((b, i) => {
      const cx = (b.x0 + b.x1) / 2
      const cz = (b.z0 + b.z1) / 2
      const size = Math.max(b.x1 - b.x0, b.z1 - b.z0)
      M.makeTranslation(cx, b.height + size * 0.6, cz)
      S.makeScale(size * 2.1, size * 2.4, size * 2.1)
      mesh.setMatrixAt(i, M.multiply(S))
      mesh.setColorAt(i, colour)
    })
    mesh.count = trees.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [trees])
  return (
    <group>
      <instancedMesh ref={boxes} args={[undefined, undefined, 256]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, 128]} castShadow>
        <coneGeometry args={[0.6, 1, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      {/* The tower's platform: the small square the Sniper is confined to. */}
      <mesh position={[0, FIELD.towerHeight + 0.06, TOWER_Z]} castShadow receiveShadow>
        <boxGeometry args={[FIELD.platformHalf * 2 + 0.6, 0.12, FIELD.platformHalf * 2 + 0.6]} />
        <meshStandardMaterial color={PALETTE.platform} roughness={0.7} />
      </mesh>
    </group>
  )
}

/**
 * The Sniper's aiming laser: traced fresh every frame from the live round, the
 * same segment on every screen because `laserOf` is a pure function of what
 * is already synced. Visible whether or not the trigger is pulled.
 */
const LASER_GEOMETRY = new CylinderGeometry(0.03, 0.03, 1, 6, 1, true)
const UP = new Vector3(0, 1, 0)

function Laser({ live }: { live: RefObject<Round> }) {
  const beam = useRef<Mesh>(null)
  const core = useRef<Mesh>(null)
  const from = useMemo(() => new Vector3(), [])
  const to = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const line = laserOf(live.current)
    if (beam.current) beam.current.visible = !!line
    if (core.current) core.current.visible = !!line
    if (!line || !beam.current || !core.current) return
    from.set(line.from.x, line.from.y, line.from.z)
    to.set(line.to.x, line.to.y, line.to.z)
    const length = Math.max(0.05, from.distanceTo(to))
    const mid = from.clone().lerp(to, 0.5)
    const rot = new Vector3().subVectors(to, from).normalize()
    for (const mesh of [beam.current, core.current]) {
      mesh.position.copy(mid)
      mesh.quaternion.setFromUnitVectors(UP, rot)
    }
    beam.current.scale.set(1, length, 1)
    core.current.scale.set(0.35, length, 0.35)
  })
  return (
    <group>
      <mesh ref={beam} geometry={LASER_GEOMETRY} renderOrder={30}>
        <meshBasicMaterial color={PALETTE.laser} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={core} geometry={LASER_GEOMETRY} renderOrder={31}>
        <meshBasicMaterial color={PALETTE.laserCore} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Somebody else's body: the island's avatar in their colour, hidden once they are down, and a ring over the Sniper's head. */
function BodyView({ index, live, colours, isSniper }: { index: number; live: RefObject<Round>; colours: readonly string[]; isSniper: boolean }) {
  const group = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const colour = colours[index]
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(({ clock }) => {
    const round = live.current
    const p = round.players[index]
    if (!group.current || !turn.current || !p) return
    group.current.visible = !p.left && !p.mine && p.alive
    group.current.position.set(p.x, p.y, p.z)
    turn.current.rotation.y = p.yaw + Math.PI
    if (flash.current) {
      const invuln = round.elapsed < p.invulnerableUntil
      flash.current.visible = invuln
      if (invuln) (flash.current.material as MeshBasicMaterial).opacity = 0.25 + Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.35
    }
  })

  return (
    <group ref={group}>
      <group ref={turn}>
        <primitive object={avatar} />
      </group>
      {isSniper ? (
        <mesh position={[0, BODY.height + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.27, 20]} />
          <meshBasicMaterial color={PALETTE.laser} />
        </mesh>
      ) : null}
      <mesh ref={flash} position={[0, BODY.height / 2, 0]} visible={false}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial color={PALETTE.hit} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

export function JackalScene({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
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
  const mine = round.players.find((p) => p.id === me)
  const iAmSniper = mine?.role === 'sniper'

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.sky, 30, 150]} />
      <Daylight />
      {iAmSniper ? <SniperCamera live={live} look={look} /> : <RunnerCamera live={live} look={look} me={me} />}
      <Ground />
      {round.players.length > 0 ? <LaneView seed={round.seed} /> : null}
      {round.players.length > 0 ? <Laser key={`${round.id}:laser`} live={live} /> : null}
      {round.players.map((p, index) => (p.mine ? null : <BodyView key={`${round.id}:${p.id}`} index={index} live={live} colours={colours} isSniper={p.role === 'sniper'} />))}
    </>
  )
}

/** Seconds a hit's white flash is worth showing on the HUD - matches `INVULN.window` roughly. */
export const HIT_FLASH = Math.min(0.4, INVULN.window)
