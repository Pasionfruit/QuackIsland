/**
 * Wack-Attack in three dimensions.
 *
 * A fenced field of grass with sixteen holes in it, everybody the island's own
 * pill in their colour carrying a hammer, and moles: brown, with a pink nose,
 * rising out of their holes and sinking back - or gold and shining, for the
 * golden mole. A swing brings the hammer down in front of you; a whacked mole is
 * flattened into its hole with a burst in the whacker's colour. A player bonked
 * on the head wobbles, with stars going round over it, until the stun wears off.
 *
 * Your own spot - where your hammer will land - is marked on the grass.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { PLAYER, createAvatar } from '../../02-player'
import { frameScene } from './camera'
import { COLOURS, FIELD, HOLES, holeAt, isStunned, molesFor, strikePoint, whackOf, type Game, type Mole, type Whacker } from './rules'

export const PALETTE = {
  background: '#bfe4c8',
  grass: '#86c261',
  grassDark: '#78b556',
  outside: '#6fa84f',
  dirt: '#8a6440',
  hole: '#2c1d12',
  fence: '#c9a06a',
  mole: '#7b5638',
  belly: '#c9a27c',
  nose: '#f08aa0',
  eye: '#1b1310',
  gold: '#ffc83d',
  handle: '#8a5a30',
  head: '#6d7278',
  star: '#ffe14d',
  sunColour: '#fff3e0',
  ambientColour: '#eaf6ff',
  skyColour: '#e6f5ff',
  groundColour: '#6f8a4f',
} as const

/** How long a mole takes to come up, drawn. */
const RISE = 0.15
/** How long a whacked mole takes to flatten away. */
const FLATTEN = 0.35
/** A swing: up, down onto the grass by this, back up by `SWING_BACK`. */
const SWING_DOWN = 0.1
const SWING_BACK = 0.32

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
    Object.assign(light.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 90 })
    // A field thirteen metres across: a thousand texels over it is about eighty
    // to the metre, which is more than a mole is drawn with.
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0008
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-10, 26, 14]} intensity={2.2} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The grass, striped, the fence round it, and the sixteen holes. */
const Field = memo(function Field() {
  const side = FIELD.half * 2
  const posts = useMemo(() => {
    const out: [number, number][] = []
    const n = 8
    for (let i = 0; i <= n; i++) {
      const t = -FIELD.half + (side * i) / n
      out.push([t, -FIELD.half - 0.3], [t, FIELD.half + 0.3], [-FIELD.half - 0.3, t], [FIELD.half + 0.3, t])
    }
    return out
  }, [side])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color={PALETTE.outside} roughness={1} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -FIELD.half + side / 16 + (i * side) / 8]} receiveShadow>
          <planeGeometry args={[side, side / 8]} />
          <meshStandardMaterial color={i % 2 === 0 ? PALETTE.grass : PALETTE.grassDark} roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: HOLES }, (_, i) => {
        const h = holeAt(i)
        return (
          <group key={i} position={[h.x, 0, h.y]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
              <ringGeometry args={[FIELD.hole * 0.72, FIELD.hole * 1.12, 28]} />
              <meshStandardMaterial color={PALETTE.dirt} roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
              <circleGeometry args={[FIELD.hole * 0.74, 28]} />
              <meshBasicMaterial color={PALETTE.hole} />
            </mesh>
          </group>
        )
      })}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <boxGeometry args={[0.22, 0.9, 0.22]} />
          <meshStandardMaterial color={PALETTE.fence} roughness={0.9} />
        </mesh>
      ))}
      {[
        [0, -FIELD.half - 0.3, side + 0.6, 0.12],
        [0, FIELD.half + 0.3, side + 0.6, 0.12],
        [-FIELD.half - 0.3, 0, 0.12, side + 0.6],
        [FIELD.half + 0.3, 0, 0.12, side + 0.6],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.7, z]} castShadow>
          <boxGeometry args={[w, 0.12, d]} />
          <meshStandardMaterial color={PALETTE.fence} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
})

