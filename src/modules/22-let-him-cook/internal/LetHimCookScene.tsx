/**
 * Let Him Cook in three dimensions, lit and dressed like the island.
 *
 * A kitchen: a tiled wall, a wooden counter with six baskets on it - one per
 * ingredient, holding every copy of it - the chef behind it in a tall white hat,
 * and the stove with a pot off to one side. While the chef cooks, the chef goes
 * to each basket in turn and an item arcs from it into the pot. For the turns,
 * the baskets are filled again, the chef waits by the pot, and whoever's turn it
 * is walks up in their colour, takes an item from a basket and tosses it in. If
 * it should not be in there, the chef shakes his head and throws it back. Every
 * item claimed leaves a chip in its claimer's colour by its basket. Between the
 * chef's cooking and the turns, the baskets rotate round the counter.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 *
 * A click is turned into a basket here, the way Duck Hunt turns one into a
 * balloon: a ray from this camera through the pointer, and `pickBasket`.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, Vector2, Vector3, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { LAYOUT, POT, basketAt, chipAt, frameScene, itemAt, pickBasket, type Point } from './camera'
import { COLOURS, KINDS, KITCHEN, cookTime, pickTime, rotation, whoseTurn, type Game } from './rules'

export const PALETTE = {
  background: '#f3dfc1',
  floor: '#d9c2a0',
  wall: '#f7efe2',
  tile: '#e4d6c0',
  counter: '#b07a4f',
  counterTop: '#e9d2ac',
  stove: '#545b63',
  pot: '#9aa3ad',
  soup: '#e0893a',
  basket: '#b98a4e',
  basketRim: '#8f6534',
  hover: '#ffffff',
  wrong: '#e0392f',
  chef: '#f2c9a0',
  hat: '#ffffff',
  sunColour: '#fff3e0',
  ambientColour: '#fff1dc',
  skyColour: '#fff6e6',
  groundColour: '#9a8266',
} as const

/**
 * A pick, from the moment its result is known: taken from the basket into the
 * cook's hands, in the air, in the pot - and, if the chef will not have it, the
 * chef's head shaking and the item thrown back. Seconds into the result.
 */
export const TOSS = {
  grab: 0.35,
  land: 1,
  shake: [1, 2] as const,
  back: [1.55, 2.25] as const,
} as const

/** Where the cook whose turn it is waits, across, before they go to a basket. */
const WAITING_X = -LAYOUT.spacing.x - 1.5

/** Where a slot's item sits in its basket, given what is in every slot and how far the baskets have turned. */
function placeOf(kinds: readonly number[], slot: number, turned: number): Point {
  const kind = kinds[slot]
  let index = 0
  let count = 0
  for (let s = 0; s < kinds.length; s++) {
    if (kinds[s] !== kind) continue
    if (s < slot) index += 1
    count += 1
  }
  return itemAt(kind, index, count, turned)
}

/** The slot a click on a basket takes: its last item nobody has claimed, or null if it is empty. */
export function slotFor(game: Game, kind: number): number | null {
  for (let slot = game.served.length - 1; slot >= 0; slot--) if (game.served[slot] === kind && game.claimed[slot] === null) return slot
  return null
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Somewhere between two points, lifted by `height` at the middle of the way. */
function arc(from: Point, to: Point, t: number, height: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * height,
    z: from.z + (to.z - from.z) * t,
  }
}

/** What the screen hands the scene: the game, and what to do with a click. */
export interface SceneHands {
  /** Whether a click would count right now - your turn, nothing waiting. */
  canPick: () => boolean
  /** A click on a basket, as the slot it takes - see `slotFor`. */
  onPick: (slot: number) => void
  /** The slot this browser has picked and not heard back about. */
  pending: () => number | null
}

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
    Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 })
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0009
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <directionalLight ref={sun} castShadow position={[-6, 16, 10]} intensity={2.1} color={PALETTE.sunColour} />
      <ambientLight intensity={0.55} color={PALETTE.ambientColour} />
      <hemisphereLight intensity={0.8} color={PALETTE.skyColour} groundColor={PALETTE.groundColour} />
    </>
  )
}

