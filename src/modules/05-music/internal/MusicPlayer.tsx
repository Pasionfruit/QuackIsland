/**
 * The music player: one audio element and the buttons that drive it.
 *
 * Everything decidable without a browser is in `playlist.ts`. What is left
 * here is the parts that genuinely need one - an `HTMLAudioElement`, the
 * autoplay policy, and the DOM.
 *
 * Plain `<audio>` rather than the Web Audio API or three's `Audio`: this is
 * background music, not a sound in the world. It has no position, it should
 * not duck or pan as the camera turns, and an audio element streams a
 * six-megabyte file rather than decoding all of it up front.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../00-core'
import {
  MUSIC,
  clampVolume,
  formatTime,
  nextIndex,
  parseTracks,
  stepBack,
  trackLabel,
  type Track,
} from './playlist'

/** The volume the viewer last chose, if the browser will tell us. */
function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(MUSIC.storageKey)
    if (raw === null) return MUSIC.defaultVolume
    return clampVolume(Number.parseFloat(raw))
  } catch {
    // Private windows and blocked site data both throw rather than return null.
    return MUSIC.defaultVolume
  }
}

/**
 * Whether the panel is folded, remembered between reloads. Every storage call
 * can throw, and a panel that will not render because it could not remember a
 * boolean would be a silly way to lose the game.
 */
function readFolded(): boolean {
  try {
    return window.localStorage.getItem(MUSIC.foldKey) === '1'
  } catch {
    return false
  }
}

function storeFolded(folded: boolean): void {
  try {
    window.localStorage.setItem(MUSIC.foldKey, folded ? '1' : '0')
  } catch {
    // Not worth caring about.
  }
}

function storeVolume(volume: number): void {
  try {
    window.localStorage.setItem(MUSIC.storageKey, String(volume))
  } catch {
    // Not being able to remember the volume is not worth breaking anything for.
  }
}

