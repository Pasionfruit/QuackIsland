/**
 * The numbers you read while gating a module.
 *
 * Frame cost and draw calls cannot be asserted honestly in a Node test - a
 * software GL context proves calls were issued, not that the frame was fast -
 * so this is how they get measured, by a person, on real hardware. What you
 * read here goes into the module's MODULE.md and pipeline.json `measured`.
 */
import { useEffect, useState } from 'react'
import { useFolded } from './fold'
import { readPerf, type PerfSample } from './perf'

export function PerfHUD({ budgetMs = 16.6 }: { budgetMs?: number }) {
  const [s, setS] = useState<PerfSample>(readPerf)
  const [folded, toggle] = useFolded('perf')

  useEffect(() => {
    // Nothing to sample while it is folded away, so do not.
    if (folded) return
    const id = setInterval(() => setS(readPerf()), 250)
    return () => clearInterval(id)
  }, [folded])

  const over = s.frameMs > budgetMs && s.frameMs > 0
  const row = (label: string, value: string, warn = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ color: warn ? '#ffb04a' : '#f2ece2' }}>{value}</span>
    </div>
  )

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(20, 22, 26, 0.72)',
        color: '#f2ece2',
        font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        width: 168,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
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
          opacity: 0.55,
          letterSpacing: 0.6,
        }}
        title={folded ? 'Show' : 'Hide'}
      >
        {/* The frame rate stays on the header when folded: it is the one number
            worth glancing at without opening anything. */}
        <span>PERF{folded ? ` \u00b7 ${s.fps} fps` : ''}</span>
        <span style={{ opacity: 0.7 }}>{folded ? '+' : '\u2013'}</span>
      </button>

      {folded ? null : (
        <div style={{ marginTop: 3 }}>
          {row('fps', String(s.fps))}
          {row('frame', `${s.frameMs.toFixed(2)} ms`, over)}
          {row('draws', String(s.drawCalls))}
          {row('tris', s.triangles.toLocaleString())}
          {row('geom', String(s.geometries))}
        </div>
      )}
    </div>
  )
}
