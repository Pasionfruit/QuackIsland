/**
 * This Place Needs A Walmart in three dimensions, from above and behind.
 *
 * A bright supermarket: a tiled floor, low shelves in rows of colour with the
 * goods on top, fridges along the walls, four checkouts by the door with their
 * lanes lit green and a green light over each. The camera follows you from
 * behind and above.
 *
 * Every shopper is the island's capsule in their colour behind a trolley, and
 * what is in the trolley is in the trolley. **Everything on your list that is
 * still out on a shelf or the floor has a beam of light over it** - on your
 * screen only - and whatever you are close enough to grab has a ring round it.
 * A ram is a lunge; being rammed, a spin. Through the checkout, you are gone.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import { createAvatar } from '../../02-player'
import { COUNTERS, ITEMS, LANES, SHELVES, SOLIDS, STORE } from './store'
import { COLOURS, RAM, isShopping, reachable, stillNeeds, stunned, type Game } from './rules'

export const PALETTE = {
  floor: '#eef0f2',
  tile: '#dfe3e8',
  wall: '#e7e2d6',
  shelf: ['#2f6fd6', '#d6453b', '#2f9e5b', '#f09a2a'],
  fridge: '#bfe3f2',
  counter: '#5d6470',
  belt: '#23262b',
  lane: '#39d27a',
  sign: '#ffd23d',
  trolley: '#9aa3ad',
} as const

let floorTexture: CanvasTexture | null = null

/** Big square tiles, a metre across. */
function tiles(): CanvasTexture {
  if (floorTexture) return floorTexture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.floor
  c.fillRect(0, 0, 64, 64)
  c.fillStyle = PALETTE.tile
  c.fillRect(0, 0, 32, 32)
  c.fillRect(32, 32, 32, 32)
  floorTexture = new CanvasTexture(canvas)
  floorTexture.colorSpace = SRGBColorSpace
  floorTexture.wrapS = RepeatWrapping
  floorTexture.wrapT = RepeatWrapping
  floorTexture.repeat.set(STORE.halfX, STORE.halfZ)
  return floorTexture
}

const want = new Vector3()
const look = new Vector3()
const looking = new Vector3()

function Rig({ live }: { live: RefObject<Game> }) {
  const placed = useRef(false)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const me = g.players.find((p) => p.mine)
    const watching = !me || !isShopping(me)
    if (watching) {
      look.set(0, 0, -1)
      want.set(0, 36, 22)
    } else {
      look.set(me.x, 0, me.z - 1.5)
      want.set(me.x, 15, me.z + 9.5)
    }
    if (!placed.current) {
      camera.position.copy(want)
      looking.copy(look)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 2 : 7))
      camera.position.lerp(want, k)
      looking.lerp(look, k)
    }
    camera.lookAt(looking)
  })
  return null
}