/** The room: floor, tiled wall, counter, stove and pot. */
const Kitchen = memo(function Kitchen() {
  const { width, depth } = LAYOUT.counter
  const stove = LAYOUT.stove
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={1} />
      </mesh>
      <mesh position={[0, 5, -4.4]} receiveShadow>
        <planeGeometry args={[40, 10]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={1} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, 1.2 + i * 0.9, -4.39]}>
          <planeGeometry args={[40, 0.05]} />
          <meshBasicMaterial color={PALETTE.tile} />
        </mesh>
      ))}
      <mesh position={[0, LAYOUT.top / 2 - 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, LAYOUT.top - 0.08, depth]} />
        <meshStandardMaterial color={PALETTE.counter} roughness={0.8} />
      </mesh>
      <mesh position={[0, LAYOUT.top - 0.04, 0]} receiveShadow>
        <boxGeometry args={[width + 0.2, 0.08, depth + 0.2]} />
        <meshStandardMaterial color={PALETTE.counterTop} roughness={0.7} />
      </mesh>
      <mesh position={[stove.x, stove.height / 2, stove.z]} castShadow receiveShadow>
        <boxGeometry args={[stove.width, stove.height, stove.width]} />
        <meshStandardMaterial color={PALETTE.stove} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[stove.x, (stove.height + LAYOUT.potTop) / 2, stove.z]} castShadow>
        <cylinderGeometry args={[0.72, 0.62, LAYOUT.potTop - stove.height, 28, 1, true]} />
        <meshStandardMaterial color={PALETTE.pot} roughness={0.35} metalness={0.55} side={2} />
      </mesh>
      <mesh position={[stove.x, LAYOUT.potTop, stove.z]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.05, 8, 32]} />
        <meshStandardMaterial color={PALETTE.pot} roughness={0.35} metalness={0.55} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[stove.x + side * 0.82, LAYOUT.potTop - 0.25, stove.z]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.13, 0.04, 6, 12, Math.PI]} />
          <meshStandardMaterial color={PALETTE.pot} roughness={0.35} metalness={0.55} />
        </mesh>
      ))}
    </group>
  )
})

/** One ingredient, built from primitives, standing on its base at the origin. */
const Ingredient = memo(function Ingredient({ kind }: { kind: number }) {
  const r = LAYOUT.item
  switch (kind) {
    case 0: // tomato
      return (
        <group>
          <mesh position={[0, r * 0.85, 0]} scale={[1, 0.85, 1]} castShadow>
            <sphereGeometry args={[r * 0.95, 20, 14]} />
            <meshStandardMaterial color="#e2362c" roughness={0.35} />
          </mesh>
          <mesh position={[0, r * 1.62, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.2, 6]} />
            <meshStandardMaterial color="#3f8a2e" />
          </mesh>
          <mesh position={[0, r * 1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.2, 5]} />
            <meshStandardMaterial color="#4f9e35" side={2} />
          </mesh>
        </group>
      )
    case 1: // carrot
      return (
        <group rotation={[0, 0.5, 0]}>
          <mesh position={[0, r * 0.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <coneGeometry args={[r * 0.45, r * 2.2, 14]} />
            <meshStandardMaterial color="#f07f22" roughness={0.6} />
          </mesh>
          <mesh position={[-r * 1.25, r * 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[r * 0.28, r * 0.7, 6]} />
            <meshStandardMaterial color="#4f9e35" />
          </mesh>
        </group>
      )
    case 2: // mushroom
      return (
        <group>
          <mesh position={[0, r * 0.55, 0]} castShadow>
            <cylinderGeometry args={[r * 0.26, r * 0.36, r * 1.1, 12]} />
            <meshStandardMaterial color="#f4ecdc" roughness={0.9} />
          </mesh>
          <mesh position={[0, r * 1.02, 0]} scale={[1, 0.55, 1]} castShadow>
            <sphereGeometry args={[r * 0.95, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c2412f" roughness={0.7} />
          </mesh>
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} position={[Math.cos(a) * r * 0.45, r * 1.38, Math.sin(a) * r * 0.45]}>
              <sphereGeometry args={[r * 0.12, 8, 6]} />
              <meshStandardMaterial color="#fff8ee" roughness={0.8} />
            </mesh>
          ))}
        </group>
      )
    case 3: // cheese
      return (
        <mesh position={[0, r * 0.4, 0]} rotation={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[r * 1.05, r * 1.05, r * 0.8, 3]} />
          <meshStandardMaterial color="#f5c842" roughness={0.6} />
        </mesh>
      )
    case 4: // fish
      return (
        <group rotation={[0, -0.4, 0]}>
          <mesh position={[0, r * 0.5, 0]} scale={[1.45, 0.62, 0.5]} castShadow>
            <sphereGeometry args={[r * 0.8, 20, 12]} />
            <meshStandardMaterial color="#6d9bc3" roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[-r * 1.3, r * 0.5, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, 0.3]}>
            <coneGeometry args={[r * 0.45, r * 0.6, 8]} />
            <meshStandardMaterial color="#5a86ad" />
          </mesh>
        </group>
      )
    default: // egg
      return (
        <mesh position={[0, r * 0.95, 0]} scale={[0.78, 1, 0.78]} castShadow>
          <sphereGeometry args={[r * 0.95, 20, 14]} />
          <meshStandardMaterial color="#fbf6ea" roughness={0.5} />
        </mesh>
      )
  }
})

