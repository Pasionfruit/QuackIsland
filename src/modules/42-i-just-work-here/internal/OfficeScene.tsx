/**
 * I Just Work Here in three dimensions, from above.
 *
 * An open-plan office on grey-blue carpet tiles: desks in pods, meeting tables,
 * partitions, cabinets, the copier, the plants and the water cooler, with the
 * eight home desks along the north and south walls. Everybody is the island's
 * capsule in their own colour, and a desk in play has a chair and a nameplate
 * in its owner's colour.
 *
 * **Pieces are in their owner's colour**: the tube, the grip, the sight and the
 * rocket, each lying on the floor with a ring round it - yours pulse. A piece in
 * somebody's arms is carried over their head; a piece on a desk sits on it, and
 * the fourth one there puts a bazooka on its owner's shoulder.
 *
 * The camera follows you from above and a little south, so W is up the screen.
 * Armed, a line runs from you the way you aim to wherever your rocket would
 * burst, with the blast drawn round it - **red, if you would be in it.**
 * Carrying, an arrow at your feet points home, and a beam stands over your desk.
 * Once you are out, the camera rises to watch the whole office.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { createAvatar } from '../../02-player'
import { OFFICE, officeFor, type Kind } from './office'
import {
  BLAST,
  BLAST_LIFE,
  CARRIED,
  COLOURS,
  LOOSE,
  PLACED,
  ROCKET,
  aimDirection,
  deskOf,
  deskSpot,
  isArmed,
  rocketTouch,
  yawTowards,
  type Game,
} from './rules'

export const PALETTE = {
  outside: '#cfd6dc',
  carpet: '#8d9cab',
  carpetDark: '#7f8e9d',
  wall: '#e9e2d4',
  wood: '#c79a64',
  woodDark: '#9b6f43',
  partition: '#6f8497',
  cabinet: '#a6adb5',
  copier: '#dcdfe3',
  pot: '#b0643c',
  leaves: '#3f9b4f',
  cooler: '#9fd3ef',
  monitor: '#2d2a33',
  flame: '#ffb13b',
  danger: '#e0342c',
  safe: '#ffffff',
} as const

/** How high a rocket flies, metres: about the shoulder. */
export const ROCKET_Y = 1.25
/** Where the camera sits over you: up, and back to the south. */
export const CAMERA_OVER = { up: 15, back: 8.5 } as const

/** The mouse, as the screen sees it: where it is over the canvas, and the aim the scene works out from it. */
export interface AimRef {
  /** -1 to 1 across and up the canvas, or null before the mouse has been over it. */
  ndc: { x: number; y: number } | null
  yaw: number
}

const KIND_COLOUR: Record<Kind, string> = {
  wall: PALETTE.wall,
  home: PALETTE.wood,
  desk: PALETTE.wood,
  partition: PALETTE.partition,
  table: PALETTE.woodDark,
  cabinet: PALETTE.cabinet,
  copier: PALETTE.copier,
  plant: PALETTE.pot,
  cooler: PALETTE.cooler,
}

let carpetTexture: CanvasTexture | null = null

/** Carpet tiles, a metre square, two greys - so you can see yourself move. */
function carpet(): CanvasTexture {
  if (carpetTexture) return carpetTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  c.fillStyle = PALETTE.carpet
  c.fillRect(0, 0, 128, 128)
  c.fillStyle = PALETTE.carpetDark
  c.fillRect(0, 0, 64, 64)
  c.fillRect(64, 64, 64, 64)
  carpetTexture = new CanvasTexture(canvas)
  carpetTexture.colorSpace = SRGBColorSpace
  carpetTexture.wrapS = RepeatWrapping
  carpetTexture.wrapT = RepeatWrapping
  carpetTexture.repeat.set(OFFICE.halfX, OFFICE.halfZ)
  return carpetTexture
}

const ray = new Raycaster()
const pointer = new Vector2()
const shoulder = new Plane(new Vector3(0, 1, 0), -ROCKET_Y)
const hit = new Vector3()
const wantAt = new Vector3()
const wantLook = new Vector3()
const looking = new Vector3()

