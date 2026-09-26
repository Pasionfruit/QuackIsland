/**
 * Jackal, on the screen.
 *
 * The lane is drawn in its own canvas by `JackalScene`; this is the shell:
 * the keys and the mouse turned into hands for `useJackalNet`, and the words
 * - who is the Sniper, the clock, and each role's own HUD.
 *
 * **Sniper: mouse to aim, left click to shoot, right click to scope in and
 * out, WASD to move round the tower.** Runner: WASD to move, the mouse is
 * your camera, Space jumps - and clears a crate or a barrel, never a tree.
 * The first click takes the mouse (pointer lock); escape gives it back.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { arenaFor, type Block } from './arena'
import { JackalScene, PITCH, type LookRef } from './JackalScene'
import {
  COLOURS,
  GUN,
  PITCH_LIMIT,
  ROUND,
  cooldownLeft,
  reloading,
  runnersOf,
  summarize,
  type Round,
} from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useJackalNet } from './useJackalNet'

/** Radians turned per pixel of mouse movement. */
export const SENSITIVITY = 0.0024

const LOOK = {
  ink: '#1b1e24',
  faded: '#767c8a',
  paper: '#eef1f5',
  sun: '#ffc94d',
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
const JUMP_KEY = 'Space'

export function JackalScreen({ run }: { run: MinigameRun }) {
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
  // No `standings` handed over: a binary Sniper-vs-Runners result does not fit
  // the podium's N-way placings, so `Over` below is this game's own card, and
  // this is what keeps `useFinish` from swapping the panel out for it.
  const results = useFinish(round.over)
  const wire = useJackalNet()
  const live = useRef(round)
  live.current = round

  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const iAmSniper = mine?.role === 'sniper'

  const look = useRef<LookRef>({ yaw: 0, pitch: 0 })
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const trigger = useRef(false)
  const scoped = useRef(false)
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)
  const refused = useRef(false)
  const [hitAt, setHitAt] = useState(-Infinity)

  useJackalSounds(round)

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
        look.current = { yaw: you.yaw, pitch: you.role === 'sniper' ? you.pitch : 0.5 }
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
        jump: held.current.has(JUMP_KEY),
        scoped: scoped.current,
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
      if (!(e.code in KEYS) && e.code !== JUMP_KEY) return
      if (e.code === JUMP_KEY) e.preventDefault()
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
      const sniper = you?.role === 'sniper'
      const [lo, hi] = sniper ? [-PITCH_LIMIT, PITCH_LIMIT] : [PITCH.min, PITCH.max]
      look.current.yaw -= e.movementX * SENSITIVITY
      look.current.pitch = Math.max(lo, Math.min(hi, look.current.pitch + (sniper ? -1 : 1) * e.movementY * SENSITIVITY))
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
    const el = e.currentTarget
    const isLocked = () => document.pointerLockElement === el
    if (e.button === 2) {
      if (isLocked() || refused.current) scoped.current = !scoped.current
      return
    }
    if (e.button !== 0) return
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
  const runners = runnersOf(round)
  const standing = runners.filter((p) => p.alive && !p.left).length
  const cooling = mine && mine.role === 'sniper' ? cooldownLeft(round, mine) / GUN.cooldown : 0
  const isReloading = mine && mine.role === 'sniper' ? reloading(round, mine) : false
  const sinceHit = (performance.now() - hitAt) / 1000

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Jackal</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : t}>
              <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(t)}>
                {Math.ceil(t)}s
              </span>
            </TopTimer>
            <span style={{ ...pill, background: iAmSniper ? LOOK.danger : LOOK.good, color: '#fff' }}>{iAmSniper ? 'you are the Sniper' : 'you are a Runner'}</span>
            <span style={{ ...pill, background: LOOK.faded, color: '#fff' }}>{standing} runner{standing === 1 ? '' : 's'} left</span>
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
              background: p.role === 'sniper' ? LOOK.danger : colours[index],
              color: '#fff',
              opacity: p.left ? 0.4 : p.role === 'runner' && !p.alive ? 0.5 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-player={p.id}
          >
            {p.role === 'sniper' ? '◎ ' : ''}
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

        {mine && mine.role === 'runner' && round.elapsed < mine.invulnerableUntil && !round.over ? <div style={invulnGlow} /> : null}

        {ready && mine && !round.over && iAmSniper ? (
          <SniperHud scoped={mine.scoped} cooling={cooling} bullets={mine.bullets} reloading={isReloading} runnersLeft={standing} sinceHit={sinceHit} />
        ) : null}

        {ready && mine && !round.over && !iAmSniper ? <RunnerHud round={round} mine={mine} /> : null}

        {ready && !locked && !lockRefused && !round.over ? (
          <div style={hint}>{iAmSniper ? 'click to take aim - left click shoots, right click scopes' : 'click to take the mouse - WASD to run, Space to vault cover'}</div>
        ) : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The Sniper's own HUD: a crosshair that widens when not scoped, bullets, the reload, and how many runners are left. */
function SniperHud({ scoped, cooling, bullets, reloading, runnersLeft, sinceHit }: { scoped: boolean; cooling: number; bullets: number; reloading: boolean; runnersLeft: number; sinceHit: number }) {
  return (
    <div style={crosshairWrap}>
      <svg width={scoped ? 40 : 56} height={scoped ? 40 : 56} viewBox="-28 -28 56 56" data-scoped={scoped}>
        {scoped ? (
          <>
            <circle r={22} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={2} />
            <line x1={-26} y1={0} x2={26} y2={0} stroke="#fff" strokeWidth={1} />
            <line x1={0} y1={-26} x2={0} y2={26} stroke="#fff" strokeWidth={1} />
          </>
        ) : (
          <>
            <circle r={20} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={4} />
            {cooling > 0 ? <circle r={20} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray={`${(1 - cooling) * 125.7} 125.7`} transform="rotate(-90)" opacity={0.85} /> : null}
            {[0, 90, 180, 270].map((a) => (
              <line key={a} x1={0} y1={-6} x2={0} y2={-12} stroke={cooling > 0 ? 'rgba(255,255,255,0.5)' : '#fff'} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a})`} />
            ))}
          </>
        )}
        <circle r={1.8} fill="#fff" />
        {sinceHit < 0.3 ? [45, 135, 225, 315].map((a) => <line key={a} x1={0} y1={-8} x2={0} y2={-16} stroke={LOOK.danger} strokeWidth={3} strokeLinecap="round" transform={`rotate(${a})`} />) : null}
      </svg>
      <div style={ammoTag} data-bullets={bullets}>
        {reloading ? 'RELOADING…' : `${bullets} bullet${bullets === 1 ? '' : 's'}`}
      </div>
      <div style={{ ...ammoTag, background: 'rgba(20,16,28,0.6)' }}>{runnersLeft} standing</div>
    </div>
  )
}

/** A runner's own HUD: lives, and which way the nearest cover is. */
function RunnerHud({ round, mine }: { round: Round; mine: Round['players'][number] }) {
  const arena = arenaFor(round.seed)
  const hint = nearestCoverHint(arena.blocks, mine)
  return (
    <div style={runnerHudWrap}>
      <div style={livesRow} data-lives={mine.lives}>
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} style={{ ...heart, opacity: i < mine.lives ? 1 : 0.25 }}>
            ♥
          </span>
        ))}
      </div>
      {hint ? <div style={coverHint}>{hint}</div> : null}
    </div>
  )
}

/** Which way, and how far, the nearest piece of cover is - "6m ahead-left", or nothing within reach. */
function nearestCoverHint(blocks: readonly Block[], mine: { x: number; z: number; yaw: number }): string | null {
  let best: { d: number; fx: number; rx: number } | null = null
  for (const b of blocks) {
    if (b.kind === 'wall' || b.kind === 'tower') continue
    const cx = (b.x0 + b.x1) / 2
    const cz = (b.z0 + b.z1) / 2
    const dx = cx - mine.x
    const dz = cz - mine.z
    const d = Math.hypot(dx, dz)
    if (d > 18 || (best && d >= best.d)) continue
    const fx = -Math.sin(mine.yaw) * dx + -Math.cos(mine.yaw) * dz
    const rx = Math.cos(mine.yaw) * dx + -Math.sin(mine.yaw) * dz
    best = { d, fx, rx }
  }
  if (!best) return null
  const fwd = best.fx > 2 ? 'ahead' : best.fx < -2 ? 'behind' : ''
  const side = best.rx > 2 ? 'right' : best.rx < -2 ? 'left' : ''
  const where = [fwd, side].filter(Boolean).join('-') || 'right here'
  return `cover ${Math.round(best.d)}m ${where}`
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
      <JackalScene live={live} look={look} me={me} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 68, near: 0.05, far: 260, position: [0, 30, 30] as [number, number, number] }
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
  const mineWon = mine ? (mine.player.role === 'sniper' ? round.winner === 'sniper' : round.winner === 'runner') : false
  const headline = round.winner === 'runner' ? 'A runner reached the base!' : 'The tower holds!'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{round.winner === 'runner' ? 'The Runners win.' : 'The Sniper wins.'}</div>
        {mine ? <div style={{ ...pill, marginBottom: 12, background: mineWon ? LOOK.good : LOOK.danger, color: '#fff', display: 'inline-block' }}>{mineWon ? 'you won' : 'you lost'}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {list.map(({ player, index }) => (
            <div key={player.id} style={scoreRow} data-role={player.role}>
              <span style={{ ...dot, background: player.role === 'sniper' ? LOOK.danger : colours[index] }} />
              <span style={{ flex: 1, fontWeight: player.id === me ? 700 : 400 }}>{nameOf(player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{player.role === 'sniper' ? 'Sniper' : 'Runner'}</span>
              <span style={{ minWidth: 92, textAlign: 'right', font: `600 13px/1.4 ${FONT}`, color: player.role === 'runner' && player.reachedBase ? LOOK.good : LOOK.faded }}>
                {player.role === 'sniper' ? '' : player.reachedBase ? 'reached base' : player.alive ? `${player.lives} lives left` : 'eliminated'}
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
  background: '#bcd9ec',
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
  transform: 'translate(-50%, -28px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
}

const ammoTag: React.CSSProperties = {
  marginTop: 6,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(20,16,28,0.75)',
  color: '#fff',
  font: `800 11px/1.6 ${FONT}`,
  letterSpacing: 0.5,
}

const runnerHudWrap: React.CSSProperties = { position: 'absolute', left: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }

const livesRow: React.CSSProperties = { display: 'flex', gap: 4 }

const heart: React.CSSProperties = { fontSize: 22, color: LOOK.danger, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }

const coverHint: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(20,16,28,0.65)',
  color: '#fff',
  font: `600 11px/1.5 ${FONT}`,
  width: 'fit-content',
}

const invulnGlow: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 60px 10px rgba(255,255,255,0.35)' }

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
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}

/** A shot fired, a hit landed, and somebody going down - off each player's `shotAt`, `lives` and `alive`, which every screen is sent. */
function useJackalSounds(round: Round): void {
  const seen = useRef<{ id: number; by: Map<string, { shot: number; lives: number; alive: boolean }> }>({ id: -1, by: new Map() })
  useEffect(() => {
    const fresh = seen.current.id !== round.id
    if (fresh) seen.current = { id: round.id, by: new Map() }
    const by = seen.current.by
    for (const p of round.players) {
      const was = by.get(p.id)
      by.set(p.id, { shot: p.shotAt, lives: p.lives, alive: p.alive })
      if (fresh || !was) continue
      if (p.role === 'sniper' && p.shotAt !== was.shot) playCue(CUES.gunShot, p.mine ? 0.6 : 0.25)
      if (was.lives > p.lives && p.alive) playCue(CUES.bump, p.mine ? 0.7 : 0.35)
      if (was.alive && !p.alive) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
    }
  }, [round])
}