/** A basket for one ingredient, with a ring when it is under the pointer or when its item was turned away. */
const Basket = memo(function Basket({ kind, live, hovered, hands }: { kind: number; live: RefObject<Game>; hovered: RefObject<number | null>; hands: SceneHands }) {
  const holder = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const ringColour = useRef<MeshBasicMaterial>(null)
  const { basket: r, wall } = LAYOUT
  useFrame(() => {
    if (!ring.current || !holder.current) return
    const g = live.current
    const at = basketAt(kind, rotation(g))
    holder.current.position.set(at.x, at.y, at.z)
    const last = g.phase === 'result' ? g.last : null
    const wrong = !!last && !last.ok && last.kind === kind && g.clock >= TOSS.land && g.clock < TOSS.back[1]
    const pending = hands.pending()
    const hover = g.phase === 'turns' && (hovered.current === kind || (pending !== null && g.served[pending] === kind))
    ring.current.visible = wrong || hover
    ringColour.current?.color.set(wrong ? PALETTE.wrong : PALETTE.hover)
  })
  return (
    <group ref={holder}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[r * 0.82, r * 0.8, 0.06, 28]} />
        <meshStandardMaterial color={PALETTE.basketRim} roughness={1} />
      </mesh>
      <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 0.82, wall, 28, 3, true]} />
        <meshStandardMaterial color={PALETTE.basket} roughness={1} side={2} />
      </mesh>
      {[0.3, 0.62].map((h) => (
        <mesh key={h} position={[0, wall * h, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * (0.82 + 0.18 * h) + 0.01, 0.025, 6, 32]} />
          <meshStandardMaterial color={PALETTE.basketRim} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, wall, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[r, 0.06, 8, 32]} />
        <meshStandardMaterial color={PALETTE.basketRim} roughness={1} />
      </mesh>
      <group ref={ring} position={[0, 0.02, 0]} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 1.08, r * 1.24, 40]} />
          <meshBasicMaterial ref={ringColour} color={PALETTE.hover} />
        </mesh>
      </group>
    </group>
  )
})

/** By each basket, a chip for every item of it claimed this recipe, in the claimer's colour. */
const Chips = memo(function Chips({ live, colours }: { live: RefObject<Game>; colours: readonly string[] }) {
  const chips = useRef<(Group | null)[]>([])
  const materials = useRef<(MeshBasicMaterial | null)[]>([])
  useFrame(() => {
    const g = live.current
    for (const chip of chips.current) if (chip) chip.visible = false
    if (g.phase === 'cooking') return
    // A claim in the air is not marked until it lands.
    const flying = g.phase === 'result' && g.last?.ok && g.clock < TOSS.land ? g.last.slot : null
    const shown = new Array<number>(KINDS).fill(0)
    const turned = rotation(g)
    for (let slot = 0; slot < g.served.length; slot++) {
      const claimer = g.claimed[slot]
      if (claimer === null || slot === flying) continue
      const kind = g.served[slot]
      const n = shown[kind]++
      const i = kind * KITCHEN.copies + n
      const chip = chips.current[i]
      if (!chip) continue
      const at = chipAt(kind, n, turned)
      chip.position.set(at.x, at.y, at.z)
      chip.visible = true
      materials.current[i]?.color.set(colours[claimer])
    }
  })
  return (
    <>
      {Array.from({ length: KINDS * KITCHEN.copies }, (_, i) => {
        return (
          <group
            key={i}
            ref={(g) => {
              chips.current[i] = g
            }}
            visible={false}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.06, 18]} />
              <meshBasicMaterial
                ref={(m) => {
                  materials.current[i] = m
                }}
                color={PALETTE.hover}
              />
            </mesh>
          </group>
        )
      })}
    </>
  )
})

