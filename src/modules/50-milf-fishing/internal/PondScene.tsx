/**
 * M.I.L.F (fishing) in three dimensions, from just behind you.
 *
 * A lake at sunset ringed with pines and hills, and one long dock with
 * everybody along its edge in a row, each with a rod, a line out to a bobber and
 * a bucket beside them.
 *
 * **The rod is the whole game.** It is jointed, and bends from the butt to the
 * tip by exactly as much as the fish on it pulls - a little for a perch, right
 * over for your mom - tugging while the fish is on. The bobber dips under with
 * it. A pull whips the rod up; if there was a fish, it comes flying out of the
 * water over your head into your bucket, as big as it is. Then the line is cast
 * back out.
 *
 * Everybody's rod bends for their own fish, so you can see who has what on.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { createAvatar } from '../../02-player'
import { FISH, RECAST, bendAt, playBack } from './pond'
import { COLOURS, bitesOf, type Game } from './rules'

export const PALETTE = {
  sky: '#f4b27a',
  water: '#2c6c8c',
  dock: '#9a7048',
  dockDark: '#6e4c2e',
  pine: '#24452f',
  hill: '#3e5a48',
  rod: '#3a2616',
  cork: '#c9a36a',
  line: '#f5f5f0',
  bobber: '#e0342c',
} as const

/** How far apart everybody stands along the dock. */
export const SPACING = 2.6
/** How high the dock's top is above the water. */
const DOCK = 0.5
/** How far out the bobbers float. */
const OUT = 6.5
/** The rod: how many joints, how long each, and how far it bends over at a bend of 1, radians a joint. */
const ROD = { joints: 7, joint: 0.4, curl: 0.3 } as const

/** Where player `index` of `count` stands on the dock. */
export function standAt(index: number, count: number): number {
  return (index - (count - 1) / 2) * SPACING
}

let waveTexture: CanvasTexture | null = null

/** Glints on the water, scrolled so the lake moves. */
function waves(): CanvasTexture {
  if (waveTexture) return waveTexture
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.water
  c.fillRect(0, 0, 256, 256)
  // A fixed scatter, not Math.random: the same lake every time.
  let n = 777
  const next = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 110; i++) {
    c.fillStyle = next() < 0.55 ? 'rgba(255,214,170,0.22)' : 'rgba(10,40,70,0.25)'
    c.fillRect(next() * 256, next() * 256, 6 + next() * 30, 2)
  }
  waveTexture = new CanvasTexture(canvas)
  waveTexture.colorSpace = SRGBColorSpace
  waveTexture.wrapS = RepeatWrapping
  waveTexture.wrapT = RepeatWrapping
  waveTexture.repeat.set(30, 30)
  return waveTexture
}

const want = new Vector3()
const look = new Vector3()
const looking = new Vector3()

function Rig({ live }: { live: RefObject<Game> }) {
  const placed = useRef(false)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const index = g.players.findIndex((p) => p.mine)
    const x = index >= 0 ? standAt(index, g.players.length) : 0
    if (index < 0 || g.over) {
      look.set(0, 0.5, -OUT)
      want.set(0, 5, 7)
    } else {
      // Between you and whoever is on your left, looking past your right shoulder: your whole rod against the water, and the bobber beyond it.
      look.set(x + 0.7, 1.1, -3.5)
      want.set(x - 1.7, 3.3, 4)
    }
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 3)
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

/** The lake, the shore round it, the hills, the pines and the sun going down. */
function Lake() {
  const texture = useMemo(() => waves(), [])
  useFrame((_, delta) => {
    texture.offset.x = (texture.offset.x + Math.min(delta, 0.1) * 0.006) % 1
    texture.offset.y = (texture.offset.y + Math.min(delta, 0.1) * 0.012) % 1
  })
  const pines = useMemo(() => {
    const out: [number, number, number][] = []
    let n = 4242
    const next = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.05 + next() * 0.9) + Math.PI
      const r = 38 + next() * 22
      out.push([Math.cos(a) * r, Math.sin(a) * r, 1.8 + next() * 2.6])
    }
    return out
  }, [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial map={texture} roughness={0.7} metalness={0} />
      </mesh>
      {/* The far shore: a ring of land beyond the water, with hills behind. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[36, 140, 64, 1, Math.PI * 0.95, Math.PI * 1.1]} />
        <meshStandardMaterial color="#4f6b3f" side={DoubleSide} />
      </mesh>
      {[
        [-50, -80, 26],
        [10, -95, 34],
        [60, -75, 24],
        [-95, -40, 22],
        [95, -45, 20],
      ].map(([x, z, h], i) => (
        <mesh key={i} position={[x, h / 2 - 2, z]}>
          <coneGeometry args={[h * 1.2, h, 7]} />
          <meshStandardMaterial color={PALETTE.hill} flatShading />
        </mesh>
      ))}
      {pines.map(([x, z, h], i) => (
        <group key={`p${i}`} position={[x, 0, z]}>
          <mesh position={[0, h * 0.2, 0]}>
            <cylinderGeometry args={[0.12, 0.16, h * 0.4, 5]} />
            <meshStandardMaterial color={PALETTE.dockDark} />
          </mesh>
          <mesh position={[0, h * 0.62, 0]}>
            <coneGeometry args={[h * 0.32, h * 0.9, 7]} />
            <meshStandardMaterial color={PALETTE.pine} flatShading />
          </mesh>
        </group>
      ))}
      {/* The sun, low over the hills. */}
      <mesh position={[30, 14, -150]}>
        <circleGeometry args={[9, 32]} />
        <meshBasicMaterial color="#ffe3a3" />
      </mesh>
    </group>
  )
}