/** The camera over you - or over everything, once you are out - and the aim from the mouse. */
function Rig({ live, aim }: { live: RefObject<Game>; aim: RefObject<AimRef> }) {
  const placed = useRef(false)
  useFrame(({ camera }, delta) => {
    const g = live.current
    const me = g.players.find((p) => p.mine)
    const watching = !me || me.out !== null || me.left || g.players.length === 0
    if (watching) {
      wantLook.set(0, 0, 0.5)
      wantAt.set(0, 34, 17)
    } else {
      const x = Math.max(-OFFICE.halfX + 7, Math.min(OFFICE.halfX - 7, me.x))
      // Less room kept to the north: the camera sits south, so the far wall already shows less.
      const z = Math.max(-OFFICE.halfZ + 1.5, Math.min(OFFICE.halfZ - 3, me.z))
      wantLook.set(x, 0, z - 0.4)
      wantAt.set(x, CAMERA_OVER.up, z + CAMERA_OVER.back)
    }
    if (!placed.current) {
      camera.position.copy(wantAt)
      looking.copy(wantLook)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * (watching ? 2.5 : 8))
      camera.position.lerp(wantAt, k)
      looking.lerp(wantLook, k)
    }
    camera.lookAt(looking)
    camera.updateMatrixWorld()

    // The aim: from you to where the mouse is, at the height a rocket flies.
    const a = aim.current
    if (me && a.ndc) {
      pointer.set(a.ndc.x, a.ndc.y)
      ray.setFromCamera(pointer, camera)
      if (ray.ray.intersectPlane(shoulder, hit)) a.yaw = yawTowards(me, { x: hit.x, z: hit.z })
    }
  })
  return null
}

const BOX = new Matrix4()
const SCALE = new Matrix4()

/** The floor, the walls, the furniture and the eight desks, for a seed. */
const OfficeView = memo(function OfficeView({ seed }: { seed: number }) {
  const boxes = useRef<InstancedMesh>(null)
  const screens = useRef<InstancedMesh>(null)
  const leaves = useRef<InstancedMesh>(null)
  const office = officeFor(seed)
  useLayoutEffect(() => {
    const colour = new Color()
    const mesh = boxes.current
    if (mesh) {
      office.blocks.forEach((b, i) => {
        // A plant's rectangle is its pot, drawn short; the leaves go on top.
        const h = b.kind === 'plant' ? 0.5 : b.height
        BOX.makeTranslation((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2)
        SCALE.makeScale(b.x1 - b.x0, h, b.z1 - b.z0)
        mesh.setMatrixAt(i, BOX.multiply(SCALE))
        mesh.setColorAt(i, colour.set(KIND_COLOUR[b.kind]))
      })
      mesh.count = office.blocks.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    // A monitor on every desk, facing whoever sits at it.
    const desks = office.blocks.filter((b) => b.kind === 'desk' || b.kind === 'home')
    if (screens.current) {
      desks.forEach((b, i) => {
        const wide = b.x1 - b.x0 >= b.z1 - b.z0
        const cx = (b.x0 + b.x1) / 2
        const cz = (b.z0 + b.z1) / 2
        // Pushed to the back of the desk: the side nearer the partition or the wall.
        const back = b.kind === 'home' ? (cz < 0 ? -1 : 1) : 0
        BOX.makeTranslation(cx + (wide ? 0 : back * 0.2), b.height + 0.22, cz + (wide ? back * 0.25 : 0))
        SCALE.makeScale(wide ? 0.6 : 0.06, 0.38, wide ? 0.06 : 0.6)
        screens.current!.setMatrixAt(i, BOX.multiply(SCALE))
      })
      screens.current.count = desks.length
      screens.current.instanceMatrix.needsUpdate = true
    }
    const plants = office.blocks.filter((b) => b.kind === 'plant')
    if (leaves.current) {
      plants.forEach((b, i) => {
        BOX.makeTranslation((b.x0 + b.x1) / 2, 1, (b.z0 + b.z1) / 2)
        SCALE.makeScale(0.55, 0.65, 0.55)
        leaves.current!.setMatrixAt(i, BOX.multiply(SCALE))
      })
      leaves.current.count = plants.length
      leaves.current.instanceMatrix.needsUpdate = true
    }
  }, [office])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OFFICE.halfX * 2, OFFICE.halfZ * 2]} />
        <meshStandardMaterial map={carpet()} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={PALETTE.outside} roughness={1} />
      </mesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, 160]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={screens} args={[undefined, undefined, 64]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={PALETTE.monitor} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, 32]} castShadow>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={PALETTE.leaves} roughness={0.9} />
      </instancedMesh>
    </group>
  )
})

