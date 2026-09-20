/**
 * Probable Stop in three dimensions.
 *
 * Two peaks with a misty valley between them, three rope-and-plank bridges
 * slung from one to the other, and a cloud off to the left for everybody who
 * has fallen. The bodies are the island's own avatar. Where everything is comes
 * from `place.ts`, worked out from the game alone, so every browser draws the
 * same moment - including the bridges snapping, which are a function of the
 * reveal's clock and not of anything this browser remembers.
 *
 * **Each bridge has a condition** - sturdy, weathered, patched or rickety - new
 * every round. It is looks and nothing else: see `bridgeCondition`.
 *
 * **The bridges are how you choose.** Point at one and it lights; click it to
 * stand on it, click it again to confirm. The same as the keys and the cards
 * under the view - three ways to do one thing.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  TubeGeometry,
  Vector3,
  type DirectionalLight,
  type Fog,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { createAvatar } from '../../02-player'
import { frameScene } from './camera'
import type { Game, Player } from './game'
import {
  BEATS,
  PLACE,
  bridgeCondition,
  deckHeight,
  fallTime,
  revealProgress,
  greyness,
  spotFor,
  type Condition,
  type Rect,
} from './place'

export const PALETTE = {
  meadow: '#8fa866',
  rock: '#7b746b',
  rockDark: '#5d5750',
  mist: '#d5dee5',
  mistShade: '#edf2f5',
  cloud: '#fbfcfe',
  far: '#56657a',
  snow: '#eef2f6',
  valley: '#6c7a6a',

  /** One colour per path, used on the bridge and on its card. */
  lanes: ['#e8735a', '#f2b33d', '#6fc2dd'] as readonly string[],
  safe: '#7bd96b',

  you: '#3f8fd0',
  player: '#5eb85b',
  fallen: '#9a948a',
  confirmed: '#ffd24d',

  sunColour: '#fff1dc',
  ambientColour: '#dbe6f2',
  skyColour: '#d6e4f2',
  groundColour: '#7a7466',
} as const

/** Everything decorative is seeded from the world, so every browser draws the same mountains. */
const lookRandom = (label: string) => createRng(hashSeed(CONVENTIONS.worldSeed, `probable-stop:${label}`))