/**
 * One item: in its basket, in the chef's hand on its way to the pot, in a cook's
 * hands and tossed in, thrown back out, or in the pot and gone.
 */
function Slot({ slot, live, hands, cook }: { slot: number; live: RefObject<Game>; hands: SceneHands; cook: RefObject<{ x: number }> }) {
  const holder = useRef<Group>(null)
  const game = live.current
  const kinds = game.phase === 'cooking' ? game.counter : game.served
  const kind = kinds[slot]

  useFrame(() => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const home = placeOf(kinds, slot, rotation(g))
    let at: Point = home
    let scale: number = LAYOUT.inBasket
    let visible = true
    let spin = 0

    if (g.phase === 'cooking') {
      const n = g.picks.indexOf(slot)
      if (n >= 0) {
        const since = g.clock - pickTime(n, g.recipe)
        if (since >= KITCHEN.flight) visible = false
        else if (since >= 0) {
          const t = since / KITCHEN.flight
          at = arc(home, POT, t, 2.2)
          spin = t * 6
          scale = LAYOUT.inBasket * (1 - t * 0.35)
        } else if (since > -KITCHEN.reach) {
          // The chef has hold of it.
          at = { ...home, y: home.y + (1 + since / KITCHEN.reach) * 0.45 }
        }
      }
    } else {
      const last = g.phase === 'result' && g.last?.slot === slot ? g.last : null
      if (last) {
        const t = g.clock
        const held: Point = { x: cook.current.x, y: 2.05, z: LAYOUT.cookZ - 0.4 }
        if (t < TOSS.grab) {
          const u = smooth(clamp01(t / TOSS.grab))
          at = arc(home, held, u, 0.6)
          scale = LAYOUT.inBasket + (1 - LAYOUT.inBasket) * u
        } else if (t < TOSS.land) {
          const u = (t - TOSS.grab) / (TOSS.land - TOSS.grab)
          at = arc(held, POT, u, 1.8)
          spin = u * 7
          scale = 1 - u * 0.3
        } else if (last.ok || t < TOSS.back[0]) {
          visible = false
        } else if (t < TOSS.back[1]) {
          // The chef will not have it: back where it came from.
          const u = (t - TOSS.back[0]) / (TOSS.back[1] - TOSS.back[0])
          at = arc(POT, home, u, 2.6)
          spin = -u * 9
        }
      } else if (g.claimed[slot] !== null) {
        visible = false
      } else if (hands.pending() === slot) {
        at = { ...home, y: home.y + 0.45 }
        scale = 1
      }
    }

    group.visible = visible
    group.position.set(at.x, at.y, at.z)
    group.rotation.set(0, spin, 0)
    group.scale.setScalar(scale)
  })

  return (
    <group ref={holder}>
      <Ingredient kind={kind} />
    </group>
  )
}

/** Who is at the counter: whoever's turn it is, or whose pick is being shown. */
function atCounter(g: Game): number | null {
  if (g.phase === 'turns') return whoseTurn(g)
  if (g.phase === 'result' && g.last && g.last.why !== 'left') return g.last.player
  return null
}

/**
 * A cook, in their colour, in front of the counter while it is their turn and
 * nobody else's: walks in, waits, goes to the basket they pick from, and tosses
 * the item into the pot. On your own turn yours follows the pointer from basket
 * to basket.
 */