/** A desk in play: a chair and a nameplate in its owner's colour, and a beam over it while you carry something home. */
function HomeDesk({ index, live }: { index: number; live: RefObject<Game> }) {
  const beam = useRef<Mesh>(null)
  const g = live.current
  const desk = deskOf(g, index)
  const colour = COLOURS[index % COLOURS.length]
  const north = desk.spot.z > desk.block.z1
  const cx = (desk.block.x0 + desk.block.x1) / 2
  const front = north ? desk.block.z1 : desk.block.z0
  const side = north ? 1 : -1
  useFrame(({ clock }) => {
    const p = live.current.players[index]
    if (!beam.current || !p) return
    beam.current.visible = p.mine && p.carrying >= 0 && p.out === null
    ;(beam.current.material as MeshBasicMaterial).opacity = 0.22 + 0.1 * Math.sin(clock.elapsedTime * 5)
  })
  return (
    <group>
      {/* The chair, pulled out a little. */}
      <mesh position={[cx, 0.25, front + side * 0.45]} castShadow>
        <boxGeometry args={[0.55, 0.5, 0.5]} />
        <meshStandardMaterial color={colour} roughness={0.7} />
      </mesh>
      {/* The nameplate, along the front edge of the desk. */}
      <mesh position={[cx, desk.block.height + 0.02, front - side * 0.05]}>
        <boxGeometry args={[desk.block.x1 - desk.block.x0, 0.05, 0.1]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh ref={beam} position={[cx, 3, (desk.block.z0 + desk.block.z1) / 2]} visible={false}>
        <cylinderGeometry args={[0.6, 0.6, 6, 20, 1, true]} />
        <meshBasicMaterial color={colour} transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/** A part of a bazooka, in a colour, laid along +Z. */
function makePart(part: number, colour: string): Group {
  const body = new MeshStandardMaterial({ color: colour, roughness: 0.5 })
  const dark = new MeshStandardMaterial({ color: '#34303b', roughness: 0.6 })
  const group = new Group()
  const add = (mesh: Mesh, x = 0, y = 0, z = 0, rx = 0) => {
    mesh.position.set(x, y, z)
    mesh.rotation.x = rx
    mesh.castShadow = true
    group.add(mesh)
  }
  if (part === 0) {
    add(new Mesh(new CylinderGeometry(0.12, 0.12, 0.8, 14), body), 0, 0, 0, Math.PI / 2)
    add(new Mesh(new CylinderGeometry(0.14, 0.14, 0.08, 14), dark), 0, 0, 0.38, Math.PI / 2)
  } else if (part === 1) {
    add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.3, 8), dark), 0, -0.05, 0, 0.25)
    add(new Mesh(new CylinderGeometry(0.07, 0.07, 0.24, 10), body), 0, 0.1, 0, Math.PI / 2)
  } else if (part === 2) {
    add(new Mesh(new CylinderGeometry(0.06, 0.06, 0.3, 10), body), 0, 0.05, 0, Math.PI / 2)
    add(new Mesh(new CylinderGeometry(0.075, 0.075, 0.04, 10), dark), 0, 0.05, -0.15, Math.PI / 2)
    add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.12, 6), dark), 0, -0.06, 0)
  } else {
    add(new Mesh(new CylinderGeometry(0.08, 0.08, 0.3, 12), body), 0, 0, 0.05, Math.PI / 2)
    add(new Mesh(new ConeGeometry(0.08, 0.2, 12), dark), 0, 0, -0.2, -Math.PI / 2)
  }
  // Drawn half as big again as life, so a piece reads from the height the camera is at.
  group.scale.setScalar(1.5)
  return group
}

