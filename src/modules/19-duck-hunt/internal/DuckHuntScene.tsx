/**
 * Duck Hunt in three dimensions, lit and dressed like the island.
 *
 * An open grass hunting ground, balloons rising up the view, the players lined
 * up along the near edge in their colours, and everybody else's crosshair
 * moving over the field where they are aiming. Where every balloon is
 * comes from `balloonAt` and the game clock, so every browser draws the same
 * balloons in the same places without being told.
 *
 * **Shooting is here, because aiming needs the camera.** A click becomes a ray
 * from this browser's camera through the pointer, `pickBalloon` finds what it
 * hits, and the screen is handed the answer. Different windows have different
 * cameras; what counts is what was under the crosshair on the screen that fired.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  type MeshBasicMaterial,
  Vector2,
  Vector3,
  type DirectionalLight,
  type Mesh,
  type BufferGeometry,
} from 'three'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { createAvatar } from '../../02-player'
import { botAim } from './ai'
import { ARENA, BOUNDS, COLOURS, EMBLEMS, aimAt, balloonAt, pickBalloon, type Balloon, type Emblem, type Point } from './arena'
import { frameScene } from './camera'
import type { Game } from './game'
import { AIM_STALE_MS, type Aims, type Trigger } from './useGameNet'

export const PALETTE = {
  grass: '#7db552',
  patches: ['#72aa48', '#88bd5c', '#6fa347', '#8fc063'],
  tufts: ['#6ea544', '#7fb650', '#8cc25a', '#5f9a3d', '#9ac765'],
  reeds: ['#9fb85a', '#b3c46a', '#7fa84a', '#c2b86a'],
  flowers: ['#ffffff', '#ffe066', '#f6a5c0', '#b9a7f0', '#ffb347'],
  bushes: ['#4f8a3a', '#5d9a41', '#467f35', '#62a04a'],
  trunks: ['#7a5a3c', '#6b4d32', '#86633f'],
  crowns: ['#3f7a34', '#4c8a3a', '#356c2e', '#5a9744'],
  hills: ['#8bb87a', '#7eae70', '#98c088'],
  background: '#a8d3ef',
  sunColour: '#fff3e0',
  ambientColour: '#cfe3ff',
  skyColour: '#bcd6ff',
  groundColour: '#5f7f45',
  emblem: '#ffffff',
} as const

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
    Object.assign(light.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 160 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[14, 34, 26]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** One material per colour, shared by every balloon in it. */
const skins = new Map<string, MeshStandardMaterial>()
function skin(colour: string): MeshStandardMaterial {
  let material = skins.get(colour)
  if (!material) {
    material = new MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.05 })
    skins.set(colour, material)
  }
  return material
}

/** A flat shape, one geometry per kind, facing +z, about a balloon's width across. */
const shapes = new Map<Emblem, BufferGeometry[]>()
function emblemParts(emblem: Emblem): BufferGeometry[] {
  let parts = shapes.get(emblem)
  if (parts) return parts
  const r = ARENA.radius * 0.42
  switch (emblem) {
    case 'dot':
      parts = [new CircleGeometry(r * 0.8, 24)]
      break
    case 'ring':
      parts = [new RingGeometry(r * 0.55, r, 28)]
      break
    case 'triangle':
      parts = [new CircleGeometry(r * 1.1, 3, Math.PI / 2)]
      break
    case 'square':
      parts = [new CircleGeometry(r * 1.05, 4, Math.PI / 4)]
      break
    case 'diamond':
      parts = [new CircleGeometry(r * 1.05, 4, 0)]
      break
    case 'hexagon':
      parts = [new CircleGeometry(r, 6)]
      break
    case 'star':
      parts = [new CircleGeometry(r * 1.1, 3, Math.PI / 2), new CircleGeometry(r * 1.1, 3, -Math.PI / 2)]
      break
    case 'cross': {
      const bar = new CircleGeometry(r, 4, Math.PI / 4)
      bar.scale(1.1, 0.32, 1)
      const upright = new CircleGeometry(r, 4, Math.PI / 4)
      upright.scale(0.32, 1.1, 1)
      parts = [bar, upright]
      break
    }
  }
  shapes.set(emblem, parts)
  return parts
}

