/**
 * Mama Tank, on the screen.
 *
 * The field is drawn in its own canvas by `MamaScene`; this is the shell:
 * the keys and the mouse turned into hands for `useMamaNet`, and the words -
 * who drives Mama Tank, the clock, and each role's own HUD.
 *
 * **Both roles share exactly the same controls**: WASD to move, the mouse
 * aims and is your camera, left click fires. Unlike Jackal (which branches
 * hard on role), this screen does not: the only thing that differs between
 * Mama Tank and a mini tank is what the HUD says. The first click takes the
 * mouse (pointer lock); escape gives it back.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { MamaScene, PITCH, type LookRef } from './MamaScene'
import { COLOURS, MAMA, MINI, ROUND, cooldownLeft, minisOf, summarize, type Round } from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useMamaNet } from './useMamaNet'

/** Radians turned per pixel of mouse movement - one shared sensitivity, both roles. */
export const SENSITIVITY = 0.0022

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

export function MamaScreen({ run }: { run: MinigameRun }) {
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
  // No `standings` handed over: a binary Mama-Tank-vs-mini-tanks result does
  // not fit the podium's N-way placings, so `Over` below is this game's own
  // card.
  const results = useFinish(round.over)
  const wire = useMamaNet()
  const live = useRef(round)
  live.current = round

  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const iAmMama = mine?.role === 'mama'

  const look = useRef<LookRef>({ yaw: 0, pitch: 0 })
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const trigger = useRef(false)
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)
  const refused = useRef(false)
  const [hitAt, setHitAt] = useState(-Infinity)

  useMamaSounds(round)

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
        look.current = { yaw: you.yaw, pitch: you.pitch }
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
        fire: trigger.current,
      }
      trigger.current = false
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.shot && result.shot.hit >= 0) setHitAt(now)
      if (result.changed) setRound({ ...current })
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const isLocked = () => !!board.current && document.pointerLockElement === board.current
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!(e.code in KEYS)) return
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    const onMove = (e: MouseEvent) => {
      if (paused.current) return
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
    if (paused.current || live.current.over) return
    if (e.button !== 0) return
    const el = e.currentTarget
    const isLocked = () => document.pointerLockElement === el
    if (isLocked()) {
      trigger.current = true
      return
    }
    if (refused.current) {
      dragging.current = true
      trigger.current = true
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
  const minis = minisOf(round)
  const standing = minis.filter((p) => p.alive && !p.left).length
  const cooling = mine ? cooldownLeft(round, mine) / (mine.role === 'mama' ? MAMA.cooldown : MINI.cooldown) : 0
  const sinceHit = (performance.now() - hitAt) / 1000
  const eliminated = mine ? mine.role === 'mini' && !mine.alive : false

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Mama Tank</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : t}>
              <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(t)}>
                {Math.ceil(t)}s
              </span>
            </TopTimer>
            <span style={{ ...pill, background: iAmMama ? LOOK.danger : LOOK.good, color: '#fff' }}>{iAmMama ? 'you are Mama Tank' : 'you are a mini tank'}</span>
            <span style={{ ...pill, background: LOOK.faded, color: '#fff' }} data-hits-on-mama={round.hitsOnMama}>
              hits on Mama: {round.hitsOnMama}/{round.hitsNeeded}
            </span>
            {iAmMama ? (
              <span style={{ ...pill, background: LOOK.faded, color: '#fff' }}>
                {standing} mini tank{standing === 1 ? '' : 's'} left
              </span>
            ) : null}
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
              background: p.role === 'mama' ? LOOK.danger : colours[index],
              color: '#fff',
              opacity: p.left ? 0.4 : p.role === 'mini' && !p.alive ? 0.5 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-player={p.id}
          >
            {p.role === 'mama' ? '◆ ' : ''}
            {nameOf(p.id)}
          </span>
        ))}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: locked ? 'none' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerUp={() => (dragging.current = false)}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} look={look} me={me} />

        {ready && mine && !round.over && !eliminated ? <Reticle cooling={cooling} sinceHit={sinceHit} /> : null}

        {ready && !round.over && eliminated ? <div style={eliminatedTag}>your tank is out - watching the rest of the round</div> : null}

        {ready && !locked && !lockRefused && !round.over ? <div style={hint}>click to take the mouse - WASD to move, left click fires</div> : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The shared reticle both roles fire from: a crosshair with a cooldown ring, and a flash the instant a shot of yours lands. */
function Reticle({ cooling, sinceHit }: { cooling: number; sinceHit: number }) {
  return (
    <div style={crosshairWrap}>
      <svg width={44} height={44} viewBox="-22 -22 44 44">
        <circle r={17} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        {cooling > 0 ? <circle r={17} fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray={`${(1 - cooling) * 106.8} 106.8`} transform="rotate(-90)" opacity={0.85} /> : null}
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={0} y1={-5} x2={0} y2={-10} stroke={cooling > 0 ? 'rgba(255,255,255,0.5)' : '#fff'} strokeWidth={2} strokeLinecap="round" transform={`rotate(${a})`} />
        ))}
        <circle r={1.6} fill="#fff" />
        {sinceHit < 0.3 ? [45, 135, 225, 315].map((a) => <line key={a} x1={0} y1={-7} x2={0} y2={-14} stroke={LOOK.danger} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a})`} />) : null}
      </svg>
    </div>
  )
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
      <MamaScene live={live} look={look} me={me} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 62, near: 0.05, far: 260, position: [0, 40, 40] as [number, number, number] }
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
  const mineWon = mine ? (mine.player.role === 'mama' ? round.winner === 'mama' : round.winner === 'mini') : false
  const headline = round.winner === 'mini' ? 'The mini tanks win!' : 'Mama Tank wins!'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 6 }}>
          hits on Mama: {round.hitsOnMama}/{round.hitsNeeded}
        </div>
        {mine ? <div style={{ ...pill, marginBottom: 12, background: mineWon ? LOOK.good : LOOK.danger, color: '#fff', display: 'inline-block' }}>{mineWon ? 'you won' : 'you lost'}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {list.map(({ player, index }) => (
            <div key={player.id} style={scoreRow} data-role={player.role}>
              <span style={{ ...dot, background: player.role === 'mama' ? LOOK.danger : colours[index] }} />
              <span style={{ flex: 1, fontWeight: player.id === me ? 700 : 400 }}>{nameOf(player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{player.role === 'mama' ? 'Mama Tank' : 'mini tank'}</span>
              <span style={{ minWidth: 110, textAlign: 'right', font: `600 13px/1.4 ${FONT}`, color: player.role === 'mini' && !player.alive ? LOOK.faded : LOOK.good }}>
                {player.role === 'mama' ? '' : player.alive ? 'made it through' : 'eliminated'}
                {player.role === 'mini' && player.hits > 0 ? ` · ${player.hits} hit${player.hits === 1 ? '' : 's'}` : ''}
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
  background: '#cfe0ea',
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
  pointerEvents: 'none',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
}

const eliminatedTag: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 18,
  transform: 'translateX(-50%)',
  padding: '6px 14px',
  borderRadius: 999,
  background: 'rgba(18, 20, 28, 0.72)',
  color: '#fff',
  font: `600 12px/1.4 ${FONT}`,
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

/** A shot fired, a hit landed on Mama, and a mini tank going down - off each player's `shotAt`, `hits` and `alive`, which every screen is sent. */
function useMamaSounds(round: Round): void {
  const seen = useRef<{ id: number; by: Map<string, { shot: number; hits: number; alive: boolean }> }>({ id: -1, by: new Map() })
  useEffect(() => {
    const fresh = seen.current.id !== round.id
    if (fresh) seen.current = { id: round.id, by: new Map() }
    const by = seen.current.by
    for (const p of round.players) {
      const was = by.get(p.id)
      by.set(p.id, { shot: p.shotAt, hits: p.hits, alive: p.alive })
      if (fresh || !was) continue
      if (p.shotAt !== was.shot) playCue(CUES.gunShot, p.mine ? 0.6 : 0.25)
      if (p.hits > was.hits) playCue(CUES.bump, p.mine ? 0.7 : 0.35)
      if (was.alive && !p.alive) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
    }
  }, [round])
}
