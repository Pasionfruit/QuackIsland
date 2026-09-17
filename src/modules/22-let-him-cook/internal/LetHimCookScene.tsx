/**
 * Let Him Cook in three dimensions, lit and dressed like the island.
 *
 * A kitchen: a tiled wall, a wooden counter with fifteen ingredients on it in
 * three rows, the chef behind it in a tall white hat, and the stove with a pot
 * off to one side. While the chef cooks, the chef goes to each item in turn and
 * it arcs into the pot. For the turns, the counter is laid out again; an item
 * somebody claims sits on a plate in their colour.
 *
 * **Drawn from a ref, redrawn every frame from inside the canvas.** The canvas
 * itself is rendered once by the screen; see Duck Hunt's notes for why a
 * `<Canvas>` re-rendered every frame is a mistake.
 *
 * A click is turned into an item here, the way Duck Hunt turns one into a
 * balloon: a ray from this camera through the pointer, and `pickSlot`.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import { Color, Group, Vector2, Vector3, type DirectionalLight, type MeshBasicMaterial } from 'three'
import { createAvatar } from '../../02-player'
import { LAYOUT, POT, frameScene, pickSlot, slotAt } from './camera'
import { COLOURS, KITCHEN, cookTime, pickTime, whoseTurn, type Game } from './rules'

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
  plate: '#ffffff',
  hover: '#ffffff',
  wrong: '#e0392f',
  chef: '#f2c9a0',
  hat: '#ffffff',
  sunColour: '#fff3e0',
  ambientColour: '#fff1dc',
  skyColour: '#fff6e6',
  groundColour: '#9a8266',
} as const

/** What the screen hands the scene: the game, and what to do with a click. */
export interface SceneHands {
  /** Whether a click would count right now - your turn, nothing waiting. */
  canPick: () => boolean
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

/**
 * One slot on the counter: whatever ingredient is there in this phase, where it
 * is - on the counter, in the air on its way to the pot, gone - and what it
 * looks like: hovered, claimed on a plate, or a wrong pick shaking.
 */
function Slot({ slot, live, hovered, hands }: { slot: number; live: RefObject<Game>; hovered: RefObject<number | null>; hands: SceneHands }) {
  const holder = useRef<Group>(null)
  const plate = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const plateColour = useRef<MeshBasicMaterial>(null)
  const ringColour = useRef<MeshBasicMaterial>(null)
  const game = live.current
  const cooking = game.phase === 'cooking'
  const kind = cooking ? game.counter[slot] : game.served[slot]
  const home = slotAt(slot)

  useFrame(({ clock }) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    let x = home.x
    let y = LAYOUT.top
    let z = home.z
    let scale = 1
    let visible = true
    let spin = 0

    if (g.phase === 'cooking') {
      const n = g.picks.indexOf(slot)
      if (n >= 0) {
        const since = g.clock - pickTime(n, g.recipe)
        if (since >= KITCHEN.flight) visible = false
        else if (since >= 0) {
          const t = since / KITCHEN.flight
          x = home.x + (POT.x - home.x) * t
          z = home.z + (POT.z - home.z) * t
          y = LAYOUT.top + (POT.y - LAYOUT.top) * t + Math.sin(t * Math.PI) * 2.2
          spin = t * 6
          scale = 1 - t * 0.35
        } else if (since > -KITCHEN.reach) {
          // The chef has hold of it.
          y += (1 + since / KITCHEN.reach) * 0.25
        }
      }
    } else {
      const last = g.phase === 'result' ? g.last : null
      if (last && last.slot === slot && !last.ok) {
        // A wrong pick shakes where it stands.
        x += Math.sin(clock.elapsedTime * 40) * 0.08 * Math.max(0, 1 - g.clock / KITCHEN.result)
      }
      if (last && last.slot === slot && last.ok) scale = 1 + 0.25 * Math.max(0, 1 - g.clock * 3)
      if (g.claimed[slot] !== null) y += 0.08
      else if (hovered.current === slot || hands.pending() === slot) scale *= 1.18
    }

    group.visible = visible
    group.position.set(x, y, z)
    group.rotation.set(0, spin, 0)
    group.scale.setScalar(scale)

    const claimer = g.phase === 'cooking' ? null : g.claimed[slot]
    if (plate.current) {
      plate.current.visible = claimer !== null
      if (claimer !== null) plateColour.current?.color.set(COLOURS[claimer % COLOURS.length])
    }
    if (ring.current) {
      const last = g.phase === 'result' ? g.last : null
      const wrong = !!last && last.slot === slot && !last.ok
      const hover = g.phase === 'turns' && claimer === null && (hovered.current === slot || hands.pending() === slot)
      ring.current.visible = wrong || hover
      ringColour.current?.color.set(wrong ? PALETTE.wrong : PALETTE.hover)
    }
  })

