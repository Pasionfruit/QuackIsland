/**
 * Shanty Matrix, on the screen.
 *
 * The ship is drawn in its own canvas by `DeckScene`; this is the shell: the
 * keys and the clicks turned into hands for `useDeckNet`, and the words - how
 * long the barrage has left, how fierce it is, who is still aboard, a red edge
 * round the screen while a lit lane runs under you, a *close shave!* when one
 * only just misses, and how you went over the side.
 *
 * **WASD to move** (W is towards the bow), **left click or Space to shove**
 * whoever is in front of you - the way you last walked.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { SHOT, activeShots, ballAt, barrageFor, fierceness, offLine, alongLine } from './deck'
import { DeckScene } from './DeckScene'
import { BODY, COLOURS, PUSH, ROUND, clock, cooldownLeft, hitRange, isStanding, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useDeckNet } from './useDeckNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f7f0e2',
  sun: '#ffc94d',
  red: '#d9443a',
  sea: '#1f78a8',
  gold: '#e0a526',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: east and south. W is north, towards the bow. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
}

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** How hot the barrage is, in words, from `fierceness`. */
function heat(f: number): string {
  return f < 0.25 ? 'calm seas' : f < 0.5 ? 'broadside' : f < 0.8 ? 'heavy fire' : 'all guns!'
}

/**
 * Whether a lit lane runs under a point at `t`: a ball fired and not yet past
 * it, whose reach covers it. What the red edge round the screen means.
 */
export function inALane(seed: number, t: number, x: number, z: number): boolean {
  for (const shot of activeShots(seed, t)) {
    const ball = ballAt(shot, t)
    if (!ball || ball.stage === 'outgoing') continue
    if (offLine(shot, x, z) < hitRange(shot.radius) && alongLine(shot, x, z) > ball.s - shot.radius) return true
  }
  return false
}

