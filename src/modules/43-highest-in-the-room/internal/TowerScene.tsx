/**
 * Highest In The Room in three dimensions, side on.
 *
 * A row of towers in a tall room, one each, built of blocks in their owner's
 * colour, two shades turn about so you can count them. Everybody is the
 * island's capsule standing on top of their own. A right key hops you up onto
 * a new block; a wrong one drops you four, the tower sinking under you.
 *
 * **The camera follows whoever is highest**, and so does a red band ten blocks
 * below them: sink into it and you are out. A tower that is out goes grey.
 * Stripes on the back wall every five blocks show how fast everybody is going.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three'
import { createAvatar } from '../../02-player'
import { CLIMB, COLOURS, isIn, leaderHeight, type Game } from './rules'

export const PALETTE = {
  wall: '#efe4d2',
  stripe: '#d9c7ab',
  floor: '#b98a5c',
  out: '#9a95a3',
  danger: '#e0342c',
} as const

/** How tall a block is, and how far apart the towers stand, metres. */
export const BLOCK = 1
export const SPACING = 2.1
/** How many blocks under the top of each tower are drawn: the red band and a little more. */
const DRAWN = CLIMB.behind + 6
const MAX_BLOCKS = 8 * (DRAWN + 1)

/** Where a tower stands, of `count` in a row. */
export function towerX(index: number, count: number): number {
  return (index - (count - 1) / 2) * SPACING
}

/** How far right of the row the camera looks, metres: the room the arrow panel takes. */
const PANEL = 3

const M = new Matrix4()
const S = new Matrix4()

/** The camera on whoever is highest, far enough back to see everybody and the band. */
function Rig({ live, shown }: { live: RefObject<Game>; shown: RefObject<number[]> }) {
  const y = useRef<number | null>(null)
  useFrame(({ camera, size }, delta) => {
    const g = live.current
    const top = g.players.reduce((m, p, i) => (isIn(p) ? Math.max(m, shown.current[i] ?? p.height) : m), 0)
    const count = Math.max(1, g.players.length)
    // Room for the widest row, for twelve blocks up and down, and on the right for the arrow panel.
    const wide = (count * SPACING + 2 + PANEL * 2) / Math.max(0.5, size.width / Math.max(1, size.height))
    const distance = Math.max(17, wide / 0.93)
    const want = top * BLOCK - 3
    y.current = y.current === null ? want : y.current + (want - y.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 5))
    // Looking a little right of the row, so the towers sit left of the panel.
    camera.position.set(PANEL, y.current + 2.5, distance)
    camera.lookAt(PANEL, y.current, 0)
  })
  return null
}

