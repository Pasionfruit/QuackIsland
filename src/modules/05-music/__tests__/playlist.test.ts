import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MUSIC,
  clampVolume,
  formatTime,
  nextIndex,
  parseTracks,
  previousIndex,
  stepBack,
  trackLabel,
} from '../internal/playlist'

describe('running through the playlist', () => {
  it('goes forwards and wraps round the end', () => {
    expect(nextIndex(0, 4)).toBe(1)
    expect(nextIndex(2, 4)).toBe(3)
    // Which is what makes it a *running* playlist rather than one that stops.
    expect(nextIndex(3, 4)).toBe(0)
  })

  it('goes backwards and wraps off the front', () => {
    expect(previousIndex(2, 4)).toBe(1)
    expect(previousIndex(0, 4)).toBe(3)
  })

  it('survives an empty playlist rather than dividing by zero', () => {
    expect(nextIndex(0, 0)).toBe(0)
    expect(previousIndex(0, 0)).toBe(0)
    expect(Number.isNaN(nextIndex(0, 0))).toBe(false)
  })

  it('gets back on the list from an index that is off it', () => {
    expect(nextIndex(99, 4)).toBe(0)
    expect(previousIndex(-5, 4)).toBe(3)
    for (const i of [-3, 0, 7, 99]) {
      expect(nextIndex(i, 4)).toBeGreaterThanOrEqual(0)
      expect(nextIndex(i, 4)).toBeLessThan(4)
      expect(previousIndex(i, 4)).toBeGreaterThanOrEqual(0)
      expect(previousIndex(i, 4)).toBeLessThan(4)
    }
  })

  it('comes back to where it started after a full lap', () => {
    let i = 0
    for (let n = 0; n < 4; n++) i = nextIndex(i, 4)
    expect(i).toBe(0)
  })
})

describe('what the back button does', () => {
  it('restarts the track when you are already into it', () => {
    // What every music player does and what everyone's hands expect: back once
    // for the top of this song, twice for the one before.
    expect(stepBack(2, 4, MUSIC.restartWindow)).toBe(2)
    expect(stepBack(2, 4, 30)).toBe(2)
  })

  it('goes to the previous track when you have only just started', () => {
    expect(stepBack(2, 4, 0)).toBe(1)
    expect(stepBack(2, 4, MUSIC.restartWindow - 0.01)).toBe(1)
  })

  it('wraps to the end of the list from the first track', () => {
    expect(stepBack(0, 4, 0)).toBe(3)
  })

  it('restarts rather than going nowhere on a one-track playlist', () => {
    expect(stepBack(0, 1, 0)).toBe(0)
    expect(stepBack(0, 1, 10)).toBe(0)
  })

  it('takes the window as an argument, so the rule is not baked in', () => {
    expect(stepBack(2, 4, 5, 10)).toBe(1)
    expect(stepBack(2, 4, 5, 1)).toBe(2)
  })
})

describe('volume', () => {
  it('stays between silent and full', () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(0)).toBe(0)
    expect(clampVolume(0.5)).toBe(0.5)
    expect(clampVolume(1)).toBe(1)
    expect(clampVolume(4)).toBe(1)
  })

  it('falls back to the default rather than passing rubbish to the element', () => {
    // Setting `volume` to NaN throws in the browser, and the value comes from
    // localStorage, which can hold anything at all.
    expect(clampVolume(Number.NaN)).toBe(MUSIC.defaultVolume)
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(MUSIC.defaultVolume)
    expect(clampVolume(Number.parseFloat('nonsense'))).toBe(MUSIC.defaultVolume)
  })

  it('starts somewhere in the background, not at full blast', () => {
    expect(MUSIC.defaultVolume).toBeGreaterThan(0)
    expect(MUSIC.defaultVolume).toBeLessThan(0.7)
  })
})