/** One mole: up out of its hole, down again, or flattened by a hammer. */
function MoleBody({ mole, live }: { mole: Mole; live: RefObject<Game> }) {
  const body = useRef<Group>(null)
  const burst = useRef<Group>(null)
  const burstMaterial = useRef<MeshBasicMaterial>(null)
  const hole = holeAt(mole.hole)
  const colour = mole.golden ? PALETTE.gold : PALETTE.mole

  useFrame(({ clock }) => {
    const g = live.current
    const group = body.current
    if (!group) return
    const now = g.elapsed
    const whack = whackOf(g, mole.id)
    let rise = Math.min(1, Math.max(0, (now - mole.at) / RISE))
    let squash = 1
    if (whack) {
      const t = Math.max(0, now - whack.at)
      squash = Math.max(0.2, 1 - t / FLATTEN)
      rise = Math.max(0, 1 - t / FLATTEN)
    } else if (now > mole.at + mole.up) {
      rise = Math.max(0, 1 - (now - mole.at - mole.up) / FIELD.sink)
    }
    group.visible = rise > 0.01
    group.position.set(hole.x, -0.9 + rise * 0.9, hole.y)
    group.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5)
    group.rotation.y = mole.golden ? clock.elapsedTime * 2 : Math.sin(clock.elapsedTime * 3 + mole.id) * 0.3

    const ring = burst.current
    if (ring && burstMaterial.current) {
      const t = whack ? now - whack.at : Infinity
      ring.visible = t >= 0 && t < 0.5
      if (ring.visible && whack) {
        ring.scale.setScalar(0.6 + t * 4)
        burstMaterial.current.opacity = 1 - t / 0.5
        burstMaterial.current.color.set(COLOURS[whack.player % COLOURS.length])
      }
    }
  })

  return (
    <>
      <group ref={body} visible={false}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.42, 0.45, 6, 16]} />
          <meshStandardMaterial
            color={colour}
            roughness={mole.golden ? 0.25 : 0.85}
            metalness={mole.golden ? 0.6 : 0}
            emissive={mole.golden ? PALETTE.gold : '#000000'}
            emissiveIntensity={mole.golden ? 0.35 : 0}
          />
        </mesh>
        <mesh position={[0, 0.55, 0.3]} scale={[1, 1.1, 0.5]}>
          <sphereGeometry args={[0.3, 14, 10]} />
          <meshStandardMaterial color={mole.golden ? '#fff0b0' : PALETTE.belly} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.78, 0.42]}>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshStandardMaterial color={PALETTE.nose} roughness={0.5} />
        </mesh>
        {[-0.15, 0.15].map((x) => (
          <mesh key={x} position={[x, 0.93, 0.34]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshBasicMaterial color={PALETTE.eye} />
          </mesh>
        ))}
      </group>
      <group ref={burst} position={[hole.x, 0.08, hole.y]} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.95, 24]} />
          <meshBasicMaterial ref={burstMaterial} transparent opacity={1} />
        </mesh>
      </group>
    </>
  )
}

/**
 * Which moles are on the field at `now`: the first and the last of them, by
 * place in the schedule.
 *
 * The schedule is in order of when each mole comes up, so what is showing is
 * always a run of it rather than a scatter - found by walking it, without
 * building a list, because this is looked at every frame.
 */
function showing(moles: readonly Mole[], now: number): { first: number; last: number } {
  let first = -1
  let last = -2
  for (let i = 0; i < moles.length; i++) {
    const mole = moles[i]
    if (mole.at > now + 0.1) break
    if (now > mole.at + mole.up + FIELD.sink + FLATTEN + 0.5) continue
    if (first < 0) first = i
    last = i
  }
  return { first, last }
}

/** A heading on the field's x/y, as a turn about the world's up axis. */
function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

/** Stars going round over a stunned head. */
const STARS = 5

