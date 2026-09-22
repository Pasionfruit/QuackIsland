/**
 * Color Coded, on the screen.
 *
 * The arena is drawn in its own canvas by `ColorScene`; this is the shell: the
 * keys and the mouse turned into hands for `useColorNet`, and the words - the
 * clock, the round, who is standing, what the wheel is doing, **the colour and the
 * two seconds to get on it**, and falling.
 *
 * **WASD to move, hold Shift to run, the mouse to turn the camera.** Walking is
 * relative to the camera, and you face the way it looks. The floor is ice, so what
 * the keys do is steer a slide. **Click, or Space or E, pushes** whoever is in front
 * of you; the first click on the arena takes the mouse (pointer lock) and escape gives
 * it back. A browser that will not lock gets drag-to-turn instead, and Space or E to push.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { PANEL_COLOURS, PANEL_NAMES, dealFor, wheelAngle, when } from './arena'
import { ColorScene, PITCH, type LookRef } from './ColorScene'
import { BODY, COLOURS, ROUND, clock, isStanding, placings, speedOf, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useColorNet } from './useColorNet'

/** Radians turned per pixel of mouse movement. */
export const SENSITIVITY = 0.0028

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: forward and right, relative to the camera. */
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

/** The keys that hold run, by `KeyboardEvent.code`. */
const RUN_KEYS = ['ShiftLeft', 'ShiftRight']

/** The keys that push, by `KeyboardEvent.code`. */
const PUSH_KEYS = ['Space', 'KeyE']

/** A change of speed in one frame, metres a second, that can only have been a collision: the keys cannot do it. */
const BUMPED = 3

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Forward and right keys, turned into a walk on the floor for a camera looking along `yaw`. */
export function walkFor(yaw: number, forward: number, right: number): { mx: number; mz: number } {
  const length = Math.hypot(forward, right)
  if (length < 1e-6) return { mx: 0, mz: 0 }
  const f = forward / Math.max(1, length)
  const r = right / Math.max(1, length)
  return { mx: -Math.sin(yaw) * f + Math.cos(yaw) * r, mz: -Math.cos(yaw) * f - Math.sin(yaw) * r }
}

