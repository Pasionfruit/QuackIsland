/**
 * The junkyard: the same for everybody, findable, and fair.
 *
 * The expensive claim this module makes is that **Midnight is always partly in
 * sight and never all of it**, at every seed. It is not a claim a handful of
 * hand-picked seeds can support, so these run a hundred of them and hold the
 * layout to a band rather than to an example.
 */
import { describe, expect, it } from 'vitest'
import { CLICK_PAD, YARD, catShape, fanPoint, inSight, layYard, look, rayBox, toward, type Box, type Yard } from '../internal/yard'
import { EYE, direction, rayThrough, startView } from '../internal/view'

/** A spread of seeds, the same every run: this is the claim about all yards, not about one. */
const SEEDS = Array.from({ length: 100 }, (_, i) => (i + 1) * 7919)

const yards: Yard[] = SEEDS.map((seed) => layYard(seed))

describe('a yard', () => {
  it('is the same yard every time it is laid from the same seed', () => {
    const a = layYard(99_001)
    const b = layYard(99_001)
    expect(a.pieces.length).toBe(b.pieces.length)
    expect(a.midnight).toEqual(b.midnight)
    expect(a.boxes).toEqual(b.boxes)
    expect(layYard(99_002).midnight).not.toEqual(a.midnight)
  })

  it('fills up with junk, none of it overlapping and none of it behind you', () => {
    for (const yard of yards) {
      expect(yard.pieces.length, `${yard.seed} pieces`).toBeGreaterThan(YARD.pieces * 0.6)
      expect(yard.lamps.length, `${yard.seed} lamps`).toBe(YARD.lamps)
      for (const piece of yard.pieces) {
        const distance = Math.hypot(piece.x - EYE.x, piece.z - EYE.z)
        expect(distance, `${yard.seed} near`).toBeGreaterThan(YARD.near - 1)
        expect(distance, `${yard.seed} far`).toBeLessThan(YARD.fence)
        // In front of the camera: the yard is a fan, not a ring round your head.
        expect(piece.z, `${yard.seed} behind`).toBeLessThan(EYE.z)
      }
    }
  })

  it('gives every piece something for a click to land on, no bigger than the piece', () => {
    for (const yard of yards.slice(0, 20)) {
      for (const piece of yard.pieces) {
        expect(piece.boxes.length, `${yard.seed} ${piece.kind}`).toBeGreaterThan(0)
        for (const box of piece.boxes) {
          expect(Math.hypot(box.x - piece.x, box.z - piece.z), `${yard.seed} ${piece.kind} stray`).toBeLessThan(piece.radius + 1)
          expect(box.hy, `${yard.seed} ${piece.kind} flat`).toBeGreaterThan(0)
          expect(box.y - box.hy, `${yard.seed} ${piece.kind} floating`).toBeGreaterThan(-0.6)
        }
      }
    }
  })
})

