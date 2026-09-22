/**
 * Lady Luck, on the screen.
 *
 * The field is drawn in its own canvas by `LadyLuckScene`; this is the shell:
 * `useFieldNet` running or following the round, a click passed to it, the clock
 * and everybody's claims, a crosshair in place of the pointer, and the results.
 *
 * **Mouse to aim, left click to select a clover.** The crosshair is in your
 * colour when a click will count, and its ring empties and fills back up over
 * the second after a click that did not claim - the same crosshair as Duck
 * Hunt's, drawn in the DOM so it never lags a frame behind your hand.
 *
 * A misclick costs a point, and so does every click while the ring is filling
 * back up: a red "-1" says so.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, replayMinigame, useCueOnChange, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { LadyLuckScene, type SceneHands } from './LadyLuckScene'
import { COLOURS, FIELD, placings, timeLeft, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useFieldNet } from './useFieldNet'

const LOOK = {
  ink: '#34422a',
  faded: '#7a8a6c',
  paper: '#eef6de',
  sun: '#ffc94d',
  danger: '#c8443c',
  lucky: '#3f9a3a',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function LadyLuckScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.hunter.id, place: e.place, name: nameOf(e.hunter.id), colour: colours[e.index], mine: e.hunter.id === me })),
  )
  const wire = useFieldNet()
  const live = useRef(game)
  live.current = game
  /** A click this frame: a clover, null for grass, undefined for none. */
  const clicked = useRef<number | null | undefined>(undefined)
  const crosshair = useRef<HTMLDivElement>(null)
  /** When this browser last saw its own score go up, and down, for the flashes. */
  const [foundAt, setFoundAt] = useState(-10)
  const [lostAt, setLostAt] = useState({ at: -10, points: 0 })
  const lastScore = useRef(0)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const hands = useMemo<SceneHands>(
    () => ({
      onClick: (clover) => {
        if (!paused.current) clicked.current = clover
      },
      claiming: () => wire.claiming(),
    }),
    [],
  )

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const click = clicked.current
      clicked.current = undefined
      if (wire.advance(current, dt, click, paused.current)) setGame({ ...current })
      const mine = current.players.find((p) => p.mine)
      if (mine && mine.score > lastScore.current) setFoundAt(current.elapsed)
      if (mine && mine.score < lastScore.current) setLostAt({ at: current.elapsed, points: lastScore.current - mine.score })
      lastScore.current = mine?.score ?? 0
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const moveCrosshair = (e: React.PointerEvent) => {
    const el = crosshair.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`
    el.style.opacity = '1'
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const cooling = mine ? Math.min(1, mine.cooldown / FIELD.cooldown) : 0
  const left = timeLeft(game)

  // A click that was not a free four-leaf clover, off your own misses and spams
  // as the host counted them. Only yours: everybody else's mistakes are theirs.
  const slips = mine ? mine.misses + mine.spams : 0
  useCueOnChange(CUES.wrongSelection, `${game.id}:${slips}`, slips > 0)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Lady Luck</span>
        {ready ? (
          <TopTimer left={game.over ? null : left}><span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span></TopTimer>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        {ready ? (
          <span style={{ color: LOOK.faded, fontSize: 12 }}>
            find the four-leaf clovers - three are hidden at a time · a misclick or a spammed click costs {FIELD.penalty}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {game.players.map((hunter, index) => (
          <span
            key={hunter.id}
            data-score={hunter.score}
            style={{
              ...pill,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: hunter.mine ? colours[index] : 'rgba(255,255,255,0.75)',
              color: hunter.mine ? '#fff' : LOOK.ink,
              boxShadow: hunter.mine ? 'none' : `inset 0 0 0 2px ${colours[index]}`,
            }}
          >
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(hunter.id)}</span>
            <strong>🍀 {hunter.score}</strong>
          </span>
        ))}
      </div>

      <div
        style={{ ...board, cursor: ready && !game.over ? 'none' : 'default' }}
        onPointerMove={moveCrosshair}
        onPointerLeave={() => crosshair.current && (crosshair.current.style.opacity = '0')}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} hands={hands} />
        {ready && !game.over ? (
          <div ref={crosshair} style={crosshairBox} data-cooldown={mine ? mine.cooldown.toFixed(2) : '0'}>
            <Crosshair colour={mine ? colours[mineIndex] : '#fff'} cooling={cooling} />
          </div>
        ) : null}
        {ready && !game.over && game.elapsed - foundAt < 1.1 ? (
          <div style={toastWrap}>
            <div style={toast} data-found>
              🍀 Lucky! +1
            </div>
          </div>
        ) : null}
        {ready && !game.over && game.elapsed - lostAt.at < 0.8 && game.elapsed - foundAt >= 1.1 ? (
          <div style={toastWrap}>
            <div key={lostAt.at} style={{ ...toast, background: LOOK.danger }} data-lost={lostAt.points}>
              -{lostAt.points}
            </div>
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `LadyLuckScene`. */
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
      <LadyLuckScene live={live} hands={hands} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 300, position: [0, 30, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * The crosshair: four ticks and a dot, with a ring that empties after a click
 * that did not claim and fills back up over the cooldown. Solid and in your
 * colour when a click will count.
 */
function Crosshair({ colour, cooling }: { colour: string; cooling: number }) {
  const r = 17
  const around = 2 * Math.PI * r
  const ready = cooling <= 0
  return (
    <svg width={48} height={48} viewBox="-24 -24 48 48" style={{ overflow: 'visible' }}>
      <circle r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={5} />
      <circle
        r={r}
        fill="none"
        stroke={ready ? colour : '#ffffff'}
        strokeWidth={3}
        strokeDasharray={`${around * (1 - cooling)} ${around}`}
        transform="rotate(-90)"
      />
      {[0, 90, 180, 270].map((angle) => (
        <line
          key={angle}
          x1={0}
          y1={-8}
          x2={0}
          y2={-13}
          stroke={ready ? '#ffffff' : 'rgba(255,255,255,0.5)'}
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${angle})`}
        />
      ))}
      <circle r={2.2} fill={ready ? colour : 'rgba(255,255,255,0.6)'} />
    </svg>
  )
}

