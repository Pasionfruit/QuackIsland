/**
 * Settings: a gear in the top right, and the page it opens.
 *
 * What used to be the debug panel, sorted by who it is for rather than by
 * which module it came from:
 *
 * - **Island** - the time of day and the weather.
 * - **Audio** - sound effects, and the same music controls as the corner.
 * - **Player** - your duck's colour, and what is in your wallet.
 * - **Developer** - the camera, the scene's modules, and the frame numbers.
 *
 * Lives in the app rather than in any module: it reaches across several of
 * them, and the composition root is the one place allowed to. Modules expose
 * state and setters; this renders the controls.
 */
import { useEffect, useRef, useState } from 'react'
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
  readPerf,
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
  useStore,
  useWeather,
  type PerfSample,
} from '../modules/00-core'
import {
  PLAYER_COLOURS,
  isCameraOffPlayer,
  refocusCamera,
  setPlayerColour,
  stunPlayer,
  toggleViewMode,
  usePlayerColour,
  useViewMode,
} from '../modules/02-player'
import { MusicControls } from '../modules/05-music'
import { AUDIO, getCueEngine, readStoredVolume, setEffectsVolume } from '../modules/08-audio'
import { useNet } from '../modules/09-net'
import {
  CURRENCIES,
  balanceOf,
  clearPurse,
  earn,
  formatAmount,
  trySpend,
  usePurse,
} from '../modules/11-currency'
import { SCENE, setModuleEnabled } from './scene'
import { settingsOpen as open } from './settingsOpen'

export const SETTINGS_TABS = ['island', 'audio', 'player', 'developer'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

const TAB_LABELS: Record<SettingsTab, string> = {
  island: 'Island',
  audio: 'Audio',
  player: 'Player',
  developer: 'Developer',
}

const TAB_KEY = 'localrot.settingsTab'

function readTab(): SettingsTab {
  try {
    const raw = window.localStorage.getItem(TAB_KEY)
    return (SETTINGS_TABS as readonly string[]).includes(raw ?? '') ? (raw as SettingsTab) : 'island'
  } catch {
    return 'island'
  }
}

function storeTab(tab: SettingsTab): void {
  try {
    window.localStorage.setItem(TAB_KEY, tab)
  } catch {
    // Opening on the first tab next time is fine.
  }
}

/** The gear, and the page behind it. */
export function Settings() {
  const shown = useStore(open)

  // Escape closes, as it does everywhere else.
  useEffect(() => {
    if (!shown) return
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') open.set(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [shown])

  return (
    <>
      <button
        type="button"
        onClick={() => open.set(!shown)}
        style={{ ...gear, borderColor: shown ? 'rgba(255,207,138,0.7)' : 'rgba(255,255,255,0.14)' }}
        title="Settings"
        aria-label="Settings"
      >
        <GearIcon />
      </button>
      {shown ? <SettingsPage onClose={() => open.set(false)} /> : null}
    </>
  )
}

/** The page itself, over everything. Exported so it can be mounted on its own. */
export function SettingsPage({ onClose, initialTab }: { onClose: () => void; initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(() => initialTab ?? readTab())
  const card = useRef<HTMLDivElement>(null)

  return (
    <div
      style={backdrop}
      // Only a press on the dim part closes it: one that starts inside the card
      // and is released outside it - dragging a slider too far - must not.
      onMouseDown={(e) => {
        if (!card.current?.contains(e.target as Node)) onClose()
      }}
    >
      <div ref={card} style={sheet} role="dialog" aria-label="Settings">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.8 }}>SETTINGS</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...button, padding: '2px 8px' }}>
            esc
          </button>
        </div>

        <div style={tabRow} role="tablist">
          {SETTINGS_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === tab}
              onClick={() => {
                setTab(id)
                storeTab(id)
              }}
              style={{
                ...tabButton,
                background: id === tab ? '#e0a05a' : 'rgba(255,255,255,0.05)',
                color: id === tab ? '#20222a' : '#c8c3ba',
                borderColor: id === tab ? '#e0a05a' : 'rgba(255,255,255,0.12)',
              }}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>

        <div style={body}>
          {tab === 'island' ? <IslandTab /> : null}
          {tab === 'audio' ? <AudioTab /> : null}
          {tab === 'player' ? <PlayerTab /> : null}
          {tab === 'developer' ? <DeveloperTab /> : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ ...heading, ...(first ? { marginTop: 0 } : null) }}>{title}</div>
      {children}
    </section>
  )
}

