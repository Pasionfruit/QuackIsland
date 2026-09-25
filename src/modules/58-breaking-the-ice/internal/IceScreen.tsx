/**
 * Breaking the Ice, on the screen.
 *
 * The iceberg is drawn in its own canvas by `IceScene`; this is the shell:
 * the keys and the mouse turned into hands for `useIceNet`, and the words -
 * the clock, who is still standing, and what the ice under you is doing.
 *
 * **WASD to move, the mouse to look round - it is your camera too. Wherever
 * you walk, the ice cracks under you and is gone three seconds later, whether
 * you are still on it or not. Space jumps. Right click pushes** whoever is in
 * front of you. The first click on the ice takes the mouse (pointer lock);
 * escape gives it back. A browser that will not lock gets drag-to-turn instead.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { IceScene, PITCH, type LookRef } from './IceScene'
import { useIceNet } from './useIceNet'
import {
  COLOURS,
  broken,
  cracked,
  forward,
  placings,
  rightOf,
  standing,
  tileAt,
  timeLeft,
  type Intent,
  type Round,
} from './rules'
import { myId, newRound, waitingRound } from './setup'

/** Radians turned per pixel of mouse movement. */
export const SENSITIVITY = 0.0026

const LOOK = {
  ink: '#123a4a',
  faded: '#5c8a9c',
  frost: '#e7f6fb',
  sun: '#ffc94d',
  danger: '#c8443c',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that move, by `KeyboardEvent.code`: forward and right, relative to the camera. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  KeyS: [-1, 0],
  KeyD: [0, 1],
  KeyA: [0, -1],
}

/** Forward and right keys, turned into a move for a camera looking along `yaw`. */
function walk(yaw: number, fwd: number, rt: number): { x: number; z: number } {
  const length = Math.hypot(fwd, rt)
  if (length < 1e-6) return { x: 0, z: 0 }
  const f = forward(yaw)
  const r = rightOf(yaw)
  const fn = fwd / Math.max(1, length)
  const rn = rt / Math.max(1, length)
  return { x: f.x * fn + r.x * rn, z: f.z * fn + r.z * rn }
}

