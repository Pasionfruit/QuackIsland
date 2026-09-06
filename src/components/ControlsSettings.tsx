import { useEffect, useState } from 'react'
import { codeFor, codeLabel, hasOverride, rebind, resetAction, resetGame } from '../lib/controls'

export interface RemapRow {
  /** Storage key, e.g. 'smash.p0.attack' or 'hide.up'. */
  key: string
  label: string
  fallback: string
}

export interface RemapGroup {
  title: string
  rows: RemapRow[]
}

/**
 * A rebinding panel for one game: click an action, press the key you want it
 * on. Shared across every game rather than built per-game, since the only
 * thing that differs between them is which actions exist - see lib/controls.ts
 * for where a rebind actually gets saved.
 */
export function ControlsSettings({
  title,
  resetPrefix,
  groups,
}: {
  title: string
  /** Passed to resetGame() for the "Reset all" button - e.g. 'smash'. */
  resetPrefix: string
  groups: RemapGroup[]
}) {
  const [listening, setListening] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code !== 'Escape') rebind(listening, e.code)
      setListening(null)
      setTick((t) => t + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening])

  return (
    <div className="panel">
      <div className="panel__title">{title}</div>
      <div style={{ display: 'grid', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="fighter__title" style={{ marginBottom: 6 }}>
              {g.title}
            </div>
            <div className="keys">
              {g.rows.map((row) => {
                const custom = hasOverride(row.key)
                const current = codeFor(row.key, row.fallback)
                return (
                  <div className="keyrow" key={row.key}>
                    <span>{row.label}</span>
                    <div className="chiprow" style={{ marginBottom: 0 }}>
                      <button
                        type="button"
                        className={`btn btn--sm ${listening === row.key ? '' : 'btn--ghost'}`}
                        onClick={() => setListening(row.key)}
                      >
                        {listening === row.key ? 'Press a key…' : codeLabel(current)}
                      </button>
                      {custom && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            resetAction(row.key)
                            setTick((t) => t + 1)
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        style={{ marginTop: 14 }}
        onClick={() => {
          resetGame(resetPrefix)
          setTick((t) => t + 1)
        }}
      >
        Reset all to defaults
      </button>
    </div>
  )
}
