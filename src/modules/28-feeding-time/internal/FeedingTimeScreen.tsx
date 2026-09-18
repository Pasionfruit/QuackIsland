/**
 * Feeding Time, on the screen.
 *
 * The pond is drawn in its own canvas by `FeedingTimeScene`; this is the shell:
 * the flick read off the pointer and turned into a throw, `useFeedNet` deciding
 * what it does, and the words - the clock, everybody's ducks fed, a flash for
 * each of yours, and the results.
 *
 * **Hold the left button in the bottom third and drag up into the top third,
 * fast.** The throw goes the moment the pointer reaches the top third: its lean
 * is its aim, and its speed is how far. A trail follows the drag, and the bottom
 * third is marked where a flick has to start.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { FeedingTimeScene, type SceneHands } from './FeedingTimeScene'
import { COLOURS, FLICK, flickToThrow, placings, timeLeft, type Game, type Throw } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useFeedNet } from './useFeedNet'

const LOOK = {
  ink: '#2f3d36',
  faded: '#7a8a80',
  paper: '#eef6ef',
  sun: '#ffc94d',
  danger: '#c8443c',
  green: '#3f9a3a',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

interface Drag {
  from: { x: number; y: number }
  startedAt: number
  trail: { x: number; y: number }[]
}

export function FeedingTimeScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over)
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useFeedNet()
  const live = useRef(game)
  live.current = game

  /** A throw flicked, waiting for the next frame. */
  const flicked = useRef<Throw | null>(null)
  const drag = useRef<Drag | null>(null)
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([])
  const [flash, setFlash] = useState<number | null>(null)
  const lastScore = useRef(0)
  const board = useRef<HTMLDivElement>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const hands = useMemo<SceneHands>(() => ({ pending: () => wire.pending() }), [])

  const again = () => {
    const fresh = newGame()
    live.current = fresh
    lastScore.current = 0
    setGame(fresh)
  }

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const thrown = flicked.current
      flicked.current = null
      if (wire.advance(current, dt, thrown, paused.current)) setGame({ ...current })
      const mine = current.players.find((p) => p.mine)
      if (mine && mine.score > lastScore.current) setFlash(current.elapsed)
      lastScore.current = mine?.score ?? 0
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  /** Where the pointer is on the board, 0 to 1 across and down, and the board's shape. */
  const onBoard = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, aspect: rect.width / Math.max(1, rect.height) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    const at = onBoard(e)
    if (at.y < FLICK.startBelow) return
    try {
      // Keep the drag ours even if the pointer leaves the board on the way up.
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // A pointer the browser does not know to capture: the drag still works inside the board.
    }
    drag.current = { from: { x: at.x, y: at.y }, startedAt: performance.now(), trail: [{ x: at.x, y: at.y }] }
    setTrail([{ x: at.x, y: at.y }])
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const held = drag.current
    if (!held) return
    const at = onBoard(e)
    held.trail = [...held.trail.slice(-14), { x: at.x, y: at.y }]
    setTrail(held.trail)
    if (at.y > FLICK.throwAbove) return
    // Reached the top third: that is the throw, if it was quick enough.
    const thrown = flickToThrow(held.from, { x: at.x, y: at.y }, (performance.now() - held.startedAt) / 1000, at.aspect)
    drag.current = null
    if (thrown) flicked.current = thrown
    window.setTimeout(() => setTrail([]), 120)
  }

  const onPointerUp = () => {
    drag.current = null
    setTrail([])
  }

  const ready = game.players.length > 0
  const left = timeLeft(game)
  const showFlash = ready && !game.over && flash !== null && game.elapsed - flash < 0.8

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Feeding Time</span>
        {ready ? (
          <span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((feeder, index) => (
          <span
            key={feeder.id}
            data-score={feeder.score}
            style={{
              ...pill,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: feeder.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.8)',
              color: feeder.mine ? '#fff' : LOOK.ink,
              boxShadow: feeder.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
            }}
          >
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(feeder.id)}</span>
            <strong>🦆 {feeder.score}</strong>
          </span>
        ))}
      </div>

      <div
        ref={board}
        style={board_}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} hands={hands} />
        {ready && !game.over ? (
          <>
            <div style={throwLine} />
            <div style={startBand}>
              <span style={startHint}>hold here and flick up ↑</span>
            </div>
          </>
        ) : null}
        {trail.length > 1 ? (
          <svg style={trailSvg} viewBox="0 0 1 1" preserveAspectRatio="none">
            <polyline
              points={trail.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.85}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
        {showFlash ? (
          <div style={flashWrap}>
            <div key={flash ?? 0} style={flashStyle} data-flash>
              🦆 Fed! +1
            </div>
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `FeedingTimeScene`. */
const Stage = memo(function Stage({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
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
      <FeedingTimeScene live={live} hands={hands} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 300, position: [0, 20, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most ducks fed first. */
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
  const mine = order.find((entry) => entry.feeder.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Time is up' : mine.place === 1 ? (winners.length > 1 ? 'A tie for first!' : 'The ducks love you!') : 'Time is up'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{headline}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.feeder.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.feeder.id === me ? 700 : 400 }}>{nameOf(entry.feeder.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {entry.feeder.throws} thrown · {entry.feeder.throws > 0 ? Math.round((100 * entry.feeder.score) / entry.feeder.throws) : 0}% fed
              </span>
              <strong style={{ minWidth: 44, textAlign: 'right' }}>🦆 {entry.feeder.score}</strong>
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
  background: '#bfe4f2',
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
  borderBottom: '2px solid #cfe2d2',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board_: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'grab' }

const startBand: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: `${(1 - FLICK.startBelow) * 100}%`,
  background: 'linear-gradient(0deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))',
  borderTop: '2px dashed rgba(255,255,255,0.45)',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingBottom: 12,
  boxSizing: 'border-box',
}

const startHint: React.CSSProperties = {
  color: '#fff',
  font: `700 14px/1 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.45)',
}

const throwLine: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: `${FLICK.throwAbove * 100}%`,
  borderTop: '2px dashed rgba(255,255,255,0.3)',
  pointerEvents: 'none',
}

const trailSvg: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }

const flashWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 16,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const flashStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 999,
  background: LOOK.green,
  color: '#fff',
  font: `800 18px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(20, 40, 35, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 400,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
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