/** The clock moves every frame; polling four times a second keeps it live. */
function useTicking(): () => void {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  return () => tick((n) => n + 1)
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

// ---------------------------------------------------------------- Island

function IslandTab() {
  const weather = useWeather()
  const net = useNet()
  useLightingSettings()
  useTicking()

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
    <>
      {guest ? (
        <div style={{ ...note, color: '#ffcf8a', marginBottom: 8 }}>
          the host of {net.room} sets the time and the weather
        </div>
      ) : net.status === 'joined' ? (
        <div style={{ ...note, marginBottom: 8 }}>you host - your clock and weather are everyone’s</div>
      ) : null}

      <Section title="TIME OF DAY" first>
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

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={guest}
            onClick={() => setCycleRunning(!running)}
            style={{
              ...button,
              background: running ? '#e0a05a' : 'rgba(255,255,255,0.06)',
              color: running ? '#20222a' : '#f2ece2',
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
        <div style={note}>an hour a cycle, 15 min each. speed it up to check it</div>
      </Section>

      <Section title="WEATHER">
        {/* Chosen, not simulated: every state is one click away rather than
            something you wait for. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {WEATHER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={guest}
              onClick={() => setWeather(kind)}
              style={{
                ...button,
                background: kind === weather && !guest ? '#e0a05a' : 'rgba(255,255,255,0.04)',
                color: guest ? '#8d8a84' : kind === weather ? '#20222a' : '#c8c3ba',
              }}
            >
              {WEATHER_LABELS[kind]}
            </button>
          ))}
        </div>
        <div style={{ ...note, marginTop: 5 }}>
          {WEATHER[weather].cloud > 0 ? `${Math.round(WEATHER[weather].cloud * 100)}% cloud` : 'clear sky'}
          {WEATHER[weather].precipitation === 'none' ? '' : `, ${WEATHER[weather].precipitation}`}
          {guest ? '' : ' - takes a few seconds to come over'}
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- Audio

function AudioTab() {
  const [effects, setEffects] = useState(() => {
    try {
      return readStoredVolume()
    } catch {
      return AUDIO.defaultVolume
    }
  })

  return (
    <>
      <Section title="SOUND EFFECTS" first>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ opacity: 0.55 }}>volume</span>
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
          <span style={{ opacity: 0.6, width: 28, textAlign: 'right' }}>{Math.round(effects * 100)}</span>
        </div>
        <div style={note}>
          footsteps, jumps and strokes{getCueEngine().ready ? '' : ' - click the world to start'}
        </div>
      </Section>

      <Section title="MUSIC">
        {/* The same player as the square in the bottom right corner - one
            song, driven from either place. */}
        <MusicControls />
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- Player

function PlayerTab() {
  const colour = usePlayerColour()
  const purse = usePurse()

  return (
    <>
      <Section title="COLOUR" first>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {PLAYER_COLOURS.map((c) => {
            const on = c.hex.toLowerCase() === colour.toLowerCase()
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPlayerColour(c.hex)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={on}
                style={{
                  height: 36,
                  borderRadius: 8,
                  background: c.hex,
                  border: on ? '3px solid #ffcf8a' : '1px solid rgba(255,255,255,0.2)',
                  boxShadow: on ? '0 0 10px rgba(255,207,138,0.6)' : 'none',
                  cursor: 'pointer',
                }}
              />
            )
          })}
        </div>
        <div style={note}>
          {PLAYER_COLOURS.find((c) => c.hex.toLowerCase() === colour.toLowerCase())?.label ?? 'custom'} -
          everybody in your lobby sees it
        </div>
      </Section>

      <Section title="WALLET">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {CURRENCIES.map((c) => (
            <div key={c.id} style={coin} title={c.label}>
              <span style={{ fontSize: 20 }} aria-hidden>
                {c.glyph}
              </span>
              <span style={{ color: c.colour, fontSize: 15, fontWeight: 700 }}>
                {formatAmount(balanceOf(purse, c.id))}
              </span>
              <span style={{ opacity: 0.55 }}>{c.label}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- Developer

function DeveloperTab() {
  const camera = useCameraMode()
  const view = useViewMode()
  const purse = usePurse()
  const tick = useTicking()

  return (
    <>
      <Section title="VIEW" first>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['first', 'third'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (mode !== view) toggleViewMode()
              }}
              disabled={camera !== 'player'}
              style={{
                ...button,
                flex: 1,
                background: mode === view && camera === 'player' ? '#e0a05a' : 'rgba(255,255,255,0.04)',
                color: camera !== 'player' ? '#6b6862' : mode === view ? '#20222a' : '#c8c3ba',
                cursor: camera === 'player' ? 'pointer' : 'default',
              }}
            >
              {mode === 'first' ? '1st person' : '3rd person'}
            </button>
          ))}
        </div>
        <div style={{ color: camera === 'player' ? '#8d8a84' : '#ffcf8a', marginTop: 4 }}>
          {camera === 'player' ? 'V to swap' : 'free orbit - player module is off'}
        </div>
        <div style={{ opacity: 0.5 }}>
          WASD walk, space jump,{' '}
          {view === 'first' ? 'drag to look' : 'drag to look, right-drag to pan, wheel to zoom'}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => {
              refocusCamera()
              tick()
            }}
            style={{ ...button, color: isCameraOffPlayer() ? '#ffcf8a' : '#f2ece2' }}
          >
            refocus on player (F)
          </button>
          {/* No minigame pushes anybody over in the world yet, so this is the
              only way to see the stun there. */}
          <button type="button" onClick={() => stunPlayer(1.5)} style={button}>
            knock over (1.5s)
          </button>
        </div>
      </Section>

      <Section title="MODULES">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          {SCENE.map((entry) => (
            <label key={entry.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                defaultChecked={entry.enabled}
                onChange={(e) => {
                  setModuleEnabled(entry.id, e.target.checked)
                  tick()
                }}
                style={{ accentColor: '#e0a05a' }}
              />
              <span style={{ color: entry.enabled ? '#f2ece2' : '#8d8a84' }}>{entry.id}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="PERFORMANCE">
        <Performance />
      </Section>

      <Section title="WALLET LEDGER">
        {/* Nothing much earns these yet, so the ledger can be pushed about by
            hand here to check it. */}
        {CURRENCIES.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 60, color: c.colour }}>{c.label}</span>
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
        <button type="button" onClick={clearPurse} style={{ ...flat, marginTop: 4, opacity: 0.5 }}>
          empty it
        </button>
      </Section>
    </>
  )
}

/**
 * The frame numbers, read while gating a module. Only sampled while this tab
 * is open - there is nothing to read them with otherwise.
 */
function Performance({ budgetMs = 16.6 }: { budgetMs?: number }) {
  const [s, setS] = useState<PerfSample>(readPerf)
  useEffect(() => {
    const id = setInterval(() => setS(readPerf()), 250)
    return () => clearInterval(id)
  }, [])

  const over = s.frameMs > budgetMs && s.frameMs > 0
  const cells: [string, string, boolean][] = [
    ['fps', String(s.fps), false],
    ['frame', `${s.frameMs.toFixed(2)} ms`, over],
    ['draws', String(s.drawCalls), false],
    ['tris', s.triangles.toLocaleString(), false],
    ['geom', String(s.geometries), false],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
      {cells.map(([label, value, warn]) => (
        <div key={label} style={{ ...coin, padding: '5px 4px' }}>
          <span style={{ color: warn ? '#ffb04a' : '#f2ece2' }}>{value}</span>
          <span style={{ opacity: 0.55 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

function GearIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#f2ece2"
        fillRule="evenodd"
        d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.7c.1.6.1 1.2 0 1.8l2 1.7-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.7a6 6 0 0 1 0-1.8l-2-1.7 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
        transform="translate(0 1)"
      />
    </svg>
  )
}

const gear: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.78)',
  border: '1px solid rgba(255,255,255,0.14)',
  padding: 0,
  cursor: 'pointer',
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  boxSizing: 'border-box',
  background: 'rgba(8, 10, 14, 0.45)',
}

const sheet: React.CSSProperties = {
  width: 'min(460px, 100%)',
  maxHeight: 'calc(100vh - 32px)',
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 16px',
  borderRadius: 12,
  background: 'rgba(20, 22, 26, 0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  color: '#f2ece2',
  font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  boxSizing: 'border-box',
  userSelect: 'none',
}

const tabRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 5,
  marginBottom: 12,
}

const tabButton: React.CSSProperties = {
  border: '1px solid',
  borderRadius: 6,
  font: 'inherit',
  fontWeight: 700,
  padding: '5px 4px',
  cursor: 'pointer',
}

// The page itself never scrolls - see `index.html` - so the tab's content has
// to, or a short window would strand the bottom of the Developer tab.
const body: React.CSSProperties = { overflowY: 'auto', overflowX: 'hidden', minHeight: 0, flex: 1 }

const heading: React.CSSProperties = { opacity: 0.55, letterSpacing: 0.6, margin: '16px 0 6px' }

const note: React.CSSProperties = { opacity: 0.45, marginTop: 3 }

const coin: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1,
  padding: '8px 4px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
}

const button: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '3px 8px',
  cursor: 'pointer',
}

const flat: React.CSSProperties = {
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: '#f2ece2',
  cursor: 'pointer',
  padding: 0,
}
