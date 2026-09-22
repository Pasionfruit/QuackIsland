/**
 * Binary BS in three dimensions, from above.
 *
 * A giant gear lying flat in the dark, one side for each player in their own
 * colour, teeth round the rim, and the number on the hub. **The mark** - a red
 * pointer - stands off the north edge, and never moves. While the vote is on,
 * the side that goes if everybody votes 1 is striped red.
 *
 * Then the gear turns, as many sides as the count says, the side at the mark
 * drops away with whoever is on it, and everybody left steps onto a new gear
 * with a side fewer. Everybody is the island's capsule; over each head, a tick
 * once they have voted - and at the reveal, their vote.
 *
 * **Drawn from refs, not from props.** The canvas is rendered once by the
 * screen; everything here reads the live game each frame and moves itself.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useReducer, useRef, type RefObject } from 'react'
import { CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three'
import { createAvatar, usePlayerColour } from '../../02-player'
import { rosterColour, usePeers } from '../../09-net'
import { hubValue, turnAngle, viewOf } from './display'
import { COLOURS, GEAR, clock, markedSide, numberFor, when, type Game, type Result } from './rules'

export { turnAngle }

export const PALETTE = {
  sky: '#1d1830',
  steel: '#8e8aa0',
  steelDark: '#5d596d',
  hub: '#2a2233',
  mark: '#e0342c',
  ink: '#2a2233',
} as const

const THICK = 0.6
const TEETH_EACH = 3

const textures = new Map<string, CanvasTexture>()

/** A round badge with a word on it, drawn once. */
function badge(text: string, fill: string, ink = '#ffffff'): CanvasTexture {
  const key = `${text}:${fill}:${ink}`
  const known = textures.get(key)
  if (known) return known
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')!
  c.fillStyle = fill
  c.beginPath()
  c.arc(64, 64, 60, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = ink
  c.font = `900 ${text.length > 2 ? 44 : 78}px ui-rounded, 'Segoe UI', system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(text, 64, 70)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  textures.set(key, texture)
  if (textures.size > 64) textures.delete(textures.keys().next().value!)
  return texture
}

/** The current round's result, if it has been counted. */
function resultNow(g: Game): Result | undefined {
  return g.results.find((r) => r.round === g.round)
}

const spot = new Vector3()

/** The gear: a wedge per side with its teeth, the hub with the number, the stripes on the marked side. */
function Gear({ live, colours }: { live: RefObject<Game>; colours: readonly string[] }) {
  const turn = useRef<Group>(null)
  const wedges = useRef<(Group | null)[]>([])
  const stripe = useRef<Mesh>(null)
  const hubTop = useRef<Mesh>(null)
  const g = viewOf(live.current)
  const sides = Math.max(1, g.seats.length)
  const step = (Math.PI * 2) / sides

  useFrame(({ clock: c }) => {
    const game = viewOf(live.current)
    const t = clock(game)
    const w = when(t)
    const result = resultNow(game)
    if (turn.current) turn.current.rotation.y = turnAngle(result, game.seats.length, t)
    wedges.current.forEach((wedge, side) => {
      if (!wedge) return
      const dropping = !!result && result.side === side && w.round === result.round && (w.phase === 'drop' || w.phase === 'reseat')
      const k = dropping ? (w.phase === 'drop' ? w.t / w.length : 1) : 0
      wedge.position.y = -30 * k * k
      wedge.visible = k < 0.99
    })
    if (stripe.current) {
      // The side that goes if nothing changes, striped while the vote is on.
      const marked = markedSide(numberFor(game.seed, game.round), game.seats.length)
      stripe.current.visible = w.phase === 'vote' && game.seats.length > 0 && t >= 0
      stripe.current.rotation.y = -marked * step
      ;(stripe.current.material as MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(c.elapsedTime * 6)
    }
    if (hubTop.current) {
      const m = hubTop.current.material as MeshBasicMaterial
      // The number, then the total as the votes are added in, then the sides still to turn as it clicks round.
      const hub = hubValue(game, result, t)
      const want = badge(String(hub.value), hub.phase === 'number' ? PALETTE.hub : hub.phase === 'total' ? '#4b3f8f' : '#b3261e')
      if (m.map !== want) {
        m.map = want
        m.needsUpdate = true
      }
    }
  })

  return (
    <>
    <group ref={turn}>
      {Array.from({ length: sides }, (_, side) => {
        const player = g.seats[side]
        const colour = new Color(player !== undefined ? colours[player] : PALETTE.steel).lerp(new Color(PALETTE.steel), 0.35)
        // Cylinder angles run from +Z; sides run clockwise from north - so side s is centred on π - s·step.
        const start = Math.PI - (side + 0.5) * step + 0.015
        return (
          <group key={side} ref={(el) => (wedges.current[side] = el)}>
            <mesh position={[0, -THICK / 2, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[GEAR.rim, GEAR.rim, THICK, Math.max(8, Math.ceil(48 / sides)), 1, false, start, step - 0.03]} />
              <meshStandardMaterial color={colour} roughness={0.55} metalness={0.2} />
            </mesh>
            {Array.from({ length: TEETH_EACH }, (_, k) => {
              const a = (side - 0.5 + (k + 0.5) / TEETH_EACH) * step
              const r = (GEAR.rim + GEAR.teeth) / 2
              return (
                <mesh key={k} position={[Math.sin(a) * r, -THICK / 2, -Math.cos(a) * r]} rotation={[0, -a, 0]} castShadow>
                  <boxGeometry args={[Math.min(1.4, (GEAR.rim * step) / TEETH_EACH - 0.5), THICK, GEAR.teeth - GEAR.rim + 0.2]} />
                  <meshStandardMaterial color={PALETTE.steelDark} roughness={0.5} metalness={0.3} />
                </mesh>
              )
            })}
          </group>
        )
      })}
      <mesh ref={stripe} position={[0, 0.02, 0]} visible={false}>
        {/* A wedge over side 0, turned onto whichever side is marked. */}
        {/* Closed, for its top face: an open cylinder is only its curved wall, invisible from above. */}
        <cylinderGeometry args={[GEAR.rim - 0.15, GEAR.rim - 0.15, 0.04, 24, 1, false, Math.PI - step / 2 + 0.04, step - 0.08]} />
        <meshBasicMaterial color={PALETTE.mark} transparent depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[GEAR.hub, GEAR.hub, 0.5, 40]} />
        <meshStandardMaterial color={PALETTE.hub} roughness={0.4} />
      </mesh>
    </group>
      {/* The number on the hub stays the right way up while the gear turns under it. */}
      <mesh ref={hubTop} position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[GEAR.hub * 0.92, 40]} />
        <meshBasicMaterial transparent />
      </mesh>
    </>
  )
}

/** The mark: a red pointer off the north edge, pointing at the side that goes. */
function Mark() {
  return (
    <group position={[0, 0.4, -(GEAR.teeth + 1.6)]}>
      {/* A triangle with a point to the south, at the gear. */}
      <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <circleGeometry args={[1.3, 3]} />
        <meshBasicMaterial color={PALETTE.mark} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -1.6]}>
        <boxGeometry args={[0.7, 0.3, 2]} />
        <meshBasicMaterial color={PALETTE.mark} />
      </mesh>
    </group>
  )
}

/** Somebody on their side: riding the gear round, falling with their side, a badge over their head. */
function Body({ index, live, colour }: { index: number; live: RefObject<Game>; colour: string }) {
  const group = useRef<Group>(null)
  const tag = useRef<Mesh>(null)
  const avatar = useMemo(() => createAvatar(colour), [colour])
  const shown = useRef<{ x: number; z: number } | null>(null)
  useFrame(({ camera }, delta) => {
    const g = viewOf(live.current)
    const p = g.players[index]
    if (!group.current || !p) return
    const t = clock(g)
    const w = when(t)
    const result = resultNow(g)
    const side = g.seats.indexOf(index)
    const falling = !!result && result.victim === index && w.round === result.round && (w.phase === 'drop' || w.phase === 'reseat')
    group.current.visible = !p.left && side >= 0 && (p.out === null || falling) && !(falling && w.phase === 'reseat')
    // Eased to where it stands, so a reseat is a walk and a guest's snapshots do not stutter.
    const s = shown.current ?? (shown.current = { x: p.x, z: p.z })
    const k = p.mine ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * (w.phase === 'reseat' ? 5 : 14))
    s.x += (p.x - s.x) * k
    s.z += (p.z - s.z) * k
    // Riding the gear: turned about the middle with it.
    const a = turnAngle(result, g.seats.length, t)
    spot.set(s.x * Math.cos(a) + s.z * Math.sin(a), 0, -s.x * Math.sin(a) + s.z * Math.cos(a))
    const drop = falling ? (w.phase === 'drop' ? w.t / w.length : 1) : 0
    group.current.position.set(spot.x, -30 * drop * drop, spot.z)
    group.current.rotation.set(drop * 3, 0, drop * 2)

    if (tag.current) {
      const m = tag.current.material as MeshBasicMaterial
      const shownVote = result && result.round === w.round && w.phase !== 'vote' ? result.votes[index] : undefined
      let want: CanvasTexture | null = null
      if (shownVote !== undefined) want = shownVote === null ? badge('–', PALETTE.steelDark) : badge(String(shownVote), shownVote === 0 ? '#3d8bff' : '#34b34a')
      else if (w.phase === 'vote' && p.vote !== null) want = p.mine ? badge(String(p.vote), colour) : badge('✓', PALETTE.ink)
      tag.current.visible = !!want && !falling
      if (want && m.map !== want) {
        m.map = want
        m.needsUpdate = true
      }
      tag.current.quaternion.copy(camera.quaternion)
    }
  })
  return (
    <group ref={group}>
      <primitive object={avatar} />
      <mesh ref={tag} position={[0, 2.5, 0]} visible={false} renderOrder={6}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

export function GearScene({ live }: { live: RefObject<Game> }) {
  // Redrawn when the seats change - a new gear, a side fewer; everything else moves itself.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const cast = useRef('')
  useFrame(() => {
    const g = viewOf(live.current)
    const key = `${g.id}:${g.round}:${g.seats.join(',')}:${g.players.map((p) => p.id).join(',')}`
    if (key !== cast.current) {
      cast.current = key
      redraw()
    }
  })
  const game = viewOf(live.current)
  const background = useMemo(() => new Color(PALETTE.sky), [])
  const myColour = usePlayerColour()
  const peers = usePeers()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  return (
    <>
      <color attach="background" args={[background]} />
      <hemisphereLight args={['#ffffff', '#3a3450', 1.4]} />
      <directionalLight
        position={[6, 20, 10]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      {game.players.length > 0 ? <Gear key={`${game.id}:${game.round}:${game.seats.join(',')}`} live={live} colours={colours} /> : null}
      <Mark />
      {game.players.map((p, index) => (
        <Body key={`${game.id}:${p.id}`} index={index} live={live} colour={colours[index]} />
      ))}
    </>
  )
}
