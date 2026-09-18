/**
 * Synchronize Steps in three dimensions.
 *
 * One wide stone staircase, twenty steps, going down from left to right with
 * its steps numbered down the front; a lane of it for each player, its treads
 * tinted in their colour; everybody as the island's own pill.
 *
 * While picking, a bubble over your own head shows your pick, and a bubble over
 * anybody else's says only that they have picked. At the reveal every bubble
 * shows its number - green if it was alone and they stay, yellow for a pair,
 * red for a drop of eight (a crowd, or a pair on 1) - and a moment later everybody walks down to where it takes
 * them, hopping down one step at a time. Reach the bottom and you land on the
 * ground past the last step, and the game is over.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, Group, InstancedMesh, Matrix4, SRGBColorSpace, type DirectionalLight, type Sprite } from 'three'
import { createAvatar } from '../../02-player'
import { STAIRS, frameScene, hopAt, laneZ, stepX, stepY, walkAt } from './camera'
import { COLOURS, TOWER, moveFor, type Game, type Stepper } from './rules'

export const PALETTE = {
  background: '#9fd3ee',
  ground: '#6fae4f',
  stone: '#c8bfae',
  stoneDark: '#a99f8c',
  number: '#4a4238',
  bubble: '#ffffff',
  ink: '#2a2233',
  alone: '#3fae5e',
  pair: '#f2b33d',
  crowd: '#e04848',
  sunColour: '#fff4e0',
  ambientColour: '#dfe9ff',
  skyColour: '#d8efff',
  groundColour: '#5a7a3a',
} as const

/** When in the reveal the walk down starts, and how long each step of it takes. */
export const HOP = { start: 0.35, step: 0.15 } as const

const textures = new Map<string, CanvasTexture>()

