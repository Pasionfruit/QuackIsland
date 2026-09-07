/**
 * The knobs you gate a module with.
 *
 * Lives in the app rather than in any module: it reaches across several of
 * them, and the composition root is the one place that is allowed to. Modules
 * expose state and setters; this renders the controls.
 */
import { SCENE, setModuleEnabled } from './scene'
import {
  TIMES_OF_DAY,
  TIME_LABELS,
  setTimeOfDay,
  useCameraMode,
  useTimeOfDay,
} from '../modules/00-core'
import { useState } from 'react'

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
  minWidth: 190,
  userSelect: 'none',
}

export function DebugPanel() {
  const time = useTimeOfDay()
  const camera = useCameraMode()
  const [, bump] = useState(0)
  const index = TIMES_OF_DAY.indexOf(time)

  return (
    <div style={panel}>
      <div style={{ opacity: 0.55, letterSpacing: 0.6, marginBottom: 6 }}>TIME OF DAY</div>
      <input
        type="range"
        min={0}
        max={TIMES_OF_DAY.length - 1}
        step={1}
        value={index}
        onChange={(e) => setTimeOfDay(TIMES_OF_DAY[Number(e.target.value)])}
        style={{ width: '100%', accentColor: '#e0a05a' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {TIMES_OF_DAY.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTimeOfDay(t)}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px 1px',
              cursor: 'pointer',
              font: 'inherit',
              color: t === time ? '#ffcf8a' : '#8d8a84',
            }}
          >
            {TIME_LABELS[t]}
          </button>
        ))}
      </div>

      <div style={{ opacity: 0.55, letterSpacing: 0.6, margin: '12px 0 4px' }}>VIEW</div>
      <div style={{ color: camera === 'player' ? '#ffcf8a' : '#8d8a84' }}>
        {camera === 'player' ? 'following the player' : 'free orbit'}
      </div>
      <div style={{ opacity: 0.5, marginTop: 2 }}>WASD to walk, space to jump</div>

      <div style={{ opacity: 0.55, letterSpacing: 0.6, margin: '12px 0 4px' }}>MODULES</div>
      {SCENE.map((entry) => (
        <label key={entry.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            defaultChecked={entry.enabled}
            onChange={(e) => {
              // Turning a module off to look at another one on its own is the
              // whole reason the registry carries an `enabled` flag.
              setModuleEnabled(entry.id, e.target.checked)
              bump((n) => n + 1)
            }}
            style={{ accentColor: '#e0a05a' }}
          />
          <span style={{ color: entry.enabled ? '#f2ece2' : '#8d8a84' }}>{entry.id}</span>
        </label>
      ))}
    </div>
  )
}
