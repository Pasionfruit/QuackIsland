/**
 * The rules: the feed, the ads in it, the wheel, and who wins.
 */
import { describe, expect, it } from 'vitest'
import {
  ADS,
  FEED,
  blocked,
  capOf,
  createGame,
  drainWheel,
  finished,
  leave,
  newWheel,
  nextAd,
  placings,
  planAds,
  queueWheel,
  report,
  rpm,
  scroll,
  skipAd,
  stepGame,
  timeLeft,
  wheelReels,
} from '../internal/rules'
import { adCopyAt, reelAt } from '../internal/reels'

const game = () => createGame(4242, [{ id: 'a', mine: true }, { id: 'b' }, { id: 'c' }])

/** Scroll player `i` all the way to the end, skipping every ad on the way. */
function race(g: ReturnType<typeof game>, i: number, ends = true) {
  for (let n = 0; n < 200 && !finished(g.players[i]); n++) {
    if (blocked(g, g.players[i])) skipAd(g, i, g.players[i].skipped)
    else scroll(g, i, 1.3, ends)
  }
}

describe('the ads', () => {
  it('are the same for the same seed, and differ between seeds', () => {
    expect(planAds(7)).toEqual(planAds(7))
    expect(planAds(7)).not.toEqual(planAds(8))
  })

  it('come in order, spaced out, all before the end, with the buttons on the screen', () => {
    for (let seed = 1; seed < 200; seed++) {
      const ads = planAds(seed)
      expect(ads.length).toBeGreaterThan(5)
      expect(ads.length).toBeLessThanOrEqual(ADS.most)
      expect(ads[0].reel).toBe(ADS.first)
      ads.forEach((ad, i) => {
        expect(ad.reel).toBeLessThan(FEED.reels)
        if (i > 0) {
          expect(ad.reel - ads[i - 1].reel).toBeGreaterThanOrEqual(ADS.gap[0])
          expect(ad.reel - ads[i - 1].reel).toBeLessThanOrEqual(ADS.gap[1])
        }
        for (const v of [ad.x, ad.y]) {
          expect(v).toBeGreaterThan(0.1)
          expect(v).toBeLessThan(0.9)
        }
      })
    }
  })

  it('shrink their skip buttons as the feed goes on', () => {
    const ads = planAds(99)
    expect(ads[0].size).toBe(ADS.size[0])
    for (let i = 1; i < ads.length; i++) expect(ads[i].size).toBeLessThan(ads[i - 1].size)
    expect(ads[ads.length - 1].size).toBeGreaterThanOrEqual(ADS.size[1])
  })

  it('put their buttons in different places', () => {
    const spots = new Set(planAds(5).map((ad) => `${ad.x}:${ad.y}`))
    expect(spots.size).toBe(planAds(5).length)
  })
})

describe('scrolling', () => {
  it('moves you down the feed', () => {
    const g = game()
    expect(scroll(g, 0, 1.5)).toBe(1.5)
    expect(g.players[0].progress).toBe(1.5)
  })

  it('stops dead at an ad, and does nothing more until it is skipped', () => {
    const g = game()
    g.clock = 3
    const ad = g.ads[0]
    scroll(g, 0, 100)
    expect(g.players[0].progress).toBe(ad.reel)
    expect(blocked(g, g.players[0])).toBe(true)
    expect(g.players[0].blockedAt).toBe(3)
    expect(scroll(g, 0, 1)).toBe(0)
    expect(g.players[0].progress).toBe(ad.reel)
  })

  it('carries on once the ad is skipped, to the next one', () => {
    const g = game()
    scroll(g, 0, 100)
    expect(skipAd(g, 0, 0)).toBe(true)
    expect(g.players[0].blockedAt).toBeNull()
    expect(nextAd(g, g.players[0])).toBe(g.ads[1])
    scroll(g, 0, 100)
    expect(g.players[0].progress).toBe(g.ads[1].reel)
  })

  it('only skips the ad that is up', () => {
    const g = game()
    expect(skipAd(g, 0, 0)).toBe(false)
    scroll(g, 0, 100)
    expect(skipAd(g, 0, 1)).toBe(false)
    expect(skipAd(g, 0, 0)).toBe(true)
    expect(skipAd(g, 0, 0)).toBe(false)
  })

  it('does not go backwards, or anywhere at all for nonsense', () => {
    const g = game()
    scroll(g, 0, 1)
    expect(scroll(g, 0, -1)).toBe(0)
    expect(scroll(g, 0, Number.NaN)).toBe(0)
    expect(g.players[0].progress).toBe(1)
  })

  it('runs out at the end of the feed, and the first there ends the game', () => {
    const g = game()
    g.clock = 20
    race(g, 1)
    expect(g.players[1].progress).toBe(FEED.reels)
    expect(g.players[1].skipped).toBe(g.ads.length)
    expect(g.players[1].finishedAt).toBe(20)
    expect(g.over).toBe(true)
    expect(capOf(g, g.players[1])).toBe(FEED.reels)
  })

  it('does not end the game on a guest - that is the host\'s to say', () => {
    const g = game()
    race(g, 0, false)
    expect(finished(g.players[0])).toBe(true)
    expect(g.over).toBe(false)
  })
})