const white = new MeshStandardMaterial({ color: PALETTE.emblem, roughness: 0.5 })

/** One balloon: a sphere in its owner's colour, their shape on the front, a string. */
function BalloonBody({ balloon, game }: { balloon: Balloon; game: Game }) {
  const holder = useRef<Group>(null)
  const colour = COLOURS[balloon.owner % COLOURS.length]
  const emblem = EMBLEMS[balloon.owner % EMBLEMS.length]
  useFrame(() => {
    const at = balloonAt(balloon, game.elapsed)
    if (holder.current && at) holder.current.position.set(at.x, at.y, at.z)
  })
  return (
    <group ref={holder}>
      <mesh material={skin(colour)} scale={[1, 1.15, 1]} castShadow>
        <sphereGeometry args={[ARENA.radius, 20, 16]} />
      </mesh>
      {/* Just in front of the balloon's surface, not on it: a flat shape at the
          sphere's own radius sits inside the curve everywhere but the very
          middle, and all that shows is its outline. */}
      {emblemParts(emblem).map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={white} position={[0, 0.05, ARENA.radius + 0.04 + i * 0.002]} />
      ))}
      <mesh position={[0, -ARENA.radius * 1.15 - 0.6, 0]} material={white}>
        <cylinderGeometry args={[0.02, 0.02, 1.2, 4]} />
      </mesh>
    </group>
  )
}

interface Burst {
  key: number
  at: Point
  colour: string
  born: number
}

/** Bits of balloon flying out, for a moment, wherever something popped. */
function Bursts({ game }: { game: Game }) {
  const seen = useRef(new Set<number>())
  const bursts = useRef<Burst[]>([])
  const holder = useRef<Group>(null)

  // Anything newly popped since last time gets a burst where it was.
  for (const [id] of game.popped) {
    if (seen.current.has(id)) continue
    seen.current.add(id)
    const balloon = game.balloons[id]
    const at = balloon && balloonAt(balloon, game.elapsed)
    if (at) bursts.current.push({ key: id, at, colour: COLOURS[balloon.owner % COLOURS.length], born: performance.now() })
  }
  // A new game starts the list again.
  if (game.popped.size === 0 && seen.current.size > 0) seen.current.clear()

  useFrame(() => {
    const now = performance.now()
    bursts.current = bursts.current.filter((b) => now - b.born < 450)
    const group = holder.current
    if (!group) return
    group.children.forEach((child, i) => {
      const burst = bursts.current[i]
      child.visible = !!burst
      if (!burst) return
      const t = (now - burst.born) / 450
      child.position.set(burst.at.x, burst.at.y, burst.at.z)
      child.scale.setScalar(0.6 + t * 2.4)
      ;((child as Mesh).material as MeshStandardMaterial).opacity = 1 - t
      ;((child as Mesh).material as MeshStandardMaterial).color.set(burst.colour)
    })
  })

  // A small pool: more pops at once than this is not something anybody sees.
  return (
    <group ref={holder}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} visible={false}>
          <icosahedronGeometry args={[ARENA.radius * 0.7, 0]} />
          <meshStandardMaterial transparent wireframe opacity={1} />
        </mesh>
      ))}
    </group>
  )
}

