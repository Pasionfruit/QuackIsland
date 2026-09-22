/**
 * I See The Light in three dimensions, lit and dressed like the island.
 *
 * A running track on the grass, a lane per racer, a start line at the near end
 * and a chequered finish at the far one, with a traffic light on a gantry over
 * it. Everybody is the island's own pill in their colour, in their lane, facing
 * the light, and hopping forward a step at a time.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { TRACK, frameScene, laneX, trackZ } from './camera'
import { COLOURS, LIGHT, lightAt, type Race, type Racer } from './rules'

export const PALETTE = {
  grass: '#8cc063',
  track: '#c9774f',
  line: '#fff8ea',
  dark: '#2c2a2e',
  post: '#56514d',
  lampOff: '#3b3336',
  red: '#ff3b30',
  green: '#34e27a',
  background: '#a9d4ec',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#7d8a5a',
} as const

const HALF_WIDTH = 4 * TRACK.lane
/** How fast a body closes on where its steps put it, per second. */
const CATCH_UP = 14

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
    Object.assign(light.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[14, 30, 4]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.45} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.85} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The grass, the track, the lane lines, the start line and the chequered finish. */
const Track = memo(function Track({ lanes }: { lanes: number }) {
  const width = Math.max(1, lanes) * TRACK.lane
  const middle = -TRACK.length / 2
  const squares = useMemo(() => {
    const out: [number, number][] = []
    const size = 0.425
    const across = Math.round(width / size)
    for (let i = 0; i < across; i++) {
      for (let row = 0; row < 2; row++) if ((i + row) % 2 === 0) out.push([-width / 2 + size * (i + 0.5), -TRACK.length + size * (row - 0.5)])
    }
    return out
  }, [width])
  return (
    <group>
      <mesh position={[0, -0.02, -TRACK.length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <mesh position={[0, 0, middle - 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 0.8, TRACK.length + 6]} />
        <meshStandardMaterial color={PALETTE.track} roughness={0.95} />
      </mesh>
      {Array.from({ length: lanes + 1 }, (_, i) => (
        <mesh key={i} position={[-width / 2 + i * TRACK.lane, 0.01, middle - 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.07, TRACK.length + 6]} />
          <meshBasicMaterial color={PALETTE.line} />
        </mesh>
      ))}
      <mesh position={[0, 0.015, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.14]} />
        <meshBasicMaterial color={PALETTE.line} />
      </mesh>
      <mesh position={[0, 0.012, -TRACK.length]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.85]} />
        <meshBasicMaterial color={PALETTE.line} />
      </mesh>
      {squares.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.016, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.425, 0.425]} />
          <meshBasicMaterial color={PALETTE.dark} />
        </mesh>
      ))}
    </group>
  )
})

/**
 * The traffic light: a gantry over the finish, a red lamp over a green one,
 * whichever is on glowing. It reads the race's clock, so it changes the frame
 * the rules say it does. The lamps are unlit and not tone mapped, so a lit red
 * is red rather than salmon.
 */
function TrafficLight({ live }: { live: RefObject<Race> }) {
  const red = useRef<MeshBasicMaterial>(null)
  const green = useRef<MeshBasicMaterial>(null)
  const z = -TRACK.length - TRACK.lightBack
  const span = HALF_WIDTH + 1.2
  useFrame(() => {
    const race = live.current
    const on = race.racers.length > 0 ? lightAt(race.seed, race.elapsed).colour : 'red'
    for (const [material, colour, lit] of [
      [red.current, PALETTE.red, on === 'red'],
      [green.current, PALETTE.green, on === 'green'],
    ] as const) {
      if (!material) continue
      material.color.set(lit ? colour : PALETTE.lampOff)
    }
  })
  return (
    <group position={[0, 0, z]}>
      {[-span, span].map((x) => (
        <mesh key={x} position={[x, TRACK.lightHeight / 2 + 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.2, TRACK.lightHeight + 1.2, 10]} />
          <meshStandardMaterial color={PALETTE.post} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, TRACK.lightHeight + 1.1, 0]} castShadow>
        <boxGeometry args={[span * 2 + 0.4, 0.32, 0.32]} />
        <meshStandardMaterial color={PALETTE.post} roughness={0.7} />
      </mesh>
      <mesh position={[0, TRACK.lightHeight - 0.2, 0]} castShadow>
        <boxGeometry args={[1.9, 3.6, 0.9]} />
        <meshStandardMaterial color={PALETTE.dark} roughness={0.6} />
      </mesh>
      <mesh position={[0, TRACK.lightHeight + 0.65, 0.47]}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial ref={red} color={PALETTE.lampOff} toneMapped={false} />
      </mesh>
      <mesh position={[0, TRACK.lightHeight - 1.05, 0.47]}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial ref={green} color={PALETTE.lampOff} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * One racer, in their lane. They close on where their steps put them, with a
 * hop to each step; somebody out topples over where they stood; somebody over
 * the line jumps for joy.
 */
function RacerBody({ racer, index, count, live, colour }: { racer: Racer; index: number; count: number; live: RefObject<Race>; colour: string }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const z = useRef(trackZ(racer.steps, LIGHT.steps))
  const hop = useRef(0)
  const lastSteps = useRef(racer.steps)

  useFrame((_, delta) => {
    const group = holder.current
    if (!group) return
    const race = live.current
    const dt = Math.min(delta, 0.1)
    const target = trackZ(racer.steps, LIGHT.steps)
    z.current += (target - z.current) * (1 - Math.exp(-CATCH_UP * dt))
    if (racer.steps > lastSteps.current) hop.current = 1
    lastSteps.current = racer.steps
    hop.current = Math.max(0, hop.current - dt * 7)

    let y = Math.sin(hop.current * Math.PI) * 0.18
    let tip = 0
    if (racer.out) {
      const t = Math.max(0, race.elapsed - racer.out.at)
      tip = Math.min(1, t * 2.5) * (Math.PI / 2)
      y = 0
    } else if (racer.finishedAt !== null) {
      const t = Math.max(0, race.elapsed - racer.finishedAt)
      y = Math.abs(Math.sin(t * 6)) * 0.5
    }
    group.position.set(laneX(index, count), y, z.current)
    // Facing the light, and falling on their back, towards the camera.
    group.rotation.set(-tip, Math.PI, 0, 'YXZ')
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
    </group>
  )
}

/** A strip down your own lane, so you can find yourself among eight. */
function YourLane({ index, count, colour }: { index: number; count: number; colour: string }) {
  return (
    <mesh position={[laneX(index, count), 0.005, -TRACK.length / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TRACK.lane - 0.12, TRACK.length]} />
      <meshBasicMaterial color={colour} transparent opacity={0.28} />
    </mesh>
  )
}

export function ISeeTheLightScene({ live }: { live: RefObject<Race> }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const race = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const count = Math.max(race.racers.length, 1)
  const mineIndex = race.racers.findIndex((r) => r.mine)
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => race.racers.map((racer, index) => rosterColour(racer, index, COLOURS, myColour, peers)),
    [race.racers, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 70, 200]} />
      <FixedCamera />
      <Daylight />
      <Track lanes={count} />
      <TrafficLight live={live} />
      {mineIndex >= 0 ? <YourLane index={mineIndex} count={count} colour={colours[mineIndex]} /> : null}
      {race.racers.map((racer, index) => (
        <RacerBody key={`${race.id}:${racer.id}`} racer={racer} index={index} count={count} live={live} colour={colours[index]} />
      ))}
    </>
  )
}