describe('what a guest says of itself', () => {
  it('moves them on, never back, and not past an ad nobody skipped', () => {
    const g = game()
    report(g, 1, 50, 0)
    expect(g.players[1].progress).toBe(g.ads[0].reel)
    report(g, 1, 50, 2)
    expect(g.players[1].skipped).toBe(2)
    expect(g.players[1].progress).toBe(g.ads[2].reel)
    report(g, 1, 1, 0)
    expect(g.players[1].skipped).toBe(2)
    expect(g.players[1].progress).toBe(g.ads[2].reel)
  })

  it('ends the game at the end of the feed', () => {
    const g = game()
    report(g, 2, FEED.reels, g.ads.length)
    expect(finished(g.players[2])).toBe(true)
    expect(g.over).toBe(true)
  })
})

describe('the game', () => {
  it('runs to the time limit', () => {
    const g = game()
    for (let i = 0; i < FEED.limit * 10 + 10; i++) stepGame(g, 0.1)
    expect(g.over).toBe(true)
    expect(timeLeft(g)).toBe(0)
  })

  it('ends when everybody has gone', () => {
    const g = game()
    leave(g, 0)
    leave(g, 1)
    leave(g, 2)
    stepGame(g, 0.1)
    expect(g.over).toBe(true)
  })

  it('places finishers first, soonest first, then everybody else by how far they got', () => {
    const g = game()
    scroll(g, 2, 2)
    scroll(g, 1, 1)
    g.clock = 12
    race(g, 0)
    const order = placings(g)
    expect(order.map((e) => e.player.id)).toEqual(['a', 'c', 'b'])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3])
  })

  it('shares a place when level', () => {
    const g = game()
    scroll(g, 1, 2)
    scroll(g, 2, 2)
    const order = placings(g)
    expect(order.map((e) => e.place)).toEqual([1, 1, 3])
  })
})

describe('the wheel', () => {
  it('counts only scrolling down, a notch at a time, and not a page at a time', () => {
    expect(wheelReels(100)).toBeCloseTo(100 / FEED.reelPx)
    expect(wheelReels(-100)).toBe(0)
    expect(wheelReels(3, 1)).toBeCloseTo(120 / FEED.reelPx)
    expect(wheelReels(1, 2)).toBeCloseTo(FEED.eventPx / FEED.reelPx)
    expect(wheelReels(1e9)).toBeCloseTo(FEED.eventPx / FEED.reelPx)
  })

  it('drains no faster than the top speed, and throws away what piles up past the queue', () => {
    const w = newWheel()
    for (let i = 0; i < 50; i++) queueWheel(w, wheelReels(240))
    expect(w.queued).toBe(FEED.queueMax)
    let moved = 0
    for (let i = 0; i < 10; i++) moved += drainWheel(w, 0.1)
    expect(moved).toBeCloseTo(FEED.queueMax)
    const again = newWheel()
    queueWheel(again, 1)
    expect(drainWheel(again, 0.1)).toBeCloseTo(FEED.maxRate * 0.1)
  })
})

describe('the speedometer', () => {
  it('reads reels a minute', () => {
    expect(rpm([])).toBe(0)
    expect(rpm([{ at: 0, progress: 0 }, { at: 1, progress: 3 }])).toBeCloseTo(180)
    // Only the last little while counts.
    expect(rpm([{ at: 0, progress: 0 }, { at: 5, progress: 0 }, { at: 6, progress: 2 }])).toBeCloseTo(120)
  })
})

describe('the feed', () => {
  it('has the same reels and ads on everybody\'s phone', () => {
    expect(reelAt(3, 10)).toEqual(reelAt(3, 10))
    expect(adCopyAt(3, 2)).toEqual(adCopyAt(3, 2))
    const hues = new Set(Array.from({ length: FEED.reels }, (_, i) => reelAt(3, i).hue))
    expect(hues.size).toBeGreaterThan(30)
  })
})
