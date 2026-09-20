/**
 * He's One Shot in three dimensions, through your own eyes.
 *
 * A big walled square of sand under a bright sky, with crates and lengths of wall
 * to hide behind. Everybody standing is the island's capsule in their own colour.
 * **A hunter - somebody already eliminated - is a see-through grey ghost with a
 * ring of their colour over their head, and a smaller ring inside it in the colour
 * of whoever they hunt for**, so at a glance you can tell who can still be shot
 * from who is only there to shoot you, and whose side they are on.
 *
 * **A shielded player is inside a pale blue bubble.** Shields lie about the arena
 * as floating bubbles of the same blue over a ring on the sand, and are gone from
 * there until they come back.
 *
 * Your gun sits at the bottom right, in your colour, and kicks when it fires.
 * Every shot is a streak from the gun to wherever it stopped, in the shooter's
 * colour, gone in a moment, with a puff where it landed.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three'
import { createAvatar } from '../../02-player'
import { ARENA, arenaFor } from './arena'
import { BODY, COLOURS, crewOf, guarded, pickupReady, type Game, type Shot } from './rules'

export const PALETTE = {
  sky: '#9fd8f0',
  sand: '#ead5a6',
  sandDark: '#dfc58f',
  wall: '#7fb5c4',
  crate: '#c98f55',
  plank: '#dcae72',
  hunter: '#6d6880',
  /** A shield: the bubble round a player, and the one waiting to be picked up. */
  shield: '#5ad1ff',
  shieldCore: '#e6fbff',
  gun: '#2d2a33',
  flash: '#fff3b0',
} as const

/** Where your gun sits in front of your eyes, metres: right, down, forward. */
export const GUN_AT = { x: 0.2, y: -0.19, z: -0.45 } as const
/** How big the gun is drawn: small enough to leave the view to the arena. */
export const GUN_SCALE = 0.55
/** How long a streak lasts, seconds. */
const TRACER_FADE = 0.22
const PUFF_FADE = 0.4

/** The camera's own look, which the screen keeps from the mouse. */
export interface LookRef {
  yaw: number
  pitch: number
}

let floorTexture: CanvasTexture | null = null

/** Big soft squares of two sands, so you can see yourself move. */
function floor(): CanvasTexture {
  if (floorTexture) return floorTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.sand
  c.fillRect(0, 0, 128, 128)
  c.fillStyle = PALETTE.sandDark
  c.fillRect(0, 0, 64, 64)
  c.fillRect(64, 64, 64, 64)
  floorTexture = new CanvasTexture(canvas)
  floorTexture.colorSpace = SRGBColorSpace
  floorTexture.wrapS = RepeatWrapping
  floorTexture.wrapT = RepeatWrapping
  // One square every two metres.
  floorTexture.repeat.set(ARENA.half / 2, ARENA.half / 2)
  return floorTexture
}

