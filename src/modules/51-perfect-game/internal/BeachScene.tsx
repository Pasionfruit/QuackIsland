/**
 * Perfect Game in three dimensions, from behind the line.
 *
 * A sandy beach running down to the sea, palms at either side, and a rope along
 * the line with the thrower's box behind it. **The column of crabs** - thirty
 * little red crabs, scuttling sideways as crabs do, bent into the turn's arc, S
 * or hook - marches across from the left.
 *
 * The thrower stands where they have chosen with the coconut, and **a dotted
 * line shows everybody where they are aiming**; everybody else watches from the
 * ends of the line. Rolled, the coconut trundles off along it, turning as it
 * goes, and **every crab it hits is knocked flying**, spinning, out of the
 * column. Then it rolls on into the surf.
 *
 * The camera looks down the beach from high behind the line, leaning a little
 * towards whoever is throwing.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { createAvatar } from '../../02-player'
import { BEACH, BOX, COCONUT, COLUMN, coconutAt, columnFor, crabAt, heading, headingAt, hits, pathAt, travel } from './beach'
import { COLOURS, phaseOf, tau, throwOf, thrower, type Game } from './rules'

export const PALETTE = {
  sky: '#9fd6f2',
  sand: '#f1d9a0',
  sandDark: '#e3c47f',
  sea: '#2f8fc0',
  foam: '#f4fbff',
  crab: '#e2462f',
  crabDark: '#a92a1a',
  coconut: '#6b4423',
  rope: '#c9a36a',
  palm: '#2f8f4a',
  trunk: '#8a6a45',
  wall: '#b98b5c',
  wallCap: '#e9cf9a',
} as const

/** Where the mouse is on the sand - for aiming - or null off it. The screen reads it. */
export interface PointerRef {
  at: { x: number; z: number } | null
}

let sandTexture: CanvasTexture | null = null

/** Sand, speckled. */
function sand(): CanvasTexture {
  if (sandTexture) return sandTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.sand
  c.fillRect(0, 0, 128, 128)
  // A fixed scatter, not Math.random: the same sand every time.
  let n = 99
  const next = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 500; i++) {
    c.fillStyle = next() < 0.5 ? PALETTE.sandDark : '#f8e8bf'
    c.fillRect(next() * 128, next() * 128, 1 + next() * 2, 1 + next() * 2)
  }
  sandTexture = new CanvasTexture(canvas)
  sandTexture.colorSpace = SRGBColorSpace
  sandTexture.wrapS = RepeatWrapping
  sandTexture.wrapT = RepeatWrapping
  sandTexture.repeat.set(16, 16)
  return sandTexture
}

const want = new Vector3()
const look = new Vector3()
const looking = new Vector3()

function Rig({ live }: { live: RefObject<Game> }) {
  const placed = useRef(false)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const lean = g.players.length > 0 && !g.over ? g.aim.x * 0.3 : 0
    look.set(lean, 0, -11)
    want.set(lean, 17, 14)
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2)
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

/** How tall the walls are: over the coconut's top, so it can be seen to hit them. */
const WALL_HEIGHT = 1.1
/** How thick, outward from the edge of the beach. */
const WALL_THICK = 0.5