describe('Midnight', () => {
  it('is always somewhere her head can be seen, between a third and four fifths of her showing', () => {
    let inBand = 0
    for (const yard of yards) {
      const cat = yard.midnight
      const share = cat.seen / cat.points.length
      // Her head is first in the list, and it is the one that must be visible.
      expect(inSight(yard.boxes, cat.points[0]), `${yard.seed} head`).toBe(true)
      expect(share, `${yard.seed} hidden`).toBeGreaterThan(0)
      expect(share, `${yard.seed} in the open`).toBeLessThan(1)
      if (share >= YARD.seenLeast && share <= YARD.seenMost) inBand += 1
    }
    // Every yard is meant to land in the band; the fallback exists for the one that cannot.
    expect(inBand).toBeGreaterThanOrEqual(SEEDS.length - 1)
  })

  it('is always far enough away to need the zoom, and never inside anything', () => {
    for (const yard of yards) {
      const cat = yard.midnight
      const distance = Math.hypot(cat.x - EYE.x, cat.z - EYE.z)
      expect(distance, `${yard.seed} near`).toBeGreaterThanOrEqual(YARD.catNear - 0.5)
      expect(distance, `${yard.seed} far`).toBeLessThanOrEqual(YARD.catFar + 0.5)
      // A cat at that distance is a couple of pixels across at the widest view:
      // under a degree, which is why the game is a zoom rather than a scan.
      const across = (2 * Math.atan(0.16 / distance) * 180) / Math.PI
      expect(across, `${yard.seed} size`).toBeLessThan(2)
    }
  })

  it('is what a click at her head lands on, from every seed', () => {
    for (const yard of yards) {
      expect(look(yard, toward(yard.midnight.points[0])), `${yard.seed}`).toBe('midnight')
    }
  })

  it('is not what a click a whisker wide of her lands on', () => {
    // Her padding is generous - she is a small thing to click - but it is not a barn door.
    let wide = 0
    for (const yard of yards) {
      const head = yard.midnight.spheres[0]
      const pad = head.r * CLICK_PAD.head
      for (const side of [-1, 1]) {
        const off = { x: head.x + side * pad * 4, y: head.y + pad * 4, z: head.z }
        if (look(yard, toward(off)) === 'midnight') wide += 1
      }
    }
    expect(wide).toBe(0)
  })

  it('sits on the ground or on top of something, facing roughly the camera', () => {
    for (const yard of yards) {
      const cat = yard.midnight
      expect(cat.y, `${yard.seed} underground`).toBeGreaterThanOrEqual(0)
      if (!cat.on) expect(cat.y, `${yard.seed} floating`).toBe(0)
      const toCamera = Math.atan2(EYE.x - cat.x, EYE.z - cat.z)
      const off = Math.abs(Math.atan2(Math.sin(cat.heading - toCamera), Math.cos(cat.heading - toCamera)))
      expect(off, `${yard.seed} facing`).toBeLessThanOrEqual(1.15)
    }
  })

  it('is drawn from the same shapes a click is tested against', () => {
    const { spheres, points } = catShape('sit', 1, 0, -12, 0.4)
    expect(spheres).toHaveLength(3)
    expect(points).toHaveLength(7)
    // Her head's middle is the first point, and it is the first sphere.
    expect(points[0]).toEqual({ x: spheres[0].x, y: spheres[0].y, z: spheres[0].z })
    for (const sphere of spheres) expect(sphere.r).toBeGreaterThan(0.05)
  })
})

describe('a click', () => {
  it('stops at whatever is in front, and finds nothing where there is nothing', () => {
    const yard = yards[0]
    expect(look(yard, { x: 0, y: 1, z: 0 })).toBe('nothing')
    expect(look(yard, { x: 0, y: 0, z: 0 })).toBe('nothing')
    // Straight at a piece of junk in the middle of the fan.
    const piece = yard.pieces.find((p) => p.boxes.length > 0)!
    expect(look(yard, toward({ x: piece.boxes[0].x, y: piece.boxes[0].y, z: piece.boxes[0].z }))).toBe('junk')
  })

  it('does not find her through a box that stands in the way', () => {
    const yard = yards[0]
    const cat = yard.midnight
    const between = toward(cat.points[0])
    const half = { x: (EYE.x + cat.x) / 2, y: (EYE.y + cat.y + 0.4) / 2, z: (EYE.z + cat.z) / 2 }
    const wall: Box = { x: half.x, y: half.y, z: half.z, hx: 1.2, hy: 1.2, hz: 1.2, yaw: 0 }
    expect(look(yard, between)).toBe('midnight')
    expect(look({ ...yard, boxes: [...yard.boxes, wall] }, between)).toBe('junk')
  })

  it('meets a box where the arithmetic says it does, turned or not', () => {
    const box: Box = { x: 0, y: 1, z: -10, hx: 1, hy: 1, hz: 1, yaw: 0 }
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box)).toBeCloseTo(9, 6)
    // Facing away from it.
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box)).toBe(Infinity)
    // Turned forty-five degrees, its corner comes to meet the ray.
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { ...box, yaw: Math.PI / 4 })).toBeCloseTo(10 - Math.SQRT2, 6)
  })

  it('from the middle of the screen is the way the camera is facing', () => {
    const view = startView()
    const middle = rayThrough(view, 0, 0, 16 / 9)
    const facing = direction(view.yaw, view.pitch)
    expect(middle.x).toBeCloseTo(facing.x, 6)
    expect(middle.y).toBeCloseTo(facing.y, 6)
    expect(middle.z).toBeCloseTo(facing.z, 6)
  })
})

describe('the fan the yard is laid in', () => {
  it('measures from the camera, north being away from it', () => {
    const straight = fanPoint(10, 0)
    expect(straight.x).toBeCloseTo(EYE.x, 6)
    expect(straight.z).toBeCloseTo(EYE.z - 10, 6)
    const left = fanPoint(10, YARD.spread)
    expect(left.x).toBeLessThan(EYE.x)
    expect(Math.hypot(left.x - EYE.x, left.z - EYE.z)).toBeCloseTo(10, 6)
  })
})
