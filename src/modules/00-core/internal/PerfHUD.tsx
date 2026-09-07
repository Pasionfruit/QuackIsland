/**
 * The numbers you read while gating a module.
 *
 * Frame cost and draw calls cannot be asserted honestly in a Node test - a
 * software GL context proves calls were issued, not that the frame was fast -
 * so this is how they get measured, by a person, on real hardware. What you
 * read here goes into the module's MODULE.md and pipeline.json `measured`.
 */
import { useEffect, useState } from 'react'
import { readPerf, type PerfSample } from './perf'

export function PerfHUD({ budgetMs = 16.6 }: { budgetMs?: number }) {
  const [s, setS] = useState<PerfSample>(readPerf)

  useEffect(() => {
    const id = setInterval(() => setS(readPerf()), 250)
    return () => clearInterval(id)
  }, [])

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
        position: 'fixed',
        top: 10,
        left: 10,
        zIndex: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(20, 22, 26, 0.72)',
        color: '#f2ece2',
        font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none',
        minWidth: 150,
      }}
    >
      {row('fps', String(s.fps))}
      {row('frame', `${s.frameMs.toFixed(2)} ms`, over)}
      {row('draws', String(s.drawCalls))}
      {row('tris', s.triangles.toLocaleString())}
      {row('geom', String(s.geometries))}
    </div>
  )
}