function FirstPersonCamera({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
  useFrame(({ camera }) => {
    const me = live.current.players.find((p) => p.mine)
    if (!me) {
      // Waiting for the host: over the arena, looking down on it.
      camera.position.set(0, 46, 36)
      camera.lookAt(0, 0, 0)
      return
    }
    // Eyes go up with a jump.
    camera.position.set(me.x, BODY.eye + me.y, me.z)
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ')
    // Now rather than at render, so the gun and your own streaks follow this frame's look.
    camera.updateMatrixWorld()
  })
  return null
}

/** The floor, the wall and the cover, for a seed. */
const ArenaView = memo(function ArenaView({ seed }: { seed: number }) {
  const boxes = useRef<InstancedMesh>(null)
  const arena = arenaFor(seed)
  useLayoutEffect(() => {
    const mesh = boxes.current
    if (!mesh) return
    const matrix = new Matrix4()
    const scale = new Matrix4()
    const colour = new Color()
    arena.blocks.forEach((b, i) => {
      matrix.makeTranslation((b.x0 + b.x1) / 2, b.height / 2, (b.z0 + b.z1) / 2)
      scale.makeScale(b.x1 - b.x0, b.height, b.z1 - b.z0)
      mesh.setMatrixAt(i, matrix.multiply(scale))
      const crate = Math.abs(b.x1 - b.x0 - (b.z1 - b.z0)) < 1.5
      mesh.setColorAt(i, colour.set(b.wall ? PALETTE.wall : crate ? PALETTE.crate : PALETTE.plank))
    })
    mesh.count = arena.blocks.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [arena])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA.half * 2, ARENA.half * 2]} />
        <meshStandardMaterial map={floor()} roughness={1} />
      </mesh>
      {/* Beyond the wall, so the horizon is not a void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={PALETTE.sandDark} roughness={1} />
      </mesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, 128]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
    </group>
  )
})

/** A body made see-through grey, on materials of its own. */
function ghostly(avatar: Group): Group {
  avatar.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const material = (mesh.material as Material).clone()
    material.transparent = true
    material.opacity = 0.42
    material.depthWrite = false
    mesh.material = material
    mesh.castShadow = false
  })
  return avatar
}

const PUFF_GEOMETRY = new SphereGeometry(0.5, 12, 8)

/** Somebody else: standing in their colour, or hunting as a ghost; a burst when they go. */
function BodyView({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const halo = useRef<Mesh>(null)
  const side = useRef<Mesh>(null)
  const bubble = useRef<Mesh>(null)
  const burst = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const standing = useMemo(() => createAvatar(colour), [colour])
  const hunter = useMemo(() => ghostly(createAvatar(PALETTE.hunter)), [])
  const shown = useRef<{ x: number; z: number } | null>(null)
  const wentAt = useRef<number | null>(null)

  useFrame(({ clock }, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !turn.current || !p) return
    // Hidden through the spawn guard, so nobody can be lined up before the shooting starts.
    group.current.visible = !p.left && !p.mine && !guarded(g)
    // Eased towards where the host last had them, so fifteen snapshots a second do not stutter.
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 20)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    group.current.position.set(s.x, p.y, s.z)
    turn.current.rotation.y = p.yaw + Math.PI
    standing.visible = p.out === null
    hunter.visible = p.out !== null
    if (halo.current) {
      halo.current.visible = p.out !== null
      halo.current.rotation.z = clock.elapsedTime * 2
    }
    if (side.current) {
      // A smaller ring in the colour of whoever they hunt for; nothing for a hunter with nobody to hunt for.
      const master = p.out !== null ? crewOf(g, index) : null
      side.current.visible = master !== null
      if (master !== null) (side.current.material as MeshBasicMaterial).color.set(COLOURS[master % COLOURS.length])
      side.current.rotation.z = -clock.elapsedTime * 2
    }
    if (bubble.current) {
      bubble.current.visible = p.shield && p.out === null
      bubble.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4 + index) * 0.03)
    }
    if (p.out !== null && wentAt.current === null) wentAt.current = clock.elapsedTime
    if (p.out === null) wentAt.current = null
    if (burst.current) {
      const age = wentAt.current === null ? Infinity : clock.elapsedTime - wentAt.current
      burst.current.visible = age < PUFF_FADE
      if (age < PUFF_FADE) {
        burst.current.scale.setScalar(0.4 + (age / PUFF_FADE) * 1.1)
        ;(burst.current.material as MeshBasicMaterial).opacity = 0.8 * (1 - age / PUFF_FADE)
      }
    }
  })

  return (
    <group ref={group}>
      <group ref={turn}>
        <primitive object={standing} />
        <primitive object={hunter} />
      </group>
      <mesh ref={halo} position={[0, BODY.height + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.27, 6]} />
        <meshBasicMaterial color={colour} side={DoubleSide} />
      </mesh>
      <mesh ref={side} position={[0, BODY.height + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.07, 0.13, 6]} />
        <meshBasicMaterial color="#ffffff" side={DoubleSide} />
      </mesh>
      <mesh ref={bubble} position={[0, BODY.height / 2, 0]} visible={false}>
        <sphereGeometry args={[0.95, 20, 14]} />
        <meshBasicMaterial color={PALETTE.shield} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh ref={burst} geometry={PUFF_GEOMETRY} position={[0, 1.1, 0]} visible={false}>
        <meshBasicMaterial color={colour} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * The shields lying about the arena: a pale blue bubble with a bright core,
 * bobbing over a ring on the sand, turned to face nobody in particular. Gone
 * while the shield is, and the ring stays so you know where to look.
 */
function Pickups({ live, seed }: { live: RefObject<Game>; seed: number }) {
  const spots = arenaFor(seed).pickups
  const floating = useRef<(Group | null)[]>([])
  const rings = useRef<(Mesh | null)[]>([])
  useFrame(({ clock }) => {
    const g = live.current
    spots.forEach((_, k) => {
      const bob = floating.current[k]
      if (bob) {
        bob.visible = pickupReady(g, k)
        bob.position.y = 0.95 + Math.sin(clock.elapsedTime * 2 + k * 1.7) * 0.12
        bob.rotation.y = clock.elapsedTime * 1.2
      }
      const ring = rings.current[k]
      if (ring) (ring.material as MeshBasicMaterial).opacity = pickupReady(g, k) ? 0.85 : 0.25
    })
  })
  return (
    <group>
      {spots.map((at, k) => (
        <group key={k} position={[at.x, 0, at.z]}>
          <mesh ref={(m) => void (rings.current[k] = m)} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.7, 0.95, 28]} />
            <meshBasicMaterial color={PALETTE.shield} transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <group ref={(m) => void (floating.current[k] = m)} position={[0, 0.95, 0]}>
            <mesh>
              <sphereGeometry args={[0.5, 20, 14]} />
              <meshBasicMaterial color={PALETTE.shield} transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <mesh>
              <octahedronGeometry args={[0.2, 0]} />
              <meshBasicMaterial color={PALETTE.shieldCore} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

/**
 * The sun, kept over whoever is looking: a light that shadows the whole of a
 * 48 m arena would need shadow maps too coarse to show a crate's, so it lights
 * the part you are in and moves with you.
 */
function Sun({ live }: { live: RefObject<Game> }) {
  const light = useMemo(() => {
    const l = new DirectionalLight('#ffffff', 2.4)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera
    c.left = -24
    c.right = 24
    c.top = 24
    c.bottom = -24
    c.near = 1
    c.far = 80
    return l
  }, [])
  useFrame(() => {
    const me = live.current.players.find((p) => p.mine)
    const x = me?.x ?? 0
    const z = me?.z ?? 0
    light.position.set(x + 14, 24, z + 9)
    light.target.position.set(x, 0, z)
    light.target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

const TRACER_GEOMETRY = new CylinderGeometry(0.02, 0.02, 1, 6, 1, true)
const UP = new Vector3(0, 1, 0)

/** Where a shot of your own seems to come from: the end of your gun. */
const MUZZLE = new Vector3(GUN_AT.x, GUN_AT.y + 0.03 * GUN_SCALE, GUN_AT.z - 0.36 * GUN_SCALE)

/** The streaks and the puffs, from a small pool. */
function Tracers({ live }: { live: RefObject<Game> }) {
  const camera = useThree((s) => s.camera)
  const streaks = useMemo(
    () =>
      Array.from({ length: 12 }, () => {
        const m = new Mesh(TRACER_GEOMETRY, new MeshBasicMaterial({ transparent: true, depthWrite: false }))
        m.visible = false
        return m
      }),
    [],
  )
  const puffs = useMemo(
    () =>
      Array.from({ length: 12 }, () => {
        const m = new Mesh(PUFF_GEOMETRY, new MeshBasicMaterial({ transparent: true, depthWrite: false, color: '#fffaf0' }))
        m.visible = false
        return m
      }),
    [],
  )
  const seen = useRef(new WeakMap<Shot, number>())
  const from = useMemo(() => new Vector3(), [])
  const to = useMemo(() => new Vector3(), [])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    const g = live.current
    let used = 0
    for (const shot of g.shots) {
      if (!seen.current.has(shot)) seen.current.set(shot, now)
      const age = now - seen.current.get(shot)!
      if (age > PUFF_FADE || used >= streaks.length) continue
      const streak = streaks[used]
      const puff = puffs[used]
      used += 1
      const shooter = g.players[shot.by]
      if (shooter?.mine) from.copy(MUZZLE).applyMatrix4(camera.matrixWorld)
      else from.set(shot.from.x, shot.from.y - 0.25, shot.from.z)
      to.set(shot.to.x, shot.to.y, shot.to.z)
      const length = from.distanceTo(to)
      streak.visible = age < TRACER_FADE && length > 0.05
      if (streak.visible) {
        streak.position.copy(from).lerp(to, 0.5)
        streak.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
        streak.scale.set(shooter?.mine ? 1 : 1.6, length, shooter?.mine ? 1 : 1.6)
        const m = streak.material as MeshBasicMaterial
        m.color.set(shooter?.mine ? PALETTE.flash : COLOURS[shot.by % COLOURS.length])
        m.opacity = 1 - age / TRACER_FADE
      }
      puff.visible = true
      puff.position.copy(to)
      puff.scale.setScalar(0.08 + (age / PUFF_FADE) * 0.35)
      const pm = puff.material as MeshBasicMaterial
      pm.color.set(shot.hit >= 0 ? COLOURS[shot.hit % COLOURS.length] : '#fffaf0')
      pm.opacity = 0.9 * (1 - age / PUFF_FADE)
    }
    for (let i = used; i < streaks.length; i++) {
      streaks[i].visible = false
      puffs[i].visible = false
    }
  })

  return (
    <group>
      {streaks.map((m, i) => (
        <primitive key={`s${i}`} object={m} />
      ))}
      {puffs.map((m, i) => (
        <primitive key={`p${i}`} object={m} />
      ))}
    </group>
  )
}

/** Your gun, held in front of the camera, in your colour. It kicks when it fires. */
function Gun({ live }: { live: RefObject<Game> }) {
  const camera = useThree((s) => s.camera)
  const rig = useRef<Group>(null)
  const kick = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const game = live.current
  const index = game.players.findIndex((p) => p.mine)
  const colour = index >= 0 ? COLOURS[index % COLOURS.length] : '#ffffff'

  useFrame(() => {
    if (!rig.current || !kick.current) return
    rig.current.position.copy(camera.position)
    rig.current.quaternion.copy(camera.quaternion)
    const g = live.current
    const me = g.players.find((p) => p.mine)
    rig.current.visible = !!me && !me.left
    const since = me ? g.elapsed - me.shotAt : Infinity
    const k = since >= 0 && since < 0.2 ? 1 - since / 0.2 : 0
    kick.current.position.set(GUN_AT.x, GUN_AT.y + 0.012 * k, GUN_AT.z + 0.05 * k)
    kick.current.rotation.x = 0.3 * k
    if (flash.current) flash.current.visible = since >= 0 && since < 0.06
  })

  // Drawn over everything, so it never sinks into a wall you are standing against.
  const over = { depthTest: false, depthWrite: false } as const
  return (
    <group ref={rig}>
      <group ref={kick} scale={GUN_SCALE}>
        <mesh renderOrder={20}>
          <boxGeometry args={[0.09, 0.13, 0.36]} />
          <meshBasicMaterial color={PALETTE.gun} {...over} />
        </mesh>
        <mesh renderOrder={21} position={[0, 0.045, -0.02]}>
          <boxGeometry args={[0.095, 0.03, 0.3]} />
          <meshBasicMaterial color={colour} {...over} />
        </mesh>
        <mesh renderOrder={21} position={[0, 0.03, -0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 10]} />
          <meshBasicMaterial color="#4a4652" {...over} />
        </mesh>
        <mesh renderOrder={20} position={[0, -0.11, 0.08]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.07, 0.14, 0.08]} />
          <meshBasicMaterial color={PALETTE.gun} {...over} />
        </mesh>
        <mesh ref={flash} renderOrder={22} position={[0, 0.03, -0.39]} visible={false}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshBasicMaterial color={PALETTE.flash} {...over} />
        </mesh>
      </group>
    </group>
  )
}

export function HesOneShotScene({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
  // Only re-rendered when who is in the arena changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.players.map((p) => `${p.id}${p.mine ? '*' : ''}`).join(',')}`
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
      <fog attach="fog" args={[PALETTE.sky, 40, 115]} />
      <hemisphereLight args={['#eef8ff', '#c9a36e', 1.3]} />
      <Sun live={live} />
      <FirstPersonCamera live={live} look={look} />
      {game.players.length > 0 ? <ArenaView seed={game.seed} /> : null}
      {game.players.length > 0 ? <Pickups key={`${game.id}:pickups`} live={live} seed={game.seed} /> : null}
      {game.players.map((p, index) => (p.mine ? null : <BodyView key={`${game.id}:${p.id}`} index={index} live={live} />))}
      <Tracers live={live} />
      {game.players.length > 0 ? <Gun key={`${game.id}:gun`} live={live} /> : null}
    </>
  )
}
