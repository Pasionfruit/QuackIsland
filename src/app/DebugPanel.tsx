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
  useFolded,
  useLightingSettings,
  useWeather,
} from '../modules/00-core'
import {
  isCameraOffPlayer,
  refocusCamera,
  stunPlayer,
  toggleViewMode,
  useViewMode,
} from '../modules/02-player'
import { AUDIO, getCueEngine, readStoredVolume, setEffectsVolume } from '../modules/08-audio'
import { useNet } from '../modules/09-net'
import { CURRENCIES, clearPurse, earn, trySpend, usePurse } from '../modules/11-currency'
import { SCENE, setModuleEnabled } from './scene'

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
  const view = useViewMode()
  const weather = useWeather()
  const net = useNet()
  const purse = usePurse()
  useLightingSettings()

  const [effects, setEffects] = useState(() => {
    try {
      return readStoredVolume()
    } catch {
      return AUDIO.defaultVolume
    }
  })

  // The clock moves every frame; polling four times a second keeps the panel
  // live without dragging React into the render loop.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  // In a lobby the host drives the clock and the weather. A guest's controls
  // are disabled rather than left to fight the sync: a slider that snaps back
  // once a second is worse than one that plainly cannot be moved.
  const guest = net.status === 'joined' && !net.host

  const t = getDayTime()
  const scale = getTimeScale()
  const running = isCycleRunning()
  const now = nameAt(t)
  const tide = tideAt(t)

  return (
    <div style={panel}>
      <Section id="time" title="TIME OF DAY" first>
        {guest ? (
          <div style={{ opacity: 0.6, marginBottom: 4, color: '#ffcf8a' }}>
            set by the host of {net.room}
          </div>
        ) : null}
        <input
          type="range"
          min={0}
          max={0.999}
          step={0.001}
          value={t}
          disabled={guest}
          onChange={(e) => setDayTime(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#e0a05a', opacity: guest ? 0.4 : 1 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          {TIMES_OF_DAY.map((name) => (
            <button
              key={name}
              type="button"
              disabled={guest}
              onClick={() => setTimeOfDay(name)}
              style={{
                ...flat,
                color: guest ? '#5f5c58' : name === now ? '#ffcf8a' : '#8d8a84',
              }}
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
            disabled={guest}
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
              disabled={guest}
              onClick={() => setTimeScale(s)}
              style={{
                ...flat,
                color: guest ? '#5f5c58' : scale === s ? '#ffcf8a' : '#8d8a84',
              }}
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
              disabled={guest}
              onClick={() => setWeather(kind)}
              style={{
                ...flat,
                border: '1px solid #6b6862',
                borderRadius: 4,
                padding: '2px 6px',
                background: kind === weather && !guest ? '#e0a05a' : 'none',
                color: guest ? '#8d8a84' : kind === weather ? '#20222a' : '#c8c3ba',
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
        <div style={{ opacity: 0.45 }}>
          {guest ? `set by the host of ${net.room}` : 'takes a few seconds to come over'}
        </div>
      </Section>

      <Section id="lobby" title="LOBBY">
        {/* The controls moved to the popup in the top left corner. A lobby is
            the first thing you use and the one panel here that is not for
            debugging; what is left is the status, where the rest of this panel
            can read it. */}
        <div>
          {net.status === 'joined' ? (
            <>
              <span style={{ color: '#ffcf8a' }}>{net.room}</span>
              <span style={{ opacity: 0.6 }}>
                {` - ${net.peers} other${net.peers === 1 ? '' : 's'}${net.host ? ' - you host' : ''}`}
              </span>
            </>
          ) : (
            <span style={{ opacity: 0.6 }}>
              {net.status === 'connecting'
                ? 'connecting...'
                : net.status === 'error'
                  ? net.why
                  : 'not in a lobby'}
            </span>
          )}
        </div>
        <div style={{ opacity: 0.45, marginTop: 3 }}>
          {net.status === 'joined'
            ? net.host
              ? 'your clock and weather are everyone’s'
              : 'the host sets the time and the weather'
            : 'open the lobby, top left, to make one or join one'}
        </div>
      </Section>

      <Section id="sound" title="SOUND">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ opacity: 0.55 }}>effects</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={effects}
            onChange={(e) => {
              const level = Number(e.target.value)
              setEffects(level)
              setEffectsVolume(level)
            }}
            style={{ flex: 1, accentColor: '#6fb6c8' }}
            title={`${Math.round(effects * 100)}%`}
          />
          <span style={{ opacity: 0.45, width: 26, textAlign: 'right' }}>
            {Math.round(effects * 100)}
          </span>
        </div>
        <div style={{ opacity: 0.45, marginTop: 2 }}>
          footsteps, jumps and strokes{getCueEngine().ready ? '' : ' - click the world to start'}
        </div>
      </Section>

      <Section id="wallet" title="WALLET">
        {/* Nothing earns these yet - fishing, beachcombing and vines are each
            their own feature. These are here so the ledger can be checked. */}
        {CURRENCIES.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 54, color: c.colour }}>{c.label}</span>
            <span style={{ width: 46, textAlign: 'right', opacity: 0.75 }}>{purse[c.id]}</span>
            <button type="button" onClick={() => earn(c.id, 1)} style={flat} title="earn one">
              +
            </button>
            <button
              type="button"
              onClick={() => trySpend({ [c.id]: 1 })}
              style={{ ...flat, opacity: purse[c.id] > 0 ? 1 : 0.35 }}
              title="spend one"
            >
              -
            </button>
            <button type="button" onClick={() => earn(c.id, 10)} style={{ ...flat, opacity: 0.6 }}>
              +10
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={clearPurse}
          style={{ ...flat, marginTop: 4, opacity: 0.5 }}
        >
          empty it
        </button>
      </Section>

      <Section id="view" title="VIEW">
        <div style={{ display: 'flex', gap: 4 }}>
          {(['first', 'third'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (mode !== view) toggleViewMode()
              }}
              disabled={camera !== 'player'}
              style={{
                ...flat,
                flex: 1,
                border: '1px solid #6b6862',
                borderRadius: 4,
                padding: '2px 6px',
                background: mode === view && camera === 'player' ? '#e0a05a' : 'none',
                color:
                  camera !== 'player'
                    ? '#6b6862'
                    : mode === view
                      ? '#20222a'
                      : '#c8c3ba',
                cursor: camera === 'player' ? 'pointer' : 'default',
              }}
            >
              {mode === 'first' ? '1st person' : '3rd person'}
            </button>
          ))}
        </div>
        <div style={{ color: camera === 'player' ? '#8d8a84' : '#ffcf8a', marginTop: 3 }}>
          {camera === 'player' ? 'V to swap' : 'free orbit - player module is off'}
        </div>
        <div style={{ opacity: 0.5 }}>WASD walk, space jump</div>
        <div style={{ opacity: 0.5 }}>
          {view === 'first'
            ? 'drag to look'
            : 'drag to look, right-drag to pan, wheel to zoom'}
        </div>
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

        {/* No minigame pushes anybody over yet, so this is the only way to see
            the stun. Temporary, like the animation it is here to show. */}
        <button
          type="button"
          onClick={() => stunPlayer(1.5)}
          style={{
            ...flat,
            marginTop: 4,
            border: '1px solid #6b6862',
            borderRadius: 4,
            padding: '2px 8px',
          }}
        >
          knock over (1.5s)
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
  // The page no longer scrolls to reveal whatever this panel's sections do
  // not fit - see `index.html` - so this has to scroll itself instead, or
  // opening every section on a short window would strand the last few.
  maxHeight: 'calc(100vh - 20px)',
  overflowY: 'auto',
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