  return (
    <>
      <group ref={plate} position={[home.x, LAYOUT.top + 0.01, home.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[LAYOUT.item * 1.25, 28]} />
          <meshBasicMaterial ref={plateColour} color={PALETTE.plate} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[LAYOUT.item * 1.05, LAYOUT.item * 0.9, 0.08, 28]} />
          <meshStandardMaterial color={PALETTE.plate} roughness={0.3} />
        </mesh>
      </group>
      <group ref={ring} position={[home.x, LAYOUT.top + 0.02, home.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[LAYOUT.item * 1.1, LAYOUT.item * 1.35, 32]} />
          <meshBasicMaterial ref={ringColour} color={PALETTE.hover} />
        </mesh>
      </group>
      <group ref={holder}>
        <Ingredient kind={kind} />
      </group>
    </>
  )
}

/** The chef, in a hat, going to each item as it is taken; watching the counter otherwise. */
function Chef({ live }: { live: RefObject<Game> }) {
  const holder = useRef<Group>(null)
  const avatar = useMemo(() => createAvatar(PALETTE.chef), [])
  const x = useRef(0)
  useFrame((_, delta) => {
    const group = holder.current
    if (!group) return
    const g = live.current
    let target = 0
    let bob = 0
    if (g.phase === 'cooking') {
      // Where the next item to be taken is, or the pot once it is all in.
      const next = g.picks.findIndex((_, n) => pickTime(n, g.recipe) + KITCHEN.flight * 0.5 > g.clock)
      if (next >= 0 && pickTime(next, g.recipe) - KITCHEN.reach - 0.5 <= g.clock) target = slotAt(g.picks[next]).x
      else if (next < 0 && g.clock < cookTime(g.picks.length, g.recipe)) target = POT.x - 1.3
      bob = Math.abs(Math.sin(g.clock * 9)) * 0.06
    }
    x.current += (target - x.current) * (1 - Math.exp(-7 * Math.min(delta, 0.1)))
    // On a step behind the counter, so more of the chef shows over it.
    group.position.set(x.current, 0.4 + bob, LAYOUT.chefZ)
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

/** Clicks and the pointer, turned into items. */
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
      return pickSlot(camera.position, direction, (slot) => g.claimed[slot] !== null)
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
    hovered.current = pickSlot(camera.position, direction, (slot) => g.claimed[slot] !== null)
    gl.domElement.style.cursor = hovered.current !== null ? 'pointer' : 'default'
  })
  return null
}

export function LetHimCookScene({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useFrame(() => redraw())
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.background), [])
  const hovered = useRef<number | null>(null)
  const ready = game.players.length > 0
  // A new layout - the chef's counter, the counter laid out again, the next
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
      {ready ? Array.from({ length: KITCHEN.items }, (_, slot) => <Slot key={`${layout}:${slot}`} slot={slot} live={live} hovered={hovered} hands={hands} />) : null}
      <Pointer live={live} hovered={hovered} hands={hands} />
    </>
  )
}

/** Whether it is this browser's turn in a game. */
export function myTurn(game: Game): boolean {
  const turn = whoseTurn(game)
  return turn !== null && game.players[turn]?.mine === true
}
