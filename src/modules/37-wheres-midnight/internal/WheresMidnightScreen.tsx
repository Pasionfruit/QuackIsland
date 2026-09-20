/**
 * Where's Midnight?, on the screen.
 *
 * The junkyard is drawn in its own canvas by `WheresMidnightScene`; this is the
 * shell: the pointer turned into a view for the scene and into clicks for
 * `useSearchNet`, and the words - the clock, whether you can click yet, who has
 * found him, and the results.
 *
 * **W A S D to turn, wheel to zoom, click him to say you have found him.** The
 * keys pan the view - see `pan` - at a rate that follows the zoom; nothing drags.
 * The wheel zooms towards the pointer rather than towards the middle, so you can
 * chase a suspicious dark patch into the corner of the screen without losing it.
 * Both are `view.ts`; nothing about either is decided here.
 *
 * **At the closest zoom, there is a flashlight** - and only there. A button - or F
 * - lights the middle of the view; zoom back out and it goes off. **While it is on
 * the camera is locked**: W A S D and the wheel do nothing, so the light is on what
 * you lined up before you switched it on, and putting it away is what frees you.
 * It is yours alone: nobody else's yard gets any lighter.
 *
 * **A click is a press and a release**, settled on release: there is nothing left
 * to drag, so a press is never anything but a guess.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, replayMinigame, useCueOnChange, useFinish, type MinigameRun } from '../../15-minigames'
import { COLOURS, SEARCH, placings, timeLeft, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useSearchNet } from './useSearchNet'
import { VIEW, canTorch as closestZoom, magnification, pan, rayThrough, startView, wheelFov, zoomAt, type Vec3, type View } from './view'
import { WheresMidnightScene } from './WheresMidnightScene'
import { look, yardFor } from './yard'

const LOOK = {
  ink: '#e8e2d6',
  faded: '#9a938a',
  panel: 'rgba(16, 20, 27, 0.86)',
  sun: '#ffc94d',
  danger: '#e0564e',
  good: '#6fe3a0',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

const seconds = (s: number) => `${s.toFixed(1)}s`

/** The keys that pan the view, by `KeyboardEvent.code`, so they sit in the same place on any layout. */
const PAN_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD']

/** A miss, marked where it was clicked for a moment: cosmetic, and the game's own answer is the one that counts. */
interface Splat {
  left: number
  top: number
  at: number
}

