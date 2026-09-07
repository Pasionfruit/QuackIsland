import { describe, expect, it } from 'vitest'
import { LIGHTING, TIMES_OF_DAY, WEATHER, WEATHER_KINDS } from '../../00-core'
import { SKY, cloudThreshold, cloudUv, domeFits, horizonFalloff } from '../internal/dome'
import { PRECIPITATION } from '../internal/fall'

describe('the dome', () => {
  it('sits outside the fog and inside the far plane, in every weather', () => {
    // Inside the fog it is painted out with the very colour it is supposed to
    // be providing; past the far plane it is clipped and there is no sky at
    // all. Both look like the module is broken rather than mis-sized.
    const cameraFar = 12000
    for (const name of TIMES_OF_DAY) {
      for (const kind of WEATHER_KINDS) {
        // Weather only pulls the fog in, so clear weather is the worst case.
        const fogFar = LIGHTING[name].fogFar * Math.max(1, WEATHER[kind].fogFar)
        expect(domeFits(SKY.radius, fogFar, cameraFar)).toBe(true)
      }
    }
  })

  it('rejects a dome that is too small or too big', () => {
    expect(domeFits(100, 2600, 12000)).toBe(false)
    expect(domeFits(20000, 2600, 12000)).toBe(false)
  })
})

describe('where the clouds go', () => {
  it('puts straight up at the middle of the layer', () => {
    const [u, v] = cloudUv(0, 1, 0, SKY.cloudHeight)
    expect(u).toBeCloseTo(0, 9)
    expect(v).toBeCloseTo(0, 9)
  })

  it('runs away towards the horizon, which is what makes it a layer', () => {
    // Clouds pasted on the dome hang overhead like a fisheye. Projected onto a
    // flat plane they converge, which is what a real sky does.
    const high = Math.hypot(...cloudUv(0.3, 0.9, 0, SKY.cloudHeight))
    const low = Math.hypot(...cloudUv(0.3, 0.2, 0, SKY.cloudHeight))
    expect(low).toBeGreaterThan(high * 3)
  })

  it('stays finite looking straight at the horizon, and below it', () => {
    for (const y of [0, -0.5, -1]) {
      for (const value of cloudUv(1, y, 0, SKY.cloudHeight)) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('scales with how high the layer is', () => {
    const near = Math.hypot(...cloudUv(0.5, 0.8, 0, 500))
    const far = Math.hypot(...cloudUv(0.5, 0.8, 0, 2000))
    expect(far).toBeGreaterThan(near)
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

  it('clamps rather than inverting on a cover from outside the range', () => {
    expect(cloudThreshold(-1)).toBe(cloudThreshold(0))
    expect(cloudThreshold(2)).toBe(cloudThreshold(1))
  })

  it('fades out at the horizon, where the projection smears', () => {
    expect(horizonFalloff(-0.1)).toBe(0)
    expect(horizonFalloff(0)).toBe(0)
    expect(horizonFalloff(SKY.horizonFade)).toBe(0)
    expect(horizonFalloff(1)).toBe(1)
    expect(horizonFalloff(SKY.horizonFade * 2)).toBeGreaterThan(0)
    expect(horizonFalloff(SKY.horizonFade * 2)).toBeLessThan(1)
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