export function ColorScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused
  /** Held for the three-two-one rather than paused with the card up: the mouse can be taken before the start. */
  const counting = useRef(run.phase === 'counting')
  counting.current = run.phase === 'counting'

  const wire = useColorNet()
  const live = useRef(game)
  live.current = game
  const look = useRef<LookRef>({ yaw: 0, pitch: 0.55 })
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  /** How many pushes have been asked for: it only goes up. */
  const pushes = useRef(0)
  /** Asks for a push: set once the keys are listened for, and used by the mouse. */
  const pushKey = useRef<() => void>(() => {})
  const going = useRef<{ id: number; vx: number; vz: number } | null>(null)
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const refused = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)

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
      let forward = 0
      let right = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          forward += k[0]
          right += k[1]
        }
      }
      const walk = walkFor(look.current.yaw, Math.sign(forward), Math.sign(right))
      const run = RUN_KEYS.some((code) => held.current.has(code))
      const hands = { ...walk, yaw: look.current.yaw, run, push: pushes.current }
      const result = wire.advance(current, dt, hands, paused.current)
      // A bump: your speed changed by more than the keys can change it in a frame.
      const after = current.players.find((p) => p.mine)
      const before = going.current
      if (after && isStanding(after) && before && before.id === current.id && !paused.current) {
        const jolt = Math.hypot(after.vx - before.vx, after.vz - before.vz)
        if (jolt > BUMPED) playCue(CUES.bump, Math.min(0.9, 0.3 + jolt / 14))
      }
      going.current = after ? { id: current.id, vx: after.vx, vz: after.vz } : null
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The keys, and the mouse while it is locked to the arena - or dragged, where it cannot be.
  useEffect(() => {
    const isLocked = () => !!board.current && document.pointerLockElement === board.current
    /** A push, asked for: counted, and heard on your own screen at once. */
    const asked = () => {
      pushes.current += 1
      playCue(CUES.bump, 0.35)
    }
    pushKey.current = asked
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (PUSH_KEYS.includes(e.code)) {
        e.preventDefault()
        if (down && !e.repeat && !paused.current && !live.current.over) asked()
        return
      }
      if (!(e.code in KEYS) && !RUN_KEYS.includes(e.code)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
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

  // Paused, or over: let go of the mouse and the keys, so the card can be clicked.
  useEffect(() => {
    if (!run.paused && !game.over) return
    held.current.clear()
    dragging.current = false
    if (board.current && document.pointerLockElement === board.current) document.exitPointerLock()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (paused.current && !counting.current) || live.current.over) return
    const el = e.currentTarget
    // Once the mouse is taken a click is a push.
    if (document.pointerLockElement === el) {
      pushKey.current()
      return
    }
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

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const t = clock(game)
  const w = when(t)
  const deal = ready ? dealFor(game.seed, w.round) : null
  useColorSounds(game)
  const standing = game.players.filter(isStanding).length
  const pace = mine && isStanding(mine) ? speedOf(mine) : 0

  let call: { text: string; sub?: string; colour?: string; dark?: boolean } | null = null
  if (ready && !game.over && deal && t >= 0) {
    if (w.phase === 'spin') call = { text: 'Spinning…', sub: 'watch the wheel' }
    else if (w.phase === 'reveal') {
      const name = PANEL_NAMES[deal.colour]
      call = { text: name.toUpperCase(), sub: `get on ${name}! ${Math.max(0, w.length - w.t).toFixed(1)}`, colour: PANEL_COLOURS[deal.colour], dark: deal.colour === 2 || deal.colour === 3 }
    } else if (w.phase === 'drop') call = { text: 'Hold on!', colour: PANEL_COLOURS[deal.colour], dark: deal.colour === 2 || deal.colour === 3 }
    else call = { text: 'Rebuilding…', sub: `round ${w.round + 1} next` }
  }

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' } | null = null
  if (ready && !game.over && mine) {
    if (mine.out !== null) {
      const by = mine.by !== null ? game.players[mine.by] : null
      banner = t - mine.out < 3 ? { text: 'You fell!', sub: by ? `${nameOf(by.id)} knocked you off` : 'watching the rest', tone: 'out' } : { text: 'Out - watching the rest', tone: 'hint' }
    } else if (!locked && !lockRefused) banner = { text: 'Click to take the camera', sub: 'hold Shift to run · click or Space to push - it is ice', tone: 'hint' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Color Coded</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : ROUND.limit - Math.max(0, t)}>
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}>
                {minutes(Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t))))}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-round={w.round}>
              round {w.round}
            </span>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-standing={standing}>
              {standing} standing
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = colours[index]
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: isStanding(p) ? colour : 'rgba(255,255,255,0.85)',
                color: isStanding(p) ? '#fff' : LOOK.faded,
                boxShadow: isStanding(p) ? 'none' : `inset 0 0 0 2px ${colour}`,
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-out={p.out ?? ''}
              data-kills={p.kills}
            >
              {nameOf(p.id)}
              {p.kills > 0 ? ` · ${p.kills} knocked off` : ''}
            </span>
          )
        })}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: locked ? 'none' : 'pointer' }}
        onPointerDown={onPointerDown}
        onPointerUp={() => (dragging.current = false)}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} look={look} />

        {mine && mine.out !== null && t - mine.out < 0.8 && !game.over ? <div style={{ ...flash, opacity: 1 - (t - mine.out) / 0.8 }} /> : null}

        {call ? (
          <div style={callWrap} data-phase={w.phase} data-colour={w.phase === 'spin' ? '' : deal?.colour}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MiniWheel angle={wheelAngle(game.seed, Math.max(0, t))} />
              <div style={{ ...callBox, background: call.colour ?? 'rgba(42,34,51,0.8)', color: call.dark ? LOOK.ink : '#fff' }}>{call.text}</div>
            </div>
            {call.sub ? <div style={callSub}>{call.sub}</div> : null}
          </div>
        ) : null}

        {ready && mine && isStanding(mine) && !game.over ? (
          <div style={speedo} data-speed={pace.toFixed(1)} data-running={mine.run ? 1 : 0}>
            <div style={{ ...speedoFill, width: `${Math.min(1, pace / BODY.run) * 100}%`, background: mine.run ? 'rgba(255,201,77,0.85)' : 'rgba(255,255,255,0.45)' }} />
            <span style={speedoText}>{mine.run ? 'running' : 'Shift to run · click or Space to push'}</span>
          </div>
        ) : null}

        {banner ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The giant wheel, small, beside the call - so the spin is on the screen
 * whichever way the camera faces. Turned the same way as the one in the sky:
 * counter-clockwise by `angle`, the segment at the top the colour.
 */
function MiniWheel({ angle }: { angle: number }) {
  const r = 26
  const n = PANEL_COLOURS.length
  const wedge = (k: number) => {
    // SVG's y runs down, so a counter-clockwise turn in the sky is a negative angle here.
    const a0 = -((k * Math.PI * 2) / n + angle)
    const a1 = -(((k + 1) * Math.PI * 2) / n + angle)
    return `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 0 0 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`
  }
  return (
    <svg width={64} height={68} viewBox="-32 -36 64 68" aria-hidden data-wheel>
      <circle r={r + 3} fill="#fdf6e8" />
      {PANEL_COLOURS.map((c, k) => (
        <path key={c} d={wedge(k)} fill={c} />
      ))}
      <circle r={4} fill={LOOK.ink} />
      <path d={`M-6 ${-r - 8} L6 ${-r - 8} L0 ${-r + 2} Z`} fill={LOOK.ink} />
    </svg>
  )
}

/** The canvas, rendered once - see `ColorScene`. */
const Stage = memo(function Stage({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
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
      <ColorScene live={live} look={look} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 60, near: 0.1, far: 400, position: [0, 12, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * The wheel whirring as it spins, a two-second sting while the colour is up, a
 * crash as the panels drop, and a fall for anybody going - louder if it is you.
 * Off the clock and the players every screen has; a new game is only
 * remembered.
 */
function useColorSounds(game: Game): void {
  const seen = useRef<{ id: number; phase: string; out: Set<string> }>({ id: -1, phase: '', out: new Set() })
  useEffect(() => {
    const s = seen.current
    const fresh = s.id !== game.id
    if (fresh) seen.current = { id: game.id, phase: '', out: new Set(game.players.filter((p) => p.out !== null).map((p) => p.id)) }
    const now = seen.current
    if (game.players.length === 0 || game.over || clock(game) < 0) return
    const w = when(clock(game))
    const phase = `${w.round}:${w.phase}`
    if (phase !== now.phase) {
      now.phase = phase
      if (w.phase === 'spin') playCue(CUES.spinning, 0.45)
      else if (w.phase === 'reveal') playCue(CUES.suspense, 0.55)
      else if (w.phase === 'drop') playCue(CUES.woodenBridgeCollapse, 0.6)
    }
    for (const p of game.players) {
      if (p.out === null || now.out.has(p.id)) continue
      now.out.add(p.id)
      playCue(CUES.fallingOver, p.mine ? 0.7 : 0.35)
    }
  }, [game])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#8fd0f2',
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
  borderBottom: '2px solid #ddd3e8',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const flash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,255,255,0) 30%, rgba(40,60,120,0.55) 100%)',
}

const callWrap: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
}

const callBox: React.CSSProperties = {
  padding: '6px 26px',
  borderRadius: 16,
  font: `900 30px/1.2 ${FONT}`,
  letterSpacing: 1,
  boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
}

const callSub: React.CSSProperties = { color: '#fff', font: `800 16px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }

const speedo: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 20,
  transform: 'translateX(-50%)',
  width: 260,
  height: 18,
  borderRadius: 999,
  background: 'rgba(42,34,51,0.55)',
  overflow: 'hidden',
  pointerEvents: 'none',
}

const speedoFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(255,255,255,0.45)' }

const speedoText: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  textAlign: 'center',
  color: '#fff',
  font: `800 11px/18px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 56,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
  padding: '0 16px',
}

const bannerBox: React.CSSProperties = {
  maxWidth: '100%',
  padding: '6px 18px',
  borderRadius: 14,
  font: `800 20px/1.25 ${FONT}`,
  textAlign: 'center',
}

const TONES: Record<'out' | 'hint', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