/** Where each player's last shot landed, as a flash in their colour. Misses too. */
function ShotFlashes({ game }: { game: Game }) {
  return (
    <>
      {game.players.map((player, index) => {
        const shot = player.lastShot
        const age = shot ? game.elapsed - shot.at : Infinity
        if (!shot || age < 0 || age > 0.35) return null
        const t = age / 0.35
        return (
          <mesh key={player.id} position={[shot.x, shot.y, shot.z + 0.05]} scale={0.4 + t * 0.8}>
            <ringGeometry args={[0.35, 0.5, 24]} />
            <meshBasicMaterial color={COLOURS[index % COLOURS.length]} transparent opacity={1 - t} />
          </mesh>
        )
      })}
    </>
  )
}

/** Scatter up to `count` spots with a seeded hand, skipping any spot `keepOut` refuses. */
function scatter(
  label: string,
  count: number,
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  keepOut: (x: number, z: number) => boolean = () => false,
) {
  const random = createRng(hashSeed(CONVENTIONS.worldSeed, `duck-hunt:field:${label}`))
  const out: { x: number; z: number; r: () => number }[] = []
  for (let tries = 0; out.length < count && tries < count * 6; tries++) {
    const x = area.minX + random() * (area.maxX - area.minX)
    const z = area.minZ + random() * (area.maxZ - area.minZ)
    if (!keepOut(x, z)) out.push({ x, z, r: random })
  }
  return out
}

type V3 = [number, number, number]
interface Placed {
  position: V3
  scale: V3
  turn: number
  colour: string
}

/** Many copies of one shape in one draw call, each placed, sized and coloured. */
function Instances({ geometry, items, shadows = false }: { geometry: BufferGeometry; items: Placed[]; shadows?: boolean }) {
  const mesh = useMemo(() => {
    const material = new MeshStandardMaterial({ roughness: 0.95, flatShading: true })
    const instanced = new InstancedMesh(geometry, material, items.length)
    const place = new Object3D()
    const colour = new Color()
    items.forEach((item, i) => {
      place.position.set(...item.position)
      place.scale.set(...item.scale)
      place.rotation.set(0, item.turn, 0)
      place.updateMatrix()
      instanced.setMatrixAt(i, place.matrix)
      instanced.setColorAt(i, colour.set(item.colour))
    })
    instanced.castShadow = shadows
    instanced.receiveShadow = true
    return instanced
  }, [geometry, items, shadows])
  useEffect(() => () => mesh.dispose(), [mesh])
  return <primitive object={mesh} />
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]

/**
 * An open grass hunting ground: a meadow running off to rolling hills, wild
 * grass and flowers in it, bushes round the edges and a line of trees at the
 * back. Nothing tall stands between the camera and where balloons fly - bushes
 * and tall grass keep to the sides and the back, and only short grass is in
 * front. Placed by a seeded hand, so it is the same field in every window.
 */