describe('the readout', () => {
  it('shows minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(61)).toBe('1:01')
    expect(formatTime(215)).toBe('3:35')
    expect(formatTime(600)).toBe('10:00')
  })

  it('rounds down, so it never shows a second that has not happened', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })

  it('says it does not know rather than showing NaN', () => {
    // `duration` is NaN until the metadata arrives, which is a real frame or
    // two of the panel being on screen.
    expect(formatTime(Number.NaN)).toBe('-:--')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('-:--')
    expect(formatTime(-1)).toBe('-:--')
  })

  it('names a track by artist and title, and copes without either', () => {
    expect(trackLabel({ src: 'a.mp3', artist: 'Moavii', title: 'Display' })).toBe('Moavii - Display')
    expect(trackLabel({ src: 'a.mp3', artist: '', title: 'Display' })).toBe('Display')
    expect(trackLabel(null)).toBe('no music')
  })
})

describe('reading the manifest', () => {
  it('reads a well-formed one', () => {
    const tracks = parseTracks({
      tracks: [{ src: 'music/a.mp3', title: 'A', artist: 'Someone' }],
    })
    expect(tracks).toEqual([{ src: 'music/a.mp3', title: 'A', artist: 'Someone' }])
  })

  it('gives up quietly on rubbish rather than throwing', () => {
    // This comes off the network. Music failing to load must never be the
    // thing that stops the game running.
    for (const bad of [null, undefined, 42, 'nope', {}, { tracks: 'no' }, { tracks: {} }]) {
      expect(parseTracks(bad)).toEqual([])
    }
  })

  it('drops entries with nothing to play and keeps the rest', () => {
    const tracks = parseTracks({
      tracks: [
        { title: 'no source' },
        { src: '', title: 'empty source' },
        null,
        'string',
        { src: 'music/good.mp3', title: 'Good', artist: 'X' },
      ],
    })
    expect(tracks).toHaveLength(1)
    expect(tracks[0].src).toBe('music/good.mp3')
  })

  it('falls back to the filename when a track has no title', () => {
    const [track] = parseTracks({ tracks: [{ src: 'music/x.mp3' }] })
    expect(track.title).toBe('music/x.mp3')
    expect(track.artist).toBe('')
  })
})

describe('the manifest that actually ships', () => {
  const raw = JSON.parse(readFileSync('public/assets/music/tracks.json', 'utf8'))
  const tracks = parseTracks(raw)

  it('has music in it', () => {
    expect(tracks.length).toBeGreaterThan(0)
  })

  it('parses without losing a single track', () => {
    // A file that parses to fewer tracks than it lists is a manifest with a
    // typo in it, which would otherwise just be a song that never plays.
    expect(tracks).toHaveLength(raw.tracks.length)
  })

  it('points at files that are really there', () => {
    for (const track of tracks) {
      expect(() => readFileSync(`public/assets/${track.src}`)).not.toThrow()
    }
  })

  it('names every track, and has no duplicate sources', () => {
    for (const track of tracks) {
      expect(track.title.length).toBeGreaterThan(0)
      // The scan strips the "(freetouse.com)" credit off the display name.
      expect(track.title).not.toContain('.mp3')
      expect(track.title).not.toContain('freetouse')
    }
    expect(new Set(tracks.map((t) => t.src)).size).toBe(tracks.length)
  })

  it('lists every song in the folder', () => {
    // Dropping an mp3 in and forgetting to rescan is the obvious way to add a
    // song that never plays, and nothing else would notice.
    const onDisk = readdirSync('public/assets/music')
      .filter((f) => /\.(mp3|ogg|m4a|wav|flac)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, 'en'))
    expect(tracks.map((t) => t.src.replace(/^music\//, ''))).toEqual(onDisk)
  })

  it('is resolved relative to the asset base, not from the site root', () => {
    // `assetUrl` prepends the base; a leading slash here would escape it and
    // break the moment the assets move to a CDN.
    for (const track of tracks) expect(track.src.startsWith('/')).toBe(false)
  })
})
