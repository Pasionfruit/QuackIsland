/**
 * Breaking the Ice in three dimensions: three squares of tiles, smaller and
 * lower the further down they sit, over a long drop to the sea.
 *
 * The camera sits behind and above whichever body is yours, turned by the
 * mouse - climbing or dropping with you as you change layers. Once you have
 * fallen, or the round has decided, it pulls back to watch the whole iceberg.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live round each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, InstancedMesh, Matrix4, Vector3, type DirectionalLight } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import {
  CELL,
  COLOURS,
  DIM,
  LAYERS,
  broken,
  cracked,
  tileCentre,
  type Player,
  type Round,
} from './rules'

export const PALETTE = {
  sky: '#bfe6f6',
  sea: '#2f7fa8',
  fog: '#a9d8ec',
  tile: ['#eaf6fb', '#cfeaf5', '#b3dcee'] as const,
  crack: '#ffb454',
  rim: '#8fc7dd',
  sun: '#fff3e0',
  ambient: '#cfe3ff',
  ground: '#7fa8bd',
} as const

/** The mouse's camera, which the screen keeps. */
export interface LookRef {
  yaw: number
  pitch: number
}

/** How far behind you the camera sits, and how it climbs with the pitch. */
export const CAMERA_BACK = 9
export const PITCH = { min: 0.15, max: 1.3 } as const
/** A tile's thickness. */
const THICK = 0.7
/** Kept clear of a solid layer's underside, or the camera ends up inside it. */
const CEILING_MARGIN = 0.4
/** A hair narrower than a full cell, so the grid lines show. */
const GAP = 0.14
/** How long somebody is still drawn, tumbling, after they go under. */
const GONE_AFTER = 1.4

const target = new Vector3()
const eye = new Vector3()

function Rig({ live, look }: { live: RefObject<Round>; look: RefObject<LookRef> }) {
  const at = useRef<Vector3 | null>(null)
  useFrame(({ camera }, delta) => {
    const round = live.current
    const me = round.players.find((p) => p.mine)
    const { yaw, pitch } = look.current
    // Fallen, or the round decided: pull back and watch the whole iceberg.
    const watching = !me || !me.alive || round.decidedAt !== null
    const span = LAYERS[0].size * CELL
    const distance = watching ? span * 0.85 : CAMERA_BACK
    if (watching) target.set(0, LAYERS[1].y, 0)
    else target.set(me.x, me.y + 1.3, me.z)
    // Behind: the opposite of where the camera faces, and up by the pitch.
    eye.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance + (watching ? span * 0.3 : 0),
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    // On any layer but the top, a solid one sits overhead - keep the eye
    // below its underside, or the view is spent looking at the inside of
    // the floor above rather than at the layer you are actually on.
    if (!watching && me && me.layer > 0) {
      const ceiling = LAYERS[me.layer - 1].y - THICK - CEILING_MARGIN
      eye.y = Math.min(eye.y, ceiling)
    }
    if (!at.current) at.current = eye.clone()
    else at.current.lerp(eye, 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 16)))
    camera.position.copy(at.current)
    camera.lookAt(target)
  })
  return null
}

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  return (
    <>
      <directionalLight ref={sun} castShadow position={[16, 30, 14]} intensity={2.3} color={PALETTE.sun} />
      <ambientLight intensity={0.5} color={PALETTE.ambient} />
      <hemisphereLight intensity={0.85} color={PALETTE.sky} groundColor={PALETTE.ground} />
    </>
  )
}

function Sea() {
  return (
    <mesh position={[0, LAYERS[LAYERS.length - 1].y - 1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color={PALETTE.sea} roughness={0.35} />
    </mesh>
  )
}

const M = new Matrix4()
const S = new Matrix4()

/** One layer's tiles: intact, warning-cracked, or shrunk away out of sight once broken. */
function Layer({ live, layer }: { live: RefObject<Round>; layer: 0 | 1 | 2 }) {
  const mesh = useRef<InstancedMesh>(null)
  const colour = useMemo(() => new Color(), [])
  const cells = useMemo(() => {
    const size = LAYERS[layer].size
    const off = (DIM - size) / 2
    const list: { row: number; col: number }[] = []
    for (let row = off; row < DIM - off; row++) for (let col = off; col < DIM - off; col++) list.push({ row, col })
    return list
  }, [layer])
  const base = useMemo(() => new Color(PALETTE.tile[layer]), [layer])
  const crackColour = useMemo(() => new Color(PALETTE.crack), [])
  const y = LAYERS[layer].y

  useFrame(() => {
    const round = live.current
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < cells.length; i++) {
      const { row, col } = cells[i]
      const gone = broken(round.tiles, layer, row, col, round.elapsed)
      const warn = !gone && cracked(round.tiles, layer, row, col, round.elapsed)
      const centre = tileCentre(row, col)
      M.makeTranslation(centre.x, gone ? y - 6 : y - THICK / 2, centre.z)
      S.makeScale(CELL - GAP, gone ? 0.05 : THICK, CELL - GAP)
      m.setMatrixAt(i, M.multiply(S))
      colour.copy(warn ? crackColour : base)
      m.setColorAt(i, colour)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.4} />
    </instancedMesh>
  )
}

/** A heading in the rules' yaw to a turn about the world's up axis, for the avatar body. */
function bodyYaw(yaw: number): number {
  return yaw + Math.PI
}

/** One player's body: the island's pill, standing, falling, or gone under. */
function PlayerBody({ player, round, colour }: { player: Player; round: Round; colour: string }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(() => {
    const group = holder.current
    if (!group) return
    if (!player.alive) {
      const t = round.elapsed - (player.eliminatedAt ?? round.elapsed)
      group.visible = t < GONE_AFTER
      group.position.set(player.x, player.y - t * 4, player.z)
      group.rotation.set(t * 3, bodyYaw(player.yaw), t * 2)
      return
    }
    group.visible = true
    group.position.set(player.x, player.y, player.z)
    group.rotation.set(0, bodyYaw(player.yaw), 0)
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
    </group>
  )
}

/** A ring under your own body, so you can find yourself among eight. */
function YouMarker({ player, colour }: { player: Player; colour: string }) {
  const ring = useRef<Group>(null)
  useFrame(() => {
    if (!ring.current) return
    ring.current.visible = player.alive
    ring.current.position.set(player.x, player.y + 0.03, player.z)
  })
  return (
    <group ref={ring}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.72, 28]} />
        <meshBasicMaterial color={colour} />
      </mesh>
    </group>
  )
}

export function IceScene({ live, look }: { live: RefObject<Round>; look: RefObject<LookRef> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const round = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  const mineIndex = round.players.findIndex((p) => p.mine)
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers))
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.fog, 40, 160]} />
      <Rig live={live} look={look} />
      <Daylight />
      <Sea />
      <Layer live={live} layer={0} />
      <Layer live={live} layer={1} />
      <Layer live={live} layer={2} />
      {mineIndex >= 0 ? <YouMarker player={round.players[mineIndex]} colour={colours[mineIndex]} /> : null}
      {round.players.map((player, index) => (
        <PlayerBody key={`${round.id}:${player.id}`} player={player} round={round} colour={colours[index]} />
      ))}
    </>
  )
}
