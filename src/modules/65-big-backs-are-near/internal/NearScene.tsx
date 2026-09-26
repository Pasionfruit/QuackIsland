/**
 * Big Backs are Near, in three dimensions, from each player's own point of
 * view.
 *
 * **The Hunter** looks out from their own eyes, first person, with a short
 * camera `far` and a tight fog on top of it - two belts on the same
 * near-sightedness, since fog alone still lets a shape loom out of it a
 * frame before it should. **A Hider** is behind and above their own body,
 * third person, the same rig `64-jackal`'s `RunnerCamera` uses, with
 * ordinary long-range fog - the brief gives Hiders no vision handicap.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live round each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, InstancedMesh, Matrix4, Vector3, type DirectionalLight, type PerspectiveCamera } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { MAZE, mazeFor, type Block } from './maze'
import { BODY, COLOURS, HUNTER, type Round } from './rules'

export const PALETTE = {
  sky: '#cfe0a8',
  hunterSky: '#33361f',
  ground: '#6b7a3d',
  groundDark: '#5c6a34',
  corn: '#c2a233',
  cornDark: '#8a7226',
  hunterMark: '#d9443a',
} as const

/** The mouse's own look, kept by the screen. */
export interface LookRef {
  yaw: number
  pitch: number
}

/** How far behind a Hider the camera sits, and how it climbs with the pitch. */
const CAM_BACK = 6.5
const CAM_UP = 1.6
export const PITCH = { min: -0.2, max: 1.1 } as const

const target = new Vector3()
const eye = new Vector3()

/** First person, from the Hunter's own eyes - a short `far` plane on top of the fog, so nothing looms out of the murk a frame early. */
function HunterCamera({ live, look }: { live: RefObject<Round>; look: RefObject<LookRef> }) {
  useFrame(({ camera }) => {
    const round = live.current
    const hunter = round.players.find((p) => p.role === 'hunter')
    const cam = camera as unknown as PerspectiveCamera
    if (!hunter) {
      camera.position.set(0, BODY.eye + 20, 20)
      camera.lookAt(0, BODY.eye, 0)
      return
    }
    camera.position.set(hunter.x, BODY.eye, hunter.z)
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ')
    camera.updateMatrixWorld()
    const wantFar = HUNTER.sightRadius + 3
    if (Math.abs(cam.far - wantFar) > 0.05) {
      cam.far = wantFar
      cam.updateProjectionMatrix()
    }
  })
  return null
}

/** Third person, behind and above your own Hider: pulled back to watch the whole pen once you are caught or the round has decided - the same shape as Jackal's `RunnerCamera`. */
function HiderCamera({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
  const at = useRef<Vector3 | null>(null)
  useFrame(({ camera }, delta) => {
    const round = live.current
    const mine = round.players.find((p) => p.id === me)
    const watching = !mine || !mine.alive || round.over
    const { yaw, pitch } = look.current
    const distance = watching ? 46 : CAM_BACK
    if (watching) target.set(0, 6, 0)
    else target.set(mine.x, BODY.eye + 0.3, mine.z)
    eye.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance + CAM_UP + (watching ? 20 : 0), target.z + Math.cos(yaw) * Math.cos(pitch) * distance)
    if (!at.current) at.current = eye.clone()
    else at.current.lerp(eye, 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 14)))
    camera.position.copy(at.current)
    camera.lookAt(target)
  })
  return null
}

function Daylight({ dim }: { dim: boolean }) {
  const sun = useRef<DirectionalLight>(null)
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        position={[24, 40, 14]}
        intensity={dim ? 1.1 : 2.1}
        color="#fff2cf"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <ambientLight intensity={dim ? 0.35 : 0.6} color="#dfe8c0" />
      <hemisphereLight intensity={dim ? 0.4 : 0.75} color={PALETTE.sky} groundColor={PALETTE.ground} />
    </>
  )
}

function Ground() {
  const half = (MAZE.size * MAZE.cell) / 2 + 4
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[half * 3, half * 3]} />
        <meshStandardMaterial color={PALETTE.groundDark} roughness={1} />
      </mesh>
    </>
  )
}

const M = new Matrix4()
const S = new Matrix4()

/** Every corn row, instanced - hundreds of blocks over one draw call. */
function MazeView({ seed }: { seed: number }) {
  const boxes = useRef<InstancedMesh>(null)
  const blocks = useMemo(() => mazeFor(seed).blocks, [seed])
  useLayoutEffect(() => {
    const mesh = boxes.current
    if (!mesh) return
    const a = new Color(PALETTE.corn)
    const b = new Color(PALETTE.cornDark)
    const colour = new Color()
    blocks.forEach((block: Block, i) => {
      M.makeTranslation((block.x0 + block.x1) / 2, block.height / 2, (block.z0 + block.z1) / 2)
      S.makeScale(block.x1 - block.x0, block.height, block.z1 - block.z0)
      mesh.setMatrixAt(i, M.multiply(S))
      mesh.setColorAt(i, colour.copy(i % 2 === 0 ? a : b))
    })
    mesh.count = blocks.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [blocks])
  return (
    <instancedMesh ref={boxes} args={[undefined, undefined, Math.max(1, blocks.length)]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}

/** Somebody else's body: the island's avatar in their colour, hidden once caught, left, or your own. */
function BodyView({ index, live, colours, isHunter }: { index: number; live: RefObject<Round>; colours: readonly string[]; isHunter: boolean }) {
  const group = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const colour = colours[index]
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(() => {
    const round = live.current
    const p = round.players[index]
    if (!group.current || !turn.current || !p) return
    group.current.visible = !p.left && !p.mine && p.alive
    group.current.position.set(p.x, 0, p.z)
    turn.current.rotation.y = p.yaw + Math.PI
  })

  return (
    <group ref={group}>
      <group ref={turn}>
        <primitive object={avatar} />
      </group>
      {isHunter ? (
        <mesh position={[0, 2.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.27, 20]} />
          <meshBasicMaterial color={PALETTE.hunterMark} />
        </mesh>
      ) : null}
    </group>
  )
}

export function NearScene({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
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
  const mine = round.players.find((p) => p.id === me)
  const iAmHunter = mine?.role === 'hunter'
  const sky = iAmHunter ? PALETTE.hunterSky : PALETTE.sky
  const background = useMemo(() => new Color(sky), [sky])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(() => round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)), [round.players, myColour, peers])

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={iAmHunter ? [sky, 1.5, HUNTER.sightRadius] : [sky, 24, 140]} />
      <Daylight dim={iAmHunter} />
      {iAmHunter ? <HunterCamera live={live} look={look} /> : <HiderCamera live={live} look={look} me={me} />}
      <Ground />
      {round.players.length > 0 ? <MazeView seed={round.seed} /> : null}
      {round.players.map((p, index) => (p.mine ? null : <BodyView key={`${round.id}:${p.id}`} index={index} live={live} colours={colours} isHunter={p.role === 'hunter'} />))}
    </>
  )
}