/** A piece: on the floor with a ring round it, over its carrier's head, or on its owner's desk. */
function PieceView({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const g = live.current
  const piece = g.pieces[index]
  const colour = COLOURS[piece.owner % COLOURS.length]
  const model = useMemo(() => makePart(piece.part, colour), [piece.part, colour])
  const spin = (index * 1.7) % (Math.PI * 2)

  useFrame(({ clock }) => {
    const game = live.current
    const it = game.pieces[index]
    const owner = game.players[it?.owner ?? -1]
    if (!group.current || !ring.current || !it || !owner) return
    const t = clock.elapsedTime
    ring.current.visible = it.state === LOOSE
    if (it.state === LOOSE) {
      group.current.position.set(it.x, 0.35 + 0.08 * Math.sin(t * 2.4 + spin), it.z)
      group.current.rotation.set(0, spin + t * 0.8, 0)
      ring.current.position.set(it.x, 0.02, it.z)
      const pulse = owner.mine ? 1 + 0.25 * Math.sin(t * 5) : 1
      ring.current.scale.setScalar(pulse * (owner.mine ? 1.2 : 0.9))
      ;(ring.current.material as MeshBasicMaterial).opacity = owner.mine ? 0.9 : 0.45
    } else if (it.state === CARRIED) {
      const carrier = owner
      group.current.position.set(carrier.x, 2.25 + 0.05 * Math.sin(t * 6), carrier.z)
      group.current.rotation.set(0, carrier.yaw + Math.PI, 0)
    } else {
      const at = deskSpot(game, index)
      const desk = deskOf(game, it.owner)
      group.current.position.set(at.x, desk.block.height + 0.14, at.z)
      group.current.rotation.set(0, Math.PI / 2, 0)
    }
    // Four on a desk is a bazooka on a shoulder instead.
    group.current.visible = !(it.state === PLACED && isArmed(game, it.owner))
  })

  return (
    <>
      <group ref={group}>
        <primitive object={model} />
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.55, 28]} />
        <meshBasicMaterial color={colour} transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </>
  )
}

/** The whole bazooka, for a shoulder: all four parts, put together. */
function makeBazooka(colour: string): Group {
  const group = new Group()
  const tube = makePart(0, colour)
  tube.scale.z *= 1.4
  group.add(tube)
  const grip = makePart(1, colour)
  grip.position.set(0, -0.2, 0.05)
  group.add(grip)
  const sight = makePart(2, colour)
  sight.position.set(-0.14, 0.12, 0.1)
  group.add(sight)
  const rocket = makePart(3, colour)
  rocket.position.set(0, 0, -0.62)
  group.add(rocket)
  // Life size on a shoulder.
  for (const part of group.children) part.scale.divideScalar(1.5)
  // The parts are laid with their fronts to -Z; a body faces +Z.
  group.rotation.y = Math.PI
  return group
}

/** Somebody: in their colour, armed or not, eased towards where the host last had them. */
function BodyView({ index, live }: { index: number; live: RefObject<Game> }) {
  const group = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const gun = useRef<Group>(null)
  const colour = COLOURS[index % COLOURS.length]
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const bazooka = useMemo(() => makeBazooka(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)

  useFrame(({ clock }, delta) => {
    const g = live.current
    const p = g.players[index]
    if (!group.current || !turn.current || !gun.current || !p) return
    group.current.visible = !p.left && p.out === null
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    if (p.mine || Math.hypot(p.x - s.x, p.z - s.z) > 3) {
      s.x = p.x
      s.z = p.z
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 20)
      s.x += (p.x - s.x) * k
      s.z += (p.z - s.z) * k
    }
    group.current.position.set(s.x, 0, s.z)
    turn.current.rotation.y = p.yaw + Math.PI
    gun.current.visible = isArmed(g, index)
    // A little kick when it fires.
    const since = g.elapsed - p.firedAt
    const k = since >= 0 && since < 0.2 ? 1 - since / 0.2 : 0
    gun.current.position.set(0.32, 1.45, 0.05 - 0.12 * k)
    // Arms up and a wobble, carrying something over your head.
    avatar.rotation.z = p.carrying >= 0 ? 0.05 * Math.sin(clock.elapsedTime * 10) : 0
  })

  return (
    <group ref={group}>
      <group ref={turn}>
        <primitive object={avatar} />
        <group ref={gun}>
          <primitive object={bazooka} />
        </group>
      </group>
    </group>
  )
}

