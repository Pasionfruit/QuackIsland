/**
 * The course in three dimensions, lit and dressed like the island.
 *
 * A fenced green run, bands of hedges with a gate in each, puddles that show
 * you where the ground will hold you up, treats bobbing off the racing line,
 * and up to eight animals on it.
 *
 * **The camera chases your own pet and never turns.** See `camera.ts` for why.
 *
 * **Speed is read from the ground, not from the game's velocity.** A guest's
 * copy of a racer has no velocity at all - the snapshot carries where everybody
 * is, not how fast - so the legs are driven by how far a body actually moved
 * since the last frame. That is the same number on the host and on a guest, so
 * the animals run the same way on every screen.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type DirectionalLight,
  type Group,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { FINISH_Z, HEDGE, TRACK, courseFor } from './course'
import { FOG, FOV, chase } from './camera'
import { buildPet, disposePet } from './models'
import { petById } from './pets'
import { COLOURS, hasTaken, petOf, type Game } from './rules'

export const PALETTE = {
  sky: '#a9d8ef',
  grass: '#6fae52',
  track: '#8cc464',
  dirt: '#b79a6a',
  hedge: '#5aa84a',
  hedgeDark: '#3f8036',
  puddle: '#3f6f96',
  fence: '#e8dcc0',
  post: '#c6b48a',
  line: '#f6f4ee',
  banner: '#e8414b',
  treat: '#f2c14e',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#6f7a58',
} as const

const half = TRACK.width / 2
/** How quickly the camera catches up with the pet, per second. */
const FOLLOW = 6

function ChaseCamera({ live }: { live: RefObject<Game> }) {
  const at = useRef<{ x: number; y: number; z: number } | null>(null)
  const look = useRef(new Vector3())
  useFrame(({ camera, size }, dt) => {
    const game = live.current
    if (!game) return
    const me = game.racers.find((r) => r.mine) ?? game.racers[0]
    const shot = chase(me ? me.x : 0, me ? me.z : 2, size.width / Math.max(1, size.height))
    if (!at.current) at.current = { x: shot.x, y: shot.y, z: shot.z }
    const k = 1 - Math.exp(-FOLLOW * Math.min(dt, 0.1))
    at.current.x += (shot.x - at.current.x) * k
    at.current.y += (shot.y - at.current.y) * k
    at.current.z += (shot.z - at.current.z) * k
    camera.position.set(at.current.x, at.current.y, at.current.z)
    camera.lookAt(look.current.set(shot.target.x, shot.target.y, shot.target.z))
    const perspective = camera as PerspectiveCamera
    if (perspective.fov !== FOV) {
      perspective.fov = FOV
      perspective.updateProjectionMatrix()
    }
  })
  return null
}

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[14, 26, 12]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.75} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** A long shadow-casting light that only covers what is near the camera would miss the rest; this keeps it on the pets. */
function SunFollow({ live }: { live: RefObject<Game> }) {
  const rig = useRef<Group>(null)
  useFrame(() => {
    const game = live.current
    const me = game?.racers.find((r) => r.mine)
    if (rig.current) rig.current.position.z = me ? me.z : 0
  })
  return (
    <group ref={rig}>
      <Daylight />
    </group>
  )
}

/** The ground, the track, the fences and the two lines that matter. */
const Ground = memo(function Ground() {
  const length = TRACK.length + TRACK.runUp + TRACK.runOff
  const middle = (TRACK.runUp + FINISH_Z - TRACK.runOff) / 2
  const posts = Math.floor(length / 4)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, middle]} receiveShadow>
        <planeGeometry args={[220, length + 80]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      {/* The run itself, a shade lighter, so the fences are not the only thing saying where it is. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, middle]} receiveShadow>
        <planeGeometry args={[TRACK.width, length]} />
        <meshStandardMaterial color={PALETTE.track} roughness={1} />
      </mesh>
      {/* Start and finish. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK.width, 0.6]} />
        <meshStandardMaterial color={PALETTE.line} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, FINISH_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK.width, 1.2]} />
        <meshStandardMaterial color={PALETTE.line} roughness={0.9} />
      </mesh>
      {/* The finish, with something over it you can see coming. */}
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[side * (half - 0.4), 2.4, FINISH_Z]}>
          <boxGeometry args={[0.35, 4.8, 0.35]} />
          <meshStandardMaterial color={PALETTE.post} roughness={0.9} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 4.5, FINISH_Z]}>
        <boxGeometry args={[TRACK.width - 0.5, 1.1, 0.25]} />
        <meshStandardMaterial color={PALETTE.banner} roughness={0.85} />
      </mesh>
      {/* Fences: a rail each side and a post every four metres. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0.5, 1].map((h) => (
            <mesh key={h} position={[side * half, h, middle]}>
              <boxGeometry args={[0.1, 0.12, length]} />
              <meshStandardMaterial color={PALETTE.fence} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      <Posts count={posts} middle={middle} length={length} />
    </group>
  )
})

/** Every fence post on the course, in one draw call a side. */
function Posts({ count, middle, length }: { count: number; middle: number; length: number }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const scale = new Vector3(0.16, 1.25, 0.16)
    const turn = new Quaternion()
    let i = 0
    for (let n = 0; n < count; n++) {
      const z = middle + length / 2 - n * 4
      for (const side of [-1, 1]) {
        position.set(side * half, 0.62, z)
        instanced.setMatrixAt(i++, matrix.compose(position, turn, scale))
      }
    }
    instanced.count = i
    instanced.instanceMatrix.needsUpdate = true
    instanced.frustumCulled = false
  }, [count, middle, length])
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count * 2]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={PALETTE.post} roughness={0.95} />
    </instancedMesh>
  )
}

