/**
 * The knobs you gate a module with.
 *
 * Lives in the app rather than in any module: it reaches across several of
 * them, and the composition root is the one place allowed to. Modules expose
 * state and setters; this renders the controls.
 *
 * Every section folds away and remembers whether it was folded, because the
 * panel now has enough in it to be in the way while you are looking at the
 * thing it controls.
 */
import { useEffect, useState } from 'react'
import {
  CYCLE_SECONDS,
  SECTION_SECONDS,
  TIMES_OF_DAY,
  TIME_LABELS,
  TIDE_MAX,
  WEATHER,
  WEATHER_KINDS,
  WEATHER_LABELS,
  getDayTime,
  tideAt,
  tideRising,
  getTimeScale,
  isCycleRunning,
  nameAt,
  setCycleRunning,
  setDayTime,
  setTimeOfDay,
  setTimeScale,
  setWeather,
  useCameraMode,
  useLightingSettings,
  useWeather,
} from '../modules/00-core'
import { isCameraOffPlayer, refocusCamera } from '../modules/02-player'
import { SCENE, setModuleEnabled } from './scene'

/**
 * Whether a section is folded, remembered between reloads.
 *
 * Wrapped because every storage call can throw - a private window and blocked
 * site data both do - and a panel that will not render because it could not
 * remember a boolean would be a silly way to lose the game.
 */
function useFolded(key: string, initial = false): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try {
      const raw = window.localStorage.getItem(`localrot.fold.${key}`)
      return raw === null ? initial : raw === '1'
    } catch {
      return initial
    }
  })
  const toggle = () => {
    setFolded((was) => {
      const next = !was
      try {
        window.localStorage.setItem(`localrot.fold.${key}`, next ? '1' : '0')
      } catch {
        // Not worth caring about.
      }
      return next
    })
  }
  return [folded, toggle]
}

function Section({
  id,
  title,
  first,
  children,
}: {
  id: string
  title: string
  first?: boolean
  children: React.ReactNode
}) {
  const [folded, toggle] = useFolded(id)
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        style={{
          ...heading,
          ...(first ? { marginTop: 0 } : null),
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          background: 'none',
          border: 'none',
          font: 'inherit',
          color: 'inherit',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
        }}
        title={folded ? 'Show' : 'Hide'}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.7 }}>{folded ? '+' : '–'}</span>
      </button>
      {folded ? null : children}
    </>
  )
}

function clockLabel(t: number, scale: number): string {
  const intoSection = (t * CYCLE_SECONDS) % SECTION_SECONDS
  const mins = Math.floor(intoSection / 60)
  const secs = Math.floor(intoSection % 60)
  const remaining = SECTION_SECONDS - intoSection
  const wait = scale > 0 ? Math.ceil(remaining / scale) : 0
  const next = scale > 0 ? (wait > 90 ? `${Math.ceil(wait / 60)}m` : `${wait}s`) : 'paused'
  return `${mins}:${String(secs).padStart(2, '0')} in, next in ${next}`
}

