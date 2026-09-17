/**
 * Sprint Triathlon, on the screen.
 *
 * The course is drawn in its own canvas by `TriathlonScene`; this is the shell:
 * clicks, presses and keys counted here against this screen's own race, the
 * leg you are on with what to do about it - a stroke meter, a pedal meter, the
 * sentence with what you have typed so far - the race clock and everybody's
 * leg, and the results with each leg's time.
 *
 * **Left click to swim, space to bike, type the sentence to run.** Key repeats
 * count for nothing: a held key is one press.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import type { MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { TriathlonScene } from './TriathlonScene'
import {
  COLOURS,
  COURSE,
  FRESH,
  click,
  legOf,
  pedal,
  placings,
  progressOf,
  raceClock,
  sentenceFor,
  timeOf,
  type,
  type Leg,
  type Race,
  type Racer,
  type Self,
} from './rules'
import { myId, newRace, waitingRace } from './setup'
import { useRaceNet } from './useRaceNet'

const LOOK = {
  ink: '#33403f',
  faded: '#7d8886',
  paper: '#eef6f2',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
  water: '#2f86b8',
  road: '#5c5f66',
  track: '#c46a45',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"
const MONO = "ui-monospace, 'Cascadia Mono', 'Consolas', 'Menlo', monospace"

const LEG_ICON: Record<Leg, string> = { swim: '🏊', bike: '🚴', run: '🏃', done: '🏁' }

export function TriathlonScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the race from here.
  const [race, setRace] = useState<Race>(() => (getNet().host ? newRace() : waitingRace()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRaceNet()
  const live = useRef(race)
  live.current = race

  /** This screen's own race, as counted here. */
  const self = useRef<Self>(FRESH)
  const selfFor = useRef(race.id)
  const [, bump] = useState(0)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newRace()
    live.current = fresh
    setRace(fresh)
  }

  /** Whether this screen's hands count right now, and the race they count against. */
  const hands = (): Race | null => {
    const current = live.current
    if (selfFor.current !== current.id) {
      selfFor.current = current.id
      self.current = FRESH
    }
    const mine = current.racers.find((r) => r.mine)
    if (paused.current || current.over || current.racers.length === 0 || !mine || mine.left || mine.finishAt !== null) return null
    return current
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const current = hands()
      if (!current || e.ctrlKey || e.metaKey || e.altKey) return
      const sentence = sentenceFor(current.seed)
      const leg = legOf(self.current, sentence)
      if (leg === 'bike' && e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) self.current = pedal(self.current, sentence, current.elapsed)
      } else if (leg === 'run' && e.key.length === 1) {
        e.preventDefault()
        if (!e.repeat) self.current = type(self.current, sentence, e.key, current.elapsed)
      } else {
        return
      }
      bump((n) => n + 1)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      hands()
      if (wire.advance(current, dt, self.current, paused.current)) setRace({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const current = hands()
    if (!current) return
    self.current = click(self.current, sentenceFor(current.seed), current.elapsed)
    bump((n) => n + 1)
  }

  const ready = race.racers.length > 0
  const sentence = ready ? sentenceFor(race.seed) : ''
  const mineIndex = race.racers.findIndex((r) => r.mine)
  const mine = race.racers[mineIndex]
  // What this screen counted is ahead of what the host has said; show the more.
  const own: Self =
    mine && selfFor.current === race.id
      ? {
          ...self.current,
          strokes: Math.max(self.current.strokes, mine.strokes),
          pedals: Math.max(self.current.pedals, mine.pedals),
          typed: Math.max(self.current.typed, mine.typed),
        }
      : FRESH
  const leg = legOf(own, sentence)
  const countdown = ready && race.elapsed < COURSE.start ? Math.ceil(COURSE.start - race.elapsed) : null

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Sprint Triathlon</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.ink, color: '#fff', fontVariantNumeric: 'tabular-nums' }} data-clock={raceClock(race).toFixed(1)}>
            {(mine ? timeOf(race, mine) : raceClock(race)).toFixed(1)}s
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {race.racers.map((racer, index) => (
          <span
            key={racer.id}
            style={{
              ...pill,
              background: racer.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.8)',
              color: racer.mine ? '#fff' : LOOK.ink,
              boxShadow: racer.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: racer.left ? 0.5 : 1,
            }}
            data-leg={legOf(racer, sentence)}
          >
            {LEG_ICON[legOf(racer, sentence)]} {nameOf(racer.id)}
          </span>
        ))}
      </div>

      <div
        style={{ ...board, cursor: leg === 'swim' && !countdown ? 'pointer' : 'default' }}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} />
        {countdown !== null ? (
          <div style={countdownWrap}>
            <span key={countdown} style={countdownNumber} data-countdown={countdown}>
              {countdown}
            </span>
          </div>
        ) : null}
        {ready && mine && !race.over && countdown === null ? <Task leg={leg} own={own} racer={mine} race={race} sentence={sentence} /> : null}
      </div>

      {race.over && ready ? <Over race={race} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** What to do on the leg you are on, and how far through it you are. */
function Task({ leg, own, racer, race, sentence }: { leg: Leg; own: Self; racer: Racer; race: Race; sentence: string }) {
  if (leg === 'swim' || leg === 'bike') {
    const swim = leg === 'swim'
    const done = swim ? own.strokes : own.pedals
    const of = swim ? COURSE.strokes : COURSE.pedals
    return (
      <div style={panelWrap}>
        <div style={{ ...panel, borderColor: swim ? LOOK.water : LOOK.road }} data-task={leg}>
          <div style={{ fontSize: 22, fontWeight: 800, color: swim ? LOOK.water : LOOK.road }}>
            {swim ? '🏊 SWIM - click as fast as you can!' : '🚴 BIKE - hammer Space!'}
          </div>
          <div style={meter}>
            <div style={{ ...meterFill, width: `${(100 * done) / of}%`, background: swim ? LOOK.water : LOOK.road }} />
          </div>
          <div style={{ color: LOOK.faded, fontSize: 12 }} data-count={done}>
            {done} / {of} {swim ? 'strokes' : 'pedals'}
          </div>
        </div>
      </div>
    )
  }
  if (leg === 'run') {
    const stumbling = race.elapsed < own.stumbling
    return (
      <div style={panelWrap}>
        <div style={{ ...panel, borderColor: stumbling ? LOOK.red : LOOK.track, width: 'min(760px, calc(100vw - 32px))' }} data-task="run">
          <div style={{ fontSize: 18, fontWeight: 800, color: LOOK.track }}>🏃 RUN - type the sentence</div>
          <div style={{ ...sentenceBox, transform: stumbling ? 'translateX(3px)' : 'none' }} data-sentence={sentence} data-typed={own.typed}>
            <span style={{ color: LOOK.green }}>{sentence.slice(0, own.typed)}</span>
            <span style={{ background: stumbling ? LOOK.red : LOOK.sun, color: stumbling ? '#fff' : LOOK.ink, borderRadius: 3 }}>
              {sentence[own.typed] === ' ' ? ' ' : sentence[own.typed]}
            </span>
            <span style={{ color: LOOK.faded }}>{sentence.slice(own.typed + 1)}</span>
          </div>
          <div style={{ color: LOOK.faded, fontSize: 12 }}>
            {own.typed} / {sentence.length} · {own.mistakes} {own.mistakes === 1 ? 'mistake' : 'mistakes'}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={panelWrap}>
      <div style={{ ...panel, borderColor: LOOK.green }} data-task="done">
        <div style={{ fontSize: 22, fontWeight: 800, color: LOOK.green }}>
          🏁 Finished{racer.finishAt !== null ? ` in ${racer.finishAt.toFixed(2)}s` : '!'}
          {racer.place !== null ? ` - ${ordinal(racer.place)}` : ''}
        </div>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/** The canvas, rendered once - see `TriathlonScene`. */
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
      <TriathlonScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 400, position: [0, 30, 30] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: finishers by time, with each leg's split; then everybody else by how far they got. */
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
  const sentence = sentenceFor(race.seed)
  const headline = !mine ? 'Race over' : mine.racer.finishAt === null ? 'Out of time' : mine.place === 1 ? 'Triathlon champion!' : `Finished ${ordinal(mine.place)}`
  const legTime = (from: number | null, to: number | null) => (from === null || to === null ? '-' : `${(to - from).toFixed(1)}`)
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{headline}</div>
        <div style={{ ...scoreRow, color: LOOK.faded, fontSize: 11 }}>
          <span style={{ minWidth: 18 }} />
          <span style={{ width: 12 }} />
          <span style={{ flex: 1 }} />
          <span style={splitCell}>🏊</span>
          <span style={splitCell}>🚴</span>
          <span style={splitCell}>🏃</span>
          <span style={{ ...splitCell, minWidth: 54 }}>time</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => {
            const r = entry.racer
            return (
              <div key={r.id} style={scoreRow} data-place={entry.place}>
                <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
                <span style={{ flex: 1, fontWeight: r.id === me ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(r.id)}</span>
                <span style={splitCell}>{legTime(0, r.swimAt)}</span>
                <span style={splitCell}>{legTime(r.swimAt, r.bikeAt)}</span>
                <span style={splitCell}>{legTime(r.bikeAt, r.finishAt)}</span>
                <strong style={{ ...splitCell, minWidth: 54 }}>
                  {r.finishAt !== null ? `${r.finishAt.toFixed(2)}s` : r.left ? 'left' : `${Math.round(progressOf(r, sentence) * 100)}%`}
                </strong>
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
  background: '#bfe3f2',
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
  borderBottom: '2px solid #cfe2da',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const countdownWrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const countdownNumber: React.CSSProperties = {
  width: 120,
  height: 120,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(51, 64, 63, 0.9)',
  border: '5px solid #fff',
  color: '#fff',
  font: `800 68px/1 ${FONT}`,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
}

const panelWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 18,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0 16px',
}

const panel: React.CSSProperties = {
  boxSizing: 'border-box',
  maxWidth: '100%',
  padding: '10px 18px',
  borderRadius: 18,
  border: '4px solid',
  background: 'rgba(238, 246, 242, 0.95)',
  boxShadow: '0 5px 0 rgba(0,0,0,0.15)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}

const meter: React.CSSProperties = {
  width: 'min(420px, 70vw)',
  height: 14,
  borderRadius: 999,
  background: 'rgba(51, 64, 63, 0.15)',
  overflow: 'hidden',
}

const meterFill: React.CSSProperties = { height: '100%', borderRadius: 999 }

const sentenceBox: React.CSSProperties = {
  font: `600 20px/1.5 ${MONO}`,
  textAlign: 'left',
  wordBreak: 'break-word',
  width: '100%',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(20, 40, 45, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 460,
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

const splitCell: React.CSSProperties = { minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }

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