/** The hedges: a hundred odd bushes, one draw call. */
const Hedges = memo(function Hedges({ seed }: { seed: number }) {
  const course = courseFor(seed)
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const scale = new Vector3()
    const turn = new Quaternion()
    const colour = new Color()
    const green = new Color(PALETTE.hedge)
    const dark = new Color(PALETTE.hedgeDark)
    course.hedges.forEach((hedge, i) => {
      position.set(hedge.x, hedge.r * 0.62, hedge.z)
      scale.set(hedge.r, hedge.r * 0.95, hedge.r)
      instanced.setMatrixAt(i, matrix.compose(position, turn, scale))
      // A bush is not one green; the variation comes from the hedge's own size.
      // Kept to a narrow band: a hedge you cannot tell from the shadow under it
      // is a hedge you run into.
      instanced.setColorAt(i, colour.copy(green).lerp(dark, Math.min(1, Math.max(0, (hedge.r - HEDGE.min) / (HEDGE.max - HEDGE.min)))))
    })
    instanced.count = course.hedges.length
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.frustumCulled = false
  }, [course])
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, Math.max(1, course.hedges.length)]} castShadow receiveShadow>
      <meshStandardMaterial color="#ffffff" roughness={0.95} />
    </instancedMesh>
  )
})

/** The puddles, flat on the ground where they will slow you down. */
const Puddles = memo(function Puddles({ seed }: { seed: number }) {
  const course = courseFor(seed)
  return (
    <group>
      {course.puddles.map((puddle, i) => (
        <mesh key={i} position={[puddle.x, 0.015, puddle.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[puddle.r, 22]} />
          {/* Matt rather than shiny: a wet-looking puddle catches the sun in one
              white blob that reads as a hole in the ground. */}
          <meshStandardMaterial color={PALETTE.puddle} roughness={0.62} metalness={0.02} transparent opacity={0.8} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  )
})

/** The treats, bobbing and turning, and gone once you have had them. */
function Treats({ live }: { live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const course = courseFor(live.current.seed)
  useFrame(({ clock }) => {
    const rig = group.current
    const game = live.current
    if (!rig || !game) return
    const me = game.racers.find((r) => r.mine)
    const t = clock.elapsedTime
    rig.children.forEach((child, i) => {
      child.visible = !me || !hasTaken(me, i)
      if (!child.visible) return
      child.position.y = 0.55 + Math.sin(t * 2.4 + i) * 0.12
      child.rotation.y = t * 1.6 + i
    })
  })
  return (
    <group ref={group} key={course.seed}>
      {course.treats.map((treat, i) => (
        <group key={i} position={[treat.x, 0.55, treat.z]}>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.18, 0.3]} />
            <meshStandardMaterial color={PALETTE.treat} roughness={0.5} emissive={PALETTE.treat} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#fff0c0" roughness={0.5} emissive={PALETTE.treat} emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * One animal on the course.
 *
 * The rig is rebuilt when the pet changes, which happens freely all through the
 * choosing - somebody flicking between the cat and the rabbit is rebuilding two
 * dozen small meshes a second, which is why `disposePet` exists.
 */
function RacerBody({ index, live }: { index: number; live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const game = live.current
  const racer = game.racers[index]
  const pet = petOf(racer)
  const colour = COLOURS[index % COLOURS.length]
  const rig = useMemo(() => buildPet(pet, colour), [pet, colour])
  useEffect(() => () => disposePet(rig), [rig])
  const stride = useRef(0)
  const was = useRef<{ x: number; z: number } | null>(null)

  useFrame(({ clock }, dt) => {
    const root = holder.current
    const now = live.current
    const me = now?.racers[index]
    if (!root || !now || !me) return
    const step = Math.min(dt, 0.1)
    const t = clock.elapsedTime

    // How fast it is actually going, from the ground it covered.
    const moved = was.current ? Math.hypot(me.x - was.current.x, me.z - was.current.z) : 0
    was.current = { x: me.x, z: me.z }
    const speed = step > 0 ? moved / step : 0

    root.position.set(me.x, 0, me.z)
    root.rotation.y = me.facing
    root.visible = !me.left || now.phase !== 'racing'

    if (petById(pet).speed <= 0) {
      // A fish. It flops, and that is the whole of its race.
      const flop = Math.sin(t * 6.5)
      rig.body.rotation.z = flop * 0.55
      rig.body.rotation.y = Math.sin(t * 3.1) * 0.25
      rig.body.position.y = Math.abs(Math.sin(t * 6.5)) * 0.14
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 9) * 0.5
      return
    }

    stride.current += speed * step * 2.6
    const swing = Math.sin(stride.current) * Math.min(0.85, 0.2 + speed * 0.07)
    rig.legs.forEach((leg, i) => {
      // Front pair and back pair opposite, left and right opposite: a trot.
      const sign = (i < 2 ? 1 : -1) * (i % 2 === 0 ? 1 : -1)
      leg.rotation.x = swing * sign
    })
    // Bounding, and leaning into a boost.
    rig.body.position.y = Math.abs(Math.sin(stride.current)) * Math.min(0.12, speed * 0.012)
    rig.body.rotation.x = (me.boosting ? -0.16 : 0) - Math.min(0.12, speed * 0.008)
    if (rig.tail) rig.tail.rotation.z = Math.sin(t * 9) * (0.15 + Math.min(0.3, speed * 0.03))
    for (const ear of rig.ears) ear.rotation.x = -Math.min(0.7, speed * 0.06)
  })

  return (
    <group ref={holder}>
      <primitive object={rig.root} />
      <BoostRing index={index} live={live} />
    </group>
  )
}

/** A ring under an animal that is burning its tank, so you can see who is spending. */
function BoostRing({ index, live }: { index: number; live: RefObject<Game> }) {
  const mesh = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const ring = mesh.current
    const racer = live.current?.racers[index]
    if (!ring || !racer) return
    ring.visible = racer.boosting
    if (!racer.boosting) return
    ring.scale.setScalar(1 + Math.sin(clock.elapsedTime * 14) * 0.12)
  })
  return (
    <mesh ref={mesh} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.6, 0.86, 22]} />
      <meshBasicMaterial color="#ffe066" transparent opacity={0.75} />
    </mesh>
  )
}

/** A ring under your own animal, so you can find yourself among eight. */
function YouMarker({ live }: { live: RefObject<Game> }) {
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    const ring = mesh.current
    const game = live.current
    const me = game?.racers.find((r) => r.mine)
    if (!ring || !me) return
    ring.visible = !!me
    ring.position.set(me.x, 0.03, me.z)
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.92, 1.08, 26]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
    </mesh>
  )
}

export function PetRaceScene({ live }: { live: RefObject<Game> }) {
  // Redrawn only when the field changes - somebody joining, somebody picking
  // another pet, a fresh race - never every frame: the camera, the pets, the
  // treats and the marker all move themselves from the live race inside their
  // own `useFrame`, and a React pass over the whole course sixty times a second
  // is the one thing here that costs real time.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    let key = `${g.id}:${g.seed}`
    for (const racer of g.racers) key += `:${racer.id}:${racer.pet ?? ''}`
    if (key === cast.current) return
    cast.current = key
    redraw()
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.sky), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.sky, FOG.near, FOG.far]} />
      <ChaseCamera live={live} />
      <SunFollow live={live} />
      <Ground />
      <Hedges key={`hedges:${game.seed}`} seed={game.seed} />
      <Puddles key={`puddles:${game.seed}`} seed={game.seed} />
      <Treats key={`treats:${game.seed}`} live={live} />
      <YouMarker live={live} />
      {game.racers.map((racer, index) => (
        <RacerBody key={`${game.id}:${racer.id}`} index={index} live={live} />
      ))}
    </>
  )
}
