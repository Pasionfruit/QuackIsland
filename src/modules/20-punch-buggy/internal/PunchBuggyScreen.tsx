/**
 * Punch Buggy, on the screen.
 *
 * The platform is drawn in its own canvas by `PunchBuggyScene`; this is the
 * shell: the keys and the mouse in, `useRoundNet` deciding what they do, and a
 * HUD with the clock, who is still standing, and what your fist is doing.
 *
 * **WASD to move, the mouse to aim, left click to punch - and left click again
 * to pull it back.** You face the pointer whenever your arm is home; the punch
 * goes where you were aiming when you threw it.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { PunchBuggyScene } from './PunchBuggyScene'
import { COLOURS, placings, standing, timeLeft, type Intent, type Point, type Round } from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useRoundNet } from './useRoundNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  danger: '#c8443c',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function PunchBuggyScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : waitingRound()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const colours = useMemo(
    () => round.fighters.map((fighter, index) => rosterColour(fighter, index, COLOURS, myColour, peers)),
    [round.fighters, myColour, peers],
  )
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(round.over, () =>
    placings(round).map((e) => ({ id: e.fighter.id, place: e.place, name: nameOf(e.fighter.id), colour: colours[e.index], mine: e.fighter.id === me })),
  )
  const wire = useRoundNet()
  const live = useRef(round)
  live.current = round
  /** Where the pointer is on the platform, from the scene. */
  const aimAt = useRef<Point | null>(null)

  const keys = useRef({ up: false, down: false, left: false, right: false })
  const clicks = useRef(0)
  /** The round the click count belongs to. A new round starts it at zero. */
  const clicksFor = useRef(round.id)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
          k.up = down
          break
        case 'KeyS':
          k.down = down
          break
        case 'KeyA':
          k.left = down
          break
        case 'KeyD':
          k.right = down
          break
        default:
          return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    const forget = () => {
      keys.current = { up: false, down: false, left: false, right: false }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', forget)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', forget)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      if (clicksFor.current !== current.id) {
        clicksFor.current = current.id
        clicks.current = 0
      }
      const k = keys.current
      // Up on the keyboard is towards the far side of the platform.
      const mine: Intent = {
        x: (k.right ? 1 : 0) - (k.left ? 1 : 0),
        y: (k.down ? 1 : 0) - (k.up ? 1 : 0),
        clicks: clicks.current,
      }
      const me = current.fighters.find((f) => f.mine)
      const at = aimAt.current
      // Right on top of yourself there is no way to point: keep the last one.
      if (me && at && Math.hypot(at.x - me.x, at.y - me.y) > 0.3) mine.aim = Math.atan2(at.y - me.y, at.x - me.x)
      else if (me) mine.aim = me.facing
      if (wire.advance(current, dt, mine, paused.current)) setRound({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || paused.current) return
    const current = live.current
    const mine = current.fighters.find((f) => f.mine)
    if (!mine || !mine.alive || current.over) return
    clicks.current += 1
  }

  const ready = round.fighters.length > 0
  const mineIndex = round.fighters.findIndex((f) => f.mine)
  const mine = round.fighters[mineIndex]
  const left = timeLeft(round)
  usePunchSounds(round)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Punch Buggy</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : left}><span style={{ ...pill, background: left <= 5 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
              {Math.ceil(left)}s
            </span></TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }}>{standing(round).length} standing</span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {mine ? <PunchPill fighter={mine} colour={colours[mineIndex]} /> : null}
      </div>

      <div style={board} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} aim={aimAt} />
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** What your fist is doing, and what a click will do about it. */
function PunchPill({ fighter, colour }: { fighter: Round['fighters'][number]; colour: string }) {
  const text = !fighter.alive
    ? fighter.how === 'fell'
      ? 'you fell off'
      : 'you were punched out'
    : fighter.punch === 'in'
      ? 'click to punch'
      : fighter.punch === 'back'
        ? 'pulling back…'
        : 'click to pull back - you cannot move'
  return (
    <span style={{ ...pill, background: fighter.alive ? colour : LOOK.faded, color: '#fff' }} data-punch={fighter.punch}>
      {text}
    </span>
  )
}

/** The canvas, rendered once - see `PunchBuggyScene`. */
const Stage = memo(function Stage({ live, aim }: { live: RefObject<Round>; aim: RefObject<Point | null> }) {
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
      <PunchBuggyScene live={live} aim={aim} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 1, far: 400, position: [0, 30, 30] as [number, number, number] }
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
  const mine = order.find((entry) => entry.fighter.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine
    ? 'Round over'
    : mine.place === 1
      ? winners.length > 1
        ? 'Still standing!'
        : 'Last one standing!'
      : mine.fighter.how === 'fell'
        ? 'You fell off'
        : 'Punched out'
  const how = (entry: (typeof order)[number]) => {
    const f = entry.fighter
    if (f.alive) return winners.length > 1 ? 'still standing' : 'last one standing'
    const at = `${(f.outAt ?? 0).toFixed(1)}s`
    if (f.how === 'punched') return `punched by ${f.by ? nameOf(f.by) : 'somebody'} · ${at}`
    return f.by ? `knocked off by ${nameOf(f.by)} · ${at}` : `fell off · ${at}`
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
            <div key={entry.fighter.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: colours[entry.index] }} />
              <span style={{ flex: 1, fontWeight: entry.fighter.id === me ? 700 : 400 }}>{nameOf(entry.fighter.id)}</span>
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
  background: 'linear-gradient(180deg, #8ed3e8 0%, #6fc2dd 40%, #3f9fc4 100%)',
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
  background: LOOK.sand,
  borderBottom: '2px solid #ecd0a0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', cursor: 'crosshair' }

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
  background: LOOK.sand,
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
 * A fist going out, a shove, and somebody going down - off each fighter's
 * `thrownAt`, `shovedAt` and `alive`, which every screen is sent. Yours loud,
 * everybody else's quieter. A new round is only remembered, never played.
 */
function usePunchSounds(round: Round): void {
  const seen = useRef<{ seed: number; by: Map<string, { thrown: number; shoved: number; alive: boolean }> }>({
    seed: -1,
    by: new Map(),
  })
  useEffect(() => {
    const fresh = seen.current.seed !== round.seed
    if (fresh) seen.current = { seed: round.seed, by: new Map() }
    const by = seen.current.by
    for (const f of round.fighters) {
      const was = by.get(f.id)
      by.set(f.id, { thrown: f.thrownAt, shoved: f.shovedAt, alive: f.alive })
      if (fresh || !was) continue
      const loud = f.mine ? 1 : 0.4
      if (f.thrownAt !== was.thrown) playCue(CUES.launch, 0.35 * loud)
      if (f.shovedAt !== was.shoved && f.alive) playCue(CUES.bump, 0.5 * loud)
      if (was.alive && !f.alive) {
        if (f.how === 'punched') playCue(CUES.bump, 0.7)
        playCue(CUES.fallingOver, 0.6 * loud)
      }
    }
  }, [round])
}