const ROCKET_BODY = new CylinderGeometry(ROCKET.radius * 0.7, ROCKET.radius * 0.7, 0.5, 10)
const ROCKET_NOSE = new ConeGeometry(ROCKET.radius * 0.7, 0.22, 10)
const FLAME = new SphereGeometry(0.16, 10, 8)

/** The rockets in the air, from a small pool. */
function Rockets({ live }: { live: RefObject<Game> }) {
  const pool = useMemo(
    () =>
      Array.from({ length: 24 }, () => {
        const g = new Group()
        const body = new Mesh(ROCKET_BODY, new MeshStandardMaterial({ color: '#3a3642', roughness: 0.5 }))
        body.rotation.x = Math.PI / 2
        const nose = new Mesh(ROCKET_NOSE, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }))
        nose.rotation.x = -Math.PI / 2
        nose.position.z = -0.36
        const flame = new Mesh(FLAME, new MeshBasicMaterial({ color: PALETTE.flame }))
        flame.position.z = 0.32
        g.add(body, nose, flame)
        g.visible = false
        return g
      }),
    [],
  )
  useFrame(({ clock }) => {
    const g = live.current
    let used = 0
    for (const r of g.rockets) {
      if (used >= pool.length) break
      const m = pool[used++]
      m.visible = true
      m.position.set(r.x, ROCKET_Y, r.z)
      m.rotation.set(0, r.yaw, 0)
      const flame = m.children[2] as Mesh
      flame.scale.setScalar(0.8 + 0.4 * Math.sin(clock.elapsedTime * 40 + used))
      ;((m.children[1] as Mesh).material as MeshStandardMaterial).color.set(COLOURS[r.by % COLOURS.length])
    }
    for (let i = used; i < pool.length; i++) pool[i].visible = false
  })
  return (
    <group>
      {pool.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}

const BURST = new SphereGeometry(1, 20, 14)
const BLAST_RING = new RingGeometry(0.94, 1, 48)
const BURST_FADE = 0.5

/** Every blast: a ball of fire, and a ring on the floor as wide as the blast reaches. */
function Blasts({ live }: { live: RefObject<Game> }) {
  const pool = useMemo(
    () =>
      Array.from({ length: 16 }, () => {
        const ball = new Mesh(BURST, new MeshBasicMaterial({ color: PALETTE.flame, transparent: true, depthWrite: false }))
        const ring = new Mesh(BLAST_RING, new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ball.visible = false
        ring.visible = false
        return { ball, ring }
      }),
    [],
  )
  const seen = useRef(new Map<string, number>())
  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    const g = live.current
    let used = 0
    for (const b of g.blasts) {
      const key = `${g.id}:${b.seq}`
      if (!seen.current.has(key)) seen.current.set(key, now)
      const age = now - seen.current.get(key)!
      if (age > BLAST_LIFE || used >= pool.length) continue
      const { ball, ring } = pool[used++]
      const k = Math.min(1, age / BURST_FADE)
      ball.visible = age < BURST_FADE
      ball.position.set(b.x, ROCKET_Y * 0.8, b.z)
      ball.scale.setScalar(0.4 + BLAST.radius * 0.8 * Math.sqrt(k))
      ;(ball.material as MeshBasicMaterial).opacity = 0.85 * (1 - k)
      ;(ball.material as MeshBasicMaterial).color.set(k < 0.3 ? '#fff1b8' : PALETTE.flame)
      ring.visible = true
      ring.position.set(b.x, 0.03, b.z)
      ring.scale.setScalar(BLAST.radius)
      ;(ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - age / BLAST_LIFE)
    }
    for (let i = used; i < pool.length; i++) {
      pool[i].ball.visible = false
      pool[i].ring.visible = false
    }
    if (seen.current.size > 64) seen.current.clear()
  })
  return (
    <group>
      {pool.map(({ ball, ring }, i) => (
        <group key={i}>
          <primitive object={ball} />
          <primitive object={ring} />
        </group>
      ))}
    </group>
  )
}

const LINE = new CylinderGeometry(0.035, 0.035, 1, 6, 1, true)
const UP = new Vector3(0, 1, 0)
const from = new Vector3()
const to = new Vector3()
const along = new Vector3()

/**
 * Your guide. Armed: where the rocket would go and how far its blast would
 * reach - red if you are in it. Carrying: an arrow at your feet, pointing home.
 */