/** Every tower's blocks near the top, and the stripes on the wall, instanced. */
function Towers({ live, shown }: { live: RefObject<Game>; shown: RefObject<number[]> }) {
  const blocks = useRef<InstancedMesh>(null)
  const stripes = useRef<InstancedMesh>(null)
  const colour = useMemo(() => new Color(), [])
  useFrame((_, delta) => {
    const g = live.current
    const mesh = blocks.current
    if (!mesh) return
    const count = g.players.length
    let n = 0
    g.players.forEach((p, i) => {
      // Up at once; down with a fall.
      const was = shown.current[i] ?? p.height
      const now = p.height >= was ? p.height : was + (p.height - was) * (1 - Math.exp(-Math.min(delta, 0.1) * 9))
      shown.current[i] = Math.abs(now - p.height) < 0.01 ? p.height : now
      const top = Math.round(p.height)
      const x = towerX(i, count)
      const base = isIn(p) ? COLOURS[i % COLOURS.length] : PALETTE.out
      for (let b = Math.max(0, top - DRAWN); b < top && n < MAX_BLOCKS; b++) {
        // Block b sits with its top at b + 1, sunk by however far the tower is still falling.
        const y = (b + 0.5) * BLOCK + (shown.current[i] - p.height) * BLOCK
        M.makeTranslation(x, y, 0)
        S.makeScale(1.2, BLOCK * 0.96, 1.2)
        mesh.setMatrixAt(n, M.multiply(S))
        colour.set(base)
        if (b % 2 === 1) colour.multiplyScalar(0.82)
        mesh.setColorAt(n, colour)
        n += 1
      }
    })
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    // Stripes every five blocks, round where the camera is.
    const lines = stripes.current
    if (lines) {
      const mid = Math.round(leaderHeight(g) / 5) * 5
      let k = 0
      for (let h = mid - 20; h <= mid + 10; h += 5) {
        if (h <= 0) continue
        M.makeTranslation(0, h * BLOCK, -2.5)
        S.makeScale(60, 0.08, 0.05)
        lines.setMatrixAt(k++, M.multiply(S))
      }
      lines.count = k
      lines.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={blocks} args={[undefined, undefined, MAX_BLOCKS]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={stripes} args={[undefined, undefined, 8]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={PALETTE.stripe} roughness={1} />
      </instancedMesh>
    </>
  )
}

/** Somebody on top of their tower: a hop when they get one right, a shake when they get one wrong. */
function Climber({ index, live, shown }: { index: number; live: RefObject<Game>; shown: RefObject<number[]> }) {
  const group = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  useFrame(() => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !p) return
    group.current.visible = isIn(p)
    const hop = g.elapsed - p.pressedAt
    const lift = hop >= 0 && hop < 0.18 && p.wrongAt !== p.pressedAt ? Math.sin((hop / 0.18) * Math.PI) * 0.35 : 0
    const shake = g.elapsed - p.wrongAt
    const wobble = shake >= 0 && shake < 0.5 ? Math.sin(shake * 40) * 0.25 * (1 - shake / 0.5) : 0
    group.current.position.set(towerX(index, g.players.length), (shown.current[index] ?? p.height) * BLOCK + lift, 0)
    group.current.rotation.z = wobble
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
    </group>
  )
}

/** The band ten blocks under whoever is highest: into it, and you are out. */
function Danger({ live }: { live: RefObject<Game> }) {
  const band = useRef<Mesh>(null)
  const y = useRef(0)
  useFrame(({ clock }, delta) => {
    const g = live.current
    const want = (leaderHeight(g) - CLIMB.behind) * BLOCK
    y.current += (want - y.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 6))
    if (!band.current) return
    band.current.visible = want > 0 && !g.over
    // Its top edge is the line: a tower whose top is below it is out.
    band.current.position.set(0, y.current - 0.6, 0.2)
    ;(band.current.material as MeshBasicMaterial).opacity = 0.35 + 0.1 * Math.sin(clock.elapsedTime * 6)
  })
  return (
    <mesh ref={band} visible={false} renderOrder={5}>
      <boxGeometry args={[60, 1.2, 3.5]} />
      <meshBasicMaterial color={PALETTE.danger} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

export function TowerScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is in the room changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  // How high each tower is drawn: eased, so a knock-down sinks rather than jumps.
  const shown = useRef<number[]>([])
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      shown.current = []
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.wall), [])
  useLayoutEffect(() => {
    shown.current = []
  }, [game.id])
  return (
    <>
      <color attach="background" args={[background]} />
      <hemisphereLight args={['#ffffff', '#b98a5c', 1.6]} />
      {/* No shadows: the towers climb out of any shadow camera's reach, and flat light reads the blocks fine. */}
      <directionalLight position={[6, 12, 10]} intensity={1.8} />
      <Rig live={live} shown={shown} />
      {/* The back wall and the floor of the room. */}
      <mesh position={[0, 0, -2.6]}>
        <planeGeometry args={[80, 4000]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 40]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={1} />
      </mesh>
      <Towers live={live} shown={shown} />
      {game.players.map((p, index) => (
        <Climber key={`${game.id}:${p.id}`} index={index} live={live} shown={shown} />
      ))}
      <Danger live={live} />
    </>
  )
}
