/**
 * Keyboard Warrior in three dimensions.
 *
 * A round sand arena in the evening, everybody lined up across the back of it in
 * their colours, facing you. **The letter is a big cream tile that pops up
 * somewhere new in the space in front of them**, bobbing and swaying a little so
 * it never sits still to be read.
 *
 * When somebody gets it, the tile flies to them and shrinks away, a +1 rises
 * over their head and they hop. When nobody does, it drops out of the air. A
 * wrong key gets a red cross over your head and a shake of the body; once the
 * letter is decided, a green tick shows over everybody else who had it right but
 * was slower.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, Group, SRGBColorSpace, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type PerspectiveCamera } from 'three'
import { createAvatar } from '../../02-player'
import { FOV, TILE, cameraFor, standPoint } from './camera'
import { COLOURS, ROUND, type Game } from './rules'

export const PALETTE = {
  sky: '#f3b58a',
  ground: '#d8a86f',
  arena: '#ecd4a4',
  rim: '#b0784a',
  tile: '#fff6e3',
  ink: '#2a2233',
  right: '#2f9e5b',
  wrong: '#d9443a',
} as const

const FONT = "ui-rounded, 'Segoe UI', system-ui, -apple-system, sans-serif"

const textures = new Map<string, CanvasTexture>()

/** A texture with `text` drawn big in `colour` on nothing. */
function glyph(text: string, colour: string, weight = 800): CanvasTexture {
  const key = `${text}:${colour}:${weight}`
  const known = textures.get(key)
  if (known) return known
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const c = canvas.getContext('2d')!
  c.fillStyle = colour
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `${weight} ${text.length > 1 ? 150 : 200}px ${FONT}`
  c.fillText(text, 128, 140)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  textures.set(key, texture)
  return texture
}

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
/** How long the tile takes to fly to the winner, seconds. */
const FLY = 0.45

/** The still camera, fitted to the window. */
function FixedCamera() {
  useFrame(({ camera, size }) => {
    const fitted = cameraFor(size.width / Math.max(1, size.height))
    if (camera.position.equals(fitted.position)) return
    camera.position.copy(fitted.position)
    camera.quaternion.copy(fitted.quaternion)
    ;(camera as PerspectiveCamera).fov = FOV
    ;(camera as PerspectiveCamera).updateProjectionMatrix()
  })
  return null
}

function Arena() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7.5, 64]} />
        <meshStandardMaterial color={PALETTE.arena} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <torusGeometry args={[7.5, 0.18, 10, 64]} />
        <meshStandardMaterial color={PALETTE.rim} roughness={0.8} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        // Posts round the back half only: nothing between the camera and the letters.
        const a = Math.PI * (0.05 + (i / 9) * 0.9)
        return (
          <mesh key={i} position={[Math.cos(a) * 7.6, 0.7, -Math.sin(a) * 7.6]} castShadow>
            <cylinderGeometry args={[0.16, 0.2, 1.4, 12]} />
            <meshStandardMaterial color={PALETTE.rim} roughness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Where a player's head is, for the tile to fly to and the marks to sit over. */
function headOf(count: number, index: number) {
  const at = standPoint(count, index)
  return { x: at.x, y: 2.25, z: at.z }
}

/** One player: their body in their colour, a disc under it, and the marks over their head. */
function PlayerView({ index, live }: { index: number; live: RefObject<Game> }) {
  const body = useRef<Group>(null)
  const cross = useRef<Mesh>(null)
  const tick = useRef<Mesh>(null)
  const plus = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(() => {
    const g = live.current
    const p = g.players[index]
    if (!body.current || !p) return
    const letter = g.letter
    const t = g.elapsed
    const own = letter.attempts.find((a) => a.player === index)
    const decided = letter.closedAt !== null
    const wrong = !!own && own.key !== letter.char
    body.current.visible = !p.left
    // A hop for the point; a shake for a wrong key.
    const sinceWin = decided && letter.winner === index ? t - letter.closedAt! : Infinity
    body.current.position.y = sinceWin < 0.6 ? Math.sin((sinceWin / 0.6) * Math.PI) * 0.45 : 0
    const sinceWrong = wrong ? t - own!.heardAt : Infinity
    body.current.rotation.z = sinceWrong >= 0 && sinceWrong < 0.4 ? Math.sin(sinceWrong * 40) * 0.12 * (1 - sinceWrong / 0.4) : 0
    if (cross.current) cross.current.visible = wrong && !p.left
    if (tick.current) tick.current.visible = decided && !!own && !wrong && letter.winner !== index && !p.left
    if (plus.current) {
      const r = sinceWin - FLY
      plus.current.visible = r >= 0 && r < ROUND.show - FLY
      plus.current.position.y = 2.45 + r * 0.6
      ;(plus.current.material as MeshBasicMaterial).opacity = clamp01(1 - r / (ROUND.show - FLY))
    }
  })

  const g = live.current
  const at = standPoint(g.players.length, index)
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.6, 32]} />
        <meshBasicMaterial color={colour} transparent opacity={0.55} />
      </mesh>
      <group ref={body}>
        <primitive object={avatar} />
      </group>
      <mesh ref={cross} position={[0, 2.35, 0.1]} visible={false}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial map={glyph('✗', PALETTE.wrong)} transparent depthWrite={false} />
      </mesh>
      <mesh ref={tick} position={[0, 2.35, 0.1]} visible={false}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshBasicMaterial map={glyph('✓', PALETTE.right)} transparent depthWrite={false} />
      </mesh>
      <mesh ref={plus} position={[0, 2.45, 0.2]} visible={false}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshBasicMaterial map={glyph('+1', colour, 900)} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