/** The beach: sand, the sea and its surf, a wall down each side, palms beyond, the rope along the line and the thrower's box. */
function Beach({ pointer }: { pointer: RefObject<PointerRef> }) {
  const surf = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (surf.current) surf.current.position.z = BEACH.far + 0.4 + Math.sin(clock.elapsedTime * 0.8) * 0.5
  })
  const depth = BEACH.near - BEACH.far + 20
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    pointer.current.at = { x: e.point.x, z: e.point.z }
  }
  return (
    <group>
      {/* The sand - and what the mouse is over, for aiming. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (BEACH.near + BEACH.far) / 2 + 10]} receiveShadow onPointerMove={onMove}>
        <planeGeometry args={[BEACH.halfX * 2 + 30, depth]} />
        <meshStandardMaterial map={sand()} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, BEACH.far - 60]}>
        <planeGeometry args={[400, 120]} />
        <meshStandardMaterial color={PALETTE.sea} roughness={0.4} />
      </mesh>
      <mesh ref={surf} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, BEACH.far]}>
        <planeGeometry args={[400, 1.2]} />
        <meshBasicMaterial color={PALETTE.foam} transparent opacity={0.8} />
      </mesh>
      {/* The rope along the line, on little posts, and the box behind it. */}
      <mesh position={[0, 0.35, BOX.z0 - 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, BOX.x1 - BOX.x0 + 1, 8]} />
        <meshStandardMaterial color={PALETTE.rope} />
      </mesh>
      {[BOX.x0 - 0.5, 0, BOX.x1 + 0.5].map((x) => (
        <mesh key={x} position={[x, 0.2, BOX.z0 - 0.3]}>
          <cylinderGeometry args={[0.07, 0.07, 0.4, 8]} />
          <meshStandardMaterial color={PALETTE.trunk} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(BOX.x0 + BOX.x1) / 2, 0.01, (BOX.z0 + BOX.z1) / 2]}>
        <planeGeometry args={[BOX.x1 - BOX.x0, BOX.z1 - BOX.z0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.18} />
      </mesh>
      {/* The walls the coconut bounces off: their inside faces are the edge of the beach. */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (BEACH.halfX + WALL_THICK / 2), 0, (BEACH.near + BEACH.far) / 2]}>
          <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[WALL_THICK, WALL_HEIGHT, BEACH.near - BEACH.far]} />
            <meshStandardMaterial color={PALETTE.wall} roughness={0.85} />
          </mesh>
          {/* A cap along the top, a little proud, so the wall has an edge to catch the light. */}
          <mesh position={[-s * 0.05, WALL_HEIGHT + 0.05, 0]}>
            <boxGeometry args={[WALL_THICK + 0.2, 0.1, BEACH.near - BEACH.far]} />
            <meshStandardMaterial color={PALETTE.wallCap} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Palms down both sides. */}
      {[-1, 1].flatMap((s) =>
        [-24, -14, -4, 4].map((z, k) => (
          <group key={`${s}:${z}`} position={[s * (BEACH.halfX + 3 + (k % 2) * 2), 0, z]} rotation={[0, 0, s * 0.12]}>
            <mesh position={[0, 2.5, 0]} castShadow>
              <cylinderGeometry args={[0.18, 0.28, 5, 8]} />
              <meshStandardMaterial color={PALETTE.trunk} />
            </mesh>
            {[0, 1, 2, 3, 4].map((f) => (
              <mesh key={f} position={[0, 5, 0]} rotation={[0.9, (f * Math.PI * 2) / 5, 0]} castShadow>
                <coneGeometry args={[0.5, 3.2, 4]} />
                <meshStandardMaterial color={PALETTE.palm} flatShading />
              </mesh>
            ))}
          </group>
        )),
      )}
    </group>
  )
}

const BODY = new SphereGeometry(0.42, 14, 10)
const CLAW = new SphereGeometry(0.16, 10, 8)
const LEG = new CylinderGeometry(0.035, 0.03, 0.42, 5)
const EYE = new SphereGeometry(0.06, 8, 6)

