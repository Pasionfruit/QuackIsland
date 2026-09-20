/**
 * Highest In The Room, on the screen.
 *
 * The towers are drawn in their own canvas by `TowerScene`; this is the shell:
 * the keys turned into presses for `useTowerNet`, and the words - the clock,
 * who is still climbing and how far behind, **the arrow to press and a small
 * preview of the one after it** - and what just happened.
 *
 * **W A S D - press the key for the arrow on the screen**: W up, S down, A left,
 * D right. Holding a key down presses it once. When you get one right, the arrow
 * you were on slides away, the preview grows into its place and a new preview
 * slides in behind it, so there is never a jump to look for the next arrow.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { TowerScene } from './TowerScene'
import { CLIMB, COLOURS, ROUND, arrowAt, arrowFor, behind, clock, isIn, nextArrowFor, placings, type Arrow, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useTowerNet } from './useTowerNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys, by `KeyboardEvent.code`: W up, S down, A left, D right. */
export const KEYS: Record<string, Arrow> = { KeyW: 0, KeyS: 1, KeyA: 2, KeyD: 3 }
/** How each arrow is drawn: its glyph. */
export const GLYPHS = ['↑', '↓', '←', '→'] as const
/** The key that presses each arrow, as it is written on the arrow. */
export const KEYCAPS = ['W', 'S', 'A', 'D'] as const

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function TowerScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = useTowerNet()
  const live = useRef(game)
  live.current = game
  const keys = useRef<Arrow[]>([])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const pressed = keys.current.splice(0)
      const result = wire.advance(live.current, dt, pressed, paused.current)
      for (const ok of result.pressed) playCue(ok ? CUES.bump : CUES.woodenBridgeCollapse, ok ? 0.25 : 0.55)
      if (result.changed) setGame({ ...live.current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // W A S D: each press once, never a held key's repeats. A key with control, alt or the
  // system key held is the browser's or the system's - Ctrl+W closes the tab - not a press.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!(e.code in KEYS) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.repeat || paused.current || live.current.over) return
      keys.current.push(KEYS[e.code])
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [])

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const t = clock(game)
  useTowerSounds(game)
  const climbing = game.players.filter(isIn).length
  const gap = mine ? behind(game, mine) : 0

  let banner: { text: string; sub?: string; tone: 'out' | 'warn' | 'hint' } | null = null
  if (ready && !game.over && mine) {
    if (mine.out !== null) banner = t - mine.out < 3 ? { text: 'Knocked out', sub: `${CLIMB.behind} blocks behind - watching the rest`, tone: 'out' } : { text: 'Out - watching the rest', tone: 'hint' }
    else if (game.elapsed - mine.wrongAt < 0.9) banner = { text: `Wrong - down ${CLIMB.knock}`, tone: 'out' }
    else if (gap >= CLIMB.behind - 3) banner = { text: `${CLIMB.behind - gap} from out!`, sub: 'climb!', tone: 'warn' }
    else if (t < 3 && mine.typed === 0) banner = { text: 'Press the arrow', sub: 'W A S D - every right one is a block higher', tone: 'hint' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Highest In The Room</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : ROUND.limit - Math.max(0, t)}>
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}>
                {minutes(Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t))))}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-climbing={climbing}>
              {climbing} climbing
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = COLOURS[index % COLOURS.length]
          const down = behind(game, p)
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: isIn(p) ? colour : 'rgba(255,255,255,0.85)',
                color: isIn(p) ? '#fff' : LOOK.faded,
                boxShadow: isIn(p) ? 'none' : `inset 0 0 0 2px ${colour}`,
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-height={p.height}
              data-out={p.out ?? ''}
            >
              {nameOf(p.id)} · {p.height}
              {isIn(p) && down > 0 ? ` (−${down})` : ''}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} data-board>
        <Stage live={live} />

        {mine && game.elapsed - mine.wrongAt < 0.4 && !game.over ? <div style={{ ...flash, opacity: 1 - (game.elapsed - mine.wrongAt) / 0.4 }} /> : null}

        {ready && mine && isIn(mine) && !game.over ? (
          <div style={prompt} data-arrow={arrowFor(game, mine)} data-next={nextArrowFor(game, mine)}>
            <ArrowTrack
              seed={game.seed}
              at={mine.typed}
              wrong={game.elapsed - mine.wrongAt < 0.3}
              pressed={game.elapsed - mine.pressedAt < 0.08 && mine.wrongAt !== mine.pressedAt}
            />
          </div>
        ) : null}

        <style>{KEYFRAMES}</style>

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
 * The arrow to press, and the one after it as a preview beside it.
 *
 * Each arrow is its own element, keyed by which arrow it is in the sequence, so
 * when you get one right the *same* elements move to their new places instead of
 * new ones appearing: the one you were on slides off to the left and fades, the
 * preview slides across and grows into the big one, and a new preview slides in
 * from the right. The moves are CSS transitions on transform and opacity, so they
 * carry on smoothly however fast the keys come, and start over from wherever they
 * were when the next key lands.
 */
