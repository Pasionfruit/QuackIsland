/**
 * I See The Light, on the screen.
 *
 * The track is drawn in its own canvas by `ISeeTheLightScene`; this is the
 * shell: space and the pointer in, judged here against the light this screen
 * is showing, `useRaceNet` sharing the race, the circle over the view on red,
 * and a HUD with the light, how far you have got, and who is still in.
 *
 * **Space to step on green. On red, keep the pointer in the circle.** A held
 * space's key repeats count for nothing, either way: a step is a press.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { ISeeTheLightScene } from './ISeeTheLightScene'
import {
  COLOURS,
  FRESH,
  LIGHT,
  checkPointer,
  circleAt,
  countdownAt,
  insideCircle,
  lightAt,
  placings,
  pressSpace,
  racing,
  type Pointer,
  type Race,
  type Racer,
  type Self,
} from './rules'
import { myId, newRace, waitingRace } from './setup'
import { useRaceNet } from './useRaceNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  red: '#e0392f',
  green: '#23a85a',
} as const

/** Each number of the countdown lands big and settles. */
const COUNT_KEYFRAMES = '@keyframes isl-count { 0% { transform: scale(1.6); opacity: 0 } 25% { transform: scale(1); opacity: 1 } 100% { transform: scale(0.92); opacity: 1 } }'

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function ISeeTheLightScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the race from here.
  const [race, setRace] = useState<Race>(() => (getNet().host ? newRace() : waitingRace()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(race.over, () =>
    placings(race).map((e) => ({ id: e.racer.id, place: e.place, name: nameOf(e.racer.id), colour: COLOURS[e.index % COLOURS.length], mine: e.racer.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRaceNet()
  const live = useRef(race)
  live.current = race

  /** This screen's own race, as judged here. */
  const self = useRef<Self>(FRESH)
  /** The race it belongs to. A new race starts it again. */
  const selfFor = useRef(race.id)
  /** Where the pointer is on the page, or null once it has left the window. */
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const board = useRef<HTMLDivElement>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  /** The pointer on the board, in the board's own pixels, and the board's size. */
  const onBoard = (): { at: Pointer | null; width: number; height: number } => {
    const rect = board.current?.getBoundingClientRect()
    if (!rect) return { at: null, width: 1, height: 1 }
    const p = pointer.current
    return { at: p ? { x: p.x - rect.left, y: p.y - rect.top } : null, width: rect.width, height: rect.height }
  }

  const judging = (current: Race) => {
    if (selfFor.current !== current.id) {
      selfFor.current = current.id
      self.current = FRESH
    }
    const mine = current.racers.find((r) => r.mine)
    return !paused.current && !current.over && current.racers.length > 0 && !!mine && racing(mine)
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (e.repeat) return
      const current = live.current
      if (!judging(current)) return
      self.current = pressSpace(current.seed, current.elapsed, self.current)
    }
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
    }
    const gone = (e: MouseEvent) => {
      if (!e.relatedTarget) pointer.current = null
    }
    const blur = () => {
      pointer.current = null
    }
    window.addEventListener('keydown', down)
    window.addEventListener('pointermove', move)
    document.addEventListener('mouseout', gone)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('mouseout', gone)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      if (judging(current)) {
        const { at, width, height } = onBoard()
        self.current = checkPointer(current.seed, current.elapsed, at, width, height, self.current)
      }
      if (wire.advance(current, dt, self.current, paused.current)) setRace({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = race.racers.length > 0
  const mineIndex = race.racers.findIndex((r) => r.mine)
  const mine = race.racers[mineIndex]
  const light = ready ? lightAt(race.seed, race.elapsed) : null
  const red = !!light && light.colour === 'red' && !race.over
  const circle = red && light ? circleAt(race.seed, light.red, light.since) : null
  const count = ready && !race.over ? countdownAt(race.seed, race.elapsed) : null
  const view = onBoard()
  const inside = circle ? insideCircle(view.at, circle, view.width, view.height) : true
  const inRace = !!mine && racing(mine)
  const left = Math.max(0, LIGHT.timeLimit - race.elapsed)

  return (
    <div style={page}>
      <style>{COUNT_KEYFRAMES}</style>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>I See The Light</span>
        {ready && light ? (
          <>
            <span
              style={{ ...pill, background: race.over ? LOOK.faded : light.colour === 'red' ? LOOK.red : LOOK.green, color: '#fff', minWidth: 96, textAlign: 'center' }}
              data-light={race.over ? 'off' : light.colour}
            >
              {race.over ? 'race over' : light.colour === 'red' ? 'RED - hold still' : count !== null ? `GREEN - red in ${count}` : 'GREEN - go!'}
            </span>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }}>
              {race.racers.filter(racing).length} racing
            </span>
            <span style={{ ...pill, background: left <= 10 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
              {Math.ceil(left)}s
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {mine ? <Progress racer={mine} colour={COLOURS[mineIndex % COLOURS.length]} /> : null}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: red && inRace ? 'crosshair' : 'default' }}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} />
        {red ? <div style={redWash} /> : null}
        {count !== null ? (
          <div style={countdownWrap}>
            <span key={count} style={countdownNumber} data-countdown={count}>
              {count}
            </span>
          </div>
        ) : null}
        {circle && inRace ? (
          <div
            style={{
              ...circleStyle,
              left: circle.x * view.width,
              top: circle.y * view.height,
              width: circle.radius * Math.min(view.width, view.height) * 2,
              height: circle.radius * Math.min(view.width, view.height) * 2,
              borderColor: inside ? '#ffffff' : LOOK.red,
              background: inside ? 'rgba(255,255,255,0.22)' : 'rgba(224,57,47,0.25)',
            }}
            data-circle={`${circle.x.toFixed(4)},${circle.y.toFixed(4)},${circle.radius.toFixed(4)}`}
          >
            {light && light.since < LIGHT.pointerGrace ? <span style={circleHint}>in here!</span> : null}
          </div>
        ) : null}
        {mine && mine.out && !race.over ? <Banner text={outText(mine)} colour={LOOK.red} /> : null}
        {mine && mine.finishedAt !== null && !race.over ? <Banner text={`Over the line - ${placeName(mine.place ?? 1)}!`} colour={LOOK.green} /> : null}
      </div>

      {results && ready ? <Over race={race} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

function outText(racer: Racer): string {
  if (!racer.out) return ''
  if (racer.out.why === 'space') return 'Out - you pressed space on red'
  if (racer.out.why === 'pointer') return 'Out - you slipped out of the circle'
  return 'Out - you left the race'
}

function placeName(place: number): string {
  const tens = place % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'
  return `${place}${suffix}`
}

function Banner({ text, colour }: { text: string; colour: string }) {
  return (
    <div style={bannerWrap}>
      <div style={{ ...banner, background: colour }} data-banner>
        {text}
      </div>
    </div>
  )
}

/** How far you have got, and whether you are still in. */
function Progress({ racer, colour }: { racer: Racer; colour: string }) {
  const share = Math.min(1, racer.steps / LIGHT.steps)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} data-steps={racer.steps}>
      <span style={{ width: 120, height: 10, borderRadius: 999, background: 'rgba(74,53,36,0.18)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${share * 100}%`, height: '100%', background: racer.out ? LOOK.faded : colour }} />
      </span>
      <span style={{ ...pill, background: racer.out ? LOOK.faded : colour, color: '#fff' }}>
        {racer.out ? 'out' : racer.finishedAt !== null ? 'finished' : `${racer.steps}/${LIGHT.steps}`}
      </span>
    </span>
  )
}

/** The canvas, rendered once - see `ISeeTheLightScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Race> }) {
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
      <ISeeTheLightScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 1, far: 400, position: [0, 20, 30] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: the line in the order they crossed it, then everybody else by how far they got. */
function Over({
  race,
  me,
  nameOf,
  onAgain,
}: {
  race: Race
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(race)
  const mine = order.find((entry) => entry.racer.id === me)
  const finished = order.filter((entry) => entry.racer.place !== null)
  const headline = !mine
    ? 'Race over'
    : mine.racer.place === 1
      ? 'You saw the light!'
      : mine.racer.place !== null
        ? `Over the line, ${placeName(mine.racer.place)}`
        : mine.racer.out
          ? mine.racer.out.why === 'space'
            ? 'Space on red'
            : mine.racer.out.why === 'pointer'
              ? 'Slipped out of the circle'
              : 'Left the race'
          : 'Out of time'
  const how = (racer: Racer) => {
    if (racer.finishedAt !== null) return `over the line · ${racer.finishedAt.toFixed(1)}s`
    const far = `${racer.steps}/${LIGHT.steps}`
    if (!racer.out) return `still going · ${far}`
    if (racer.out.why === 'space') return `space on red · ${far}`
    if (racer.out.why === 'pointer') return `slipped · ${far}`
    return `left · ${far}`
  }
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {finished.length > 0 ? `${nameOf(finished[0].racer.id)} reached the line first.` : 'Nobody reached the line.'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.racer.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.racer.id === me ? 700 : 400 }}>{nameOf(entry.racer.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{how(entry.racer)}</span>
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
  background: 'linear-gradient(180deg, #a9d4ec 0%, #8cc063 100%)',
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
  background: LOOK.sand,
  borderBottom: '2px solid #ecd0a0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const redWash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 120px 30px rgba(224, 57, 47, 0.45)',
}

const countdownWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  // Under the traffic light, not over it.
  top: '26%',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const countdownNumber: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(224, 57, 47, 0.9)',
  border: '4px solid #fff',
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  color: '#fff',
  font: `800 56px/1 ${FONT}`,
  animation: 'isl-count 1s ease-out',
}

const circleStyle: React.CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  border: '4px solid #fff',
  boxSizing: 'border-box',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 0 0 3px rgba(0,0,0,0.18)',
}

const circleHint: React.CSSProperties = {
  color: '#fff',
  font: `700 13px/1 ${FONT}`,
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 24,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0 16px',
}

const banner: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 999,
  color: '#fff',
  font: `700 16px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
  textAlign: 'center',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(12, 40, 55, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 360,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.sand,
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
