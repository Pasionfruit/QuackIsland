/**
 * Big Backs are Near, on the screen.
 *
 * The maze is drawn in its own canvas by `NearScene`; this is the shell: the
 * keys and the mouse turned into hands for `useNearNet`, and the words - who
 * is the Hunter, the clock, and each role's own HUD.
 *
 * **Hunter: WASD to move, the mouse is your camera, Left Shift sprints - and
 * mutes your own hearing while it is held.** Hider: WASD to move, the mouse
 * is your camera. The first click takes the mouse (pointer lock); escape
 * gives it back.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { NearScene, PITCH, type LookRef } from './NearScene'
import { COLOURS, HUNTER, PITCH_LIMIT, ROUND, hearFootsteps, hearingRadius, hidersOf, summarize, type Round } from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useNearNet } from './useNearNet'

/** Radians turned per pixel of mouse movement - one sensitivity, both roles: nothing here needs Jackal's scoped-aim precision. */
export const SENSITIVITY = 0.0024

const LOOK = {
  ink: '#1b1e24',
  faded: '#767c8a',
  paper: '#eef1f5',
  danger: '#d9443a',
  good: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
}
const SPRINT_KEYS = ['ShiftLeft', 'ShiftRight']

export function NearScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : waitingRound()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const colours = round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers))
  // No `standings` handed over: a binary Hunter-vs-Hiders result does not fit
  // the podium's N-way placings, so `Over` below is this game's own card.
  const results = useFinish(round.over)
  const wire = useNearNet()
  const live = useRef(round)
  live.current = round

  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const iAmHunter = mine?.role === 'hunter'

  const look = useRef<LookRef>({ yaw: 0, pitch: 0 })
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)
  const refused = useRef(false)

  useNearSounds(round)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const idx = current.players.findIndex((p) => p.mine)
      const you = current.players[idx]
      if (you && lookFor.current !== current.id) {
        lookFor.current = current.id
        look.current = { yaw: you.yaw, pitch: you.role === 'hunter' ? you.pitch : 0.4 }
      }
      let forward = 0
      let right = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          forward += k[0]
          right += k[1]
        }
      }
      const hands = {
        forward: Math.sign(forward),
        right: Math.sign(right),
        yaw: look.current.yaw,
        pitch: look.current.pitch,
        sprint: SPRINT_KEYS.some((k) => held.current.has(k)),
      }
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.changed) setRound({ ...current })
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const isLocked = () => !!board.current && document.pointerLockElement === board.current
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!(e.code in KEYS) && !SPRINT_KEYS.includes(e.code)) return
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    const onMove = (e: MouseEvent) => {
      if (paused.current) return
      if (!isLocked() && !(refused.current && dragging.current && (e.buttons & 1) !== 0)) return
      const you = live.current.players.find((p) => p.mine)
      const hunter = you?.role === 'hunter'
      const [lo, hi] = hunter ? [-PITCH_LIMIT, PITCH_LIMIT] : [PITCH.min, PITCH.max]
      look.current.yaw -= e.movementX * SENSITIVITY
      look.current.pitch = Math.max(lo, Math.min(hi, look.current.pitch + (hunter ? -1 : 1) * e.movementY * SENSITIVITY))
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
    if (paused.current || live.current.over) return
    if (e.button !== 0) return
    const el = e.currentTarget
    const isLocked = () => document.pointerLockElement === el
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
  const t = Math.max(0, ROUND.limit - round.elapsed)
  const hiders = hidersOf(round)
  const free = hiders.filter((p) => p.alive && !p.left).length
  const pings = ready && mine && iAmHunter && !round.over ? hearFootsteps(round) : []
  const sprintMuted = mine ? hearingRadius(mine) <= 0 : false
  const caught = mine ? mine.role === 'hider' && !mine.alive : false

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Big Backs are Near</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : t}>
              <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(t)}>
                {Math.ceil(t)}s
              </span>
            </TopTimer>
            <span style={{ ...pill, background: iAmHunter ? LOOK.danger : LOOK.good, color: '#fff' }}>{iAmHunter ? 'you are the Hunter' : 'you are a Hider'}</span>
            <span style={{ ...pill, background: LOOK.faded, color: '#fff' }}>
              {free} hider{free === 1 ? '' : 's'} free
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {round.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: p.role === 'hunter' ? LOOK.danger : colours[index],
              color: '#fff',
              opacity: p.left ? 0.4 : p.role === 'hider' && !p.alive ? 0.5 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-player={p.id}
          >
            {p.role === 'hunter' ? '◎ ' : ''}
            {nameOf(p.id)}
          </span>
        ))}
      </div>

      <div ref={board} style={{ ...boardStyle, cursor: locked ? 'none' : 'crosshair' }} onPointerDown={onPointerDown} onPointerUp={() => (dragging.current = false)} data-board>
        <Stage live={live} look={look} me={me} />

        {ready && mine && !round.over && iAmHunter ? <HunterHud pings={pings} muted={sprintMuted} freeLeft={free} /> : null}
        {ready && mine && !round.over && !iAmHunter ? <HiderHud caught={caught} /> : null}

        {ready && !locked && !lockRefused && !round.over ? <div style={hint}>click to take the mouse - WASD to move</div> : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The Hunter's own HUD: a crosshair ringed by a ping for every fresh, in-range footstep, and a "can't hear" tag while sprinting. */
function HunterHud({ pings, muted, freeLeft }: { pings: { hiderId: string; distance: number; bearing: number }[]; muted: boolean; freeLeft: number }) {
  return (
    <div style={crosshairWrap}>
      <svg width={56} height={56} viewBox="-28 -28 28 28" style={{ overflow: 'visible' }}>
        <circle r={20} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        <circle r={1.8} fill="#fff" />
        {pings.map((p) => {
          const opacity = Math.max(0.15, 1 - p.distance / HUNTER.hearing)
          const r = 34
          return <circle key={p.hiderId} cx={Math.sin(p.bearing) * r} cy={-Math.cos(p.bearing) * r} r={5} fill={LOOK.danger} opacity={opacity} data-ping />
        })}
      </svg>
      <div style={ammoTag}>{freeLeft} free</div>
      {muted ? (
        <div style={{ ...ammoTag, background: LOOK.danger }} data-sprint-muted>
          sprinting — can’t hear
        </div>
      ) : null}
    </div>
  )
}

/** A Hider's own HUD: nothing but a quiet "watching" tag once caught. */
function HiderHud({ caught }: { caught: boolean }) {
  if (!caught) return null
  return <div style={watchingTag}>watching</div>
}

const Stage = memo(function Stage({ live, look, me }: { live: RefObject<Round>; look: RefObject<LookRef>; me: string }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
      }}
    >
      <NearScene live={live} look={look} me={me} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 70, near: 0.05, far: 160, position: [0, 30, 30] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

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
  const list = summarize(round)
  const mine = list.find((e) => e.player.id === me)
  const mineWon = mine ? (mine.player.role === 'hunter' ? round.winner === 'hunter' : round.winner === 'hider') : false
  const headline = round.winner === 'hider' ? 'The clock ran out - somebody stayed free!' : 'Every Hider was caught!'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{round.winner === 'hider' ? 'The Hiders win.' : 'The Hunter wins.'}</div>
        {mine ? <div style={{ ...pill, marginBottom: 12, background: mineWon ? LOOK.good : LOOK.danger, color: '#fff', display: 'inline-block' }}>{mineWon ? 'you won' : 'you lost'}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {list.map(({ player, index }) => (
            <div key={player.id} style={scoreRow} data-role={player.role}>
              <span style={{ ...dot, background: player.role === 'hunter' ? LOOK.danger : colours[index] }} />
              <span style={{ flex: 1, fontWeight: player.id === me ? 700 : 400 }}>{nameOf(player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{player.role === 'hunter' ? 'Hunter' : 'Hider'}</span>
              <span style={{ minWidth: 92, textAlign: 'right', font: `600 13px/1.4 ${FONT}`, color: player.role === 'hider' && player.alive ? LOOK.good : LOOK.faded }}>
                {player.role === 'hunter' ? '' : player.alive ? 'stayed free' : 'caught'}
              </span>
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
  background: '#cfe0a8',
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
  background: LOOK.paper,
  borderBottom: '2px solid #d7dce3',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = { padding: '3px 12px', borderRadius: 999, font: `600 12px/1.5 ${FONT}`, whiteSpace: 'nowrap' }

const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, flex: '0 0 auto', display: 'inline-block' }

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const crosshairWrap: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
}

const ammoTag: React.CSSProperties = {
  marginTop: 40,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(20,16,28,0.75)',
  color: '#fff',
  font: `800 11px/1.6 ${FONT}`,
  letterSpacing: 0.5,
}

const watchingTag: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  bottom: 14,
  padding: '4px 12px',
  borderRadius: 999,
  background: 'rgba(20,16,28,0.65)',
  color: '#fff',
  font: `600 12px/1.5 ${FONT}`,
  pointerEvents: 'none',
}

const hint: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 18,
  transform: 'translateX(-50%)',
  padding: '6px 14px',
  borderRadius: 999,
  background: 'rgba(18, 20, 28, 0.72)',
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
  padding: 16,
  boxSizing: 'border-box',
  background: 'rgba(15, 10, 20, 0.35)',
}

const overCard: React.CSSProperties = {
  width: 460,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
  boxShadow: '0 6px 0 rgba(0,0,0,0.25)',
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
  background: '#ffc94d',
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}

/** A footstep the Hunter can hear, and a Hider going down: off each player's `steppedAt` and `alive`, which every screen is sent. */
function useNearSounds(round: Round): void {
  const seen = useRef<{ id: number; by: Map<string, { alive: boolean; steppedAt: number }> }>({ id: -1, by: new Map() })
  useEffect(() => {
    const fresh = seen.current.id !== round.id
    if (fresh) seen.current = { id: round.id, by: new Map() }
    const by = seen.current.by
    const mine = round.players.find((p) => p.mine)
    const pings = mine?.role === 'hunter' ? hearFootsteps(round) : []
    const byId = new Map(pings.map((p) => [p.hiderId, p]))
    for (const p of round.players) {
      const was = by.get(p.id)
      by.set(p.id, { alive: p.alive, steppedAt: p.steppedAt })
      if (fresh || !was) continue
      if (p.role === 'hider' && was.alive && !p.alive) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
      if (p.role === 'hider' && was.steppedAt !== p.steppedAt) {
        const ping = byId.get(p.id)
        if (ping) playCue(CUES.stepDown, Math.max(0.1, 1 - ping.distance / HUNTER.hearing) * 0.6)
      }
    }
  }, [round])
}