export function ArrowTrack({ seed, at, wrong, pressed }: { seed: number; at: number; wrong: boolean; pressed: boolean }) {
  // The one just done is kept a moment, to slide off; anything older is gone.
  const shown = [at - 1, at, at + 1].filter((i) => i >= 0)
  return (
    <div style={track} data-track>
      {shown.map((i) => {
        const slot = (i - at) as -1 | 0 | 1
        const arrow = arrowAt(seed, i)
        return (
          <div
            key={i}
            data-slot={slot}
            style={{
              ...cardBase,
              ...SLOTS[slot],
              ...(slot === 0 ? { borderColor: wrong ? LOOK.red : '#fff', transform: pressed ? 'scale(0.92)' : SLOTS[0].transform } : null),
            }}
          >
            <span data-glyph={arrow}>{GLYPHS[arrow]}</span>
            <span style={cap}>{KEYCAPS[arrow]}</span>
          </div>
        )
      })}
    </div>
  )
}

/** A new preview comes in from the right, small, and settles into its place. */
const KEYFRAMES = '@keyframes tower-in { from { opacity: 0; transform: translateX(210px) scale(0.3); } }'

/** The canvas, rendered once - see `TowerScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
      }}
    >
      <TowerScene live={live} />
    </Canvas>
  )
})

const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 50, near: 0.1, far: 300, position: [0, 3, 18] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** A fall for anybody knocked out - louder if it is you - and nothing for a new game. */
function useTowerSounds(game: Game): void {
  const seen = useRef<{ id: number; out: Set<string> }>({ id: -1, out: new Set() })
  useEffect(() => {
    const s = seen.current
    const fresh = s.id !== game.id
    if (fresh) seen.current = { id: game.id, out: new Set() }
    for (const p of game.players) {
      if (p.out === null || seen.current.out.has(p.id)) continue
      seen.current.out.add(p.id)
      if (!fresh) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.35)
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
  background: '#efe4d2',
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

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const flash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,40,40,0.08) 40%, rgba(255,40,40,0.5) 100%)',
}

/** Right of the towers - the scene leaves room for it - and level with the middle of the screen. */
const prompt: React.CSSProperties = {
  position: 'absolute',
  right: 'max(24px, 6vw)',
  top: '50%',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
}

/** The room for the big arrow and, beside it, the preview: 110 wide and a little over half again. */
const track: React.CSSProperties = { position: 'relative', width: 188, height: 110 }

/** Every arrow is drawn full size and scaled into its slot from its left edge, so a slot is only a transform. */
const cardBase: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 110,
  height: 110,
  boxSizing: 'border-box',
  borderRadius: 26,
  // Not the `border` shorthand: the colour changes on a wrong key, and React warns about mixing the two.
  borderWidth: 5,
  borderStyle: 'solid',
  borderColor: '#fff',
  background: 'rgba(42,34,51,0.85)',
  color: '#fff',
  font: `900 76px/100px ${FONT}`,
  textAlign: 'center',
  boxShadow: '0 6px 0 rgba(0,0,0,0.3)',
  transformOrigin: 'left center',
  transition: 'transform 150ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 150ms ease-out, background 150ms, border-color 60ms',
  // Only ever plays when an arrow is added, the preview: the others are already there.
  animation: 'tower-in 150ms cubic-bezier(0.2, 0.8, 0.3, 1)',
}

/** Where each arrow is: the one just done sliding off, this one, and the one after it, small and dimmer. */
const SLOTS: Record<-1 | 0 | 1, React.CSSProperties> = {
  [-1]: { transform: 'translateX(-70px) scale(0.5)', opacity: 0, pointerEvents: 'none' },
  0: { transform: 'translateX(0) scale(1)', opacity: 1 },
  1: { transform: 'translateX(126px) scale(0.56)', opacity: 0.7, background: 'rgba(42,34,51,0.6)' },
}

/** The key, small in the corner of the arrow. */
const cap: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  bottom: 4,
  font: `800 15px/1 ${FONT}`,
  opacity: 0.7,
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

const TONES: Record<'out' | 'warn' | 'hint', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  warn: { background: LOOK.sun, color: LOOK.ink },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
}

const bannerSub: React.CSSProperties = { color: LOOK.ink, font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 2px rgba(255,255,255,0.8)' }