export function DeckScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = useDeckNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const clicks = useRef(0)
  /** Balls that came close and missed you, and when the last one did. */
  const shaves = useRef<{ game: number; seen: Set<number>; at: number }>({ game: -1, seen: new Set(), at: -Infinity })

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      let mx = 0
      let mz = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          mx += k[0]
          mz += k[1]
        }
      }
      const length = Math.hypot(mx, mz)
      const hands = { mx: length > 0 ? mx / length : 0, mz: length > 0 ? mz / length : 0, clicks: clicks.current }
      clicks.current = 0
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.shoved !== null) playCue(CUES.bump, result.shoved > 0 ? 0.6 : 0.3)
      noticeShaves(current)
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  /** A ball rolling past within an arm's length of you, and you still standing after it: a close shave. */
  const noticeShaves = (g: Game) => {
    const mine = g.players.find((p) => p.mine)
    if (shaves.current.game !== g.id) shaves.current = { game: g.id, seen: new Set(), at: -Infinity }
    if (!mine || !isStanding(mine) || g.over || g.players.length === 0) return
    const t = clock(g)
    for (const shot of activeShots(g.seed, t)) {
      const ball = ballAt(shot, t)
      if (!ball || ball.stage !== 'deck' || shaves.current.seen.has(shot.k)) continue
      const d = Math.hypot(mine.x - ball.x, mine.z - ball.z)
      // Just past you, and close: it missed.
      if (d < hitRange(shot.radius) + 0.4 && alongLine(shot, mine.x, mine.z) < ball.s - BODY.radius) {
        shaves.current.seen.add(shot.k)
        shaves.current.at = t
      }
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (down && !e.repeat && !paused.current && !live.current.over) clicks.current += 1
        return
      }
      if (!(e.code in KEYS)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (run.paused || game.over) held.current.clear()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    clicks.current += 1
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const t = clock(game)
  useDeckSounds(game)
  const standing = game.players.filter(isStanding).length
  const shoveLeft = mine ? cooldownLeft(game, mine) / PUSH.cooldown : 0
  const left = ROUND.limit - Math.max(0, t)
  const f = fierceness(t)
  const alive = !!mine && isStanding(mine) && !game.over && ready
  const danger = alive && t >= 0 && inALane(game.seed, t, mine.x, mine.z)
  const shaved = alive && t - shaves.current.at < 0.7

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' | 'good' | 'warn' } | null = null
  if (ready && !game.over && mine) {
    const by = mine.by !== null ? game.players[mine.by] : null
    if (mine.out !== null) {
      banner =
        t - mine.out < 3
          ? { text: 'Overboard!', sub: by ? `${nameOf(by.id)} shoved you into a cannonball` : 'a cannonball got you', tone: 'out' }
          : { text: 'Overboard - watching the rest', tone: 'hint' }
    } else if (t < 4) banner = { text: 'Dodge the cannonballs!', sub: 'a red lane means one is coming · click or Space to shove', tone: 'hint' }
    else if (shaved) banner = { text: 'Close shave!', tone: 'good' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Shanty Matrix</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : left}>
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(left))}>
                {minutes(Math.max(0, Math.ceil(left)))}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: f < 0.5 ? LOOK.sea : LOOK.red, color: '#fff' }} data-heat={f.toFixed(2)}>
              {heat(f)}
            </span>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-standing={standing}>
              {standing} aboard
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
              {p.kills > 0 ? ` · ${p.kills} sunk` : ''}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />

        {danger ? <div style={edge} data-danger /> : null}
        {mine && mine.out !== null && t - mine.out < 0.7 && !game.over ? <div style={{ ...flash, opacity: 1 - (t - mine.out) / 0.7 }} /> : null}

        {alive ? (
          <div style={meter} data-cooldown={shoveLeft.toFixed(2)}>
            <div style={{ ...meterFill, width: `${(1 - shoveLeft) * 100}%` }} />
            <span style={meterText}>{shoveLeft > 0 ? 'shove…' : 'click / space: shove'}</span>
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

/** The canvas, rendered once - see `DeckScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
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
      <DeckScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 55, near: 0.1, far: 400, position: [0, 20, 15] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * A boom for every ball fired - softer for those further off - a thud and a
 * fall for anybody going overboard. Off the clock and the players every screen
 * has; a new game is only remembered.
 */
function useDeckSounds(game: Game): void {
  const seen = useRef<{ id: number; fired: number; gone: Set<string> }>({ id: -1, fired: 0, gone: new Set() })
  useEffect(() => {
    const fresh = seen.current.id !== game.id
    if (fresh) seen.current = { id: game.id, fired: -1, gone: new Set(game.players.filter((p) => !isStanding(p)).map((p) => p.id)) }
    const s = seen.current
    if (game.players.length === 0 || game.over) return
    const t = clock(game)
    const shots = barrageFor(game.seed)
    let fired = 0
    while (fired < shots.length && shots[fired].fire <= t) fired++
    // Only booms from now on: a guest arriving late, or a fresh game, does not hear a backlog.
    if (s.fired < 0) s.fired = fired
    for (let k = s.fired; k < fired; k++) {
      // Two fired in the same instant are one boom.
      if (k > s.fired && shots[k].fire - shots[k - 1].fire < SHOT.stagger / 2) continue
      playCue(CUES.gunShot, 0.28)
    }
    s.fired = fired
    for (const p of game.players) {
      if (isStanding(p) || s.gone.has(p.id)) continue
      s.gone.add(p.id)
      if (p.out !== null) {
        playCue(CUES.bonk, p.mine ? 0.8 : 0.45)
        playCue(CUES.fallingOver, p.mine ? 0.7 : 0.35)
      }
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
  background: '#9fd6f2',
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
  borderBottom: '2px solid #e2d3b4',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const edge: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 70px 14px rgba(230,40,30,0.55)',
}

const flash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.2) 30%, rgba(20,60,110,0.65) 100%)',
}

const meter: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 20,
  transform: 'translateX(-50%)',
  width: 190,
  height: 20,
  borderRadius: 999,
  background: 'rgba(42,34,51,0.65)',
  overflow: 'hidden',
  pointerEvents: 'none',
}

const meterFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(255,255,255,0.45)' }

const meterText: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  textAlign: 'center',
  color: '#fff',
  font: `800 11px/20px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 18,
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

const TONES: Record<'out' | 'hint' | 'good' | 'warn', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(247,240,226,0.94)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  good: { background: LOOK.gold, color: LOOK.ink, transform: 'rotate(1.5deg)' },
  warn: { background: LOOK.sun, color: LOOK.ink },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
