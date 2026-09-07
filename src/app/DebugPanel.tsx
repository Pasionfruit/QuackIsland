/**
 * The knobs you gate a module with.
 *
 * Lives in the app rather than in any module: it reaches across several of
 * them, and the composition root is the one place allowed to. Modules expose
 * state and setters; this renders the controls.
 */
import { useEffect, useState } from 'react'
import {
  CYCLE_SECONDS,
  SECTION_SECONDS,
  TIMES_OF_DAY,
  TIME_LABELS,
  getDayTime,
  getTimeScale,
  isCycleRunning,
  nameAt,
  setCycleRunning,
  setDayTime,
  setTimeOfDay,
  setTimeScale,
  useCameraMode,
  useLightingSettings,
} from '../modules/00-core'
import { SCENE, setModuleEnabled } from './scene'

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 10,
  right: 10,
  zIndex: 10,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.78)',
  color: '#f2ece2',
  font: '11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  minWidth: 214,
  userSelect: 'none',
}

const heading: React.CSSProperties = { opacity: 0.55, letterSpacing: 0.6, margin: '12px 0 4px' }

const flat: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '2px 1px',
  cursor: 'pointer',
  font: 'inherit',
}

/** How far into the current fifteen minutes we are, and how long until the next. */
function clockLabel(t: number, scale: number): string {
  const into = t * CYCLE_SECONDS
  const section = Math.floor(into / SECTION_SECONDS)
  const intoSection = into - section * SECTION_SECONDS
  const mins = Math.floor(intoSection / 60)
  const secs = Math.floor(intoSection % 60)
  const remaining = SECTION_SECONDS - intoSection
  const wait = scale > 0 ? Math.ceil(remaining / scale) : 0
  const next = scale > 0 ? (wait > 90 ? `${Math.ceil(wait / 60)}m` : `${wait}s`) : 'paused'
  return `${mins}:${String(secs).padStart(2, '0')} in, next in ${next}`
}

export function DebugPanel() {
  const camera = useCameraMode()
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

  return (
    <div style={panel}>
      <div style={{ ...heading, marginTop: 0 }}>TIME OF DAY</div>
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

      <div style={heading}>VIEW</div>
      <div style={{ color: camera === 'player' ? '#ffcf8a' : '#8d8a84' }}>
        {camera === 'player' ? 'third person' : 'free orbit'}
      </div>
      <div style={{ opacity: 0.5 }}>WASD walk, space jump, drag to look</div>

      <div style={heading}>MODULES</div>
      {SCENE.map((entry) => (
        <label key={entry.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
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
    </div>
  )
}
