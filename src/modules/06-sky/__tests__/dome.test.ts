import { describe, expect, it } from 'vitest'
import { CAMERA, LIGHTING, TIMES_OF_DAY, WEATHER, WEATHER_KINDS } from '../../00-core'
import { SKY, cloudThreshold, cloudUv, domeFits, hazeAt, horizonClip } from '../internal/dome'
import { PRECIPITATION } from '../internal/fall'

describe('the dome', () => {
  it('sits outside the fog and inside the real far plane, in every weather', () => {
    // Against `CAMERA.far` itself, not a number invented here. An earlier
    // version of this test made up a far plane of 12000 and passed while the
    // dome was 6000 against a real far plane of 5000 - so the test was green
    // and the sky had a hole in it.
    for (const name of TIMES_OF_DAY) {
      for (const kind of WEATHER_KINDS) {
        // Weather only pulls the fog in, so clear weather is the worst case.
        const fogFar = LIGHTING[name].fogFar * Math.max(1, WEATHER[kind].fogFar)
        expect(domeFits(SKY.radius, fogFar, CAMERA.far)).toBe(true)
      }
    }
  })

  it('leaves no circular hole where the far plane cuts across it', () => {
    // The far plane clips on view-space *depth*, not on distance from the
    // camera. A dome of radius R is at depth R * cos(theta) for a direction
    // theta off the view axis, so a dome bigger than `far` survives at the
    // edges of the screen and is clipped in the middle - a circular hole
    // centred on wherever you look, following you about. This is that check,
    // stated the way the hardware actually behaves.
    const worstDepth = SKY.radius // straight ahead, theta = 0
    expect(worstDepth).toBeLessThan(CAMERA.far)
    // And with room to spare, so a small change to either does not reopen it.
    expect(SKY.radius).toBeLessThan(CAMERA.far * 0.9)
  })

  it('rejects a dome that is too small or too big', () => {
    expect(domeFits(100, 2600, CAMERA.far)).toBe(false)
    expect(domeFits(CAMERA.far + 1, 2600, CAMERA.far)).toBe(false)
    // The exact case that shipped.
    expect(domeFits(6000, 2600, 5000)).toBe(false)
  })
})

