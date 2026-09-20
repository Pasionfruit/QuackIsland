/**
 * Color Coded in three dimensions, over your shoulder.
 *
 * A grid of colour panels floating high in a bright sky, with a sea of cloud a
 * long way down. **A giant wheel stands off the north side**, always turned to
 * face you, six segments in the panels' colours with a pointer at the top; it
 * spins through the start of every round and stops on the colour.
 *
 * While the colour is up, its panels bob and every other panel flickers
 * darker as the two seconds run out - a panel is never drawn any colour but
 * its own. Then they drop away into the cloud, and through the rebuild rise
 * steadily back, **dark until the last moment and flush exactly when they can be
 * stood on** - what you see and what holds you are the same thing. Everybody is the island's capsule in
 * their colour; you have a white ring at your feet. Everybody leans into the way
 * they are sliding, and a runner leans hard. Somebody falling tumbles away below.
 *
 * The camera sits behind and above you, turned by the mouse. Once you have
 * fallen, it pulls back to watch the whole arena.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { createAvatar } from '../../02-player'
import { GRID, HALF, PANEL_COLOURS, dealFor, panelCentre, panelColour, panelLift, when, wheelAngle } from './arena'
import { COLOURS, PUSH, ROUND, clock, decided, isStanding, type Game } from './rules'

export const PALETTE = {
  sky: '#8fd0f2',
  cloud: '#ffffff',
  rim: '#fdf6e8',
  hub: '#2a2233',
} as const

/** How far the camera sits behind you, and how high it may look down from. */
export const CAMERA_BACK = 8
export const PITCH = { min: 0.12, max: 1.25 } as const

/** The mouse's camera, which the screen keeps. */
export interface LookRef {
  yaw: number
  pitch: number
}

/** Where the wheel stands: off the north side, above the panels. */
export const WHEEL_AT = { x: 0, y: 5.5, z: -HALF - 11 } as const
const WHEEL_RADIUS = 6
/** How far a dropped panel falls before it is drawn back. */
const DROP_DEPTH = 14

const target = new Vector3()
const eye = new Vector3()

function Rig({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
  const at = useRef<Vector3 | null>(null)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const me = g.players.find((p) => p.mine)
    const { yaw, pitch } = look.current
    // Out, or the game decided: back to look down on the arena, so the last fall is seen.
    const watching = !me || !isStanding(me) || decided(g)
    const distance = watching ? HALF * 2.1 : CAMERA_BACK
    if (watching) target.set(0, 0, 0)
    else target.set(me.x, 1.2, me.z)
    // Behind: the opposite of where the camera faces, flat, and up by the pitch.
    eye.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance)
    if (!at.current) at.current = eye.clone()
    else at.current.lerp(eye, 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 3 : 18)))
    camera.position.copy(at.current)
    camera.lookAt(target)
  })
  return null
}

const M = new Matrix4()
const S = new Matrix4()
const DARK = new Color('#2a2233')

/** The panels: coloured by the deal, dropping away and rising back by the clock. */
function Panels({ live }: { live: RefObject<Game> }) {
  const mesh = useRef<InstancedMesh>(null)
  const colour = useMemo(() => new Color(), [])
  const count = GRID.size * GRID.size
  useFrame(({ clock: c }) => {
    const g = live.current
    const panels = mesh.current
    if (!panels) return
    const t = clock(g)
    const w = when(t)
    const deal = dealFor(g.seed, w.round)
    for (let i = 0; i < count; i++) {
      const m = panelCentre(i)
      const lift = panelLift(g.seed, t, i)
      const right = deal.panels[i] === deal.colour
      // While the colour is up its panels bob, so they stand out without changing colour.
      const bob = w.phase === 'reveal' && right ? 0.12 * Math.abs(Math.sin(c.elapsedTime * 7)) : 0
      M.makeTranslation(m.x, -GRID.thick / 2 + lift * DROP_DEPTH + bob, m.z)
      S.makeScale(GRID.cell - 0.12, GRID.thick, GRID.cell - 0.12)
      panels.setMatrixAt(i, M.multiply(S))
      colour.set(PANEL_COLOURS[panelColour(g.seed, t, i)])
      // Never whitened: a panel's colour is what it is. Only the wrong ones darken, flickering as the two seconds run out.
      if (w.phase === 'reveal' && !right) colour.lerp(DARK, Math.max(0, (w.t - 0.8) / (w.length - 0.8)) * (0.5 + 0.3 * Math.sin(c.elapsedTime * 30)))
      // Still rising: dark, easing back to its own colour over the last of the climb - and its own colour, flush, is solid.
      else if (w.phase === 'rebuild' && !right) colour.lerp(DARK, 0.5 * Math.min(1, -lift * 4))
      panels.setColorAt(i, colour)
    }
    panels.count = count
    panels.instanceMatrix.needsUpdate = true
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, GRID.size * GRID.size]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.55} />
    </instancedMesh>
  )
}