const Field = memo(function Field() {
  const parts = useMemo(() => {
    const { floor } = ARENA
    /** Where balloons fly and the players stand, and the view of it. */
    const clearing = (x: number, z: number) => Math.abs(x) < BOUNDS.maxX + 1.5 && z > BOUNDS.minZ - 1.5
    const blade = (h: number, w: number): Pick<Placed, 'scale'> => ({ scale: [w, h, w] })

    const tufts: Placed[] = scatter('tufts', 1400, { minX: -70, maxX: 70, minZ: -60, maxZ: 16 }).map(({ x, z, r }) => {
      const h = 0.25 + r() * 0.45
      return { position: [x, h / 2, z], ...blade(h, 0.18 + r() * 0.12), turn: r() * 6, colour: pick(r, PALETTE.tufts) }
    })
    const reeds: Placed[] = scatter('reeds', 260, { minX: -60, maxX: 60, minZ: -40, maxZ: 12 }, clearing).map(({ x, z, r }) => {
      const h = 0.8 + r() * 0.9
      return { position: [x, h / 2, z], ...blade(h, 0.14), turn: r() * 6, colour: pick(r, PALETTE.reeds) }
    })
    const flowers: Placed[] = scatter('flowers', 320, { minX: -50, maxX: 50, minZ: -40, maxZ: 14 }).map(({ x, z, r }) => {
      const s = 0.09 + r() * 0.07
      return { position: [x, 0.28 + r() * 0.2, z], scale: [s, s, s], turn: 0, colour: pick(r, PALETTE.flowers) }
    })
    const bushes: Placed[] = scatter('bushes', 46, { minX: -34, maxX: 34, minZ: floor.minZ - 9, maxZ: 10 }, clearing).flatMap(
      ({ x, z, r }) => {
        const size = 0.9 + r() * 1.1
        return Array.from({ length: 3 }, (_, i): Placed => {
          const s = size * (1 - i * 0.2)
          return {
            position: [x + (r() - 0.5) * size, s * 0.6, z + (r() - 0.5) * size],
            scale: [s, s * 0.85, s],
            turn: r() * 6,
            colour: pick(r, PALETTE.bushes),
          }
        })
      },
    )
    // A treeline behind the field, and a few trees out on the flanks.
    const behind = scatter('trees', 70, { minX: -80, maxX: 80, minZ: -52, maxZ: floor.minZ - 12 })
    const flanks = scatter('flank-trees', 16, { minX: -60, maxX: 60, minZ: -24, maxZ: 8 }, (x) => Math.abs(x) < BOUNDS.maxX + 8)
    const trees = [...behind, ...flanks].map(({ x, z, r }) => ({ x, z, height: 5 + r() * 5, width: 2.2 + r() * 1.8, r }))
    const trunks: Placed[] = trees.map(({ x, z, height, r }) => ({
      position: [x, height * 0.25, z],
      scale: [0.35, height * 0.5, 0.35],
      turn: 0,
      colour: pick(r, PALETTE.trunks),
    }))
    const crowns: Placed[] = trees.flatMap(({ x, z, height, width, r }) =>
      Array.from({ length: 3 }, (_, i): Placed => {
        const w = width * (1 - i * 0.22)
        return {
          position: [x + (r() - 0.5) * width * 0.5, height * (0.55 + i * 0.15), z + (r() - 0.5) * width * 0.5],
          scale: [w, w * 0.8, w],
          turn: r() * 6,
          colour: pick(r, PALETTE.crowns),
        }
      }),
    )
    // Rolling hills on the horizon, fading into the haze.
    const hills: Placed[] = scatter('hills', 9, { minX: -160, maxX: 160, minZ: -150, maxZ: -85 }).map(({ x, z, r }) => {
      const w = 40 + r() * 40
      return { position: [x, -2, z], scale: [w, 10 + r() * 14, w * 0.6], turn: 0, colour: pick(r, PALETTE.hills) }
    })
    const patches = scatter('patches', 40, { minX: -60, maxX: 60, minZ: -50, maxZ: 14 }).map(({ x, z, r }) => ({
      x,
      z,
      radius: 2 + r() * 5,
      colour: pick(r, PALETTE.patches),
    }))
    return { tufts, reeds, flowers, bushes, trunks, crowns, hills, patches }
  }, [])

  const geometry = useMemo(
    () => ({
      blade: new ConeGeometry(0.5, 1, 3),
      ball: new IcosahedronGeometry(0.5, 1),
      trunk: new CylinderGeometry(0.4, 0.5, 1, 6),
      hill: new SphereGeometry(0.5, 20, 10),
    }),
    [],
  )

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]} receiveShadow>
        <planeGeometry args={[600, 400]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      {parts.patches.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.01 + i * 0.0005, p.z]} receiveShadow>
          <circleGeometry args={[p.radius, 18]} />
          <meshStandardMaterial color={p.colour} roughness={1} />
        </mesh>
      ))}
      <Instances geometry={geometry.hill} items={parts.hills} />
      <Instances geometry={geometry.blade} items={parts.tufts} />
      <Instances geometry={geometry.blade} items={parts.reeds} />
      <Instances geometry={geometry.ball} items={parts.flowers} />
      <Instances geometry={geometry.ball} items={parts.bushes} shadows />
      <Instances geometry={geometry.trunk} items={parts.trunks} shadows />
      <Instances geometry={geometry.ball} items={parts.crowns} shadows />
    </group>
  )
})

