import { describe, expect, it } from 'vitest'
import { DUCK_FOOT, duckFootAt, duckFootGlsl } from '../internal/foot'

const inside = (x: number, y: number) => duckFootAt(x, y) < 0

/**
 * Counts separate spans of foot on a ring at radius `r` around the heel.
 *
 * Around the heel, not around the middle of the quad - a ring round the middle
 * also cuts through the heel pad and reports it as an extra toe.
 */
function toesAt(r: number): number {
  const steps = 3000
  let runs = 0
  let was = false
  let first = false
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const now = inside(DUCK_FOOT.heelX + Math.cos(a) * r, DUCK_FOOT.heelY + Math.sin(a) * r)
    if (i === 0) first = now
    if (now && !was) runs++
    was = now
  }
  // A span straddling the seam is one toe counted twice.
  if (first && was) runs--
  return runs
}

/** A point `s` of the way from the heel out to the gap between two toe tips. */
function webPoint(s: number): [number, number] {
  const [a, b] = [DUCK_FOOT.toes[0], DUCK_FOOT.toes[1]]
  const mx = (a.tipX + b.tipX) / 2
  const my = (a.tipY + b.tipY) / 2
  return [DUCK_FOOT.heelX + (mx - DUCK_FOOT.heelX) * s, DUCK_FOOT.heelY + (my - DUCK_FOOT.heelY) * s]
}

describe('the shape of the foot', () => {
  it('fits inside the quad it is drawn on', () => {
    // The field is cut out of a 2x2 quad spanning -1..1. Anything past that is
    // clipped off mid-toe, and nothing in the shader would report it.
    let extent = 0
    for (let i = 0; i <= 300; i++) {
      for (let j = 0; j <= 300; j++) {
        const x = -1.2 + (i / 300) * 2.4
        const y = -1.2 + (j / 300) * 2.4
        if (inside(x, y)) extent = Math.max(extent, Math.abs(x), Math.abs(y))
      }
    }
    expect(extent).toBeLessThan(1)
    // And it fills the quad rather than rattling around in the middle of it.
    expect(extent).toBeGreaterThan(0.8)
  })

  it('has a heel', () => {
    expect(inside(DUCK_FOOT.heelX, DUCK_FOOT.heelY)).toBe(true)
  })

  it('has three toes, and they stay separate out at the tips', () => {
    // Merging into one paddle is the failure mode if the webbing is turned up
    // too far; three sticks with no web between them is the other direction.
    expect(toesAt(1)).toBe(3)
    expect(toesAt(1.2)).toBe(3)
    for (const t of DUCK_FOOT.toes) expect(inside(t.tipX, t.tipY)).toBe(true)
  })

  it('is one solid pad close to the heel, before the toes divide', () => {
    expect(toesAt(0.5)).toBe(1)
  })

  it('is webbed between the toes', () => {
    // Out along the gap between two toe tips there should be webbing under
    // foot. Without it this is a chicken.
    expect(inside(...webPoint(0.5))).toBe(true)
  })

  it('is scalloped between the toes rather than filled flat', () => {
    // The web has to fall away before the tips, or the toes stop reading as
    // toes. It reaches about sixty percent of the way out.
    expect(inside(...webPoint(0.9))).toBe(false)
    const [a, b] = [DUCK_FOOT.toes[0], DUCK_FOOT.toes[1]]
    expect(inside((a.tipX + b.tipX) / 2, (a.tipY + b.tipY) / 2)).toBe(false)
  })

  it('reaches further forward than back', () => {
    // The instance matrix turns the print to the heading of the step, and a
    // heading of zero is +y here, so the toes must lead. This is also what
    // catches the blob the smooth minimum leaves behind the heel: unclipped it
    // reached further backwards than the toes reach forwards.
    let maxY = -Infinity
    let minY = Infinity
    for (let i = 0; i <= 300; i++) {
      for (let j = 0; j <= 300; j++) {
        const x = -1.2 + (i / 300) * 2.4
        const y = -1.2 + (j / 300) * 2.4
        if (!inside(x, y)) continue
        maxY = Math.max(maxY, y)
        minY = Math.min(minY, y)
      }
    }
    expect(maxY).toBeGreaterThan(-minY)
  })

  it('is not symmetric, so a left foot differs from a right', () => {
    // Left and right prints are this shape and its mirror. If the shape were
    // symmetric the two feet would be identical and the trail would lose the
    // splay that makes it read as a walk.
    let differs = false
    for (let i = 0; i <= 120 && !differs; i++) {
      for (let j = 0; j <= 120; j++) {
        const x = -1 + (i / 120) * 2
        const y = -1 + (j / 120) * 2
        if (inside(x, y) !== inside(-x, y)) {
          differs = true
          break
        }
      }
    }
    expect(differs).toBe(true)
  })

  it('is a single connected foot, not three floating toes', () => {
    // Flood fill from the heel: everything inside must be reachable, or a toe
    // has come adrift.
    const N = 160
    const at = (i: number, j: number) => [-1 + (i / N) * 2, -1 + (j / N) * 2] as const
    const solid: boolean[] = []
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const [x, y] = at(i, j)
        solid[j * (N + 1) + i] = inside(x, y)
      }
    }
    const seen = new Set<number>()
    const startI = Math.round(((DUCK_FOOT.heelX + 1) / 2) * N)
    const startJ = Math.round(((DUCK_FOOT.heelY + 1) / 2) * N)
    const stack = [startJ * (N + 1) + startI]
    while (stack.length) {
      const k = stack.pop() as number
      if (seen.has(k) || !solid[k]) continue
      seen.add(k)
      const i = k % (N + 1)
      const j = Math.floor(k / (N + 1))
      if (i > 0) stack.push(k - 1)
      if (i < N) stack.push(k + 1)
      if (j > 0) stack.push(k - (N + 1))
      if (j < N) stack.push(k + (N + 1))
    }
    const total = solid.filter(Boolean).length
    expect(seen.size).toBe(total)
  })
})

describe('the generated shader', () => {
  it('declares the field the material calls', () => {
    expect(duckFootGlsl()).toContain('float duckFoot(vec2 p)')
  })

  it('carries one toe per toe, so none is silently dropped', () => {
    expect(duckFootGlsl().match(/toe\(p, heel,/g) ?? []).toHaveLength(DUCK_FOOT.toes.length)
  })

  it('is generated from the same numbers the field uses', () => {
    // Nudging a toe here has to reach the shader, or what is drawn stops being
    // what is tested.
    const glsl = duckFootGlsl()
    for (const t of DUCK_FOOT.toes) expect(glsl).toContain(t.tipY.toFixed(4))
    expect(glsl).toContain(DUCK_FOOT.web.toFixed(4))
    expect(glsl).toContain(DUCK_FOOT.heelCut.toFixed(4))
  })

  it('writes every float in a form GLSL will accept', () => {
    // `1` is an int in GLSL and will not multiply a float.
    const glsl = duckFootGlsl()
    const literals = glsl.match(/(?<![A-Za-z0-9_.])\d+(?:\.\d+)?/g) ?? []
    expect(literals.length).toBeGreaterThan(DUCK_FOOT.toes.length * 3)
    for (const n of literals) expect(n).toContain('.')
  })
})