export function DebugPanel() {
  const camera = useCameraMode()
  const weather = useWeather()
  useLightingSettings()

  // The clock moves every frame; polling four times a second keeps the panel
  // live without dragging React into the render loop.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const t = getDayTime()
  const scale = getTimeScale()
  const running = isCycleRunning()
  const now = nameAt(t)
  const tide = tideAt(t)

  return (
    <div style={panel}>
      <Section id="time" title="TIME OF DAY" first>
        <input
          type="range"
          min={0}
          max={0.999}
          step={0.001}
          value={t}
          onChange={(e) => setDayTime(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#e0a05a' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          {TIMES_OF_DAY.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTimeOfDay(name)}
              style={{ ...flat, color: name === now ? '#ffcf8a' : '#8d8a84' }}
            >
              {TIME_LABELS[name]}
            </button>
          ))}
        </div>
        <div style={{ opacity: 0.6, marginTop: 4 }}>{clockLabel(t, scale)}</div>

        {/* The tide runs off the same clock, so scrubbing the slider above walks
            it through a whole cycle. Two high waters a day, of unequal height. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, opacity: 0.6 }}>
          <span>
            tide {tide >= 0 ? '+' : ''}
            {tide.toFixed(2)} m {tideRising(t) ? 'rising' : 'falling'}
          </span>
          <span>{tide > TIDE_MAX * 0.8 ? 'high' : tide < -TIDE_MAX * 0.8 ? 'low' : ''}</span>
        </div>
        <div style={{ height: 3, background: '#2a2a28', marginTop: 3, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: `${((tide + TIDE_MAX) / (TIDE_MAX * 2)) * 100}%`,
              top: -2,
              width: 3,
              height: 7,
              background: '#6fb6c8',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setCycleRunning(!running)}
            style={{
              ...flat,
              background: running ? '#e0a05a' : 'none',
              color: running ? '#20222a' : '#f2ece2',
              border: '1px solid #6b6862',
              borderRadius: 4,
              padding: '1px 8px',
            }}
          >
            {running ? 'running' : 'paused'}
          </button>
          {[1, 60, 600].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTimeScale(s)}
              style={{ ...flat, color: scale === s ? '#ffcf8a' : '#8d8a84' }}
            >
              {s}x
            </button>
          ))}
        </div>
        <div style={{ opacity: 0.45, marginTop: 2 }}>
          an hour a cycle, 15 min each. speed it up to check it
        </div>
      </Section>

      <Section id="weather" title="WEATHER">
        {/* Chosen, not simulated: every state is one click away rather than
            something you wait for. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {WEATHER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setWeather(kind)}
              style={{
                ...flat,
                border: '1px solid #6b6862',
                borderRadius: 4,
                padding: '2px 6px',
                background: kind === weather ? '#e0a05a' : 'none',
                color: kind === weather ? '#20222a' : '#c8c3ba',
              }}
            >
              {WEATHER_LABELS[kind]}
            </button>
          ))}
        </div>
        <div style={{ opacity: 0.45, marginTop: 4 }}>
          {WEATHER[weather].cloud > 0
            ? `${Math.round(WEATHER[weather].cloud * 100)}% cloud`
            : 'clear sky'}
          {WEATHER[weather].precipitation === 'none'
            ? ''
            : `, ${WEATHER[weather].precipitation}`}
        </div>
        <div style={{ opacity: 0.45 }}>takes a few seconds to come over</div>
      </Section>

      <Section id="view" title="VIEW">
        <div style={{ color: camera === 'player' ? '#ffcf8a' : '#8d8a84' }}>
          {camera === 'player' ? 'third person' : 'free orbit'}
        </div>
        <div style={{ opacity: 0.5 }}>WASD walk, space jump</div>
        <div style={{ opacity: 0.5 }}>drag to look, right-drag to pan, wheel to zoom</div>
        <button
          type="button"
          onClick={() => {
            refocusCamera()
            tick((n) => n + 1)
          }}
          style={{
            ...flat,
            marginTop: 6,
            border: '1px solid #6b6862',
            borderRadius: 4,
            padding: '2px 8px',
            color: isCameraOffPlayer() ? '#ffcf8a' : '#f2ece2',
          }}
        >
          refocus on player (F)
        </button>
      </Section>

      <Section id="modules" title="MODULES">
        {SCENE.map((entry) => (
          <label
            key={entry.id}
            style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              defaultChecked={entry.enabled}
              onChange={(e) => {
                setModuleEnabled(entry.id, e.target.checked)
                tick((n) => n + 1)
              }}
              style={{ accentColor: '#e0a05a' }}
            />
            <span style={{ color: entry.enabled ? '#f2ece2' : '#8d8a84' }}>{entry.id}</span>
          </label>
        ))}
      </Section>
    </div>
  )
}

// Placed by the column in App.tsx rather than pinning itself to the corner,
// so it can share the top right with the music panel.
const panel: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.78)',
  color: '#f2ece2',
  font: '11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  width: 214,
  boxSizing: 'border-box',
  userSelect: 'none',
}

const heading: React.CSSProperties = { opacity: 0.55, letterSpacing: 0.6, margin: '12px 0 4px' }

const flat: React.CSSProperties = {
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: '#f2ece2',
  cursor: 'pointer',
  padding: 0,
}