/** One player, with a hammer that comes down in front of them on a swing. */
function WhackerBody({ whacker, index, live }: { whacker: Whacker; index: number; live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const hammer = useRef<Group>(null)
  const stars = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])

  useFrame(({ clock }) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const stunned = isStunned(whacker, g.elapsed) && !g.over
    const wobble = stunned ? Math.sin(clock.elapsedTime * 14) * 0.18 : 0
    group.position.set(whacker.x, 0, whacker.y)
    group.rotation.set(wobble, headingToYaw(whacker.facing), wobble * 0.6)
    if (stars.current) {
      stars.current.visible = stunned
      if (stunned) stars.current.rotation.set(-wobble, clock.elapsedTime * 4, -wobble * 0.6)
    }
    if (hammer.current) {
      const t = g.elapsed - whacker.swungAt
      // Held raised over the shoulder; down onto the grass in front; back up.
      const raised = -0.5
      const down = 1.45
      let angle = raised
      if (t >= 0 && t < SWING_DOWN) angle = raised + (down - raised) * (t / SWING_DOWN)
      else if (t >= SWING_DOWN && t < SWING_BACK) angle = down + (raised - down) * ((t - SWING_DOWN) / (SWING_BACK - SWING_DOWN))
      hammer.current.rotation.x = angle
    }
  })

  return (
    <group ref={holder}>
      <primitive object={avatar} />
      <group ref={stars} position={[0, PLAYER.height + 0.25, 0]} visible={false}>
        {Array.from({ length: STARS }, (_, i) => {
          const a = (i / STARS) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.45, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.45]}>
              <octahedronGeometry args={[0.11, 0]} />
              <meshBasicMaterial color={PALETTE.star} />
            </mesh>
          )
        })}
      </group>
      <group ref={hammer} position={[0.38, 1.0, 0.05]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.95, 8]} />
          <meshStandardMaterial color={PALETTE.handle} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.5, 14]} />
          <meshStandardMaterial color={PALETTE.head} roughness={0.4} metalness={0.5} emissive={colour} emissiveIntensity={0.12} />
        </mesh>
      </group>
    </group>
  )
}

/** Where your own hammer will land, marked on the grass. */
function YourSpot({ live }: { live: RefObject<Game> }) {
  const spot = useRef<Group>(null)
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    const g = live.current
    const index = g.players.findIndex((p) => p.mine)
    const box = spot.current
    if (!box) return
    box.visible = index >= 0 && !g.over
    if (index < 0) return
    const at = strikePoint(g.players[index])
    box.position.set(at.x, 0.03, at.y)
    material.current?.color.set(COLOURS[index % COLOURS.length])
  })
  return (
    <group ref={spot} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.4, 24]} />
        <meshBasicMaterial ref={material} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

export function WackAttackScene({ live }: { live: RefObject<Game> }) {
  // Redrawn only when what is on the field changes - a mole up, a mole gone,
  // somebody joining - never every frame: everything below moves itself from
  // the live game inside its own `useFrame`, and a React pass over the whole
  // field sixty times a second is the one thing here that costs real time.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const up = g.players.length > 0 ? showing(molesFor(g.seed), g.elapsed) : { first: -1, last: -2 }
    let key = `${g.id}:${g.seed}:${up.first}:${up.last}`
    for (const p of g.players) key += `:${p.id}`
    if (key === cast.current) return
    cast.current = key
    redraw()
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const now = game.elapsed
  const up = game.players.length > 0 ? showing(molesFor(game.seed), now) : { first: -1, last: -2 }
  const moles = molesFor(game.seed).slice(Math.max(0, up.first), up.last + 1)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 50, 120]} />
      <FixedCamera />
      <Daylight />
      <Field />
      {moles.map((mole) => (
        <MoleBody key={`${game.id}:${mole.id}`} mole={mole} live={live} />
      ))}
      {game.players.map((whacker, index) => (
        <WhackerBody key={`${game.id}:${whacker.id}`} whacker={whacker} index={index} live={live} />
      ))}
      <YourSpot live={live} />
    </>
  )
}
