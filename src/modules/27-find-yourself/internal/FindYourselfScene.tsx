/**
 * Find Yourself in three dimensions.
 *
 * A wooden table with a row of red cups on it, every one the same, and under
 * them the faces: each player as the island's own pill in their colour, small
 * enough to fit under a cup. The cups lift to show the faces, come down,
 * shuffle - two at a time, passing each other on arcs - and lift again after
 * the picks.
 *
 * When it is time to pick, the cup under the pointer gets a ring on the table,
 * and your own pick a ring in your colour. When the cups come up, a marker in
 * every picker's colour stands in front of the cup they chose.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, Vector2, Vector3, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createAvatar } from '../../02-player'
import { CUP_HEIGHT, LIFT, LIFT_BACK, TOP, frameScene, pickSlot } from './camera'
import { COLOURS, TABLE, cupCount, cupsAt, currentStage, facesBySlot, slotX, type Game } from './rules'

export const PALETTE = {
  background: '#2e3a4a',
  floor: '#3b4656',
  table: '#a7744a',
  tableEdge: '#8a5d38',
  cloth: '#2f7d55',
  cup: '#d8423a',
  cupRim: '#f1e6d8',
  hover: '#ffffff',
  sunColour: '#fff2dc',
  ambientColour: '#dfe8ff',
  skyColour: '#dfe8ff',
  groundColour: '#4a3a2c',
} as const

/** How small a face is, under a cup. */
const FACE_SCALE = 0.72

export interface SceneHands {
  /** Whether a click would pick right now. */
  canPick: () => boolean
  onPick: (slot: number) => void
}

function FixedCamera({ cups }: { cups: number }) {
  useFrame(({ camera, size }) => {
    const shot = frameScene(size.width / Math.max(1, size.height), cups)
    if (camera.position.x === shot.x && camera.position.y === shot.y && camera.position.z === shot.z) return
    camera.position.set(shot.x, shot.y, shot.z)
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
    camera.updateProjectionMatrix()
  })
  return null
}

function Lamp() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 60 })
    light.shadow.mapSize.set(2048, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-3, 18, 8]} intensity={2.2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.6} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The floor, the table and its green cloth, long enough for this many cups. */
const Table = memo(function Table({ cups }: { cups: number }) {
  const length = Math.abs(slotX(0, cups)) * 2 + 3.2
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={1} />
      </mesh>
      <mesh position={[0, TOP / 2 - 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, TOP - 0.1, 5]} />
        <meshStandardMaterial color={PALETTE.tableEdge} roughness={0.8} />
      </mesh>
      <mesh position={[0, TOP - 0.05, 0]} receiveShadow>
        <boxGeometry args={[length + 0.3, 0.1, 5.3]} />
        <meshStandardMaterial color={PALETTE.table} roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TOP + 0.005, 0]} receiveShadow>
        <planeGeometry args={[length - 0.4, 4.4]} />
        <meshStandardMaterial color={PALETTE.cloth} roughness={1} />
      </mesh>
    </group>
  )
})

/** A face: the player's own pill, small, looking at the camera. */
function Face({ player, live, cup }: { player: number; live: RefObject<Game>; cup: number }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(COLOURS[player % COLOURS.length]), [player])
  useFrame(() => {
    const group = holder.current
    if (!group) return
    const place = cupsAt(live.current).find((c) => c.cup === cup)
    if (!place) return
    // Faces only show while their cup is up; they ride along under it otherwise, out of sight.
    group.position.set(place.x, TOP, place.arc)
    group.visible = place.lift > 0.05
  })
  return (
    <group ref={holder} scale={FACE_SCALE}>
      <primitive object={avatar} />
    </group>
  )
}