export function MusicPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState<number>(MUSIC.defaultVolume)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(Number.NaN)
  /** True once the browser has refused to start the music without a click. */
  const [blocked, setBlocked] = useState(false)
  /** Tracks that failed in a row, so a broken playlist stops rather than spins. */
  const failures = useRef(0)
  const [folded, setFolded] = useState(readFolded)

  const track = tracks[index] ?? null

  // One audio element for the life of the player, built outside React so
  // nothing re-renders when it ticks.
  useEffect(() => {
    const element = new Audio()
    element.preload = 'auto'
    element.volume = readStoredVolume()
    audio.current = element
    setVolume(element.volume)
    return () => {
      element.pause()
      element.src = ''
      audio.current = null
    }
  }, [])

  useEffect(() => {
    let live = true
    fetch(assetUrl(MUSIC.manifest))
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        return response.json()
      })
      .then((raw) => {
        if (live) setTracks(parseTracks(raw))
      })
      .catch((error) => {
        console.error('[05-music] no playlist; the game runs without it', error)
      })
    return () => {
      live = false
    }
  }, [])

  /** Points the element at a track and, if we were playing, keeps playing. */
  const load = useCallback((next: Track | null, resume: boolean) => {
    const element = audio.current
    if (!element || !next) return
    element.src = assetUrl(next.src)
    element.currentTime = 0
    if (!resume) return
    element.play().catch(() => {
      // Only ever the autoplay policy: a click is needed first.
      setPlaying(false)
      setBlocked(true)
    })
  }, [])

  // Whenever the track changes, point the element at it.
  useEffect(() => {
    if (!track) return
    load(track, playing)
    // `playing` is deliberately not a dependency: this fires when the *track*
    // changes, and reads whether we were playing at that moment. Including it
    // would restart the song every time it was paused and resumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, load])

  // Start once there is something to play. Browsers refuse to make noise
  // before the page has been interacted with, so if that refusal comes back,
  // wait for the first click or key and try again.
  useEffect(() => {
    const element = audio.current
    if (!element || tracks.length === 0) return
    // The track effect above already pointed the element at the first song;
    // setting `src` again here would fetch the whole file a second time.
    let armed = false

    const start = () => {
      element
        .play()
        .then(() => {
          setPlaying(true)
          setBlocked(false)
        })
        .catch(() => {
          setPlaying(false)
          setBlocked(true)
          if (armed) return
          armed = true
          window.addEventListener('pointerdown', onGesture, { once: true })
          window.addEventListener('keydown', onGesture, { once: true })
        })
    }
    const onGesture = () => {
      armed = false
      start()
    }

    start()
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
    // Only when the playlist first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length])

  const skip = useCallback(() => {
    setIndex((i) => nextIndex(i, tracks.length))
  }, [tracks.length])

  const rewind = useCallback(() => {
    const element = audio.current
    const at = element ? element.currentTime : 0
    const back = stepBack(index, tracks.length, at)
    if (back === index) {
      // Same song, back to the top. React will not re-run the load effect for
      // an unchanged index, so this has to do it.
      if (element) element.currentTime = 0
      setPosition(0)
      return
    }
    setIndex(back)
  }, [index, tracks.length])

  const toggle = useCallback(() => {
    const element = audio.current
    if (!element) return
    if (element.paused) {
      element
        .play()
        .then(() => {
          setPlaying(true)
          setBlocked(false)
        })
        .catch(() => setBlocked(true))
    } else {
      element.pause()
      setPlaying(false)
    }
  }, [])

  const changeVolume = useCallback((next: number) => {
    const level = clampVolume(next)
    setVolume(level)
    if (audio.current) audio.current.volume = level
    storeVolume(level)
  }, [])

  // Element events: what it is doing, rather than what we asked it to do.
  useEffect(() => {
    const element = audio.current
    if (!element) return
    const onPlay = () => {
      setPlaying(true)
      // Something played, so any run of failures is over.
      failures.current = 0
    }
    const onPause = () => setPlaying(false)
    const onTime = () => setPosition(element.currentTime)
    const onMeta = () => setDuration(element.duration)
    const onEnded = () => setIndex((i) => nextIndex(i, tracks.length))
    const onError = () => {
      // Skip a track that will not play - but stop once the whole list has
      // failed, or a missing assets folder spins through it forever.
      failures.current += 1
      if (failures.current > tracks.length) {
        console.error('[05-music] nothing in the playlist will play; giving up', element.src)
        setPlaying(false)
        return
      }
      console.error('[05-music] could not play a track; skipping it', element.src)
      setIndex((i) => nextIndex(i, tracks.length))
    }
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('ended', onEnded)
    element.addEventListener('error', onError)
    return () => {
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('loadedmetadata', onMeta)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
    }
  }, [tracks.length])

  const progress = Number.isFinite(duration) && duration > 0 ? position / duration : 0

  return (
    <div style={panel}>
      <button
        type="button"
        onClick={() => {
          const next = !folded
          setFolded(next)
          storeFolded(next)
        }}
        style={foldHeader}
        title={folded ? 'Show' : 'Hide'}
      >
        <span>MUSIC</span>
        <span style={{ opacity: 0.7 }}>{folded ? '+' : '–'}</span>
      </button>

      {/* The track stays visible folded: what is playing is the one thing you
          want to see without opening anything. */}
      <div style={title} title={trackLabel(track)}>
        {trackLabel(track)}
      </div>

      {folded ? null : (
        <>

      <div style={rail}>
        <div style={{ ...fill, width: `${Math.min(100, progress * 100)}%` }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.55, marginTop: 2 }}>
        <span>{formatTime(position)}</span>
        <span>
          {tracks.length > 0 ? `${index + 1}/${tracks.length}` : '-'}
          {blocked ? ' · click to start' : ''}
        </span>
        <span>{formatTime(duration)}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <button type="button" onClick={rewind} style={button} title="Back (restarts the track first)">
          {'|<'}
        </button>
        <button type="button" onClick={toggle} style={button} title={playing ? 'Pause' : 'Play'}>
          {playing ? '||' : '>'}
        </button>
        <button type="button" onClick={skip} style={button} title="Skip">
          {'>|'}
        </button>

        <span style={{ opacity: 0.55, marginLeft: 4 }}>vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          style={{ flex: 1, minWidth: 54, accentColor: '#6fb6c8' }}
          title={`${Math.round(volume * 100)}%`}
        />
      </div>
        </>
      )}
    </div>
  )
}

const panel: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.78)',
  color: '#f2ece2',
  font: '11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  width: 214,
  boxSizing: 'border-box',
  userSelect: 'none',
}

const foldHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: 'inherit',
  padding: 0,
  marginBottom: 4,
  letterSpacing: 0.6,
  opacity: 0.55,
  cursor: 'pointer',
  textAlign: 'left',
}

const title: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: '#ffcf8a',
}

const rail: React.CSSProperties = {
  height: 3,
  background: '#2a2a28',
  marginTop: 5,
  borderRadius: 2,
  overflow: 'hidden',
}

const fill: React.CSSProperties = {
  height: '100%',
  background: '#6fb6c8',
}

const button: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '2px 7px',
  cursor: 'pointer',
}