/** The building: floor, walls, the door, the shelves, the checkouts. */
function Store() {
  const { halfX, halfZ, shelf } = STORE
  const counters = SOLIDS.slice(SHELVES.length)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
        <meshStandardMaterial map={tiles()} roughness={0.6} />
      </mesh>
      {/* Walls: tall on three sides, low along the front with the door in it. */}
      {[
        [0, -halfZ - 0.2, halfX * 2 + 0.8, 3, 0.4],
        [-halfX - 0.2, 0, 0.4, 3, halfZ * 2],
        [halfX + 0.2, 0, 0.4, 3, halfZ * 2],
        [-(halfX + 4) / 2, halfZ + 0.2, halfX - 4, 0.8, 0.4],
        [(halfX + 4) / 2, halfZ + 0.2, halfX - 4, 0.8, 0.4],
      ].map(([x, z, w, h, d], i) => (
        <mesh key={i} position={[x, h / 2, z]} receiveShadow castShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
        </mesh>
      ))}
      {/* The door: two panes of glass slid open. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.2, 1.1, halfZ + 0.2]}>
          <boxGeometry args={[1.6, 2.2, 0.08]} />
          <meshStandardMaterial color="#bfe6ff" transparent opacity={0.35} />
        </mesh>
      ))}
      {SHELVES.map((s, i) => {
        const wall = i >= SHELVES.length - 3
        const colour = wall ? PALETTE.fridge : PALETTE.shelf[Math.floor(i / 3) % PALETTE.shelf.length]
        return (
          <group key={i} position={[(s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2]}>
            <mesh position={[0, shelf / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[s.x1 - s.x0, shelf, s.z1 - s.z0]} />
              <meshStandardMaterial color={colour} roughness={0.7} />
            </mesh>
            {/* A pale top for the goods to stand on. */}
            <mesh position={[0, shelf + 0.01, 0]} receiveShadow>
              <boxGeometry args={[s.x1 - s.x0 - 0.06, 0.02, s.z1 - s.z0 - 0.06]} />
              <meshStandardMaterial color="#f5f5f2" roughness={0.8} />
            </mesh>
          </group>
        )
      })}
      {counters.map((c, i) => (
        <group key={`c${i}`} position={[(c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2]}>
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[c.x1 - c.x0, 0.9, c.z1 - c.z0]} />
            <meshStandardMaterial color={PALETTE.counter} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.91, -0.3]}>
            <boxGeometry args={[c.x1 - c.x0 - 0.2, 0.02, c.z1 - c.z0 - 1]} />
            <meshStandardMaterial color={PALETTE.belt} roughness={0.9} />
          </mesh>
          {/* The till, at the door end. */}
          <mesh position={[0, 1.15, (c.z1 - c.z0) / 2 - 0.35]} castShadow>
            <boxGeometry args={[0.5, 0.45, 0.4]} />
            <meshStandardMaterial color="#e9ecef" />
          </mesh>
        </group>
      ))}
      {LANES.map((l, i) => (
        <group key={`l${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(l.x0 + l.x1) / 2, 0.015, (l.z0 + l.z1) / 2]}>
            <planeGeometry args={[l.x1 - l.x0, l.z1 - l.z0]} />
            <meshBasicMaterial color={PALETTE.lane} transparent opacity={0.3} />
          </mesh>
          {/* A light on a pole over the lane, so a till can be seen from across the store. */}
          <mesh position={[COUNTERS[i] - 0.1, 1.8, l.z0 + 0.2]}>
            <cylinderGeometry args={[0.04, 0.04, 1.8, 6]} />
            <meshStandardMaterial color={PALETTE.counter} />
          </mesh>
          <mesh position={[COUNTERS[i] - 0.1, 2.8, l.z0 + 0.2]}>
            <boxGeometry args={[0.7, 0.45, 0.2]} />
            <meshBasicMaterial color={PALETTE.lane} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const GEOM = {
  box: new BoxGeometry(1, 1, 1),
  ball: new SphereGeometry(0.5, 16, 12),
  can: new CylinderGeometry(0.5, 0.5, 1, 16),
  wedge: new CylinderGeometry(0.5, 0.5, 1, 3),
  ring: new TorusGeometry(0.5, 0.07, 8, 24),
}

/** Half how tall each thing is made, roughly, metres - so how high its middle sits above what it stands on. */
const HALF = 0.21
/** Out on a shelf or the floor things are drawn bigger than life, to be found from the camera's height; in a trolley, life size. */
const LOOSE = 1.7

/** One of the ten things, from primitives: shaped and coloured so each is told apart at a glance. */
function makeItem(kind: number): Group {
  const g = new Group()
  const mat = (color: string) => new MeshStandardMaterial({ color, roughness: 0.6 })
  const add = (geom: BoxGeometry | SphereGeometry | CylinderGeometry, color: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rz = 0) => {
    const m = new Mesh(geom, mat(color))
    m.scale.set(sx, sy, sz)
    m.position.set(x, y, z)
    m.rotation.z = rz
    m.castShadow = true
    g.add(m)
    return m
  }
  switch (kind) {
    case 0: // milk: a white carton with a blue cap
      add(GEOM.box, '#f4f6fb', 0.26, 0.42, 0.26)
      add(GEOM.can, '#2f7fe0', 0.1, 0.06, 0.1, 0, 0.24)
      break
    case 1: // bananas: three curved yellow fingers
      for (let k = -1; k <= 1; k++) add(GEOM.can, '#f7d23e', 0.1, 0.42, 0.1, k * 0.09, 0, 0, 0.5 + k * 0.2)
      break
    case 2: // bread: a long brown loaf
      add(GEOM.box, '#c98a4b', 0.42, 0.2, 0.22)
      add(GEOM.ball, '#b0703a', 0.44, 0.18, 0.24, 0, 0.09)
      break
    case 3: // eggs: a carton with eggs on top
      add(GEOM.box, '#b7a47f', 0.42, 0.1, 0.22)
      for (let k = 0; k < 6; k++) add(GEOM.ball, '#f3e3c3', 0.1, 0.12, 0.1, -0.15 + (k % 3) * 0.15, 0.08, k < 3 ? -0.05 : 0.05)
      break
    case 4: // cheese: a yellow wedge
      add(GEOM.wedge, '#f5b82e', 0.46, 0.2, 0.46)
      break
    case 5: // apples: a red one with a leaf
      add(GEOM.ball, '#e0342c', 0.34, 0.32, 0.34)
      add(GEOM.box, '#3c9a3f', 0.08, 0.02, 0.04, 0.04, 0.18)
      break
    case 6: // cereal: a tall orange box
      add(GEOM.box, '#f08a24', 0.3, 0.46, 0.12)
      add(GEOM.box, '#fff2c8', 0.16, 0.12, 0.13, 0, 0.06)
      break
    case 7: // toilet paper: a stack of white rolls
      for (let k = 0; k < 2; k++) add(GEOM.can, '#fbfbf7', 0.2, 0.2, 0.2, k * 0.2 - 0.1, 0)
      add(GEOM.can, '#fbfbf7', 0.2, 0.2, 0.2, 0, 0.2)
      break
    case 8: // watermelon: a big green ball
      add(GEOM.ball, '#3c9a3f', 0.46, 0.4, 0.4)
      break
    default: // soda: a red can
      add(GEOM.can, '#d8252f', 0.18, 0.36, 0.18)
      add(GEOM.can, '#d9dde2', 0.16, 0.02, 0.16, 0, 0.19)
  }
  return g
}

const BEAM = new CylinderGeometry(0.28, 0.28, 7, 16, 1, true)

/**
 * The goods: on their shelves, on the floor, or riding in somebody's trolley.
 * What is on your list and still out there has a beam over it; what you can
 * grab has a ring round it.
 */
function Goods({ live, carts }: { live: RefObject<Game>; carts: RefObject<Map<number, CartSpot>> }) {
  const game = live.current
  const made = useMemo(
    () =>
      game.items.map((item) => {
        const body = makeItem(item.kind)
        const beam = new Mesh(BEAM, new MeshBasicMaterial({ color: ITEMS[item.kind].colour, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide }))
        const ring = new Mesh(GEOM.ring, new MeshBasicMaterial({ color: '#ffffff' }))
        ring.rotation.x = -Math.PI / 2
        beam.visible = false
        ring.visible = false
        return { body, beam, ring }
      }),
    // A new game is a new set of goods.
    [game.id, game.seed, game.items.length],
  )
  useFrame(({ clock }) => {
    const g = live.current
    const meIndex = g.players.findIndex((p) => p.mine)
    const me = g.players[meIndex]
    const needs = me && isShopping(me) ? stillNeeds(g, me) : []
    const near = me && isShopping(me) ? reachable(g, meIndex) : -1
    g.items.forEach((item, i) => {
      const m = made[i]
      if (!m) return
      const scale = item.holder === null ? LOOSE : 1
      let y = (item.shelf ? STORE.shelf : 0) + HALF * scale
      let x = item.x
      let z = item.z
      let visible = true
      if (item.holder !== null) {
        const spot = carts.current.get(item.holder)
        const p = g.players[item.holder]
        const k = p ? p.cart.indexOf(i) : -1
        if (!spot || k < 0 || spot.gone) visible = false
        else {
          // Riding in the basket, one beside the other, standing on its floor.
          const side = (k - 1) * 0.22
          x = spot.x + spot.fx * 0.05 + -spot.fz * side
          z = spot.z + spot.fz * 0.05 + spot.fx * side
          y = 0.55 + HALF
        }
      }
      m.body.visible = visible
      m.body.scale.setScalar(scale)
      m.body.position.set(x, y, z)
      m.body.rotation.y = item.holder === null ? i * 1.3 : 0
      const wanted = item.holder === null && needs.includes(item.kind)
      m.beam.visible = wanted
      if (wanted) {
        m.beam.position.set(x, 3.5, z)
        ;(m.beam.material as MeshBasicMaterial).opacity = 0.22 + 0.1 * Math.sin(clock.elapsedTime * 4 + i)
        m.body.position.y = y + 0.08 * Math.abs(Math.sin(clock.elapsedTime * 3 + i))
      }
      m.ring.visible = i === near
      if (i === near) {
        m.ring.position.set(x, y - HALF * scale + 0.03, z)
        m.ring.scale.setScalar(LOOSE * (0.9 + 0.1 * Math.sin(clock.elapsedTime * 8)))
      }
    })
  })
  return (
    <group>
      {made.map((m, i) => (
        <group key={i}>
          <primitive object={m.body} />
          <primitive object={m.beam} />
          <primitive object={m.ring} />
        </group>
      ))}
    </group>
  )
}

/** Where each trolley's basket is, drawn, for the goods to ride in: by player index. */
export interface CartSpot {
  x: number
  z: number
  /** The way it points. */
  fx: number
  fz: number
  gone: boolean
}

/** A trolley: a wire basket on legs and wheels with a handle, pointing along its own +Z. */
function makeTrolley(): Group {
  const g = new Group()
  const metal = new MeshStandardMaterial({ color: PALETTE.trolley, metalness: 0.6, roughness: 0.35 })
  const wire = new MeshStandardMaterial({ color: PALETTE.trolley, metalness: 0.6, roughness: 0.35, wireframe: true })
  const basket = new Mesh(new BoxGeometry(0.62, 0.36, 0.72, 3, 2, 3), wire)
  basket.position.set(0, 0.72, 0)
  const floor = new Mesh(GEOM.box, metal)
  floor.scale.set(0.6, 0.02, 0.7)
  floor.position.set(0, 0.55, 0)
  const handle = new Mesh(GEOM.can, metal)
  handle.scale.set(0.04, 0.66, 0.04)
  handle.rotation.z = Math.PI / 2
  handle.position.set(0, 0.95, -0.42)
  g.add(basket, floor, handle)
  for (const [x, z] of [
    [-0.26, -0.3],
    [0.26, -0.3],
    [-0.26, 0.3],
    [0.26, 0.3],
  ]) {
    const leg = new Mesh(GEOM.can, metal)
    leg.scale.set(0.03, 0.5, 0.03)
    leg.position.set(x, 0.3, z)
    const wheel = new Mesh(GEOM.can, new MeshStandardMaterial({ color: '#222' }))
    wheel.scale.set(0.1, 0.04, 0.1)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.05, z)
    g.add(leg, wheel)
  }
  g.traverse((o) => (o.castShadow = true))
  return g
}

/** Somebody: pushing their trolley, lunging as they ram, spinning when rammed, gone once through. */
function Shopper({ index, live, carts }: { index: number; live: RefObject<Game>; carts: RefObject<Map<number, CartSpot>> }) {
  const group = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const trolley = useMemo(() => makeTrolley(), [])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame((_, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !turn.current || !p) return
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 18)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    // Through the checkout: a moment at the till, then gone out the door.
    const gone = p.left || (p.doneAt !== null && g.elapsed - p.doneAt > 1.2)
    group.current.visible = !gone
    group.current.position.set(s.x, 0, s.z)
    const dizzy = stunned(g, p) ? (p.stunUntil - g.elapsed) * 14 : 0
    group.current.rotation.y = p.yaw + Math.PI + dizzy
    const since = g.elapsed - p.ramAt
    turn.current.position.z = since >= 0 && since < RAM.window ? Math.sin((since / RAM.window) * Math.PI) * 0.35 : 0
    if (ring.current) ring.current.visible = p.mine && isShopping(p)
    // The basket, for the goods: in front, the way they face.
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    carts.current.set(index, { x: s.x + fx * (0.45 + turn.current.position.z), z: s.z + fz * (0.45 + turn.current.position.z), fx, fz, gone })
  })
  return (
    <group ref={group}>
      <group ref={turn}>
        <group position={[0, 0, -0.3]}>
          <primitive object={avatar} />
        </group>
        <group position={[0, 0, 0.45]}>
          <primitive object={trolley} />
        </group>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.72, 0.86, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function StoreScene({ live }: { live: RefObject<Game> }) {
  // Only re-rendered when who is shopping changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  const carts = useRef(new Map<number, CartSpot>())
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.seed}:${g.items.length}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      carts.current.clear()
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color('#cfd8e3'), [])
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={['#cfd8e3', 40, 90]} />
      <hemisphereLight args={['#ffffff', '#c9d2dc', 1.6]} />
      <directionalLight
        position={[6, 24, 10]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      <Rig live={live} />
      <Store />
      {game.players.length > 0 ? <Goods key={`${game.id}:${game.seed}`} live={live} carts={carts} /> : null}
      {game.players.map((p, index) => (
        <Shopper key={`${game.id}:${p.id}`} index={index} live={live} carts={carts} />
      ))}
    </>
  )
}
