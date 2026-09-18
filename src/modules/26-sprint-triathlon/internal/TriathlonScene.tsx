/**
 * Sprint Triathlon in three dimensions.
 *
 * The course laid left to right: a stretch of water with lane ropes, a stretch
 * of road, a stretch of running track, an arch at the start, one at each change
 * of leg, and a finish arch. Everybody is the island's own pill in their colour,
 * in their lane: low in the water and bobbing, then up on a bicycle with its
 * wheels turning, then running with a hop to every stride. A finisher jumps for
 * joy past the line.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, Quaternion, Vector3, type DirectionalLight } from 'three'
import { createAvatar } from '../../02-player'
import { FINISH_X, START_X, TRACK, courseX, frameScene, laneZ } from './camera'
import { COLOURS, legOf, progressOf, raceClock, sentenceFor, type Race, type Racer } from './rules'

export const PALETTE = {
  background: '#bfe3f2',
  grass: '#8cc063',
  water: '#3f9fd0',
  waterDeep: '#2f86b8',
  rope: '#ffd23f',
  road: '#5c5f66',
  roadLine: '#f4f1e6',
  track: '#cf7550',
  trackLine: '#fff8ea',
  arch: '#f4f1e6',
  archTop: '#e8505b',
  finishTop: '#2e2e3c',
  wheel: '#26272b',
  frame: '#d8dbe0',
  sunColour: '#fff3e0',
  ambientColour: '#e8f3ff',
  skyColour: '#dff0ff',
  groundColour: '#7b8f5a',
} as const

/** How fast a body closes on where its progress puts it, per second. */
const CATCH_UP = 10

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

function Daylight() {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    Object.assign(light.shadow.camera, { left: -28, right: 28, top: 14, bottom: -14, near: 1, far: 100 })
    light.shadow.mapSize.set(2048, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-8, 26, 16]} intensity={2.1} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** An arch over the course, across every lane. */
