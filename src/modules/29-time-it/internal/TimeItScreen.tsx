/**
 * Time It, on the screen.
 *
 * The stage is drawn in its own canvas by `TimeItScene`; this is the shell: a
 * click passed to `useWatchNet`, and the words - the target, the countdown, the
 * stopwatch's digits while they can be seen, whether you have stopped, and the
 * results with everybody's time and how far off it was.
 *
 * The target sits in the middle of the top of the screen, where every
 * minigame's clock goes. Through the three-two-one before the stopwatch starts
 * it is also spelled out over the stage - "Aim for X seconds" - with the
 * thirty-second limit under it.
 *
 * **Left click to stop the stopwatch.** Anywhere on the stage, once it has
 * started; once only.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { TopTimer, isHeld, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { TimeItScene } from './TimeItScene'
import { COLOURS, WATCH, offBy, placings, showing, stopwatch, targetFor, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useWatchNet } from './useWatchNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  green: '#2f9e5b',
  red: '#d9443a',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"
const MONO = "ui-monospace, 'Cascadia Mono', 'Consolas', 'Menlo', monospace"

export function TimeItScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.timer.id, place: e.place, name: nameOf(e.timer.id), colour: COLOURS[e.index % COLOURS.length], mine: e.timer.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useWatchNet()
  const live = useRef(game)
  live.current = game
  /** The stopwatch reading at a click since the last frame, or null. */
  const clicked = useRef<number | null>(null)
  /** When the last frame was, so a click between frames can be read to the millisecond. */
  const frameAt = useRef(performance.now())

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const click = clicked.current
      clicked.current = null
      if (wire.advance(current, dt, click, paused.current)) setGame({ ...current })
      frameAt.current = performance.now()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || paused.current || clicked.current !== null) return
    // The stopwatch as the last frame left it, and the time since.
    clicked.current = stopwatch(live.current) + (performance.now() - frameAt.current) / 1000
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const t = stopwatch(game)
  const target = ready ? targetFor(game.seed) : 0
  const stopped = !!mine && mine.stopped !== null
  const briefing = ready && !game.over && isHeld(run)

  let readout = ''
  let caption = ''
  if (ready && !game.over) {
    if (t < 0) {
      readout = String(Math.ceil(-t))
      caption = 'Get ready…'
    } else if (showing(game)) {
      readout = t.toFixed(2)
      caption = 'Watch it run'
    } else {
      readout = '?.??'
      caption = stopped ? 'Stopped - waiting for the others' : 'Count in your head - click to stop'
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Time It</span>
        {ready ? (
          <TopTimer>
            <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink, fontSize: 14 }} data-target={target.toFixed(2)}>
              target {target.toFixed(2)}s
            </span>
          </TopTimer>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((timer, index) => (
          <span
            key={timer.id}
            style={{
              ...pill,
              background: timer.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: timer.mine ? '#fff' : LOOK.ink,
              boxShadow: timer.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: timer.left ? 0.5 : 1,
            }}
          >
            {nameOf(timer.id)}
            {timer.mine && timer.stopped !== null ? ' ✓' : ''}
          </span>
        ))}
      </div>

      <div style={{ ...board, cursor: ready && !game.over && t >= 0 && !stopped ? 'pointer' : 'default' }} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />
        {briefing ? (
          <div style={aimWrap} data-aim={target.toFixed(2)}>
            <div style={aimBox}>Aim for {target.toFixed(2)} seconds</div>
            <div style={captionStyle}>{WATCH.limit} second limit</div>
          </div>
        ) : null}
        {!briefing && readout ? (
          <div style={readoutWrap}>
            <div style={{ ...readoutBox, color: t >= 0 && !showing(game) ? LOOK.faded : '#fff' }} data-readout={readout} data-stopped={stopped ? 1 : 0}>
              {readout}
            </div>
            <div style={captionStyle}>{caption}</div>
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `TimeItScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
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
      <TimeItScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 5, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: closest to the target first, with everybody's time and how far off. */
function Over({
  game,
  me,
  nameOf,
  onAgain,
}: {
  game: Game
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(game)
  const mine = order.find((entry) => entry.timer.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Time!' : mine.timer.stopped === null ? 'You never stopped' : mine.place === 1 ? (winners.length > 1 ? 'A tie for closest!' : 'Closest to the target!') : 'Time!'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>The target was {targetFor(game.seed).toFixed(2)}s.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => {
            const off = offBy(game, entry.timer)
            return (
              <div key={entry.timer.id} style={scoreRow} data-place={entry.place}>
                <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
                <span style={{ flex: 1, fontWeight: entry.timer.id === me ? 700 : 400 }}>{nameOf(entry.timer.id)}</span>
                <span style={{ font: `600 13px/1.4 ${MONO}` }}>{entry.timer.stopped !== null && entry.timer.stopped >= 0 ? `${entry.timer.stopped.toFixed(2)}s` : '-'}</span>
                <span style={{ minWidth: 64, textAlign: 'right', font: `600 12px/1.4 ${MONO}`, color: off === null ? LOOK.faded : Math.abs(off) < 0.5 ? LOOK.green : LOOK.red }}>
                  {off === null ? (entry.timer.left ? 'left' : 'no stop') : `${off >= 0 ? '+' : ''}${off.toFixed(2)}`}
                </span>
              </div>
            )
          })}
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
  background: '#2a2233',
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const readoutWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
}

const readoutBox: React.CSSProperties = {
  minWidth: 170,
  padding: '6px 20px',
  borderRadius: 14,
  background: 'rgba(20, 16, 28, 0.82)',
  border: '3px solid rgba(255,255,255,0.25)',
  font: `700 44px/1.1 ${MONO}`,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}

const aimWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '0 16px',
  pointerEvents: 'none',
}

const aimBox: React.CSSProperties = {
  padding: '8px 22px',
  borderRadius: 16,
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 32px/1.2 ${FONT}`,
  textAlign: 'center',
}

const captionStyle: React.CSSProperties = {
  color: '#fff',
  font: `700 15px/1.3 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingBottom: 24,
  boxSizing: 'border-box',
  background: 'linear-gradient(0deg, rgba(15, 10, 20, 0.6), rgba(15, 10, 20, 0) 70%)',
}

const overCard: React.CSSProperties = {
  width: 420,
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