/** A round label - a number or a mark - drawn once and kept. */
function labelTexture(text: string, fill: string, ink: string, round = true): CanvasTexture {
  const key = `${text}|${fill}|${ink}|${round}`
  const known = textures.get(key)
  if (known) return known
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  if (round) {
    c.fillStyle = fill
    c.beginPath()
    c.arc(64, 64, 58, 0, Math.PI * 2)
    c.fill()
    c.lineWidth = 8
    c.strokeStyle = 'rgba(0,0,0,0.35)'
    c.stroke()
  }
  c.fillStyle = ink
  c.font = `bold ${round ? (text.length > 1 ? 60 : 76) : text.length > 1 ? 78 : 96}px system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(text, 64, 69)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  textures.set(key, texture)
  return texture
}

/** The colour a revealed pick is shown in: alone, a pair, or a drop of eight (a crowd, or a pair on 1). */
export function outcomeColour(pick: number, count: number): string {
  const moved = moveFor(pick, count)
  return moved >= TOWER.crowdDrop ? PALETTE.crowd : moved > 0 ? PALETTE.pair : PALETTE.alone
}

function FixedCamera({ lanes }: { lanes: number }) {
  useFrame(({ camera, size }) => {
    const shot = frameScene(size.width / Math.max(1, size.height), lanes)
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
    Object.assign(light.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 80 })
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.bias = -0.0006
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-8, 22, 14]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.45} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.6} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The ground, the steps as solid blocks, a tread in each lane's colour, and the step numbers down the front. */
const Staircase = memo(function Staircase({ lanes }: { lanes: number }) {
  const treads = useRef<InstancedMesh>(null)
  const width = Math.max(1, lanes) * STAIRS.lane
  const front = laneZ(0, lanes) + STAIRS.lane / 2
  useLayoutEffect(() => {
    const mesh = treads.current
    if (!mesh) return
    const matrix = new Matrix4()
    const colour = new Color()
    const stone = new Color(PALETTE.stone)
    let i = 0
    for (let step = 1; step <= TOWER.steps; step++) {
      for (let lane = 0; lane < lanes; lane++) {
        matrix.makeTranslation(stepX(step), stepY(step) + 0.015, laneZ(lane, lanes))
        mesh.setMatrixAt(i, matrix)
        colour.set(COLOURS[lane % COLOURS.length]).lerp(stone, step % 2 === 0 ? 0.45 : 0.55)
        mesh.setColorAt(i, colour)
        i++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [lanes])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 80]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      {Array.from({ length: TOWER.steps }, (_, i) => {
        const step = i + 1
        return (
          <mesh key={step} position={[stepX(step), stepY(step) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[STAIRS.tread, stepY(step), width]} />
            <meshStandardMaterial color={step % 2 === 0 ? PALETTE.stone : PALETTE.stoneDark} roughness={0.9} />
          </mesh>
        )
      })}
      <instancedMesh ref={treads} args={[undefined, undefined, TOWER.steps * lanes]} receiveShadow key={lanes}>
        <boxGeometry args={[STAIRS.tread * 0.92, 0.03, STAIRS.lane * 0.86]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {Array.from({ length: TOWER.steps }, (_, i) => {
        const step = i + 1
        // As big as the step's front allows, just under its tread.
        const size = Math.min(0.8, stepY(step) - 0.04)
        return (
          <mesh key={step} position={[stepX(step), stepY(step) - size / 2 - 0.02, front + 0.01]}>
            <planeGeometry args={[size, size]} />
            <meshBasicMaterial map={labelTexture(String(step), '', PALETTE.number, false)} transparent />
          </mesh>
        )
      })}
    </group>
  )
})

/** Where a player stands this frame, and the step the hop set out from. */
function placeOf(game: Game, stepper: Stepper): { x: number; y: number } {
  if (game.phase === 'reveal') {
    const t = game.clock - HOP.start
    if (stepper.out && stepper.out.round === game.round) return walkAt(stepper.out.from, 0, t, HOP.step)
    if (!stepper.out && stepper.last) return walkAt(stepper.step + stepper.last.moved, stepper.step, t, HOP.step)
  }
  return hopAt(stepper.step, stepper.step, 1)
}

/** One player on their lane, and the bubble over their head. */
function Player({ index, count, live }: { index: number; count: number; live: RefObject<Game> }) {
  const body = useRef<Group>(null)
  const bubble = useRef<Sprite>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const z = laneZ(index, count)
  useFrame(() => {
    const g = live.current
    const stepper = g.players[index]
    if (!body.current || !bubble.current || !stepper) return
    const at = placeOf(g, stepper)
    body.current.position.set(at.x, at.y, z)

    let label: CanvasTexture | null = null
    if (g.phase === 'choose' && !stepper.out && stepper.pick !== null) {
      label = stepper.mine && stepper.pick > 0 ? labelTexture(String(stepper.pick), PALETTE.bubble, PALETTE.ink) : labelTexture('✓', PALETTE.bubble, PALETTE.ink)
    } else if (g.phase === 'reveal' && stepper.last && (!stepper.out || stepper.out.round === g.round) && stepper.pick !== null) {
      label = labelTexture(String(stepper.last.pick), outcomeColour(stepper.last.pick, stepper.last.with), PALETTE.bubble)
    }
    bubble.current.visible = label !== null
    if (label && bubble.current.material.map !== label) {
      bubble.current.material.map = label
      bubble.current.material.needsUpdate = true
    }
    bubble.current.position.set(at.x, at.y + STAIRS.height + 0.45, z)
  })
  return (
    <group>
      <group ref={body} position={[stepX(TOWER.steps), stepY(TOWER.steps), z]}>
        <group scale={STAIRS.scale}>
          <primitive object={avatar} />
        </group>
      </group>
      <sprite ref={bubble} scale={[0.72, 0.72, 1]} visible={false} renderOrder={10}>
        <spriteMaterial depthTest={false} transparent />
      </sprite>
    </group>
  )
}

export function SynchronizeStepsScene({ live }: { live: RefObject<Game> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const count = game.players.length
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera lanes={Math.max(1, count)} />
      <Lights />
      <Staircase lanes={Math.max(1, count)} />
      {game.players.map((stepper, index) => (
        <Player key={`${game.id}:${stepper.id}`} index={index} count={count} live={live} />
      ))}
    </>
  )
}