/** The letter: pops up where it floats, bobs, and flies to whoever got it - or drops. */
function LetterTile({ live }: { live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const tile = useRef<Mesh>(null)
  const face = useRef<Mesh>(null)
  const tint = useMemo(() => new Color(), [])

  useFrame(() => {
    const g = live.current
    const letter = g.letter
    const t = g.elapsed
    if (!group.current || !tile.current || !face.current) return
    const decidedFor = letter.closedAt === null ? -1 : t - letter.closedAt
    const shown = g.players.length > 0 && !g.over && t >= letter.appearsAt && decidedFor < ROUND.show
    group.current.visible = shown
    if (!shown) return

    const faceMaterial = face.current.material as MeshBasicMaterial
    const texture = glyph(letter.char, PALETTE.ink, 900)
    if (faceMaterial.map !== texture) {
      faceMaterial.map = texture
      faceMaterial.needsUpdate = true
    }
    const tileMaterial = tile.current.material as MeshStandardMaterial
    const age = t - letter.appearsAt
    let scale = easeOutBack(clamp01(age / 0.25))
    let x = letter.x
    let y = letter.y + Math.sin(t * 2.2 + letter.index) * 0.12
    let z = letter.z
    let turn = Math.sin(t * 1.3 + letter.index * 1.7) * 0.28
    tint.set(PALETTE.tile)
    tileMaterial.opacity = 1
    faceMaterial.opacity = 1

    if (decidedFor >= 0 && letter.winner !== null) {
      // To the winner's head, shrinking as it goes.
      const k = easeInOut(clamp01(decidedFor / FLY))
      const head = headOf(g.players.length, letter.winner)
      x += (head.x - x) * k
      y += (head.y - y) * k
      z += (head.z - z) * k
      scale *= 1 - 0.85 * k
      turn *= 1 - k
      tint.set(PALETTE.tile).lerp(new Color(COLOURS[letter.winner % COLOURS.length]), Math.min(1, decidedFor * 6))
      if (decidedFor >= FLY) group.current.visible = false
    } else if (decidedFor >= 0) {
      // Nobody: it drops out of the air and fades.
      y -= decidedFor * decidedFor * 5
      tileMaterial.opacity = faceMaterial.opacity = clamp01(1 - decidedFor / 0.7)
    }
    tileMaterial.color.copy(tint)
    group.current.position.set(x, y, z)
    group.current.rotation.set(0, turn, Math.sin(t * 1.7 + letter.index) * 0.06)
    group.current.scale.setScalar(Math.max(0.001, scale))
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={tile} castShadow>
        <boxGeometry args={[TILE.half * 2, TILE.half * 2, 0.28]} />
        {/* Lit a little from inside, so it reads as bright card whichever way it turns. */}
        <meshStandardMaterial color={PALETTE.tile} emissive={PALETTE.tile} emissiveIntensity={0.45} roughness={0.5} transparent />
      </mesh>
      <mesh ref={face} position={[0, 0, 0.145]}>
        <planeGeometry args={[TILE.half * 2, TILE.half * 2]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

export function KeyboardWarriorScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is in the arena changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.sky, 25, 70]} />
      <hemisphereLight args={['#ffe9d2', '#b88a5a', 1.2]} />
      <directionalLight position={[-6, 12, 9]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <FixedCamera />
      <Arena />
      {game.players.map((p, index) => (
        <PlayerView key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
      <LetterTile live={live} />
    </>
  )
}