/** The results: most four-leaf clovers first. */
function Over({
  game,
  me,
  nameOf,
  colours,
  onAgain,
}: {
  game: Game
  me: string
  nameOf: (id: string) => string
  colours: readonly string[]
  onAgain: (() => void) | null
}) {
  const order = placings(game)
  const mine = order.find((entry) => entry.hunter.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Round over' : mine.place === 1 ? (winners.length > 1 ? 'Lucky - a tie for first!' : 'Luckiest in the field!') : 'Out of luck'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{game.claims.length} four-leaf clovers found this round.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.hunter.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: colours[entry.index],
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
                }}
              />
              <span style={{ flex: 1, fontWeight: entry.hunter.id === me ? 700 : 400 }}>{nameOf(entry.hunter.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {entry.hunter.misses} {entry.hunter.misses === 1 ? 'miss' : 'misses'}
                {entry.hunter.spams > 0 ? ` · ${entry.hunter.spams} spammed` : ''}
              </span>
              <strong style={{ minWidth: 40, textAlign: 'right' }}>🍀 {entry.hunter.score}</strong>
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
  background: '#9fcf86',
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
  borderBottom: '2px solid #cfe2b4',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const crosshairBox: React.CSSProperties = {
  position: 'absolute',
  left: -24,
  top: -24,
  width: 48,
  height: 48,
  pointerEvents: 'none',
  opacity: 0,
  willChange: 'transform',
}

const toastWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 16,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const toast: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 999,
  background: LOOK.lucky,
  color: '#fff',
  font: `700 16px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(20, 40, 18, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 380,
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