/** The giant wheel, turned to face you, spinning by the clock. */
function Wheel({ live }: { live: RefObject<Game> }) {
  const face = useRef<Group>(null)
  const disc = useRef<Group>(null)
  useFrame(({ camera }) => {
    const g = live.current
    if (!face.current || !disc.current) return
    face.current.rotation.y = Math.atan2(camera.position.x - WHEEL_AT.x, camera.position.z - WHEEL_AT.z)
    disc.current.rotation.z = wheelAngle(g.seed, clock(g))
  })
  const segments = PANEL_COLOURS.length
  return (
    <group ref={face} position={[WHEEL_AT.x, WHEEL_AT.y, WHEEL_AT.z]}>
      <group ref={disc}>
        {PANEL_COLOURS.map((c, k) => (
          <mesh key={c}>
            <circleGeometry args={[WHEEL_RADIUS, 16, (k * Math.PI * 2) / segments, (Math.PI * 2) / segments]} />
            <meshBasicMaterial color={c} side={DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, -0.05]}>
        <circleGeometry args={[WHEEL_RADIUS + 0.45, 48]} />
        <meshBasicMaterial color={PALETTE.rim} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <circleGeometry args={[0.8, 24]} />
        <meshBasicMaterial color={PALETTE.hub} side={DoubleSide} />
      </mesh>
      {/* The pointer, over the top segment. */}
      <mesh position={[0, WHEEL_RADIUS + 0.2, 0.1]} rotation={[0, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.9, 3]} />
        <meshBasicMaterial color={PALETTE.hub} side={DoubleSide} />
      </mesh>
      {/* A post down to nothing, so it stands rather than floats. */}
      <mesh position={[0, -WHEEL_RADIUS - 4, -0.2]}>
        <boxGeometry args={[0.8, 8, 0.4]} />
        <meshStandardMaterial color={PALETTE.rim} />
      </mesh>
    </group>
  )
}

/** Somebody: in their colour, leaning into the way they slide, tumbling when they fall. */
function Body({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const lean = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const wave = useRef<Mesh>(null)
  const waveLook = useRef<MeshBasicMaterial>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !lean.current || !p) return
    group.current.visible = !p.left && p.y > -ROUND.depth + 1
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 18)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    group.current.position.set(s.x, p.y, s.z)
    group.current.rotation.y = p.yaw + Math.PI
    // Leaning into the slide: the velocity in the body's own frame, forward and sideways, more the faster it goes.
    const turn = p.yaw + Math.PI
    const forward = p.vx * Math.sin(turn) + p.vz * Math.cos(turn)
    const sideways = p.vx * Math.cos(turn) - p.vz * Math.sin(turn)
    const k = p.out === null ? 0.05 : 0
    const cap = (v: number) => Math.max(-0.4, Math.min(0.4, v))
    const tumble = p.out !== null ? Math.min(3, (g.elapsed - p.out) * 5) : 0
    // A shove: a lunge forward and a ring flying out ahead.
    const since = g.elapsed - p.pushedAt
    const shoving = p.out === null && since >= 0 && since < PUSH.show
    const swing = shoving ? since / PUSH.show : 0
    lean.current.rotation.x = cap(forward * k) + tumble + (shoving ? 0.5 * Math.sin(swing * Math.PI) : 0)
    if (wave.current && waveLook.current) {
      wave.current.visible = shoving
      wave.current.scale.setScalar(0.6 + swing * 1.6)
      waveLook.current.opacity = 0.85 * (1 - swing)
    }
    lean.current.rotation.z = cap(-sideways * k)
    if (ring.current) ring.current.visible = p.mine && isStanding(p)
  })
  return (
    <group ref={group}>
      <group ref={lean}>
        <primitive object={avatar} />
      </group>
      <mesh ref={wave} position={[0, 0.9, 0.9]} visible={false}>
        <ringGeometry args={[0.6, 0.75, 24]} />
        <meshBasicMaterial ref={waveLook} color="#ffffff" transparent opacity={0.85} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <ringGeometry args={[0.55, 0.7, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function ColorScene({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
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
      <fog attach="fog" args={[PALETTE.sky, 35, 110]} />
      <hemisphereLight args={['#ffffff', '#bfe3f5', 1.5]} />
      <directionalLight
        position={[10, 22, 8]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <Rig live={live} look={look} />
      {/* The sea of cloud, a long way down. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -40, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color={PALETTE.cloud} />
      </mesh>
      {game.players.length > 0 ? <Panels live={live} /> : null}
      <Wheel live={live} />
      {game.players.map((p, index) => (
        <Body key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
    </>
  )
}