function FixedCamera() {
  useFrame(({ camera, size, scene }) => {
    const shot = frameScene(size.width / Math.max(1, size.height))
    // The mist thickens with distance from the camera, starting just past the
    // bridges: the play is always clear, the valley never is.
    const fog = scene.fog as Fog | null
    if (fog) {
      fog.near = shot.distance + 20
      fog.far = shot.distance * 5.5
    }
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
    const reach = 26
    Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 200 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[18, 40, 22]} intensity={2.3} color={PALETTE.sunColour} />
      <ambientLight intensity={0.5} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

// ---------------------------------------------------------------------------
// The mountains
// ---------------------------------------------------------------------------

/** How deep the valley is. Nobody ever sees the bottom. */
const VALLEY_FLOOR = -110

/**
 * One of the two peaks the bridges hang between: a craggy column of rock whose
 * flat top is exactly the rectangle people stand on, steep on the valley side
 * and spreading out behind and to the sides as it goes down.
 */
function peakGeometry(rect: Rect, valleySide: 1 | -1, label: string): BufferGeometry {
  const random = lookRandom(label)
  const levels = 16
  const around = 44
  const top = -0.35
  const positions: number[] = []
  const colours: number[] = []
  const rock = new Color(PALETTE.rock)
  const dark = new Color(PALETTE.rockDark)
  const moss = new Color(PALETTE.meadow)
  const shade = new Color()

  for (let k = 0; k <= levels; k++) {
    const t = k / levels
    const y = top + (VALLEY_FLOOR - top) * Math.pow(t, 1.35)
    const outward = 32 * Math.pow(t, 1.1)
    const hx = rect.width / 2 + 0.3 + outward
    const hzValley = rect.depth / 2 + 0.3 + 6 * t
    const hzBack = rect.depth / 2 + 0.3 + outward
    // Square at the top, to fit the ground; rounder further down.
    const power = 2 / MathUtils.lerp(7, 2.2, Math.min(1, t * 2))
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const hz = s * valleySide > 0 ? hzValley : hzBack
      const rough = k === 0 ? 0 : 0.05 + 0.16 * t + (k === 1 ? 0 : 0.04)
      const scale = 1 + (random() - 0.4) * rough
      positions.push(
        rect.x + Math.sign(c) * Math.pow(Math.abs(c), power) * hx * scale,
        y + (k === 0 ? 0 : (random() - 0.5) * 1.6),
        rect.z + Math.sign(s) * Math.pow(Math.abs(s), power) * hz * scale,
      )
      shade.copy(rock).lerp(dark, Math.min(1, t * 1.6 + random() * 0.25))
      if (k <= 1 && random() < 0.5) shade.lerp(moss, 0.55)
      colours.push(shade.r, shade.g, shade.b)
    }
  }
  // The cap, under the meadow.
  positions.push(rect.x, top, rect.z)
  colours.push(rock.r, rock.g, rock.b)
  const cap = (levels + 1) * around

  const index: number[] = []
  for (let k = 0; k < levels; k++) {
    for (let i = 0; i < around; i++) {
      const a = k * around + i
      const b = k * around + ((i + 1) % around)
      const c = a + around
      const d = b + around
      index.push(a, c, b, b, c, d)
    }
  }
  for (let i = 0; i < around; i++) index.push(cap, i, (i + 1) % around)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** The mountains around the valley: a range behind the far peak, and walls off to either side. Merged into one mesh. */
function rangeGeometry(): BufferGeometry {
  const random = lookRandom('range')
  const rock = new Color(PALETTE.far)
  const snow = new Color(PALETTE.snow)
  const pieces: BufferGeometry[] = []

  const mountain = (x: number, z: number, radius: number, peakY: number) => {
    const height = peakY - VALLEY_FLOOR
    const geometry = new ConeGeometry(radius, height, 9, 6).toNonIndexed()
    const position = geometry.getAttribute('position')
    const colours: number[] = []
    const shade = new Color()
    const wobble = new Map<string, [number, number, number]>()
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i)
      const py = position.getY(i)
      const pz = position.getZ(i)
      // The same corner of every face must move the same way, or the cone cracks.
      const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`
      let push = wobble.get(key)
      if (!push) {
        const up = (py + height / 2) / height
        const rough = up > 0.99 ? 0 : radius * 0.12
        push = [(random() - 0.5) * rough, (random() - 0.5) * height * 0.06 * (up > 0.99 ? 0 : 1), (random() - 0.5) * rough]
        wobble.set(key, push)
      }
      position.setXYZ(i, px + push[0] + x, py + push[1] + VALLEY_FLOOR + height / 2, pz + push[2] + z)
      const up = (py + height / 2) / height
      shade.copy(rock).multiplyScalar(0.85 + random() * 0.2)
      if (up > 0.8 && peakY > 0) shade.lerp(snow, 0.8)
      colours.push(shade.r, shade.g, shade.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
    geometry.deleteAttribute('uv')
    geometry.computeVertexNormals()
    pieces.push(geometry)
  }

  // Behind the far peak.
  for (let i = 0; i < 11; i++) {
    const x = -150 + i * 28 + (random() - 0.5) * 14
    mountain(x, -62 - random() * 40, 38 + random() * 22, -8 + random() * 38)
  }
  // The valley's walls, left and right, lower and nearer.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      mountain(side * (78 + random() * 30), -45 + i * 22 + (random() - 0.5) * 10, 30 + random() * 16, -30 + random() * 24)
    }
  }
  return mergeGeometries(pieces)
}

/** A tileable wisp of mist, drawn once. */
function mistTexture(label: string): CanvasTexture {
  const random = lookRandom(label)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const draw = canvas.getContext('2d')!
  for (let i = 0; i < 46; i++) {
    const x = random() * size
    const y = random() * size
    const r = 18 + random() * 60
    const alpha = 0.18 + random() * 0.3
    // Drawn again across each edge, so the tile has no seams.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = draw.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
        g.addColorStop(0, `rgba(255,255,255,${alpha})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        draw.fillStyle = g
        draw.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(3, 3)
  return texture
}

/** One sheet of mist lying in the valley, drifting slowly along it. */
function MistLayer({ y, opacity, drift, label }: { y: number; opacity: number; drift: number; label: string }) {
  const texture = useMemo(() => mistTexture(label), [label])
  useFrame((_state, delta) => {
    texture.offset.x = (texture.offset.x + drift * Math.min(delta, 0.1)) % 1
  })
  return (
    <mesh position={[0, y, -10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[360, 360]} />
      <meshBasicMaterial
        map={texture}
        color={PALETTE.mistShade}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  )
}

const Valley = memo(function Valley() {
  const near = useMemo(() => peakGeometry(PLACE.ledge, -1, 'near-peak'), [])
  const far = useMemo(() => peakGeometry(PLACE.island, 1, 'far-peak'), [])
  const range = useMemo(() => rangeGeometry(), [])
  return (
    <group>
      <mesh geometry={near} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} side={DoubleSide} />
      </mesh>
      <mesh geometry={far} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} side={DoubleSide} />
      </mesh>
      <Meadow rect={PLACE.ledge} />
      <Meadow rect={PLACE.island} />
      <mesh geometry={range}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh position={[0, VALLEY_FLOOR + 2, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={PALETTE.valley} roughness={1} />
      </mesh>
      {/* The mist: thin wisps just under the bridges, thickening below, and a
          floor of it that nothing is seen through. */}
      <MistLayer y={PLACE.mistTop + 1.5} opacity={0.22} drift={0.004} label="mist-1" />
      <MistLayer y={PLACE.mistTop} opacity={0.6} drift={-0.003} label="mist-2" />
      <MistLayer y={PLACE.mistTop - 7} opacity={0.75} drift={0.002} label="mist-3" />
      <MistLayer y={PLACE.mistTop - 16} opacity={0.85} drift={-0.0015} label="mist-4" />
      <mesh position={[0, PLACE.mistTop - 28, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color={PALETTE.mist} />
      </mesh>
    </group>
  )
})

/** The grassy top of a peak, its surface at y = 0. */
function Meadow({ rect }: { rect: Rect }) {
  return (
    <mesh position={[rect.x, -0.5, rect.z]} receiveShadow>
      <boxGeometry args={[rect.width, 1, rect.depth]} />
      <meshStandardMaterial color={PALETTE.meadow} roughness={0.95} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// The cloud the fallen watch from
// ---------------------------------------------------------------------------

/** Puffs, flat on top where people stand and billowing round the edges and underneath. */
function cloudPuffs(): { x: number; y: number; z: number; r: number; squash: number }[] {
  const random = lookRandom('cloud')
  const { x, z, width, depth } = PLACE.cloud
  const puffs: { x: number; y: number; z: number; r: number; squash: number }[] = []
  // The top: the level people stand on.
  for (let zi = 0; zi <= 6; zi++) {
    for (let xi = 0; xi <= 2; xi++) {
      const r = 1.3 + random() * 0.5
      puffs.push({
        x: x + (xi - 1) * (width / 2.6) + (random() - 0.5) * 0.4,
        z: z + (zi / 6 - 0.5) * (depth - 1) + (random() - 0.5) * 0.4,
        r,
        squash: 0.45,
        y: 0.04 - r * 0.45,
      })
    }
  }
  // The billow round the edge, a little higher.
  const edge = 18
  for (let i = 0; i < edge; i++) {
    const a = (i / edge) * Math.PI * 2
    const r = 1.2 + random() * 0.9
    puffs.push({
      x: x + Math.cos(a) * (width / 2 + 0.6),
      z: z + Math.sin(a) * (depth / 2 + 0.6),
      r,
      squash: 0.7,
      y: 0.35 - r * 0.7 + random() * 0.3,
    })
  }
  // Underneath, hanging.
  for (let i = 0; i < 9; i++) {
    const r = 1.4 + random() * 1.2
    puffs.push({
      x: x + (random() - 0.5) * width,
      z: z + (random() - 0.5) * depth,
      r,
      squash: 0.8,
      y: -1.1 - random() * 0.8,
    })
  }
  return puffs
}

const Cloud = memo(function Cloud() {
  const holder = useRef<Group>(null)
  const puffs = useMemo(() => cloudPuffs(), [])
  const geometry = useMemo(() => new IcosahedronGeometry(1, 3), [])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const dummy = new Object3D()
    puffs.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(p.r, p.r * p.squash, p.r)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
  }, [puffs])
  useFrame(({ clock }) => {
    // Drifting, just barely.
    if (holder.current) holder.current.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.04
  })
  return (
    <group ref={holder}>
      <instancedMesh ref={mesh} args={[geometry, undefined, puffs.length]} receiveShadow castShadow>
        <meshStandardMaterial color={PALETTE.cloud} roughness={1} emissive={PALETTE.cloud} emissiveIntensity={0.18} />
      </instancedMesh>
    </group>
  )
})

// ---------------------------------------------------------------------------
// The bridges
// ---------------------------------------------------------------------------

const LENGTH = PLACE.bridgeNear - PLACE.bridgeFar
const MIDDLE = (PLACE.bridgeNear + PLACE.bridgeFar) / 2
/** Where a bridge that does not hold snaps. */
const BREAK = MIDDLE
const PLANKS = Math.floor(LENGTH / 0.44)
const PLANK_DEPTH = 0.34
const PLANK_THICKNESS = 0.07
const POST_HEIGHT = 1.35

interface Look {
  /** Wood, a few shades to pick between plank by plank. */
  wood: readonly string[]
  rope: string
  /** How far out of true the planks sit. */
  askew: number
  /** Share of planks gone altogether. */
  missing: number
  /** Share of planks broken short. */
  split: number
  /** How much further the hand ropes droop than the deck. */
  droop: number
}

/** What each condition looks like. Only looks: none of it touches whether the bridge holds. */
const LOOKS: Record<Condition, Look> = {
  sturdy: { wood: ['#b5824f', '#ad7a48', '#ba8854'], rope: '#dcc592', askew: 0.012, missing: 0, split: 0, droop: 0.2 },
  weathered: { wood: ['#8e755d', '#857057', '#977e65'], rope: '#b3a27f', askew: 0.05, missing: 0.03, split: 0.1, droop: 0.5 },
  patched: {
    wood: ['#7a6b5e', '#c29359', '#72665a', '#b98a55'],
    rope: '#c7b07e',
    askew: 0.035,
    missing: 0,
    split: 0.05,
    droop: 0.4,
  },
  rickety: { wood: ['#6a5d52', '#61554b', '#75685c'], rope: '#8c826b', askew: 0.12, missing: 0.13, split: 0.2, droop: 1.1 },
}

interface PlankSpot {
  x: number
  y: number
  z: number
  pitch: number
  yaw: number
  roll: number
  width: number
  colour: Color
  /** Comes away on its own when the bridge snaps, instead of hanging on. */
  loose: boolean
  /** Which way it goes when it does. */
  spin: [number, number, number]
  drift: number
}

/** The slope of the deck at `z`, as an angle about x. */
const deckPitch = (z: number) => Math.atan((deckHeight(z + 0.05) - deckHeight(z - 0.05)) / 0.1)

function lay(look: Look, label: string): PlankSpot[] {
  const random = createRng(hashSeed(CONVENTIONS.worldSeed, label))
  const planks: PlankSpot[] = []
  let gap = false
  for (let i = 0; i < PLANKS; i++) {
    const z = PLACE.bridgeNear - ((i + 0.5) * LENGTH) / PLANKS
    const nearEnd = i < 2 || i > PLANKS - 3
    // Never two gone together, and never at either end.
    if (!nearEnd && !gap && random() < look.missing) {
      gap = true
      continue
    }
    gap = false
    const short = !nearEnd && random() < look.split
    const width = short ? PLACE.bridgeWidth * (0.55 + random() * 0.2) : PLACE.bridgeWidth
    const side = random() < 0.5 ? -1 : 1
    const shade = new Color(look.wood[Math.floor(random() * look.wood.length)]).multiplyScalar(0.92 + random() * 0.16)
    planks.push({
      x: short ? (side * (PLACE.bridgeWidth - width)) / 2 : (random() - 0.5) * look.askew * 2,
      y: deckHeight(z) - PLANK_THICKNESS / 2 + (random() - 0.5) * look.askew * 0.4,
      z,
      pitch: deckPitch(z) + (random() - 0.5) * look.askew,
      yaw: (random() - 0.5) * look.askew * 1.5,
      roll: (random() - 0.5) * look.askew,
      width,
      colour: shade,
      loose: Math.abs(z - BREAK) < 1.4 || random() < 0.22,
      spin: [(random() - 0.5) * 6, (random() - 0.5) * 4, (random() - 0.5) * 6],
      drift: (random() - 0.5) * 1.2,
    })
  }
  return planks
}

/** The hand ropes, the deck ropes and the hangers between them, for one half of a bridge, in that half's own frame. */
function ropesFor(look: Look, from: number, to: number, anchor: number): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const handY = (z: number) => POST_HEIGHT + deckHeight(z) * (1 + look.droop)
  const run = (x: number, height: (z: number) => number, radius: number) => {
    const points: Vector3[] = []
    for (let i = 0; i <= 12; i++) {
      const z = from + ((to - from) * i) / 12
      points.push(new Vector3(x, height(z), z - anchor))
    }
    pieces.push(new TubeGeometry(new CatmullRomCurve3(points), 24, radius, 5, false))
  }
  const half = PLACE.bridgeWidth / 2
  for (const side of [-1, 1]) {
    run(side * (half + 0.04), handY, 0.045)
    run(side * (half - 0.06), (z) => deckHeight(z) - PLANK_THICKNESS, 0.035)
    // Hangers, every metre and a bit.
    const count = Math.max(1, Math.round(Math.abs(to - from) / 1.3))
    for (let i = 1; i < count; i++) {
      const z = from + ((to - from) * i) / count
      const bottom = deckHeight(z) - PLANK_THICKNESS
      const top = handY(z)
      const hanger = new CylinderGeometry(0.018, 0.018, top - bottom, 4, 1)
      hanger.translate(side * (half - 0.01), (top + bottom) / 2, z - anchor)
      pieces.push(hanger)
    }
  }
  return mergeGeometries(pieces.map((p) => p.toNonIndexed()))
}

/** One bridge's worth of timber and rope, for a condition. */
function buildBridge(condition: Condition, label: string) {
  const look = LOOKS[condition]
  const planks = lay(look, label)
  return {
    look,
    near: planks.filter((p) => !p.loose && p.z > BREAK),
    far: planks.filter((p) => !p.loose && p.z <= BREAK),
    loose: planks.filter((p) => p.loose),
    nearRopes: ropesFor(look, PLACE.bridgeNear, BREAK, PLACE.bridgeNear),
    farRopes: ropesFor(look, PLACE.bridgeFar, BREAK, PLACE.bridgeFar),
  }
}

/** A plank: a box one unit each way, scaled to size per plank. */
const boardGeometry = new BoxGeometry(1, 1, 1)

/** Sets an instanced mesh's planks, relative to an anchor along the bridge, and falling if `t` > 0. */
function placePlanks(mesh: InstancedMesh, planks: readonly PlankSpot[], anchor: number, t = 0) {
  const dummy = new Object3D()
  planks.forEach((p, i) => {
    dummy.position.set(p.x + p.drift * t, p.y - 0.5 * 9.8 * t * t, p.z - anchor + p.drift * 0.5 * t)
    dummy.rotation.set(p.pitch + p.spin[0] * t, p.yaw + p.spin[1] * t, p.roll + p.spin[2] * t)
    dummy.scale.set(p.width, PLANK_THICKNESS, PLANK_DEPTH)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, p.colour)
  })
  mesh.count = planks.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

function Planks({
  planks,
  anchor,
  material,
  onMesh,
}: {
  planks: readonly PlankSpot[]
  anchor: number
  material: MeshStandardMaterial
  onMesh?: (mesh: InstancedMesh | null) => void
}) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (mesh.current) placePlanks(mesh.current, planks, anchor)
    onMesh?.(mesh.current)
  }, [planks, anchor, onMesh])
  return (
    <instancedMesh
      ref={mesh}
      args={[boardGeometry, material, Math.max(1, planks.length)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

/**
 * How far a snapped half has swung down, in radians, `t` seconds after it
 * went: past hanging straight down, back, and settling.
 */
function swing(t: number): number {
  if (t <= 0) return 0
  return (Math.PI / 2) * (1 - Math.exp(-1.4 * t) * Math.cos(3.1 * t))
}

/**
 * One bridge. Rope and planks from peak to peak, in the condition this round
 * dealt it. If it does not hold it shivers, snaps in the middle, and each half
 * swings down against its own cliff, shedding planks; if it holds it glows.
 */
function Bridge({
  lane,
  game,
  mine,
  hovered,
  onPick,
  onHover,
}: {
  lane: number
  game: Game
  mine: boolean
  hovered: boolean
  onPick: (lane: number) => void
  onHover: (lane: number | null) => void
}) {
  const condition = bridgeCondition(game, lane)
  const label = `probable-stop:bridge:${game.id}:${game.round}:${lane}`
  const built = useMemo(() => buildBridge(condition, label), [condition, label])
  const colour = PALETTE.lanes[lane]

  const holder = useRef<Group>(null)
  const nearHalf = useRef<Group>(null)
  const farHalf = useRef<Group>(null)
  const loose = useRef<InstancedMesh | null>(null)
  const fell = useRef(0)
  // Colour comes from each plank; the material only adds the glow.
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.9 }), [])
  const rope = useMemo(() => new MeshStandardMaterial({ color: built.look.rope, roughness: 1 }), [built])
  const onLoose = useCallback((m: InstancedMesh | null) => {
    loose.current = m
  }, [])
  const glow = useMemo(() => new Color(), [])

  useFrame(() => {
    const group = holder.current
    if (!group) return
    const progress = revealProgress(game)
    const gone = game.phase !== 'choosing' && game.safe.length > 0 && !game.safe.includes(lane)
    const t = gone ? fallTime(game) : 0

    // A shiver before it goes, the same for every condition: a moment of "is it mine?".
    const [s0, s1] = BEATS.shiver
    const shake = gone && t === 0 ? MathUtils.clamp((progress - s0) / (s1 - s0), 0, 1) : 0
    const now = performance.now()
    group.position.set(PLACE.lanes[lane] + Math.sin(now / 31) * 0.05 * shake, 0, 0)
    group.rotation.z = Math.sin(now / 27) * 0.025 * shake

    const angle = swing(t)
    const twist = t > 0 ? Math.sin(t * 2.3) * Math.exp(-t) * 0.3 : 0
    if (nearHalf.current) {
      nearHalf.current.rotation.set(-angle + Math.sin(now / 45) * 0.012 * shake, 0, twist)
    }
    if (farHalf.current) {
      farHalf.current.rotation.set(angle - Math.sin(now / 41) * 0.012 * shake, 0, -twist)
    }
    if (loose.current && (t > 0 || fell.current > 0)) placePlanks(loose.current, built.loose, 0, t)
    fell.current = t

    const heldUp = game.phase !== 'choosing' && game.safe.includes(lane) && progress >= BEATS.drop[0]
    glow.set(heldUp ? PALETTE.safe : colour)
    material.emissive.copy(glow)
    material.emissiveIntensity = heldUp ? 0.4 : mine ? 0.3 : hovered ? 0.16 : 0
  })

  const half = PLACE.bridgeWidth / 2
  const posts: [number, number][] = [
    [-half - 0.04, PLACE.bridgeNear + 0.2],
    [half + 0.04, PLACE.bridgeNear + 0.2],
    [-half - 0.04, PLACE.bridgeFar - 0.2],
    [half + 0.04, PLACE.bridgeFar - 0.2],
  ]

  return (
    <group ref={holder}>
      {/* What the pointer finds: the whole span, invisible. */}
      <mesh
        position={[0, 0.3, MIDDLE]}
        onPointerDown={(e) => {
          e.stopPropagation()
          onPick(lane)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(lane)
        }}
        onPointerOut={() => onHover(null)}
      >
        <boxGeometry args={[PLACE.bridgeWidth + 0.6, 1.6, LENGTH]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <group ref={nearHalf} position={[0, 0, PLACE.bridgeNear]}>
        <Planks planks={built.near} anchor={PLACE.bridgeNear} material={material} />
        <mesh geometry={built.nearRopes} material={rope} castShadow />
      </group>
      <group ref={farHalf} position={[0, 0, PLACE.bridgeFar]}>
        <Planks planks={built.far} anchor={PLACE.bridgeFar} material={material} />
        <mesh geometry={built.farRopes} material={rope} castShadow />
      </group>
      <Planks
        planks={built.loose}
        anchor={0}
        material={material}
        onMesh={onLoose}
      />

      {/* The posts the ropes are tied to, the near pair wrapped in the path's colour. */}
      {posts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.13, POST_HEIGHT + 0.1, 7]} />
            <meshStandardMaterial color="#6b4a30" roughness={0.9} />
          </mesh>
          {i < 2 ? (
            <mesh position={[0, POST_HEIGHT - 0.25, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.32, 8]} />
              <meshStandardMaterial color={colour} roughness={0.7} />
            </mesh>
          ) : null}
        </group>
      ))}
      {/* A painted board on the peak at the near end, so the path's colour matches its card. */}
      <mesh position={[0, 0.03, PLACE.bridgeNear + 0.75]} receiveShadow>
        <boxGeometry args={[PLACE.bridgeWidth - 0.2, 0.06, 0.9]} />
        <meshStandardMaterial color={colour} roughness={0.7} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

/** How high the middle of a body is, for it to tumble about when it falls. */
const WAIST = 0.85

/**
 * One player: the island's avatar, walking to wherever `spotFor` says - with a
 * step in it when it is going somewhere, and head over heels when it falls.
 */
function PlayerPill({ game, player }: { game: Game; player: Player }) {
  const holder = useRef<Group>(null)
  const body = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const placed = useRef(false)
  const stride = useRef(0)
  const colour = player.mine ? PALETTE.you : PALETTE.player
  // Its own skin, so that this body can go grey without every other one that is the same colour going with it.
  const skin = useMemo(() => new MeshStandardMaterial({ color: colour, roughness: 0.55 }), [colour])
  const avatar = useMemo(() => {
    const made = createAvatar(colour)
    const pill = made.children[0]
    if (pill instanceof Mesh) pill.material = skin
    return made
  }, [colour, skin])
  const base = useMemo(() => new Color(colour), [colour])
  const grey = useMemo(() => new Color(PALETTE.fallen), [])

  useFrame((_state, delta) => {
    const group = holder.current
    if (!group) return
    const spot = spotFor(game, player)
    // Put straight there the first time, and after anything too far to have
    // walked - the fallen reappearing on the cloud, a new game dealing
    // everybody back to the ledge. Anything else is eased towards, so a
    // guest's ten-a-second snapshots look like walking.
    const far = Math.hypot(spot.x - group.position.x, spot.z - group.position.z) > 8
    const climbing = spot.y - group.position.y > 3
    if (!placed.current || ((far || climbing) && spot.y === 0)) {
      group.position.set(spot.x, spot.y, spot.z)
      placed.current = true
    }
    const dt = Math.min(delta, 0.1)
    const rate = 1 - Math.exp(-12 * dt)
    const was = group.position.clone()
    group.position.x = MathUtils.lerp(group.position.x, spot.x, rate)
    group.position.z = MathUtils.lerp(group.position.z, spot.z, rate)
    // Falling is not eased: it is falling.
    group.position.y = spot.y < group.position.y ? spot.y : MathUtils.lerp(group.position.y, spot.y, rate)
    const dx = group.position.x - was.x
    const dz = group.position.z - was.z
    const moved = Math.hypot(dx, dz)
    if (moved > 0.002) group.rotation.y = Math.atan2(dx, dz)
    else if (game.phase === 'choosing') group.rotation.y = MathUtils.lerp(group.rotation.y, Math.PI, rate)

    const inner = body.current
    if (inner) {
      const falling = !player.alive && player.outIn === game.round && game.phase === 'reveal' ? fallTime(game) : 0
      if (falling > 0) {
        inner.position.y = WAIST
        inner.rotation.set(-falling * 3.2, 0, falling * 1.8)
      } else {
        // A step: a bob and a sway, as much as the body is moving.
        const speed = dt > 0 ? moved / dt : 0
        const going = MathUtils.clamp(speed / 1.2, 0, 1)
        stride.current += moved * 5.5
        inner.position.y = WAIST + Math.abs(Math.sin(stride.current)) * 0.1 * going
        inner.rotation.set(0.1 * going, 0, Math.sin(stride.current) * 0.1 * going)
      }
    }

    if (ring.current) ring.current.visible = player.mine && greyness(game, player) === 0
    // The colour draining out of somebody whose bridge is about to go.
    skin.color.copy(base).lerp(grey, greyness(game, player))
  })

  return (
    <group ref={holder}>
      <group ref={body} position={[0, WAIST, 0]}>
        <primitive object={avatar} position={[0, -WAIST, 0]} />
      </group>
      <mesh ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.72, 28]} />
        <meshBasicMaterial color={player.confirmed ? PALETTE.confirmed : PALETTE.you} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

export function ProbableStopScene({
  game,
  hovered,
  onPick,
  onHover,
}: {
  game: Game
  hovered: number | null
  onPick: (lane: number) => void
  onHover: (lane: number | null) => void
}) {
  const background = useMemo(() => new Color(PALETTE.mist), [])
  const me = game.players.find((p) => p.mine) ?? null
  const choosing = game.phase === 'choosing' && me !== null && me.alive

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[PALETTE.mist, 60, 200]} />
      <FixedCamera />
      <Daylight />
      <Valley />
      <Cloud />
      {PLACE.lanes.map((_, lane) => (
        <Bridge
          key={lane}
          lane={lane}
          game={game}
          mine={choosing && me.pick === lane}
          hovered={choosing && hovered === lane}
          onPick={onPick}
          onHover={onHover}
        />
      ))}
      {game.players.map((player) => (
        <PlayerPill key={player.id} game={game} player={player} />
      ))}
    </>
  )
}