function Cook({
  index,
  live,
  hovered,
  hands,
  cook,
  colour,
}: {
  index: number
  live: RefObject<Game>
  hovered: RefObject<number | null>
  hands: SceneHands
  cook: RefObject<{ x: number }>
  colour: string
}) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const state = useRef({ x: LAYOUT.cookEnters, facing: Math.PI / 2, here: false })
  useFrame(({ clock }, delta) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const s = state.current
    const here = atCounter(g) === index
    group.visible = here
    if (!here) {
      s.here = false
      return
    }
    if (!s.here) {
      // Walks in from the side, every turn.
      s.here = true
      s.x = LAYOUT.cookEnters
      s.facing = Math.PI / 2
    }

    let target = WAITING_X
    if (g.phase === 'turns' && g.players[index]?.mine) {
      const pending = hands.pending()
      const kind = pending !== null ? g.served[pending] : hovered.current
      if (kind !== null && kind !== undefined) target = basketAt(kind, rotation(g)).x
    } else if (g.phase === 'result' && g.last && g.last.kind !== null) {
      target = basketAt(g.last.kind, rotation(g)).x
    }

    const dt = Math.min(delta, 0.1)
    s.x += (target - s.x) * (1 - Math.exp(-9 * dt))
    const walking = Math.abs(target - s.x) > 0.08
    // Side on while walking; facing the counter when there.
    const facing = walking ? Math.sign(target - s.x) * (Math.PI / 2) : Math.PI
    s.facing += (facing - s.facing) * (1 - Math.exp(-12 * dt))
    // A lean into the throw as it leaves their hands.
    const t = g.clock
    const throwing = g.phase === 'result' && g.last?.slot !== null && t > TOSS.grab - 0.1 && t < TOSS.grab + 0.35
    const lean = throwing ? Math.sin(((t - TOSS.grab + 0.1) / 0.45) * Math.PI) * 0.25 : 0

    group.position.set(s.x, walking ? Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.07 : 0, LAYOUT.cookZ)
    group.rotation.set(0, s.facing, 0)
    avatar.rotation.set(lean, 0, 0)
    cook.current.x = s.x
  })
  return (
    <group ref={holder} visible={false}>
      <primitive object={avatar} />
    </group>
  )
}

/**
 * The chef, in a hat. While cooking, goes to each basket as an item is taken
 * from it. For the turns, waits by the pot for whatever is tossed in: a hop for
 * an item that belongs in it, a shake of the head for one that does not.
 */
function Chef({ live }: { live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(PALETTE.chef), [])
  const x = useRef(0)
  useFrame((_, delta) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    const byThePot = POT.x - 1.3
    let target = byThePot
    let bob = 0
    let shake = 0
    if (g.phase === 'cooking') {
      target = 0
      // Where the next item to be taken is, or the pot once it is all in.
      const next = g.picks.findIndex((_, n) => pickTime(n, g.recipe) + KITCHEN.flight * 0.5 > g.clock)
      if (next >= 0 && pickTime(next, g.recipe) - KITCHEN.reach - 0.5 <= g.clock) target = basketAt(g.counter[g.picks[next]], g.turned).x
      else if (next < 0 && g.clock < cookTime(g.picks.length, g.recipe)) target = byThePot
      bob = Math.abs(Math.sin(g.clock * 9)) * 0.06
    } else if (g.phase === 'result' && g.last && g.last.slot !== null) {
      const t = g.clock
      if (!g.last.ok && t >= TOSS.shake[0] && t < TOSS.shake[1]) {
        // No.
        const u = (t - TOSS.shake[0]) / (TOSS.shake[1] - TOSS.shake[0])
        shake = Math.sin(u * Math.PI * 2 * 3) * 0.75 * Math.sin(u * Math.PI)
      } else if (g.last.ok && t >= TOSS.land && t < TOSS.land + 0.6) {
        bob = Math.sin(((t - TOSS.land) / 0.6) * Math.PI) * 0.3
      }
    }
    x.current += (target - x.current) * (1 - Math.exp(-7 * Math.min(delta, 0.1)))
    // On a step behind the counter, so more of the chef shows over it.
    group.position.set(x.current, 0.4 + bob, LAYOUT.chefZ)
    group.rotation.set(0, shake, 0)
  })
  return (
    <group ref={holder}>
      <primitive object={avatar} />
      <mesh position={[0, 1.78, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.26, 0.5, 18]} />
        <meshStandardMaterial color={PALETTE.hat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.08, 0]} castShadow>
        <sphereGeometry args={[0.4, 18, 12]} />
        <meshStandardMaterial color={PALETTE.hat} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** The soup: rises with every item that lands. */
