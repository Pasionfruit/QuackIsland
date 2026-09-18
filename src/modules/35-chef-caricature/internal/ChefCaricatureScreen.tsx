/**
 * Chef Caricature, on the screen.
 *
 * The kitchen is drawn in its own canvas by `ChefCaricatureScene`; this is the
 * shell: the mouse turned into a pen on the board for `useInkNet`, and the words -
 * whose turn it is, the time left, how much of the outline is covered, what
 * became of an attempt, and the results.
 *
 * **Hold left click and drag to trace the outline, without letting go.** The pen
 * follows every pointer event the browser has, coalesced ones included, so a
 * quick hand draws a smooth line rather than a string of corners. The board
 * keeps the pointer while the button is held, so drawing off its edge and back
 * does not lose the stroke; letting go anywhere is letting go.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useReducer, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { TopTimer, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV, boardPoint } from './camera'
import { ChefCaricatureScene } from './ChefCaricatureScene'
import { outlineFor } from './outlines'
import { COLOURS, TRACE, coverage, drawer, phase, placings, tidiness, timeLeft, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useInkNet } from './useInkNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const dishes = (n: number) => (n === 1 ? '1 dish' : `${n} dishes`)

export function ChefCaricatureScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  //
  // **One game object, changed in place, never copied.** The pen changes the game
  // straight from pointer events, between frames. A copy taken each frame to make
  // React render would leave a pen event landing before that render changing the
  // old copy - and the dish it fed the duck lost, so the same outline could be
  // fed twice. So the game is only replaced by a new game, and every frame just
  // asks React to draw it again.
  const [game] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useInkNet()
  const live = useRef(game)
  live.current = game
  const holding = useRef(false)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      if (wire.advance(current, dt, paused.current)) redraw()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Paused: the pen comes up, which wipes an attempt in progress - the same as letting go.
  useEffect(() => {
    if (!run.paused || !holding.current) return
    holding.current = false
    wire.pen(live.current, 'up', 0, 0)
  }, [run.paused])

  const toBoard = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return boardPoint({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) }, r.width / r.height)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current) return
    const at = toBoard(e, e.currentTarget)
    if (!at) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A pointer the browser does not know - a synthetic one - cannot be captured; drawing works without.
    }
    holding.current = true
    wire.pen(live.current, 'down', at.x, at.y)
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!holding.current || paused.current) return
    const el = e.currentTarget
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : []
    for (const one of events.length > 0 ? events : [e]) {
      const at = toBoard(one, el)
      if (at) wire.pen(live.current, 'move', at.x, at.y)
    }
  }

  const onUp = () => {
    if (!holding.current) return
    holding.current = false
    wire.pen(live.current, 'up', 0, 0)
  }

  const ready = game.players.length > 0
  const now = phase(game)
  const drawing = drawer(game)
  const drawerPlayer = game.players[drawing]
  const mineTurn = !!drawerPlayer?.mine
  const stroke = game.stroke
  const covered = coverage(stroke)
  const tidy = tidiness(stroke)
  const messy = !!stroke && stroke.ink > 0.4 && tidy < TRACE.tidy
  const wiped = game.erasedAt !== null && game.elapsed - game.erasedAt < 1
  const fed = game.dish !== null && game.elapsed - game.dish.at < 1.2

  let banner: { text: string; sub?: string; tone: 'intro' | 'hint' | 'good' | 'bad' | 'watch' | 'done' } | null = null
  if (ready && drawerPlayer) {
    const who = nameOf(drawerPlayer.id)
    if (now === 'intro') {
      banner = mineTurn
        ? { text: `Your turn in ${Math.ceil(game.startsAt - game.elapsed)}`, sub: 'Hold left click and trace the outline without letting go', tone: 'intro' }
        : { text: `Next up: ${who}`, sub: `drawing in ${Math.ceil(game.startsAt - game.elapsed)}`, tone: 'intro' }
    } else if (now === 'drawing') {
      if (fed) banner = { text: mineTurn ? 'Yum! +1' : `The duck ate ${who === 'you' ? 'your' : `${who}'s`} ${outlineFor(game.seed, game.dish!.outline).name}`, tone: 'good' }
      else if (mineTurn && game.lift) banner = { text: 'Let go for the next one', tone: 'hint' }
      else if (wiped) banner = { text: mineTurn ? 'You let go - wiped' : `${who} let go - wiped`, tone: 'bad' }
      else if (mineTurn && messy) banner = { text: 'Too messy - stay on the line', sub: 'let go to start again', tone: 'bad' }
      else if (mineTurn && !stroke) banner = { text: 'Hold left click on the outline and trace it', tone: 'hint' }
      else if (!mineTurn) banner = { text: `${who} is drawing`, tone: 'watch' }
    } else if (now === 'result') {
      banner = { text: `${who === 'you' ? 'You' : who} fed the duck ${dishes(drawerPlayer.score)}`, tone: 'done' }
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Chef Caricature</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-turn={game.turn + 1}>
              turn {game.turn + 1} of {game.order.length}
            </span>
            {now === 'drawing' ? (
              <TopTimer><span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.ceil(timeLeft(game))}>
                {Math.ceil(timeLeft(game))}s
              </span></TopTimer>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: COLOURS[index % COLOURS.length],
              color: '#fff',
              opacity: p.left ? 0.45 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-score={p.score}
          >
            {index === drawing && !game.over ? '✏️ ' : ''}
            {nameOf(p.id)} <b>{p.score}</b>
          </span>
        ))}
      </div>

      <div
        style={{ ...board, cursor: mineTurn && now === 'drawing' ? 'crosshair' : 'default' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        onContextMenu={(e) => e.preventDefault()}
        data-board
        data-phase={now}
        data-my-turn={mineTurn && now === 'drawing' ? 1 : 0}
        data-coverage={covered.toFixed(3)}
      >
        <Stage live={live} />

        {ready && now === 'drawing' ? (
          <div style={meterWrap}>
            <div style={meter}>
              <div style={{ ...meterFill, width: `${Math.min(100, covered * 100)}%`, background: messy ? LOOK.red : covered >= TRACE.accept ? LOOK.green : COLOURS[drawing % COLOURS.length] }} />
              <div style={{ ...meterMark, left: `${TRACE.accept * 100}%` }} />
            </div>
            <span style={meterText}>{Math.round(covered * 100)}%</span>
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

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `ChefCaricatureScene`. */
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
      <ChefCaricatureScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.1, far: 200, position: [0, 3, 16] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most dishes first. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const shared = mine ? order.filter((e) => e.place === mine.place).length > 1 : false
  const headline = !mine ? 'Kitchen closed' : mine.place === 1 ? (shared ? 'Joint head chef!' : 'Head chef!') : `${ordinal(mine.place)} place`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>Most dishes fed to the duck first.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{entry.player.left ? 'left' : ''}</span>
              <span style={{ minWidth: 72, textAlign: 'right', font: `700 14px/1.4 ${FONT}` }}>{dishes(entry.player.score)}</span>
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
  background: '#f6e3c3',
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const meterWrap: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 12px',
  borderRadius: 999,
  background: 'rgba(244,240,248,0.92)',
  pointerEvents: 'none',
}

const meter: React.CSSProperties = { position: 'relative', width: 180, height: 10, borderRadius: 999, background: '#ddd3e8', overflow: 'hidden' }
const meterFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999 }
const meterMark: React.CSSProperties = { position: 'absolute', top: -2, bottom: -2, width: 2, background: LOOK.ink }
const meterText: React.CSSProperties = { font: `700 13px/1 ${FONT}`, minWidth: 36, textAlign: 'right' }

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 18,
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

const TONES: Record<'intro' | 'hint' | 'good' | 'bad' | 'watch' | 'done', React.CSSProperties> = {
  intro: { background: 'rgba(20,16,28,0.85)', color: '#fff', font: `800 26px/1.2 ${FONT}` },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  good: { background: LOOK.green, color: '#fff' },
  bad: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)' },
  watch: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  done: { background: LOOK.sun, color: LOOK.ink, boxShadow: '0 4px 0 #d79a22' },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }

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