function Arch({ x, lanes, top }: { x: number; lanes: number; top: string }) {
  const half = (lanes * TRACK.lane) / 2 + 0.6
  return (
    <group position={[x, 0, 0]}>
      {[-half, half].map((z) => (
        <mesh key={z} position={[0, 2, z]} castShadow>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshStandardMaterial color={PALETTE.arch} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 4.15, 0]} castShadow>
        <boxGeometry args={[0.4, 0.7, half * 2 + 0.3]} />
        <meshStandardMaterial color={top} roughness={0.7} />
      </mesh>
    </group>
  )
}

/** The three legs, the lane markings, and the arches. Only changes with the number of lanes. */
const Course = memo(function Course({ lanes }: { lanes: number }) {
  const width = lanes * TRACK.lane
  const legs = [START_X + TRACK.leg / 2, 0, FINISH_X - TRACK.leg / 2]
  const dividers = Array.from({ length: lanes + 1 }, (_, i) => -width / 2 + i * TRACK.lane)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[160, 120]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      {/* Swim: water, with lane ropes floating on it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[legs[0], 0.005, 0]}>
        <planeGeometry args={[TRACK.leg, width + 0.8]} />
        <meshStandardMaterial color={PALETTE.water} roughness={0.25} metalness={0.1} />
      </mesh>
      {dividers.map((z) => (
        <mesh key={`rope${z}`} position={[legs[0], 0.06, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, TRACK.leg, 6]} />
          <meshStandardMaterial color={PALETTE.rope} roughness={0.6} />
        </mesh>
      ))}
      {/* Bike: road, with dashed lines between lanes. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[legs[1], 0, 0]} receiveShadow>
        <planeGeometry args={[TRACK.leg, width + 0.8]} />
        <meshStandardMaterial color={PALETTE.road} roughness={0.95} />
      </mesh>
      {dividers.flatMap((z) =>
        Array.from({ length: 8 }, (_, i) => (
          <mesh key={`dash${z}:${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[legs[1] - TRACK.leg / 2 + 0.8 + i * 1.5, 0.01, z]}>
            <planeGeometry args={[1, 0.08]} />
            <meshBasicMaterial color={PALETTE.roadLine} />
          </mesh>
        )),
      )}
      {/* Run: track, with solid lane lines. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[legs[2], 0, 0]} receiveShadow>
        <planeGeometry args={[TRACK.leg, width + 0.8]} />
        <meshStandardMaterial color={PALETTE.track} roughness={0.95} />
      </mesh>
      {dividers.map((z) => (
        <mesh key={`line${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[legs[2], 0.01, z]}>
          <planeGeometry args={[TRACK.leg, 0.07]} />
          <meshBasicMaterial color={PALETTE.trackLine} />
        </mesh>
      ))}
      <Arch x={START_X} lanes={lanes} top={PALETTE.archTop} />
      <Arch x={START_X + TRACK.leg} lanes={lanes} top={PALETTE.archTop} />
      <Arch x={START_X + TRACK.leg * 2} lanes={lanes} top={PALETTE.archTop} />
      <Arch x={FINISH_X} lanes={lanes} top={PALETTE.finishTop} />
    </group>
  )
})

/**
 * The bicycle's shape, in the rider's own frame: +Z is the way they face and
 * ride, so the wheels are one behind the other along Z, each in the YZ plane.
 */
const BIKE = {
  wheelRadius: 0.38,
  /** Rear and front hubs. Far enough apart that neither wheel runs through the rider. */
  rearZ: -0.66,
  frontZ: 0.66,
  hubY: 0.42,
  saddle: [0, 0.6, -0.12] as const,
  crank: [0, 0.4, 0.02] as const,
  head: [0, 0.82, 0.48] as const,
  bars: [0, 1.02, 0.52] as const,
}

type V3 = readonly [number, number, number]
const UP = new Vector3(0, 1, 0)

/** A thin tube from one point to another - a piece of frame. */
function Tube({ from, to, radius = 0.035, colour = PALETTE.frame }: { from: V3; to: V3; radius?: number; colour?: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const along = b.clone().sub(a)
    return {
      position: a.add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, along.clone().normalize()),
      length: along.length(),
    }
  }, [from, to])
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={colour} roughness={0.4} metalness={0.5} />
    </mesh>
  )
}

/**
 * A bicycle ridden along +Z: two wheels one behind the other, a frame, a
 * saddle and bars. The wheels turn with the pedals - `wheels`' children are
 * spun about their axles (local X), and the spokes make the turning visible.
 */
const Bike = memo(function Bike({ wheels }: { wheels: RefObject<Group | null> }) {
  const { wheelRadius: r, rearZ, frontZ, hubY, saddle, crank, head, bars } = BIKE
  const rear: V3 = [0, hubY, rearZ]
  const front: V3 = [0, hubY, frontZ]
  return (
    <group>
      <group ref={wheels}>
        {[rearZ, frontZ].map((z) => (
          <group key={z} position={[0, hubY, z]}>
            {/* Turned so the tyre stands in the YZ plane, rolling along Z. */}
            <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[r, 0.05, 8, 24]} />
              <meshStandardMaterial color={PALETTE.wheel} roughness={0.7} />
            </mesh>
            {[0, Math.PI / 3, (Math.PI * 2) / 3].map((a) => (
              <mesh key={a} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.015, r * 2 - 0.04, 0.015]} />
                <meshStandardMaterial color={PALETTE.frame} roughness={0.4} metalness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <Tube from={saddle} to={crank} />
      <Tube from={crank} to={head} />
      <Tube from={saddle} to={head} />
      <Tube from={crank} to={rear} />
      <Tube from={saddle} to={rear} radius={0.025} />
      <Tube from={head} to={front} />
      <Tube from={head} to={bars} />
      <Tube from={[-0.26, bars[1], bars[2]]} to={[0.26, bars[1], bars[2]]} radius={0.03} colour={PALETTE.wheel} />
      <mesh position={[saddle[0], saddle[1] + 0.03, saddle[2]]} castShadow>
        <boxGeometry args={[0.14, 0.05, 0.28]} />
        <meshStandardMaterial color={PALETTE.wheel} roughness={0.8} />
      </mesh>
    </group>
  )
})

/** One racer, in their lane, swimming, biking or running. */
function RacerBody({ racer, index, count, live }: { racer: Racer; index: number; count: number; live: RefObject<Race> }) {
  const holder = useRef<Group>(null)
  const body = useRef<Group>(null)
  const bike = useRef<Group>(null)
  const wheels = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const x = useRef(START_X)
  const lastTyped = useRef(0)
  const hop = useRef(0)

  useFrame(({ clock }, delta) => {
    const group = holder.current
    const inner = body.current
    if (!group || !inner) return
    const race = live.current
    const sentence = sentenceFor(race.seed)
    const dt = Math.min(delta, 0.1)
    const leg = legOf(racer, sentence)
    x.current += (courseX(progressOf(racer, sentence)) - x.current) * (1 - Math.exp(-CATCH_UP * dt))
    group.position.set(x.current, 0, laneZ(index, count))
    // Facing along the course, left to right.
    group.rotation.set(0, Math.PI / 2, 0)

    if (racer.typed > lastTyped.current) hop.current = 1
    lastTyped.current = racer.typed
    hop.current = Math.max(0, hop.current - dt * 6)

    if (bike.current) bike.current.visible = leg === 'bike'
    if (wheels.current) wheels.current.children.forEach((w) => (w.rotation.x = racer.pedals * 0.6))
    const t = clock.elapsedTime
    if (leg === 'swim') {
      inner.position.set(0, -0.55 + Math.sin(t * 6 + index) * 0.06, 0)
      inner.rotation.set(1.1, 0, Math.sin(racer.strokes * 1.3) * 0.25)
    } else if (leg === 'bike') {
      inner.position.set(0, 0.55, 0)
      inner.rotation.set(0.25, 0, 0)
    } else if (leg === 'run') {
      inner.position.set(0, Math.sin(hop.current * Math.PI) * 0.22, 0)
      inner.rotation.set(0.15, 0, 0)
    } else {
      const since = racer.finishAt === null ? 0 : raceClock(race) - racer.finishAt
      inner.position.set(0, Math.abs(Math.sin(since * 6)) * 0.45, 0)
      inner.rotation.set(0, 0, 0)
    }
    group.visible = !racer.left
  })

  return (
    <group ref={holder}>
      <group ref={bike} visible={false}>
        <Bike wheels={wheels} />
      </group>
      <group ref={body}>
        <primitive object={avatar} />
      </group>
    </group>
  )
}

/** A strip of your own colour down your lane, so you can find yourself among eight. */
function YourLane({ index, count }: { index: number; count: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, laneZ(index, count)]}>
      <planeGeometry args={[FINISH_X - START_X, TRACK.lane - 0.2]} />
      <meshBasicMaterial color={COLOURS[index % COLOURS.length]} transparent opacity={0.22} />
    </mesh>
  )
}

export function TriathlonScene({ live }: { live: RefObject<Race> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const race = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const count = Math.max(1, race.racers.length)
  const mine = race.racers.findIndex((r) => r.mine)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 80, 200]} />
      <FixedCamera />
      <Daylight />
      <Course lanes={count} />
      {mine >= 0 ? <YourLane index={mine} count={count} /> : null}
      {race.racers.map((racer, index) => (
        <RacerBody key={`${race.id}:${racer.id}`} racer={racer} index={index} count={count} live={live} />
      ))}
    </>
  )
}