function Soup({ live }: { live: RefObject<Game> }) {
  const soup = useRef<Group>(null)
  useFrame(() => {
    if (!soup.current) return
    const g = live.current
    const landed = g.phase === 'cooking' ? g.picks.filter((_, n) => g.clock >= pickTime(n, g.recipe) + KITCHEN.flight).length : g.picks.length
    const full = Math.min(1, landed / KITCHEN.recipe[1])
    soup.current.visible = landed > 0
    soup.current.position.set(POT.x, LAYOUT.stove.height + 0.2 + full * (LAYOUT.potTop - LAYOUT.stove.height - 0.35), POT.z)
  })
  return (
    <group ref={soup}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.66, 28]} />
        <meshStandardMaterial color={PALETTE.soup} roughness={0.3} />
      </mesh>
    </group>
  )
}

/** Clicks and the pointer, turned into baskets. Emptied baskets are passed through. */
function Pointer({ live, hovered, hands }: { live: RefObject<Game>; hovered: { current: number | null }; hands: SceneHands }) {
  const { camera, gl } = useThree()
  const ndc = useRef<Vector2 | null>(null)

  useEffect(() => {
    const canvas = gl.domElement
    const direction = new Vector3()
    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }
    const slotUnder = (point: Vector2) => {
      direction.set(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
      const g = live.current
      const kind = pickBasket(camera.position, direction, (k) => slotFor(g, k) === null, rotation(g))
      return kind === null ? null : slotFor(g, kind)
    }
    const move = (e: PointerEvent) => {
      ndc.current = at(e)
    }
    const leave = () => {
      ndc.current = null
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !hands.canPick()) return
      const slot = slotUnder(at(e))
      if (slot !== null) hands.onPick(slot)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
    }
  }, [camera, gl, hands, live])

  useFrame(() => {
    const point = ndc.current
    if (!point || !hands.canPick()) {
      hovered.current = null
      gl.domElement.style.cursor = 'default'
      return
    }
    const direction = new Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position)
    const g = live.current
    hovered.current = pickBasket(camera.position, direction, (k) => slotFor(g, k) === null, rotation(g))
    gl.domElement.style.cursor = hovered.current !== null ? 'pointer' : 'default'
  })
  return null
}

export function LetHimCookScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  /** The basket under the pointer, when a click would take from it. */
  const hovered = useRef<number | null>(null)
  /** Where the cook at the counter is, across, for the item in their hands. */
  const cook = useRef({ x: LAYOUT.cookEnters })
  const ready = game.players.length > 0
  // A new layout - the chef's baskets, the baskets filled again, the next
  // recipe - is a new set of items.
  const layout = `${game.id}:${game.recipe}:${game.phase === 'cooking' ? 'c' : 's'}`
  return (
    <>
      <color attach="background" args={[background]} />
      <FixedCamera />
      <Daylight />
      <Kitchen />
      <Chef live={live} />
      <Soup live={live} />
      {Array.from({ length: KINDS }, (_, kind) => (
        <Basket key={kind} kind={kind} live={live} hovered={hovered} hands={hands} />
      ))}
      <Chips live={live} colours={colours} />
      {ready ? Array.from({ length: KITCHEN.items }, (_, slot) => <Slot key={`${layout}:${slot}`} slot={slot} live={live} hands={hands} cook={cook} />) : null}
      {game.players.map((p, index) => (
        <Cook key={`${game.id}:${p.id}`} index={index} live={live} hovered={hovered} hands={hands} cook={cook} colour={colours[index]} />
      ))}
      <Pointer live={live} hovered={hovered} hands={hands} />
    </>
  )
}

/** Whether it is this browser's turn in a game. */
export function myTurn(game: Game): boolean {
  const turn = whoseTurn(game)
  return turn !== null && game.players[turn]?.mine === true
}
