/**
 * Time It in three dimensions.
 *
 * A stage with a curtain behind it, a big stopwatch standing at the back, and
 * everybody in a row at the front as the island's own pill in their colour,
 * each behind a big button. The stopwatch's hand sweeps a full turn every ten
 * seconds; two and a half seconds in, a cover with a question mark swings down
 * over the face.
 *
 * Your own button goes down when you stop. Everybody else's - and the answer -
 * wait for the end: then the cover lifts, a green hand points at the target, a
 * mark in every player's colour sits round the dial where they stopped, and
 * **everybody's time is up on the front of their button's stand**.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, Group, SRGBColorSpace, type DirectionalLight } from 'three'
import { createAvatar } from '../../02-player'
import { STAGE, frameScene, standX } from './camera'
import { COLOURS, WATCH, showing, stopwatch, targetFor, type Game } from './rules'

export const PALETTE = {
  background: '#2a2233',
  floor: '#7a5238',
  curtain: '#7c2233',
  rim: '#c9ccd2',
  face: '#fbf8f1',
  tick: '#2b2b2b',
  hand: '#d8423a',
  target: '#2f9e5b',
  cover: '#2f2a3a',
  mark: '#ffd35a',
  pedestal: '#3c3a44',
  button: '#e8505b',
  sunColour: '#fff1dc',
  ambientColour: '#e6dcff',
  skyColour: '#f0e6ff',
  groundColour: '#3a2a22',
} as const

/** A full turn of the hand, in seconds. */
const TURN = 10

const FONT = "ui-rounded, 'Segoe UI', system-ui, -apple-system, sans-serif"
const labels = new Map<string, CanvasTexture>()

/** A plate with a time on it, in the player's colour: `12.34s`, or a dash for nobody who stopped. */
function timeLabel(text: string, colour: string): CanvasTexture {
  const key = `${text}:${colour}`
  const known = labels.get(key)
  if (known) return known
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const c = canvas.getContext('2d')!
  c.fillStyle = '#2a2233'
  c.beginPath()
  c.roundRect(6, 6, 500, 148, 34)
  c.fill()
  c.lineWidth = 10
  c.strokeStyle = colour
  c.stroke()
  c.fillStyle = '#ffffff'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `800 96px ${FONT}`
  c.fillText(text, 256, 86)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  labels.set(key, texture)
  return texture
}

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

function Lights() {
  const spot = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = spot.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -12, right: 12, top: 10, bottom: -4, near: 1, far: 60 })
    light.shadow.mapSize.set(2048, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={spot} castShadow position={[3, 14, 12]} intensity={2.2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.6} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** Angle of the hand for a stopwatch time: twelve o'clock at nought, clockwise. */
function handAngle(seconds: number): number {
  return -(seconds / TURN) * Math.PI * 2
}

/** The floor, the curtain, and the stopwatch's body, rim, face and ticks. */
const Stage = memo(function Stage() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 7, -6]} receiveShadow>
        <planeGeometry args={[60, 14]} />
        <meshStandardMaterial color={PALETTE.curtain} roughness={1} />
      </mesh>
      <group position={[0, STAGE.watchY, STAGE.watchZ]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[STAGE.watchRadius + 0.3, STAGE.watchRadius + 0.3, 0.6, 48]} />
          <meshStandardMaterial color={PALETTE.rim} roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.31]}>
          <circleGeometry args={[STAGE.watchRadius, 48]} />
          <meshStandardMaterial color={PALETTE.face} roughness={0.6} />
        </mesh>
        {Array.from({ length: 50 }, (_, i) => {
          const a = (i / 50) * Math.PI * 2
          const major = i % 5 === 0
          const r = STAGE.watchRadius - (major ? 0.28 : 0.2)
          return (
            <mesh key={i} position={[Math.sin(a) * r, Math.cos(a) * r, 0.32]} rotation={[0, 0, -a]}>
              <planeGeometry args={[major ? 0.09 : 0.04, major ? 0.36 : 0.2]} />
              <meshBasicMaterial color={PALETTE.tick} />
            </mesh>
          )
        })}
        <mesh position={[0, STAGE.watchRadius + 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
          <meshStandardMaterial color={PALETTE.rim} roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, STAGE.watchRadius + 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.3, 16]} />
          <meshStandardMaterial color={PALETTE.rim} roughness={0.3} metalness={0.6} />
        </mesh>
      </group>
      <mesh position={[0, STAGE.watchY / 2 - 0.2, STAGE.watchZ - 0.1]} castShadow>
        <boxGeometry args={[0.6, STAGE.watchY - STAGE.watchRadius, 0.4]} />
        <meshStandardMaterial color={PALETTE.rim} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  )
})