/** A crab: a flat red shell, two claws, six legs and two eyes on stalks, facing the throwers - it walks sideways. */
function makeCrab(): { group: Group; legs: Mesh[] } {
  const group = new Group()
  const shell = new MeshStandardMaterial({ color: PALETTE.crab, roughness: 0.5 })
  const dark = new MeshStandardMaterial({ color: PALETTE.crabDark, roughness: 0.6 })
  const body = new Mesh(BODY, shell)
  body.scale.set(1, 0.5, 0.8)
  body.position.y = 0.3
  body.castShadow = true
  group.add(body)
  for (const s of [-1, 1]) {
    const claw = new Mesh(CLAW, shell)
    claw.position.set(s * 0.42, 0.35, 0.35)
    claw.scale.set(1, 0.7, 1.2)
    group.add(claw)
    const eye = new Mesh(EYE, new MeshBasicMaterial({ color: '#111' }))
    eye.position.set(s * 0.12, 0.58, 0.22)
    group.add(eye)
  }
  const legs: Mesh[] = []
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const leg = new Mesh(LEG, dark)
      leg.position.set(s * 0.42, 0.18, -0.15 + k * 0.15)
      leg.rotation.z = s * 1.1
      group.add(leg)
      legs.push(leg)
    }
  }
  return { group, legs }
}

/** How long a knocked crab flies before it is gone, seconds. */
const FLIGHT = 1.4