/** The dock: boards along its length on posts in the water, as long as everybody on it needs. */
function Dock({ count }: { count: number }) {
  const half = Math.max(4, ((count - 1) * SPACING) / 2 + 2)
  const posts = useMemo(() => {
    const out: number[] = []
    for (let x = -half; x <= half + 1e-6; x += 2) out.push(x)
    return out
  }, [half])
  return (
    <group>
      <mesh position={[0, DOCK - 0.08, 1.1]} castShadow receiveShadow>
        <boxGeometry args={[half * 2, 0.16, 3]} />
        <meshStandardMaterial color={PALETTE.dock} roughness={0.9} />
      </mesh>
      {/* Board joins across it. */}
      {posts.map((x) => (
        <mesh key={`j${x}`} position={[x, DOCK + 0.005, 1.1]}>
          <boxGeometry args={[0.04, 0.01, 3]} />
          <meshStandardMaterial color={PALETTE.dockDark} />
        </mesh>
      ))}
      {posts.flatMap((x) =>
        [-0.3, 2.5].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, DOCK / 2 - 0.5, z]}>
            <cylinderGeometry args={[0.13, 0.13, DOCK + 1, 8]} />
            <meshStandardMaterial color={PALETTE.dockDark} />
          </mesh>
        )),
      )}
    </group>
  )
}

const FISH_BODY = new SphereGeometry(0.5, 16, 10)
const FISH_TAIL = new ConeGeometry(0.35, 0.5, 3)
const BOBBER = new SphereGeometry(0.09, 12, 8)
const SEGMENT = (() => {
  const g = new CylinderGeometry(0.018, 0.028, ROD.joint, 6)
  g.translate(0, ROD.joint / 2, 0)
  return g
})()

/** A fish of one size: a body, a tail, and its colour. Nose along -Z. */
function makeFish(size: number): Group {
  const f = FISH[size]
  const g = new Group()
  const skin = new MeshStandardMaterial({ color: f.colour, roughness: 0.4, metalness: 0.2 })
  const body = new Mesh(FISH_BODY, skin)
  body.scale.set(f.length * 0.32, f.length * 0.38, f.length)
  const tail = new Mesh(FISH_TAIL, skin)
  tail.scale.setScalar(f.length * 0.8)
  tail.rotation.x = -Math.PI / 2
  tail.position.z = f.length * 0.62
  g.add(body, tail)
  g.traverse((o) => (o.castShadow = true))
  g.visible = false
  return g
}

/** How long a landed fish takes to fly out of the water into the bucket, seconds. */
const FLY = 0.9

/**
 * One angler: themselves, their rod bending for whatever is on it, the line out
 * to the bobber, their bucket, and the fish they land flying into it.
 */