/**
 * Everybody else's crosshair, in their colour with their shape in the middle,
 * so you can see what they are going for. A person's is where their pointer
 * was last heard; a stand-in's is where it is lining up (`botAim`). Each eases
 * towards where it should be, so a crosshair heard of twenty times a second
 * still glides - and a stand-in's drifts on to its balloon the way a hand would.
 *
 * Drawn over everything and the same size on screen however far off it is. Dim
 * while that player is cooling down, like your own.
 */
function OtherCrosshairs({ game, aims }: { game: Game; aims: Aims }) {
  return (
    <>
      {game.players.map((player, index) =>
        player.mine ? null : <OtherCrosshair key={`${game.id}:${player.id}`} game={game} index={index} aims={aims} />,
      )}
    </>
  )
}

const CROSSHAIR_SIZE = 0.022
const ON_TOP = { depthTest: false, depthWrite: false, transparent: true } as const

function OtherCrosshair({ game, index, aims }: { game: Game; index: number; aims: Aims }) {
  const holder = useRef<Group>(null)
  const materials = useRef<MeshBasicMaterial[]>([])
  const at = useRef<Vector3 | null>(null)
  const colour = COLOURS[index % COLOURS.length]
  const emblem = EMBLEMS[index % EMBLEMS.length]

  useFrame(({ camera }, delta) => {
    const group = holder.current
    if (!group) return
    const player = game.players[index]
    let target: Point | null = null
    if (player && !game.over) {
      if (player.bot) target = botAim(game, index)
      else {
        const heard = aims.get(player.id)
        if (heard && heard.point && performance.now() - heard.at < AIM_STALE_MS) target = heard.point
      }
    }
    group.visible = !!target
    if (!target) {
      at.current = null
      return
    }
    if (!at.current) at.current = new Vector3(target.x, target.y, target.z)
    else at.current.lerp(new Vector3(target.x, target.y, target.z), 1 - Math.exp(-(player.bot ? 5 : 18) * Math.min(delta, 0.1)))
    group.position.copy(at.current)
    group.quaternion.copy(camera.quaternion)
    group.scale.setScalar(camera.position.distanceTo(at.current) * CROSSHAIR_SIZE)
    const opacity = player.cooldown > 0 ? 0.5 : 1
    for (const m of materials.current) m.opacity = opacity
  })

  const keep = (m: MeshBasicMaterial | null) => {
    if (m && !materials.current.includes(m)) materials.current.push(m)
  }
  return (
    <group ref={holder} visible={false}>
      <mesh renderOrder={20}>
        <ringGeometry args={[0.72, 1.12, 32]} />
        <meshBasicMaterial ref={keep} color="#000000" {...ON_TOP} opacity={0.35} />
      </mesh>
      <mesh renderOrder={21}>
        <ringGeometry args={[0.8, 1.04, 32]} />
        <meshBasicMaterial ref={keep} color={colour} {...ON_TOP} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} renderOrder={21} rotation={[0, 0, (i * Math.PI) / 2]} position={[Math.cos((i * Math.PI) / 2) * 0.5, Math.sin((i * Math.PI) / 2) * 0.5, 0]}>
          <planeGeometry args={[0.32, 0.12]} />
          <meshBasicMaterial ref={keep} color={colour} {...ON_TOP} />
        </mesh>
      ))}
      {/* Their shape, small, in the middle: nobody has to tell the colours apart. */}
      {emblemParts(emblem).map((geometry, i) => (
        <mesh key={`e${i}`} geometry={geometry} renderOrder={22} scale={0.55 / ARENA.radius}>
          <meshBasicMaterial ref={keep} color={colour} {...ON_TOP} />
        </mesh>
      ))}
    </group>
  )
}