/** The column: every crab where the turn says, scuttling - and knocked flying by the coconut. */
function Crabs({ live }: { live: RefObject<Game> }) {
  const made = useMemo(() => Array.from({ length: COLUMN.crabs }, () => makeCrab()), [])
  useFrame(({ clock }) => {
    const g = live.current
    const t = tau(g)
    const column = columnFor(g.seed)
    const thrown = throwOf(g)
    const hit = new Map((thrown ? hits(column, thrown) : []).map((h) => [h.crab, h.at]))
    const phase = phaseOf(g)
    made.forEach(({ group, legs }, i) => {
      const at = hit.get(i)
      const home = crabAt(column, i, at !== undefined && t >= at ? at : t)
      group.visible = phase !== 'over'
      if (at !== undefined && t >= at && thrown) {
        // Knocked: flung along the coconut's way - the way it was going when it hit, bounces and all - and up, spinning, and gone.
        const since = t - at
        const h = headingAt(thrown, (at - thrown.at) * COCONUT.speed)
        group.visible = since < FLIGHT
        group.position.set(home.x + h.x * since * 6 + (i % 2 ? 1 : -1) * since * 2, since * 7 - since * since * 7, home.z + h.z * since * 6)
        group.rotation.set(since * 9, since * 7, since * 5)
        return
      }
      // Over the wall the column marches through: below the sand outside it, and up out of it as it crosses in.
      const under = Math.max(0, Math.min(1, (Math.abs(home.x) - (BEACH.halfX - 0.4)) / 1.2)) * 1.2
      group.visible = phase !== 'over' && under < 1.1
      group.position.set(home.x, -under, home.z)
      group.rotation.set(0, 0, 0)
      // Scuttling: the legs pumping, the shell bobbing.
      legs.forEach((leg, k) => (leg.rotation.x = Math.sin(clock.elapsedTime * 18 + k * 1.3 + i) * 0.5))
      group.position.y += 0.03 * Math.abs(Math.sin(clock.elapsedTime * 18 + i))
    })
  })
  return (
    <group>
      {made.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
    </group>
  )
}

const DOT = new CircleGeometry(0.09, 10)
const DOTS = 90
const M = new Matrix4()

/** The coconut, in the thrower's hands or rolling; and while they aim, a dotted line where it will go. */
function Coconut({ live }: { live: RefObject<Game> }) {
  const ball = useRef<Mesh>(null)
  const dots = useRef<InstancedMesh>(null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    const c = canvas.getContext('2d')!
    c.fillStyle = PALETTE.coconut
    c.fillRect(0, 0, 64, 32)
    c.strokeStyle = '#4a2e16'
    c.lineWidth = 1
    for (let i = 0; i < 40; i++) {
      c.beginPath()
      c.moveTo((i * 37) % 64, (i * 13) % 32)
      c.lineTo(((i * 37) % 64) + 6, ((i * 13) % 32) + 3)
      c.stroke()
    }
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  const axis = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const g = live.current
    if (!ball.current || !dots.current) return
    const who = thrower(g)
    const thrown = throwOf(g)
    const t = tau(g)
    const phase = phaseOf(g)
    ball.current.visible = who >= 0 && phase !== 'intro'
    const h = heading(g.aim.angle)
    if (thrown) {
      const at = coconutAt(thrown, t) ?? { x: thrown.x, z: thrown.z }
      const rolled = Math.min(t - thrown.at, travel(thrown)) * COCONUT.speed
      // Into the surf at the end: sinking out of sight.
      const gone = t - thrown.at - travel(thrown)
      ball.current.position.set(at.x, 0.45 - Math.max(0, gone) * 1.5, at.z)
      // Rolling the way it is going just now - which turns round at a wall.
      const going = headingAt(thrown, Math.max(0, rolled))
      axis.set(-going.z, 0, going.x).normalize()
      ball.current.quaternion.setFromAxisAngle(axis, -rolled / COCONUT.radius)
    } else {
      // Held just in front of the thrower, bobbing as they line up.
      ball.current.position.set(g.aim.x + h.x * 0.8, 0.45 + 0.05 * Math.sin(clock.elapsedTime * 4), g.aim.z + h.z * 0.8)
    }
    // The dotted line, while they aim: where the coconut would go, off the walls and all.
    const aiming = phase === 'aim'
    dots.current.visible = aiming
    if (aiming) {
      const aim = { ...g.aim, at: 0 }
      const length = travel(aim) * COCONUT.speed
      for (let k = 0; k < DOTS; k++) {
        const s = 1.2 + ((k + ((clock.elapsedTime * 2) % 1)) / DOTS) * (length - 1.2)
        const on = pathAt(aim, s)
        M.makeRotationX(-Math.PI / 2)
        M.setPosition(on.x, 0.04, on.z)
        dots.current.setMatrixAt(k, M)
      }
      dots.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group>
      <mesh ref={ball} castShadow>
        <sphereGeometry args={[COCONUT.radius, 20, 14]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      <instancedMesh ref={dots} args={[DOT, undefined, DOTS]}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={DoubleSide} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

/** Somebody: the thrower at their spot facing the way they aim, everybody else watching from behind. */
function Player({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !p) return
    const throwing = thrower(g) === index && phaseOf(g) !== 'intro'
    // Watchers stand at the ends of the line, either side of the box, in sight of the camera.
    const side = index % 2 === 0 ? -1 : 1
    const along = Math.floor(index / 2)
    const want = throwing ? { x: g.aim.x, z: g.aim.z + 0.1 } : { x: side * (BOX.x1 + 1.8 + along * 1.3), z: BOX.z0 + 0.6 + along * 0.8 }
    const s = shown.current ?? (shown.current = { ...want })
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * (throwing ? 14 : 4))
    s.x += (want.x - s.x) * k
    s.z += (want.z - s.z) * k
    group.current.visible = !p.left
    group.current.position.set(s.x, 0, s.z)
    // The thrower faces their aim; the watchers turn in towards the beach.
    group.current.rotation.y = (throwing ? g.aim.angle : side * -0.6) + Math.PI
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
    </group>
  )
}

export function BeachScene({ live, pointer }: { live: RefObject<Game>; pointer: RefObject<PointerRef> }) {
  // Only re-rendered when who is on the beach changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.seed}:${g.players.map((p) => p.id).join(',')}`
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
      <fog attach="fog" args={[PALETTE.sky, 60, 170]} />
      <hemisphereLight args={['#ffffff', '#e8d3a6', 1.4]} />
      <directionalLight
        position={[10, 24, 8]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <Rig live={live} />
      <Beach pointer={pointer} />
      {game.players.length > 0 ? <Crabs live={live} /> : null}
      {game.players.length > 0 ? <Coconut live={live} /> : null}
      {game.players.map((p, index) => (
        <Player key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
    </>
  )
}