function Guide({ live }: { live: RefObject<Game> }) {
  const line = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const arrow = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const g = live.current
    const index = g.players.findIndex((p) => p.mine)
    const me = g.players[index]
    if (!line.current || !ring.current || !arrow.current) return
    const standing = !!me && me.out === null && !me.left && !g.over
    const armed = standing && isArmed(g, index)
    line.current.visible = armed
    ring.current.visible = armed
    arrow.current.visible = standing && me.carrying >= 0
    if (!me) return
    if (armed) {
      const dir = aimDirection(me.yaw)
      const { t } = rocketTouch(g, index, me, dir, ROCKET.range)
      const end = { x: me.x + dir.x * t, z: me.z + dir.z * t }
      const danger = Math.hypot(end.x - me.x, end.z - me.z) <= BLAST.radius
      from.set(me.x + dir.x * 0.4, ROCKET_Y, me.z + dir.z * 0.4)
      to.set(end.x, ROCKET_Y, end.z)
      const length = Math.max(0.01, from.distanceTo(to))
      line.current.position.copy(from).lerp(to, 0.5)
      line.current.quaternion.setFromUnitVectors(UP, along.copy(to).sub(from).normalize())
      line.current.scale.set(1, length, 1)
      const colour = danger ? PALETTE.danger : PALETTE.safe
      ;(line.current.material as MeshBasicMaterial).color.set(colour)
      ;(line.current.material as MeshBasicMaterial).opacity = danger ? 0.8 + 0.2 * Math.sin(clock.elapsedTime * 16) : 0.45
      ring.current.position.set(end.x, 0.04, end.z)
      ring.current.scale.setScalar(BLAST.radius)
      ;(ring.current.material as MeshBasicMaterial).color.set(colour)
      ;(ring.current.material as MeshBasicMaterial).opacity = danger ? 0.75 : 0.3
    }
    if (me.carrying >= 0) {
      const home = deskOf(g, index).spot
      const yaw = yawTowards(me, home)
      const dir = aimDirection(yaw)
      arrow.current.position.set(me.x + dir.x * 1.1, 0.05, me.z + dir.z * 1.1)
      arrow.current.rotation.set(-Math.PI / 2, 0, yaw)
    }
  })
  const colour = COLOURS[Math.max(0, live.current.players.findIndex((p) => p.mine)) % COLOURS.length]
  return (
    <group>
      <mesh ref={line} geometry={LINE} visible={false} renderOrder={5}>
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
      <mesh ref={ring} geometry={BLAST_RING} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
        <meshBasicMaterial transparent depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh ref={arrow} visible={false} renderOrder={5}>
        {/* A flat triangle, pointing along -Y before it is laid down and turned. */}
        <circleGeometry args={[0.45, 3, Math.PI / 2]} />
        <meshBasicMaterial color={colour} transparent opacity={0.9} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

export function OfficeScene({ live, aim }: { live: RefObject<Game>; aim: RefObject<AimRef> }) {
  // Only re-rendered when who is in the office changes; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = live.current
    const key = `${g.id}:${g.pieces.length}:${g.players.map((p) => `${p.id}${p.mine ? '*' : ''}${p.slot}`).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const game = live.current
  const background = useMemo(() => new Color(PALETTE.outside), [])
  const ready = game.players.length > 0
  return (
    <>
      <color attach="background" args={[background]} />
      <hemisphereLight args={['#ffffff', '#8d9cab', 1.5]} />
      <directionalLight
        position={[8, 26, 10]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <Rig live={live} aim={aim} />
      {ready ? <OfficeView seed={game.seed} /> : null}
      {ready ? game.players.map((p, index) => <HomeDesk key={`${game.id}:desk:${p.id}`} index={index} live={live} />) : null}
      {ready ? game.pieces.map((_, index) => <PieceView key={`${game.id}:piece:${index}`} index={index} live={live} />) : null}
      {game.players.map((p, index) => (
        <BodyView key={`${game.id}:${p.id}`} index={index} live={live} />
      ))}
      <Rockets live={live} />
      <Blasts live={live} />
      {ready ? <Guide key={`${game.id}:guide`} live={live} /> : null}
    </>
  )
}