/** The hand, the cover over the face while it is hidden, and at the end the answer. */
function Dial({ live }: { live: RefObject<Game> }) {
  const hand = useRef<Group>(null)
  const cover = useRef<Group>(null)
  const answer = useRef<Group>(null)
  useFrame(() => {
    const g = live.current
    const t = Math.max(0, stopwatch(g))
    if (hand.current) {
      hand.current.rotation.z = handAngle(Math.min(t, WATCH.visible + 0.4))
      hand.current.visible = !g.over
    }
    if (cover.current) {
      // Swings down over the face as the stopwatch hides, and up off it at the end.
      const hidden = g.players.length > 0 && !g.over && !showing(g) && stopwatch(g) >= 0
      const target = hidden ? 0 : Math.PI * 0.5
      cover.current.rotation.x += (target - cover.current.rotation.x) * 0.2
      // Folded right up it is edge-on to the camera: out of the way, and out of sight.
      cover.current.visible = cover.current.rotation.x < Math.PI * 0.48
    }
    if (answer.current) {
      answer.current.visible = g.over && g.players.length > 0
      answer.current.rotation.z = handAngle(targetFor(g.seed))
    }
  })
  const g = live.current
  return (
    <group position={[0, STAGE.watchY, STAGE.watchZ + 0.34]}>
      <group ref={hand}>
        <mesh position={[0, STAGE.watchRadius * 0.4, 0.02]}>
          <boxGeometry args={[0.08, STAGE.watchRadius * 0.9, 0.03]} />
          <meshStandardMaterial color={PALETTE.hand} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 16]} />
        <meshStandardMaterial color={PALETTE.tick} roughness={0.4} />
      </mesh>
      <group ref={answer} visible={false}>
        <mesh position={[0, STAGE.watchRadius * 0.4, 0.04]}>
          <boxGeometry args={[0.12, STAGE.watchRadius * 0.9, 0.03]} />
          <meshStandardMaterial color={PALETTE.target} roughness={0.4} emissive={PALETTE.target} emissiveIntensity={0.3} />
        </mesh>
      </group>
      {g.over
        ? g.players.map((timer, index) => {
            if (timer.stopped === null || timer.stopped < 0) return null
            const a = handAngle(timer.stopped)
            const r = STAGE.watchRadius * (0.62 + (index % 4) * 0.08)
            return (
              <mesh key={timer.id} position={[-Math.sin(a) * r, Math.cos(a) * r, 0.06]}>
                <sphereGeometry args={[0.15, 12, 10]} />
                <meshStandardMaterial color={COLOURS[index % COLOURS.length]} roughness={0.4} />
              </mesh>
            )
          })
        : null}
      {/* The cover, hinged along the top of the face. */}
      <group position={[0, STAGE.watchRadius, 0.12]}>
        <group ref={cover} rotation={[Math.PI * 0.5, 0, 0]} visible={false}>
          <mesh position={[0, -STAGE.watchRadius, 0.02]}>
            <circleGeometry args={[STAGE.watchRadius + 0.05, 48]} />
            <meshStandardMaterial color={PALETTE.cover} roughness={0.8} side={2} />
          </mesh>
          {/* A question mark: a hook, a stem and a dot. */}
          <group position={[0, -STAGE.watchRadius + 0.35, 0.06]}>
            <mesh position={[0, 0.55, 0]} rotation={[0, 0, -Math.PI * 0.35]}>
              <torusGeometry args={[0.6, 0.16, 10, 28, Math.PI * 1.3]} />
              <meshBasicMaterial color={PALETTE.mark} />
            </mesh>
            <mesh position={[0, -0.35, 0]}>
              <boxGeometry args={[0.3, 0.55, 0.05]} />
              <meshBasicMaterial color={PALETTE.mark} />
            </mesh>
            <mesh position={[0, -0.95, 0]}>
              <circleGeometry args={[0.2, 16]} />
              <meshBasicMaterial color={PALETTE.mark} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** One player at their button; the button goes down once they are known to have stopped. */
function Player({ index, count, live }: { index: number; count: number; live: RefObject<Game> }) {
  const cap = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const x = standX(index, count)
  useFrame(() => {
    const g = live.current
    const timer = g.players[index]
    if (!cap.current || !timer) return
    const known = timer.stopped !== null && (timer.mine || g.over)
    cap.current.position.y = 1.06 - (known ? 0.12 : 0)
  })
  // At the end, everybody's time on the front of their stand - the moment it is no longer a secret.
  const g = live.current
  const timer = g.players[index]
  const said = g.over && timer ? (timer.stopped !== null ? `${timer.stopped.toFixed(2)}s` : '-') : null
  return (
    <group>
      <group position={[x, 0, STAGE.rowZ - 0.6]}>
        <primitive object={avatar} />
      </group>
      <group position={[x, 0, STAGE.rowZ + 0.5]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.4, 1, 16]} />
          <meshStandardMaterial color={PALETTE.pedestal} roughness={0.6} />
        </mesh>
        {said !== null ? (
          <mesh position={[0, 0.55, 0.45]}>
            <planeGeometry args={[1.7, 0.53]} />
            <meshBasicMaterial map={timeLabel(said, colour)} transparent toneMapped={false} />
          </mesh>
        ) : null}
        <group ref={cap} position={[0, 1.06, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.26, 0.28, 0.16, 16]} />
            <meshStandardMaterial color={colour} roughness={0.4} emissive={colour} emissiveIntensity={0.15} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function TimeItScene({ live }: { live: RefObject<Game> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera />
      <Lights />
      <Stage />
      <Dial live={live} />
      {game.players.map((timer, index) => (
        <Player key={`${game.id}:${timer.id}`} index={index} count={game.players.length} live={live} />
      ))}
    </>
  )
}