/** One cup, wherever the shuffle has it. */
function Cup({ cup, live }: { cup: number; live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  useFrame(() => {
    const group = holder.current
    if (!group) return
    const place = cupsAt(live.current).find((c) => c.cup === cup)
    if (!place) return
    group.position.set(place.x, TOP + place.lift * LIFT, place.arc - place.lift * LIFT_BACK)
    // Tipped back as it lifts, like a hand lifting it off.
    group.rotation.set(-place.lift * 0.35, 0, 0)
  })
  return (
    <group ref={holder}>
      <mesh position={[0, CUP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[TABLE.cup * 0.7, TABLE.cup, CUP_HEIGHT, 28, 1, true]} />
        <meshStandardMaterial color={PALETTE.cup} roughness={0.45} side={2} />
      </mesh>
      <mesh position={[0, CUP_HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <circleGeometry args={[TABLE.cup * 0.7, 28]} />
        <meshStandardMaterial color={PALETTE.cup} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TABLE.cup, 0.045, 8, 32]} />
        <meshStandardMaterial color={PALETTE.cupRim} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** A ring on the table under a slot: the cup under the pointer, or your own pick. */
function SlotRing({ live, which, hovered }: { live: RefObject<Game>; which: 'hover' | 'mine'; hovered: { current: number | null } }) {
  const ring = useRef<Group>(null)
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    const box = ring.current
    if (!box) return
    const g = live.current
    const cups = cupCount(g.players.length)
    const mineIndex = g.players.findIndex((p) => p.mine)
    const mine = g.players[mineIndex]
    let slot: number | null = null
    if (which === 'hover') slot = g.phase === 'pick' && mine && mine.picks[g.stage] === null ? hovered.current : null
    else {
      const picked = mine?.picks[g.stage]
      slot = g.phase === 'pick' || g.phase === 'result' || g.phase === 'over' ? (picked !== null && picked !== undefined && picked >= 0 ? picked : null) : null
    }
    box.visible = slot !== null
    if (slot === null) return
    box.position.set(slotX(slot, cups), TOP + 0.02, 0)
    material.current?.color.set(which === 'hover' ? PALETTE.hover : COLOURS[mineIndex % COLOURS.length])
  })
  return (
    <group ref={ring} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TABLE.cup * 1.08, TABLE.cup * (which === 'hover' ? 1.2 : 1.32), 36]} />
        <meshBasicMaterial ref={material} color={PALETTE.hover} />
      </mesh>
    </group>
  )
}

/** After the cups come up: a marker in each picker's colour in front of the cup they chose. */
function PickMarkers({ live }: { live: RefObject<Game> }) {
  const g = live.current
  if (g.phase !== 'result' && g.phase !== 'over') return null
  const cups = cupCount(g.players.length)
  const bySlot = facesBySlot(currentStage(g))
  const stacks = new Map<number, number>()
  return (
    <>
      {g.players.map((finder, player) => {
        const slot = finder.picks[g.stage]
        if (slot === null || slot < 0) return null
        const n = stacks.get(slot) ?? 0
        stacks.set(slot, n + 1)
        const right = bySlot[slot] === player
        return (
          <mesh key={finder.id} position={[slotX(slot, cups) - 0.5 + (n % 4) * 0.33, TOP + 0.12, 1.25 + Math.floor(n / 4) * 0.33]} castShadow>
            <sphereGeometry args={[right ? 0.16 : 0.12, 14, 10]} />
            <meshStandardMaterial color={COLOURS[player % COLOURS.length]} emissive={COLOURS[player % COLOURS.length]} emissiveIntensity={right ? 0.6 : 0} />
          </mesh>
        )
      })}
    </>
  )
}

/** The pointer and clicks, turned into a slot. */
function Pointer({ live, hands, hovered }: { live: RefObject<Game>; hands: SceneHands; hovered: { current: number | null } }) {
  const { camera, gl } = useThree()
  const ndc = useRef<Vector2 | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }
    const move = (e: PointerEvent) => {
      ndc.current = at(e)
    }
    const leave = () => {
      ndc.current = null
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !hands.canPick()) return
      const point = at(e)
      const direction = new Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
      const slot = pickSlot(camera.position, direction, cupCount(live.current.players.length))
      if (slot !== null) hands.onPick(slot)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
    }
  }, [camera, gl, hands, live])

  useFrame(() => {
    const point = ndc.current
    if (!point || !hands.canPick()) {
      hovered.current = null
      gl.domElement.style.cursor = 'default'
      return
    }
    const direction = new Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
    hovered.current = pickSlot(camera.position, direction, cupCount(live.current.players.length))
    gl.domElement.style.cursor = hovered.current !== null ? 'pointer' : 'default'
  })
  return null
}

export function FindYourselfScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const hovered = useRef<number | null>(null)
  const ready = game.players.length > 0
  const cups = cupCount(Math.max(1, game.players.length))
  const stage = ready ? currentStage(game) : null
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera cups={cups} />
      <Lamp />
      <Table cups={cups} />
      {stage
        ? stage.faces.map((player, cup) => (
            <group key={`${game.id}:${game.stage}:${cup}`}>
              <Cup cup={cup} live={live} />
              {player >= 0 ? <Face player={player} live={live} cup={cup} /> : null}
            </group>
          ))
        : null}
      <SlotRing live={live} which="hover" hovered={hovered} />
      <SlotRing live={live} which="mine" hovered={hovered} />
      <PickMarkers live={live} />
      <Pointer live={live} hands={hands} hovered={hovered} />
    </>
  )
}
