import { it } from 'vitest'
import { YARD, layYard, look, toward } from '../internal/yard'

it('probe', () => {
  const rows: string[] = []
  let inBand = 0, headSeen = 0, fallback = 0, lookOk = 0
  const kinds: Record<string, number> = {}
  const t0 = performance.now()
  const N = 200
  for (let seed = 1; seed <= N; seed++) {
    const y = layYard(seed * 7919)
    const m = y.midnight
    const share = m.seen / m.points.length
    if (share >= YARD.seenLeast && share <= YARD.seenMost) inBand++
    const d = Math.hypot(m.x, m.z - 3)
    if (look(y, toward(m.points[0])) === 'midnight') lookOk++
    kinds[m.by + (m.on ? '-on' : '-by')] = (kinds[m.by + (m.on ? '-on' : '-by')] ?? 0) + 1
    if (seed <= 6) rows.push(`seed ${seed}: pieces ${y.pieces.length} boxes ${y.boxes.length} lamps ${y.lamps.length} cat ${m.pose} ${m.by}${m.on ? ' on' : ' by'} dist ${d.toFixed(1)} seen ${m.seen}/7 at ${m.x.toFixed(1)},${m.y.toFixed(2)},${m.z.toFixed(1)}`)
  }
  rows.push(`inBand ${inBand}/${N} headLook ${lookOk}/${N} ms/yard ${((performance.now() - t0) / N).toFixed(1)}`)
  rows.push(JSON.stringify(kinds))
  throw new Error('\nPROBE\n' + rows.join('\n'))
})