export function WheresMidnightScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.seeker.id, place: e.place, name: nameOf(e.seeker.id), colour: COLOURS[e.index % COLOURS.length], mine: e.seeker.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useSearchNet()
  const live = useRef(game)
  live.current = game

  const view = useRef<View>(startView())
  const board = useRef<HTMLDivElement>(null)
  const click = useRef<Vec3 | undefined>(undefined)
  /** Where a press started, until it is let go: a click is a press and a release. */
  const pressed = useRef<number | null>(null)
  /** The pan keys held, by `KeyboardEvent.code`. */
  const held = useRef(new Set<string>())
  const [splat, setSplat] = useState<Splat | null>(null)
  const [zoom, setZoom] = useState(1)
  const [torchOn, setTorchOn] = useState(false)
  const torch = useRef(false)
  // Only at the closest zoom.
  const [canTorch, setCanTorch] = useState(false)
  torch.current = torchOn && canTorch

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  /** Where a pointer is on the board, as -1..1 across and up, with the board's shape. */
  const on = (e: { clientX: number; clientY: number }) => {
    const el = board.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return {
      nx: ((e.clientX - r.left) / r.width) * 2 - 1,
      ny: -(((e.clientY - r.top) / r.height) * 2 - 1),
      aspect: r.width / r.height,
      left: e.clientX - r.left,
      top: e.clientY - r.top,
    }
  }

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const said = click.current
      click.current = undefined
      // W A S D turn the view - unless the round is paused or over, or the flashlight is on and has the camera locked.
      if (!paused.current && !current.over && !torch.current) {
        const right = (held.current.has('KeyD') ? 1 : 0) - (held.current.has('KeyA') ? 1 : 0)
        const up = (held.current.has('KeyW') ? 1 : 0) - (held.current.has('KeyS') ? 1 : 0)
        if (right || up) pan(view.current, right, up, dt)
      }
      if (wire.advance(current, dt, said, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The wheel, listened to by hand: React's is passive, and a zoom that also
  // scrolls the page behind the game is not a zoom.
  useEffect(() => {
    const el = board.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // With the flashlight on the camera is locked: no zoom either.
      if (paused.current || torch.current) return
      const at = on(e)
      if (!at) return
      zoomAt(view.current, wheelFov(view.current.fov, e.deltaY), at.nx, at.ny, at.aspect)
      setZoom(magnification(view.current))
      setCanTorch(closestZoom(view.current))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Zooming back out puts the flashlight away, so zooming in again starts dark.
  useEffect(() => {
    if (!canTorch) setTorchOn(false)
  }, [canTorch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') {
        if (e.repeat || paused.current) return
        // The flashlight is for the closest zoom only; off, it can always be put away.
        setTorchOn((on) => (on ? false : closestZoom(view.current)))
        return
      }
      if (PAN_KEYS.includes(e.code)) held.current.add(e.code)
    }
    const onUp = (e: KeyboardEvent) => held.current.delete(e.code)
    const onBlur = () => held.current.clear()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current) return
    pressed.current = e.pointerId
  }

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const was = pressed.current
    pressed.current = null
    if (was !== e.pointerId || paused.current) return
    const at = on(e)
    if (!at) return
    const dir = rayThrough(view.current, at.nx, at.ny, at.aspect)
    click.current = dir
    const mine = live.current.players.find((p) => p.mine)
    const canClick = !live.current.over && mine && mine.foundAt === null && mine.cooldown <= SEARCH.cooldownGrace
    if (canClick && look(yardFor(live.current.seed), dir) !== 'midnight') {
      setSplat({ left: at.left, top: at.top, at: performance.now() })
    }
  }

  useEffect(() => {
    if (!splat) return
    const timer = setTimeout(() => setSplat(null), 700)
    return () => clearTimeout(timer)
  }, [splat])

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const found = mine?.foundAt ?? null
  const place = placings(game).find((entry) => entry.seeker.id === me)?.place ?? 0
  const checking = wire.checking()
  const left = timeLeft(game)

  // A click that was not Midnight, as the host counted it. Yours only.
  const misses = mine?.misses ?? 0
  useCueOnChange(CUES.wrongSelection, `${game.id}:${misses}`, misses > 0)

  const state = !ready
    ? 'waiting for the host…'
    : checking
      ? 'checking…'
      : found !== null
        ? `found him in ${seconds(found)} - ${ordinal(place)}`
        : mine && mine.cooldown > SEARCH.cooldownGrace
          ? `not him - ${seconds(mine.cooldown)}`
          : 'find Midnight'

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Where&rsquo;s Midnight?</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : left}><span style={{ ...pill, background: left <= 10 ? LOOK.danger : '#2a3240' }} data-time-left={Math.ceil(left)}>
              {Math.ceil(left)}s
            </span></TopTimer>
            <span
              style={{
                ...pill,
                background: found !== null ? LOOK.good : mine && mine.cooldown > SEARCH.cooldownGrace ? LOOK.danger : '#2a3240',
                color: found !== null ? '#10281c' : LOOK.ink,
              }}
              data-state={found !== null ? 'found' : checking ? 'checking' : mine && mine.cooldown > SEARCH.cooldownGrace ? 'waiting' : 'searching'}
            >
              🐈‍⬛ {state}
            </span>
            <span style={{ ...pill, background: '#2a3240' }} data-zoom={zoom.toFixed(1)}>
              {zoom.toFixed(1)}×
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>{state}</span>
        )}
        <span style={{ flex: 1 }} />
        {mine ? (
          <span style={{ ...pill, background: '#2a3240', color: LOOK.faded }} data-misses={mine.misses}>
            {mine.misses} {mine.misses === 1 ? 'wrong guess' : 'wrong guesses'}
          </span>
        ) : null}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: 'crosshair' }}
        data-board
        // Where the camera is, redrawn every frame the round runs: for the run-localrot skill, and for anybody debugging a pan.
        data-view={`${view.current.yaw.toFixed(3)},${view.current.pitch.toFixed(3)},${view.current.fov.toFixed(2)}`}
        data-locked={torch.current ? 1 : 0}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          pressed.current = null
        }}
      >
        {ready ? <Stage live={live} view={view} torch={torch} /> : <div style={{ ...vignette, background: '#0b1018' }} />}
        <div style={vignette} />
        {ready && canTorch && !game.over ? (
          <button
            type="button"
            style={{ ...torchButton, ...(torchOn ? torchButtonOn : null) }}
            data-torch={torchOn ? 'on' : 'off'}
            // Its own press, not the board's: a tap on the button is not a guess at the yard.
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={() => setTorchOn((on) => !on)}
          >
            🔦 {torchOn ? 'flashlight on - camera locked' : 'flashlight'}
          </button>
        ) : null}
        {ready && !game.over && !canTorch && zoom > 1.5 ? <div style={torchHint}>the flashlight works at the closest zoom</div> : null}
        {splat ? (
          <div style={{ ...miss, left: splat.left, top: splat.top }} data-miss>
            ✕
          </div>
        ) : null}
        {ready ? <Standings game={game} me={me} nameOf={nameOf} /> : null}
        {ready && !game.over ? <Hints /> : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** Who has found him, in the order they did. */
function Standings({ game, me, nameOf }: { game: Game; me: string; nameOf: (id: string) => string }) {
  return (
    <div style={standings} data-standings>
      {placings(game).map((entry) => (
        <div key={entry.seeker.id} style={row}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length], opacity: entry.seeker.foundAt === null ? 0.3 : 1 }} />
          <span style={{ flex: 1, fontWeight: entry.seeker.id === me ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nameOf(entry.seeker.id)}
          </span>
          <span style={{ fontSize: 12, color: entry.seeker.foundAt === null ? LOOK.faded : LOOK.good }}>
            {entry.seeker.foundAt === null ? 'looking…' : seconds(entry.seeker.foundAt)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The controls: four of them, and none of them obvious from looking at a junkyard. */
function Hints() {
  return (
    <div style={hints}>
      <span>
        <b>W A S D</b> look round
      </span>
      <span>
        <b>wheel</b> zoom
      </span>
      <span>
        <b>click</b> that&rsquo;s him
      </span>
      <span>
        <b>F</b> flashlight, fully zoomed - it locks the camera
      </span>
    </div>
  )
}

/** The canvas, rendered once - see `WheresMidnightScene`. */
const Stage = memo(function Stage({ live, view, torch }: { live: RefObject<Game>; view: RefObject<View>; torch: RefObject<boolean> }) {
  return (
    <Canvas
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.15
      }}
    >
      <WheresMidnightScene live={live} view={view} torch={torch} />
    </Canvas>
  )
})

const DPR: [number, number] = [1, 2]
const CAMERA = { fov: VIEW.start.fov, near: 0.05, far: 300, position: [0, 5.5, 3] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: first to find him first, and whoever never did sharing last. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.seeker.id === me)
  const winners = order.filter((entry) => entry.place === 1 && entry.seeker.foundAt !== null)
  const headline =
    !mine || mine.seeker.foundAt === null ? 'He was there all along' : mine.place === 1 ? 'Found him first!' : `${ordinal(mine.place)} to find him`
  const sub =
    winners.length === 0
      ? 'Nobody found him. He is very good at this.'
      : `${winners.map((w) => nameOf(w.seeker.id)).join(' and ')} spotted him in ${seconds(winners[0].seeker.foundAt!)}.`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{sub}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.seeker.id} style={row} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.seeker.id === me ? 700 : 400 }}>{nameOf(entry.seeker.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {entry.seeker.misses} wrong {entry.seeker.misses === 1 ? 'guess' : 'guesses'}
              </span>
              <span style={{ fontWeight: 700, minWidth: 62, textAlign: 'right' }}>
                {entry.seeker.foundAt === null ? 'never' : seconds(entry.seeker.foundAt)}
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
  background: '#0b1018',
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
  background: '#151b24',
  borderBottom: '1px solid #232c38',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  color: LOOK.ink,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', touchAction: 'none', overscrollBehavior: 'contain' }

/** Darkened corners: a junkyard at night, and a nudge to look in the middle. */
const vignette: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.4) 100%)',
}