export function IceScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : waitingRound()))
  const paused = useRef(run.paused)
  paused.current = run.paused
  const counting = useRef(run.phase === 'counting')
  counting.current = run.phase === 'counting'

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const colours = round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers))
  const results = useFinish(round.over, () =>
    placings(round).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const wire = useIceNet()
  const live = useRef(round)
  live.current = round

  const look = useRef<LookRef>({ yaw: 0, pitch: 0.55 })
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const jumps = useRef(0)
  const pushes = useRef(0)
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const refused = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)

  useIceSounds(round)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const mine = current.players.find((p) => p.mine)
      if (mine && lookFor.current !== current.id) {
        lookFor.current = current.id
        look.current = { yaw: mine.yaw, pitch: 0.55 }
      }
      let f = 0
      let r = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          f += k[0]
          r += k[1]
        }
      }
      const move = walk(look.current.yaw, Math.sign(f), Math.sign(r))
      const intent: Intent = { x: move.x, z: move.z, yaw: look.current.yaw, jumps: jumps.current, pushes: pushes.current }
      if (wire.advance(current, dt, intent, paused.current)) setRound({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const isLocked = () => !!board.current && document.pointerLockElement === board.current
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (down && !e.repeat && !paused.current && !live.current.over) jumps.current += 1
        return
      }
      if (!(e.code in KEYS)) return
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    const onMove = (e: MouseEvent) => {
      if (paused.current && !counting.current) return
      if (!isLocked() && !(refused.current && dragging.current && (e.buttons & 1) !== 0)) return
      look.current.yaw -= e.movementX * SENSITIVITY
      look.current.pitch = Math.max(PITCH.min, Math.min(PITCH.max, look.current.pitch + e.movementY * SENSITIVITY))
    }
    const onLockChange = () => setLocked(isLocked())
    const onLockError = () => {
      refused.current = true
      setLockRefused(true)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', onLockError)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', onLockError)
      if (isLocked()) document.exitPointerLock()
    }
  }, [])

  useEffect(() => {
    if (!run.paused && !round.over) return
    held.current.clear()
    dragging.current = false
    if (board.current && document.pointerLockElement === board.current) document.exitPointerLock()
  }, [run.paused, round.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((paused.current && !counting.current) || live.current.over) return
    const el = e.currentTarget
    const isLocked = () => document.pointerLockElement === el
    if (e.button === 2) {
      if (isLocked() || refused.current) pushes.current += 1
      return
    }
    if (e.button !== 0) return
    if (isLocked()) return
    if (refused.current) {
      dragging.current = true
      return
    }
    try {
      const asked = el.requestPointerLock() as unknown
      if (asked instanceof Promise) asked.catch(() => document.dispatchEvent(new Event('pointerlockerror')))
    } catch {
      document.dispatchEvent(new Event('pointerlockerror'))
    }
  }

  const ready = round.players.length > 0
  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const left = timeLeft(round)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Breaking the Ice</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : left}>
              <span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
                {Math.ceil(left)}s
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }}>{standing(round).length} standing</span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {mine ? <IcePill round={round} mine={mine} colour={colours[mineIndex]} /> : null}
      </div>

      <div ref={board} style={board2} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} look={look} />
        {ready && !locked && !lockRefused && mine?.alive && !round.over ? (
          <div style={hint}>click to take the mouse - walking cracks the ice, right click pushes</div>
        ) : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** What the ice under you is doing. */
function IcePill({ round, mine, colour }: { round: Round; mine: Round['players'][number]; colour: string }) {
  let text = 'on solid ice'
  if (!mine.alive) text = 'in the sea'
  else if (!mine.grounded) text = 'falling…'
  else {
    const { row, col } = tileAt(mine.x, mine.z)
    if (cracked(round.tiles, mine.layer, row, col, round.elapsed)) text = 'cracking under you!'
    else if (broken(round.tiles, mine.layer, row, col, round.elapsed)) text = 'giving way…'
  }
  return (
    <span style={{ ...pill, background: mine.alive ? colour : LOOK.faded, color: '#fff' }} data-standing={mine.grounded}>
      {text}
    </span>
  )
}

/** The canvas, rendered once - see `IceScene`. */
const Stage = memo(function Stage({ live, look }: { live: RefObject<Round>; look: RefObject<LookRef> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <IceScene live={live} look={look} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 62, near: 0.1, far: 400, position: [0, 14, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: last one standing first, then by how long everybody lasted. */
function Over({
  round,
  me,
  nameOf,
  colours,
  onAgain,
}: {
  round: Round
  me: string
  nameOf: (id: string) => string
  colours: readonly string[]
  onAgain: (() => void) | null
}) {
  const order = placings(round)
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine
    ? 'Round over'
    : mine.place === 1
      ? winners.length > 1
        ? 'Still standing!'
        : 'Last one standing!'
      : 'You fell in'
  const how = (entry: (typeof order)[number]) => {
    if (entry.player.alive) return winners.length > 1 ? 'still standing' : 'last one standing'
    return `fell in · ${(entry.player.eliminatedAt ?? 0).toFixed(1)}s`
  }
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {winners.length > 1 ? `Time ran out with ${winners.length} still standing.` : 'Nobody else is left.'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: colours[entry.index] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{how(entry)}</span>
            </div>
          ))}
        </div>
        {onAgain ? (
          <button type="button" onClick={onAgain} style={againButton} data-again>
            again
          </button>
        ) : (
          <div style={{ ...againButton, opacity: 0.55, textAlign: 'center' }}>waiting for the host</div>
        )}
      </div>
    </div>
  )
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #cdeaf6 0%, #9fd3ea 40%, #4f9fc4 100%)',
  color: LOOK.ink,
  font: `14px/1.5 ${FONT}`,
  userSelect: 'none',
}

const hud: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: LOOK.frost,
  borderBottom: '2px solid #bfe4f2',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board2: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', cursor: 'crosshair' }

const hint: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 18,
  transform: 'translateX(-50%)',
  padding: '6px 14px',
  borderRadius: 999,
  background: 'rgba(18, 58, 74, 0.72)',
  color: '#fff',
  font: `600 12px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(12, 40, 55, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 360,
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.frost,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const scoreRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const againButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}

/**
 * A crack, a break, a push landing, and somebody going under - off each
 * player's tile state and `eliminatedAt`, which every screen already has.
 * Yours loud, everybody else's quieter. A new round is only remembered,
 * never played.
 */
function useIceSounds(round: Round): void {
  const seen = useRef<{ seed: number; alive: Map<string, boolean> }>({ seed: -1, alive: new Map() })
  useEffect(() => {
    const fresh = seen.current.seed !== round.seed
    if (fresh) seen.current = { seed: round.seed, alive: new Map() }
    const alive = seen.current.alive
    for (const p of round.players) {
      const was = alive.get(p.id)
      alive.set(p.id, p.alive)
      if (fresh || was === undefined) continue
      if (was && !p.alive) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
    }
  }, [round])
}