function Angler({ index, live }: { index: number; live: RefObject<Game> }) {
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const rod = useRef<Group>(null)
  const bobber = useRef<Mesh>(null)
  const joints = useMemo(() => {
    // Each joint hangs off the tip of the one before, so turning them all bends the whole rod.
    const list: Group[] = []
    let parent: Group | null = null
    for (let k = 0; k < ROD.joints; k++) {
      const joint = new Group()
      const mat = new MeshStandardMaterial({ color: k === 0 ? PALETTE.cork : PALETTE.rod, roughness: 0.6 })
      const seg = new Mesh(SEGMENT, mat)
      seg.scale.set(1 - k * 0.09, 1, 1 - k * 0.09)
      seg.castShadow = true
      joint.add(seg)
      if (parent) {
        joint.position.y = ROD.joint
        parent.add(joint)
      }
      list.push(joint)
      parent = joint
    }
    return list
  }, [])
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
    return new Line(geometry, new LineBasicMaterial({ color: PALETTE.line, transparent: true, opacity: 0.8 }))
  }, [])
  const fish = useMemo(() => FISH.map((_, s) => makeFish(s)), [])
  const tip = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const g = live.current
    const p = g.players[index]
    if (!p || !rod.current || !bobber.current) return
    const x = standAt(index, g.players.length)
    const t = g.elapsed
    const bites = bitesOf(g, index)
    const now = bendAt(bites, p.pulls, t)
    const last = p.pulls.filter((q) => q <= t).pop() ?? -Infinity
    const since = t - last

    // The rod: raised to fish; whipped up and back on a pull, then swung out again as it is cast.
    const cast = since < RECAST ? since / RECAST : 1
    const whip = since < RECAST ? Math.sin(Math.min(1, since / 0.25) * Math.PI * 0.5) * (1 - cast) * 1.1 : 0
    rod.current.position.set(x + 0.45, DOCK + 1.05, 0.25)
    rod.current.rotation.x = -0.95 + whip
    const bend = now.casting ? 0 : now.bend
    joints.forEach((j, k) => (j.rotation.x = k === 0 ? 0 : -bend * ROD.curl * (0.4 + (k / ROD.joints) * 1.2)))

    // The bobber: floating and bobbing, dragged under as the rod bends, out of the water while casting.
    const bob = 0.03 * Math.sin(clock.elapsedTime * 2.2 + index)
    const bx = x + 0.45
    const bz = -OUT - (index % 2) * 0.6
    if (now.casting) {
      // Flying back out on the cast.
      bobber.current.position.set(bx, 0.5 + Math.sin(cast * Math.PI) * 2.5, -1 + (bz + 1) * cast)
    } else bobber.current.position.set(bx + bend * 0.15 * Math.sin(clock.elapsedTime * 9), bob - bend * 0.35, bz + bend * 0.6)

    // The line, from the rod's tip to the bobber.
    joints[joints.length - 1].updateWorldMatrix(true, false)
    tip.set(0, ROD.joint, 0)
    joints[joints.length - 1].localToWorld(tip)
    const pos = line.geometry.getAttribute('position') as BufferAttribute
    pos.setXYZ(0, tip.x, tip.y, tip.z)
    pos.setXYZ(1, bobber.current.position.x, bobber.current.position.y, bobber.current.position.z)
    pos.needsUpdate = true
    line.geometry.computeBoundingSphere()

    // The last fish landed, flying out of the water over their head into the bucket.
    const played = playBack(
      bites,
      p.pulls.filter((q) => q <= t),
    )
    const landed = played.landed[played.landed.length - 1]
    fish.forEach((f) => (f.visible = false))
    if (landed && since < FLY) {
      const f = fish[landed.size]
      const k = since / FLY
      const from = { x: bx, y: 0, z: bz }
      const to = { x: x - 0.7, y: DOCK + 0.4, z: 0.9 }
      f.visible = true
      f.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * (3 + FISH[landed.size].length), from.z + (to.z - from.z) * k)
      f.rotation.set(-0.8 + k * 1.6, 0, Math.sin(since * 30) * 0.4)
    }
  })
  const x = standAt(index, live.current.players.length)
  return (
    <group>
      <group position={[x, DOCK, 0.5]} rotation={[0, Math.PI, 0]}>
        <primitive object={avatar} />
      </group>
      <group ref={rod}>
        <primitive object={joints[0]} />
      </group>
      <mesh ref={bobber} geometry={BOBBER}>
        <meshStandardMaterial color={PALETTE.bobber} />
      </mesh>
      <primitive object={line} />
      {fish.map((f, s) => (
        <primitive key={s} object={f} />
      ))}
      {/* The bucket. */}
      <mesh position={[x - 0.7, DOCK + 0.25, 0.9]} castShadow>
        <cylinderGeometry args={[0.3, 0.24, 0.5, 14, 1, true]} />
        <meshStandardMaterial color="#8b98a5" metalness={0.5} roughness={0.4} side={DoubleSide} />
      </mesh>
    </group>
  )
}

export function PondScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is on the dock changes; everything else moves itself.
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
      <fog attach="fog" args={[PALETTE.sky, 40, 160]} />
      <hemisphereLight args={['#ffe2c0', '#2c4f60', 1.2]} />
      <directionalLight
        position={[18, 14, -30]}
        intensity={2}
        color="#ffcf99"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <Rig live={live} />
      <Lake />
      <Dock count={Math.max(1, game.players.length)} />
      {game.players.map((p, index) => (
        <Angler key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
    </>
  )
}
