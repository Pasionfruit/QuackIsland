/**
 * Feeding Time, on the screen.
 *
 * The pond is drawn in its own canvas by `FeedingTimeScene`; this is the shell:
 * the pointer read and turned into a throw, `useFeedNet` deciding what it does,
 * and the words - the clock, everybody's ducks fed, the power meter, a flash for
 * each of yours, and the results.
 *
 * **Point at the water, hold the left button, let go.** The pointer is the aim -
 * the scene draws a line out to it - and how long the button was held is the
 * power: the meter fills, and falls back if held too long. The meter marks the
 * power that reaches the pointer, and the scene marks where the throw would land.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, replayMinigame, useCueOnChange, useFinish, useLoopCue, type MinigameRun } from '../../15-minigames'
import { FOV, groundAt } from './camera'
import { FeedingTimeScene, type SceneHands } from './FeedingTimeScene'
import { COLOURS, aimThrow, chargePower, distancePower, placings, spotOf, timeLeft, type Game, type Point, type Throw } from './rules'
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

/** Where the pointer is over the board, and since when the button has been held. */
interface Pointer {
  across: number
  down: number
  aspect: number
  heldSince: number | null
}

/** Your aim, from the pointer: your spot, the point on the ground, and the power held so far. */
function aimOf(pointer: Pointer | null, game: Game, now: number): { from: Point; target: Point; power: number | null } | null {
  const me = game.players.findIndex((p) => p.mine)
  if (!pointer || me < 0 || game.over) return null
  const from = spotOf(me, game.players.length)
  // Above the horizon: straight out, as far as it goes.
  const target = groundAt(pointer.across, pointer.down, pointer.aspect) ?? { x: from.x, z: from.z - 100 }
  return { from, target, power: pointer.heldSince === null ? null : chargePower((now - pointer.heldSince) / 1000) }
}

export function FeedingTimeScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.feeder.id, place: e.place, name: nameOf(e.feeder.id), colour: COLOURS[e.index % COLOURS.length], mine: e.feeder.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useFeedNet()
  const live = useRef(game)
  live.current = game

  /** A throw let go, waiting for the next frame. */
  const flicked = useRef<Throw | null>(null)
  const pointer = useRef<Pointer | null>(null)
  const meter = useRef<HTMLDivElement>(null)
  const meterFill = useRef<HTMLDivElement>(null)
  const meterReach = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState<number | null>(null)
  /** The button is down: drives the wind-up sound, which the meter's per-frame writes cannot. */
  const [charging, setCharging] = useState(false)
  const lastScore = useRef(0)
  const board = useRef<HTMLDivElement>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const hands = useMemo<SceneHands>(() => ({ pending: () => wire.pending(), aim: () => aimOf(pointer.current, live.current, performance.now()) }), [])

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
      // The meter, straight onto the page: it moves every frame the button is held.
      const aim = aimOf(pointer.current, current, now)
      if (meter.current && meterFill.current && meterReach.current) {
        const reach = aim ? distancePower(Math.hypot(aim.target.x - aim.from.x, aim.target.z - aim.from.z)) : null
        meterFill.current.style.width = `${(aim?.power ?? 0) * 100}%`
        meterReach.current.style.left = `${(reach ?? 0) * 100}%`
        meterReach.current.style.display = reach === null ? 'none' : 'block'
        meter.current.style.opacity = aim && aim.power !== null ? '1' : '0.6'
      }
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

  const onPointerMove = (e: React.PointerEvent) => {
    const at = onBoard(e)
    pointer.current = { across: at.x, down: at.y, aspect: at.aspect, heldSince: pointer.current?.heldSince ?? null }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    const at = onBoard(e)
    try {
      // Keep the hold ours even if the pointer leaves the board before letting go.
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // A pointer the browser does not know to capture: the hold still works inside the board.
    }
    pointer.current = { across: at.x, down: at.y, aspect: at.aspect, heldSince: performance.now() }
    setCharging(true)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const held = pointer.current
    if (!held || held.heldSince === null) return
    const at = onBoard(e)
    const letGo = { across: at.x, down: at.y, aspect: at.aspect, heldSince: held.heldSince }
    pointer.current = { ...letGo, heldSince: null }
    setCharging(false)
    if (paused.current) return
    const aim = aimOf(letGo, live.current, performance.now())
    if (aim && aim.power !== null) flicked.current = aimThrow(aim.from, aim.target, aim.power)
  }

  const onPointerCancel = () => {
    pointer.current = null
    setCharging(false)
  }

  const onPointerLeave = () => {
    // A held button is captured and keeps its aim; only a pointer passing out of the board drops it.
    if (pointer.current?.heldSince === null) pointer.current = null
  }

  const ready = game.players.length > 0
  const left = timeLeft(game)

  // Winding up for as long as the button is down, and a toss for every cracker
  // thrown - yours loud, the rest of the bank quieter - off the throw counts
  // every screen is sent.
  useLoopCue(CUES.holdMouse, charging && !run.paused && !game.over, 0.4)
  const myThrows = game.players.find((p) => p.mine)?.throws ?? 0
  const theirThrows = game.players.reduce((n, p) => n + p.throws, 0) - myThrows
  useCueOnChange(CUES.throwingBread, `${game.id}:${myThrows}`, myThrows > 0)
  useCueOnChange(CUES.throwingBread, `${game.id}:${theirThrows}`, theirThrows > 0, 0.2)
  const showFlash = ready && !game.over && flash !== null && game.elapsed - flash < 0.8
  const myColour = COLOURS[Math.max(0, game.players.findIndex((p) => p.mine)) % COLOURS.length]

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Feeding Time</span>
        {ready ? (
          <TopTimer left={game.over ? null : left}><span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span></TopTimer>
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
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} hands={hands} />
        {ready && !game.over ? (
          <div style={meterWrap}>
            <div ref={meter} style={meterBar} data-meter>
              <div ref={meterFill} style={{ ...meterFillStyle, background: myColour }} />
              <div ref={meterReach} style={meterReachStyle} />
            </div>
            <span style={meterHint}>point at the water · hold to charge · let go to throw</span>
          </div>
        ) : null}
        {showFlash ? (
          <div style={flashWrap}>
            <div key={flash ?? 0} style={flashStyle} data-flash>
              🦆 Fed! +1
            </div>
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
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

const board_: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'crosshair' }

const meterWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 14,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
}

const meterBar: React.CSSProperties = {
  position: 'relative',
  width: 'min(360px, 70%)',
  height: 16,
  borderRadius: 999,
  background: 'rgba(20, 40, 35, 0.35)',
  boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.7)',
  overflow: 'hidden',
  opacity: 0.6,
}

const meterFillStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, width: 0, borderRadius: 999 }

/** The power that reaches the pointer. */
const meterReachStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 4,
  marginLeft: -2,
  background: '#fff',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
  display: 'none',
}

const meterHint: React.CSSProperties = {
  color: '#fff',
  font: `700 13px/1 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.45)',
}

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