/** The players, lined up along the near edge in their colours, watching. */
function Shooters({ game }: { game: Game }) {
  const count = game.players.length
  return (
    <>
      {game.players.map((player, index) => (
        <ShooterPill key={player.id} index={index} count={count} mine={player.mine} />
      ))}
    </>
  )
}

function ShooterPill({ index, count, mine }: { index: number; count: number; mine: boolean }) {
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const spacing = 2.2
  const x = (index - (count - 1) / 2) * spacing
  const z = BOUNDS.maxZ - 1.2
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <primitive object={avatar} />
      {/* On the grass on the camera's side of them, where it can be seen. */}
      {emblemParts(EMBLEMS[index % EMBLEMS.length]).map((geometry, i) => (
        <mesh key={i} geometry={geometry} position={[0, 0.03 + i * 0.002, -1.1]} rotation={[-Math.PI / 2, 0, Math.PI]} scale={1.3}>
          <meshBasicMaterial color={colour} />
        </mesh>
      ))}
      {mine ? (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.7, 28]} />
          <meshBasicMaterial color={colour} />
        </mesh>
      ) : null}
    </group>
  )
}

/**
 * Turns a click on the canvas into a shot: a ray from this camera through the
 * pointer, and whatever balloon it meets first. A miss lands on the floor, or
 * far off along the ray if it went up into the sky.
 *
 * And keeps `aim` on where the pointer is pointing, for everybody else to see
 * your crosshair: where the ray meets the aiming wall (`aimAt`), or `null` once
 * the pointer leaves the field.
 */
function Trigger({ game, onShoot, aim }: { game: Game; onShoot: (trigger: Trigger) => void; aim: RefObject<Point | null> }) {
  const { camera, gl } = useThree()
  const live = useRef(game)
  live.current = game
  const shoot = useRef(onShoot)
  shoot.current = onShoot

  useEffect(() => {
    const canvas = gl.domElement
    const pointer = new Vector2()
    const direction = new Vector3()
    const ray = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      direction.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize()
      return {
        origin: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        d: { x: direction.x, y: direction.y, z: direction.z },
      }
    }
    const move = (e: PointerEvent) => {
      const { origin, d } = ray(e)
      aim.current = aimAt(origin, d)
    }
    const leave = () => {
      aim.current = null
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const { origin, d } = ray(e)
      aim.current = aimAt(origin, d)
      const g = live.current
      const hit = pickBalloon(g.balloons, g.popped, origin, d, g.elapsed)
      if (hit) return shoot.current({ balloon: hit.balloon.id, point: hit.point })
      const along = d.y < -0.01 ? -origin.y / d.y : 40
      shoot.current({ balloon: null, point: { x: origin.x + d.x * along, y: origin.y + d.y * along, z: origin.z + d.z * along } })
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [camera, gl, aim])
  return null
}

/**
 * Everything in the canvas. Handed the live game as a ref and redraws itself
 * from it every frame - see `Stage` in the screen for why the canvas itself is
 * not re-rendered.
 */
export function DuckHuntScene({
  live,
  onShoot,
  aim,
  aims,
}: {
  live: RefObject<Game>
  onShoot: (trigger: Trigger) => void
  aim: RefObject<Point | null>
  aims: Aims
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const up = game.balloons.filter((b) => !game.popped.has(b.id) && balloonAt(b, game.elapsed) !== null)
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.background, 60, 160]} />
      <FixedCamera />
      <Daylight />
      <Field />
      {up.map((balloon) => (
        <BalloonBody key={`${game.id}:${balloon.id}`} balloon={balloon} game={game} />
      ))}
      <Bursts game={game} />
      <ShotFlashes game={game} />
      <Shooters game={game} />
      <OtherCrosshairs game={game} aims={aims} />
      <Trigger game={game} onShoot={onShoot} aim={aim} />
    </>
  )
}