describe('where the clouds go', () => {
  it('puts straight up at the middle of the layer', () => {
    const [u, v] = cloudUv(0, 1, 0)
    expect(u).toBeCloseTo(0, 9)
    expect(v).toBeCloseTo(0, 9)
  })

  it('spreads out towards the horizon, which is what makes it a layer', () => {
    // Clouds pasted on the dome hang overhead like a fisheye. Projected onto a
    // flat plane they converge, which is what a real sky does.
    const high = Math.hypot(...cloudUv(0.3, 0.9, 0))
    const low = Math.hypot(...cloudUv(0.3, 0.2, 0))
    expect(low).toBeGreaterThan(high)
  })

  it('keeps growing all the way down, so the detail never runs out', () => {
    // Compressed, not clipped. A projection that stops growing turns the last
    // few degrees of sky into radial stripes.
    let last = 0
    for (const y of [0.9, 0.6, 0.4, 0.25, 0.15, 0.08, 0.04, 0.01]) {
      const r = Math.hypot(...cloudUv(0.4, y, 0.2))
      expect(r).toBeGreaterThan(last)
      last = r
    }
  })

  it('compresses rather than exploding, so the noise does not smear', () => {
    // The raw projection is `1/y` and goes to infinity. This has to stay
    // somewhere a noise function can still be sampled.
    const overhead = Math.hypot(...cloudUv(0.4, 0.9, 0.2))
    const horizon = Math.hypot(...cloudUv(0.4, 0.001, 0.2))
    expect(horizon / overhead).toBeLessThan(12)
    expect(horizon).toBeLessThan(30)
  })

  it('is barely distorted overhead, where there is nothing to compress', () => {
    // log(1 + r) / r goes to 1 as r goes to 0, so the compression fades out
    // towards the zenith and the clouds straight above you are not stretched.
    // It is a limit, not an identity: a couple of percent at five degrees off
    // vertical, and vanishing from there.
    for (const [x, tolerance] of [
      [0.005, 0.005],
      [0.05, 0.03],
    ] as const) {
      const [u] = cloudUv(x, 1, 0)
      expect(Math.abs(u / (x * SKY.cloudScale) - 1)).toBeLessThan(tolerance)
    }
    // And it only ever shrinks the projection, never stretches it.
    for (const x of [0.01, 0.1, 0.5, 2]) {
      expect(cloudUv(x, 1, 0)[0]).toBeLessThanOrEqual(x * SKY.cloudScale)
    }
  })

  it('stays finite looking straight at the horizon, and below it', () => {
    for (const y of [0, -0.5, -1]) {
      for (const value of cloudUv(1, y, 0)) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
    for (const value of cloudUv(0, 1, 0)) expect(Number.isFinite(value)).toBe(true)
  })
})

describe('how much sky the clouds cover', () => {
  it('is a clear sky at zero and a solid one at full', () => {
    // The noise it thresholds runs about 0..1, so a threshold above that is
    // clear and below it is solid. Anything in between leaves stray wisps on a
    // sunny day, which is exactly the thing you would notice.
    expect(cloudThreshold(0)).toBeGreaterThan(1)
    expect(cloudThreshold(1)).toBeLessThan(0)
  })

  it('thickens as cover rises, without a step in it', () => {
    let last = Infinity
    for (let c = 0; c <= 1; c += 0.05) {
      const t = cloudThreshold(c)
      expect(t).toBeLessThan(last)
      last = t
    }
  })

  it('still leaves a sunny sky completely clear, at every elevation', () => {
    // Thickening towards the horizon must not put a band of cloud round a
    // clear day - that would be the same bug with the sign flipped.
    for (let y = 0; y <= 1; y += 0.02) {
      expect(cloudThreshold(0, y)).toBeGreaterThan(0.8)
    }
  })

  it('clamps rather than inverting on a cover from outside the range', () => {
    expect(cloudThreshold(-1)).toBe(cloudThreshold(0))
    expect(cloudThreshold(2)).toBe(cloudThreshold(1))
  })

  it('leaves no ring of clear sky round the player', () => {
    // The bug this replaces: cloud was faded out below about seventeen degrees,
    // which on an overcast day left a band of bright clear sky all the way
    // round the horizon - a very obvious circle centred on wherever you stood.
    //
    // Overcast has to stay overcast every degree of the way down.
    for (let y = 0.05; y <= 1; y += 0.01) {
      // A solid sky thresholds well below what the noise reaches, everywhere.
      expect(cloudThreshold(0.9, y)).toBeLessThan(0.2)
      expect(horizonClip(y)).toBe(1)
    }
  })

  it('gets thicker towards the horizon, not thinner', () => {
    // A flat layer seen edge-on packs together. Going the other way is what
    // produced the ring.
    let last = Infinity
    for (const y of [1, 0.8, 0.6, 0.4, 0.2, 0.1, 0.05]) {
      const t = cloudThreshold(0.62, y)
      expect(t).toBeLessThanOrEqual(last)
      last = t
    }
    expect(cloudThreshold(0.62, 0.05)).toBeLessThan(cloudThreshold(0.62, 1))
  })

  it('goes to haze at the horizon rather than to nothing', () => {
    // Merging into the horizon colour is what a real cloud layer does, and it
    // is why there is no longer an edge to see.
    expect(hazeAt(1)).toBe(0)
    expect(hazeAt(SKY.hazeTo)).toBe(0)
    expect(hazeAt(0)).toBe(1)
    expect(hazeAt(SKY.hazeTo / 2)).toBeGreaterThan(0)
    expect(hazeAt(SKY.hazeTo / 2)).toBeLessThan(1)
  })

  it('paints nothing below the horizon line', () => {
    expect(horizonClip(-0.05)).toBe(0)
    expect(horizonClip(-0.01)).toBe(0)
    expect(horizonClip(0.045)).toBe(1)
    expect(horizonClip(1)).toBe(1)
  })

  it('has every weather asking for a cover the dome can draw', () => {
    for (const kind of WEATHER_KINDS) {
      const cover = WEATHER[kind].cloud
      expect(cover).toBeGreaterThanOrEqual(0)
      expect(cover).toBeLessThanOrEqual(1)
    }
  })
})

describe('what falls out of it', () => {
  it('allocates once for the heaviest weather there is', () => {
    // The buffers are built for the maximum and thinned by fading the tail, so
    // the allocation has to cover every preset or the heaviest gets clipped.
    for (const kind of WEATHER_KINDS) {
      expect(WEATHER[kind].count).toBeLessThanOrEqual(PRECIPITATION.max)
    }
    expect(Math.max(...WEATHER_KINDS.map((k) => WEATHER[k].count))).toBe(PRECIPITATION.max)
  })

  it('draws rain as a streak and snow as a dot', () => {
    expect(PRECIPITATION.rain.height).toBeGreaterThan(PRECIPITATION.rain.width * 8)
    expect(PRECIPITATION.rain.round).toBe(0)
    expect(PRECIPITATION.snow.height).toBeCloseTo(PRECIPITATION.snow.width, 6)
    expect(PRECIPITATION.snow.round).toBe(1)
  })

  it('only lets snow wander on the way down', () => {
    expect(PRECIPITATION.rain.drift).toBe(0)
    expect(PRECIPITATION.snow.drift).toBeGreaterThan(0)
  })

  it('puts a box round the camera big enough not to notice the edge of', () => {
    expect(PRECIPITATION.box).toBeGreaterThan(50)
    expect(PRECIPITATION.boxHeight).toBeGreaterThan(30)
  })

  it('keeps every particle in view long enough to be seen falling', () => {
    // A particle that crosses the whole box in a blink is a flicker, not rain.
    for (const style of [PRECIPITATION.rain, PRECIPITATION.snow]) {
      expect(PRECIPITATION.boxHeight / style.fall).toBeGreaterThan(1)
    }
    // And snow hangs about far longer than rain, which is most of what makes
    // it read as snow at all.
    expect(PRECIPITATION.boxHeight / PRECIPITATION.snow.fall).toBeGreaterThan(
      (PRECIPITATION.boxHeight / PRECIPITATION.rain.fall) * 4,
    )
  })

  it('fades in and out rather than appearing all at once', () => {
    expect(PRECIPITATION.fade).toBeGreaterThan(0.5)
  })

  it('drifts sideways by much less than the gaps between flakes', () => {
    // Drift bigger than the spacing makes the whole field visibly sway as one,
    // which reads as the camera moving rather than the snow.
    const spacing = PRECIPITATION.box / Math.cbrt(WEATHER.snowing.count)
    expect(PRECIPITATION.snow.drift).toBeLessThan(spacing)
  })
})