const miss: React.CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  color: LOOK.danger,
  font: `700 22px/1 ${FONT}`,
  pointerEvents: 'none',
  textShadow: '0 0 6px rgba(0,0,0,0.8)',
}

const standings: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 190,
  maxWidth: 'calc(100% - 24px)',
  padding: '8px 12px',
  borderRadius: 14,
  background: LOOK.panel,
  border: '1px solid #232c38',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  font: `13px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const hints: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  display: 'flex',
  gap: 12,
  padding: '6px 12px',
  borderRadius: 999,
  background: LOOK.panel,
  font: `12px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

/** Above the flashlight's place, while it is not allowed yet: why the button is not there. */
const torchHint: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 52,
  transform: 'translateX(-50%)',
  padding: '3px 12px',
  borderRadius: 999,
  background: LOOK.panel,
  color: LOOK.faded,
  font: `12px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const torchButton: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 12,
  transform: 'translateX(-50%)',
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid #3a4452',
  background: LOOK.panel,
  color: LOOK.ink,
  font: `600 13px/1.2 ${FONT}`,
  cursor: 'pointer',
}

const torchButtonOn: React.CSSProperties = {
  background: LOOK.sun,
  border: '1px solid #b07f16',
  color: '#241a06',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(4, 8, 14, 0.6)',
}

const overCard: React.CSSProperties = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  padding: '18px 20px',
  borderRadius: 20,
  background: '#151b24',
  border: '1px solid #232c38',
  boxShadow: '0 6px 0 rgba(0,0,0,0.35)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const againButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 4px 0 #b07f16',
  color: '#241a06',
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
