/**
 * Spidey Senses, on the screen.
 *
 * The cellar is drawn in its own canvas by `NestScene`; this is the shell: the
 * keys and the clicks turned into hands for `useNestNet`, the words - the
 * round, who is left, how far you are from the trapdoor, who has stopped, who
 * the spider took and why - and **the jump scare**: too late, and a spider
 * fills your screen.
 *
 * **W creeps in towards the trapdoor, S backs off, A and D edge round it.
 * Left click stops you** - and once the trapdoor springs, it is how you react.
 * Walking is relative to the camera, which always looks at the trapdoor.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { assetUrl } from '../../00-core'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { when } from './nest'
import { NestScene } from './NestScene'
import { COLOURS, distance, isStanding, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useNestNet } from './useNestNet'

const LOOK = {
  ink: '#241d29',
  faded: '#877d93',
  paper: '#efe8f3',
  amber: '#ffb13b',
  red: '#c9302c',
  night: '#0d0a0f',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that creep, by `KeyboardEvent.code`: in towards the trapdoor, and round it to the right. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
}

/** How long the jump scare fills the screen, seconds: as long as its shriek. */
export const SCARE = 1.47

const names = (list: string[]) => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`)

export function NestScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = useNestNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const clicked = useRef(false)
  const film = useScareFilm()

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      let toward = 0
      let around = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          toward += k[0]
          around += k[1]
        }
      }
      const hands = { toward: Math.sign(toward), around: Math.sign(around), clicked: clicked.current }
      clicked.current = false
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.stopped) playCue(CUES.stepDown, 0.5)
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!(e.code in KEYS)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (run.paused || game.over) held.current.clear()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    clicked.current = true
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const w = when(game.seed, game.elapsed)
  useNestSounds(game)
  const left = game.players.filter(isStanding).length
  const taken = ready && w.phase === 'reveal' ? game.players.filter((p) => p.out === w.round.round) : []
  const scared = !!mine && mine.how === 'eaten' && mine.outAt !== null && game.elapsed - mine.outAt < SCARE && game.elapsed >= mine.outAt

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' | 'good' | 'warn' } | null = null
  if (ready && !game.over && mine) {
    if (mine.out !== null && mine.out === w.round.round && w.phase === 'reveal') {
      banner = mine.how === 'eaten' ? { text: 'Too slow!', sub: 'the spider got you', tone: 'out' } : { text: 'Chicken!', sub: 'you were the furthest from the trapdoor', tone: 'out' }
    } else if (mine.out !== null) banner = { text: 'Out - watching the rest', tone: 'hint' }
    else if (w.phase === 'reveal') {
      const who = names(taken.map((p) => nameOf(p.id)))
      if (taken.length === 0) banner = { text: 'Dead level - nobody this time', tone: 'warn' }
      else if (taken[0].how === 'eaten') banner = { text: `The spider got ${who}!`, sub: 'too slow to react', tone: 'good' }
      else banner = { text: `${who} ${taken.length > 1 ? 'were' : 'was'} the chicken`, sub: 'furthest from the trapdoor', tone: 'good' }
    } else if (w.phase === 'ready') {
      banner =
        w.round.round === 1
          ? { text: 'Creep up on the trapdoor…', sub: 'W in, S back · click to stop before the spider jumps · furthest back is the chicken', tone: 'hint' }
          : { text: `Round ${w.round.round}`, sub: `${left} left`, tone: 'hint' }
    } else if (mine.stoppedAt !== null) banner = { text: `Stopped at ${distance(mine).toFixed(1)} m`, tone: 'warn' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Spidey Senses</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-round={w.round.round} data-phase={w.phase}>
              round {w.round.round}
            </span>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-left={left}>
              {left} left
            </span>
            {mine && isStanding(mine) ? (
              <span style={{ ...pill, background: mine.stoppedAt !== null ? LOOK.amber : '#fff', color: LOOK.ink, boxShadow: `inset 0 0 0 2px ${LOOK.amber}` }} data-distance={distance(mine).toFixed(2)}>
                {distance(mine).toFixed(1)} m {mine.stoppedAt !== null ? '· stopped' : ''}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = COLOURS[index % COLOURS.length]
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: isStanding(p) ? colour : 'rgba(255,255,255,0.85)',
                color: isStanding(p) ? '#fff' : LOOK.faded,
                boxShadow: isStanding(p) ? 'none' : `inset 0 0 0 2px ${colour}`,
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-out={p.out ?? ''}
              data-how={p.how ?? ''}
              data-stopped={p.stoppedAt ?? ''}
            >
              {nameOf(p.id)}
              {isStanding(p) && p.stoppedAt !== null ? ' ✋' : ''}
              {p.how === 'eaten' ? ' · 🕷' : p.how === 'chicken' ? ' · 🐔' : ''}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />

        {banner && !scared ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}

        {scared && mine?.outAt != null ? <JumpScare key={`${game.id}:${mine.out}`} since={game.elapsed - mine.outAt} film={film.current} /> : null}
      </div>
    </div>
  )
}

/** The jump scare's film: a spider charging down a dark corridor at you, 16:9, 1.1 s, ending all but black. The file loops. */
export const SCARE_GIF = 'Spider_Jumpscare_gif.gif'
/** How long its film runs, seconds. It is taken off the screen then - before it can loop round - and the rest of `SCARE` is black under the shriek. */
const FILM = 1.1

/**
 * The jump scare's film, fetched once when the screen opens and kept, so a
 * scare never waits on the network. Each scare makes its own object URL of it -
 * a browser shares one animation between every image of the same URL, so a
 * second scare from the same URL would open on whatever frame the first one
 * finished on.
 */
function useScareFilm(): RefObject<Blob | null> {
  const film = useRef<Blob | null>(null)
  useEffect(() => {
    let alive = true
    fetch(assetUrl(SCARE_GIF))
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (alive) film.current = blob
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return film
}

/**
 * The jump scare: the screen goes black and the spider charges down a corridor
 * straight at you, filling the screen - shaking as it lunges - then black under
 * the rest of the shriek, then fades. Mounted once per scare, so the film always
 * starts from its first frame. Without the film (it has not loaded), a drawn
 * spider lunges instead.
 */
export function JumpScare({ since, film }: { since: number; film: Blob | null }) {
  const [url] = useState(() => (film ? URL.createObjectURL(film) : null))
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  const lunge = Math.min(1, since / FILM)
  const shake = since > 0.2 && since < FILM ? (1 - since / FILM) * 26 : 0
  const dx = Math.sin(since * 91) * shake
  const dy = Math.cos(since * 77) * shake
  const fade = since > SCARE - 0.3 ? Math.max(0, (SCARE - since) / 0.3) : 1
  return (
    <div style={{ ...scareWrap, opacity: fade, background: '#000' }} data-scare={url ? 'film' : 'drawn'}>
      {url ? (
        // Filling the screen, pushing in a little as it charges; gone once its one run is over, before it can loop.
        since < FILM ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${dx}px, ${dy}px) scale(${1.02 + lunge * 0.13})` }} /> : null
      ) : (
        <DrawnSpider since={since} dx={dx} dy={dy} />
      )}
    </div>
  )
}

/** A spider drawn rather than filmed, for a scare before the film has loaded: eight red eyes, fangs, legs flung wide. */
function DrawnSpider({ since, dx, dy }: { since: number; dx: number; dy: number }) {
  const scale = 0.25 + Math.min(1, since / 0.16) * 1.55
  return (
    <svg viewBox="-100 -100 200 200" style={{ width: '70vmin', height: '70vmin', transform: `translate(${dx}px, ${dy}px) scale(${scale})` }} aria-hidden>
      {[-1, 1].map((side) =>
        [0, 1, 2, 3].map((k) => {
          const a = (-60 + k * 38) * (Math.PI / 180)
          const kx = side * (40 + Math.cos(a) * 45)
          const ky = Math.sin(a) * 45 - 10
          const fx = side * (70 + Math.cos(a) * 60)
          const fy = Math.sin(a) * 70 + 30
          return <path key={`${side}${k}`} d={`M${side * 18} ${-5 + k * 8} L${kx} ${ky} L${fx} ${fy}`} stroke="#140e18" strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        }),
      )}
      <ellipse cx={0} cy={18} rx={42} ry={48} fill="#1c1520" />
      <ellipse cx={0} cy={-22} rx={34} ry={30} fill="#241b2a" />
      {[
        [-11, -28, 8],
        [11, -28, 8],
        [-24, -20, 5],
        [24, -20, 5],
        [-6, -40, 4],
        [6, -40, 4],
        [-18, -36, 3.5],
        [18, -36, 3.5],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ff1a1a" />
      ))}
      <path d="M-12 -4 Q-14 12 -6 18 Q-8 6 -4 -2 Z" fill="#f4efe6" />
      <path d="M12 -4 Q14 12 6 18 Q8 6 4 -2 Z" fill="#f4efe6" />
    </svg>
  )
}

/** The canvas, rendered once - see `NestScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.1
      }}
    >
      <NestScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 60, near: 0.1, far: 120, position: [0, 4, 13] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * A thud for every twitch of the lid - louder when it really springs - a crash
 * as the spider comes out, a shriek for your own jump scare, a buzz for being
 * the chicken, and a fall for anybody taken. Off the clock and the players
 * every screen has; a new game is only remembered.
 */
function useNestSounds(game: Game): void {
  const seen = useRef<{ id: number; twitch: string; springs: number; judged: number; out: Set<string> }>({ id: -1, twitch: '', springs: 0, judged: 0, out: new Set() })
  useEffect(() => {
    if (seen.current.id !== game.id) {
      const w = when(game.seed, game.elapsed)
      seen.current = {
        id: game.id,
        twitch: `${w.round.round}:${w.round.twitches.filter((at) => at <= game.elapsed).length}`,
        springs: game.elapsed >= w.round.springs ? w.round.round : w.round.round - 1,
        judged: game.elapsed >= w.round.judged ? w.round.round : w.round.round - 1,
        out: new Set(game.players.filter((p) => !isStanding(p)).map((p) => p.id)),
      }
    }
    const s = seen.current
    if (game.players.length === 0 || game.over) return
    const w = when(game.seed, game.elapsed)
    const r = w.round
    // Which twitch of which round the lid is up to: a new one is a thud.
    const count = r.twitches.filter((at) => at <= game.elapsed).length
    const twitch = `${r.round}:${count}`
    if (twitch !== s.twitch) {
      s.twitch = twitch
      if (count > 0) playCue(CUES.bump, 0.4)
    }
    if (game.elapsed >= r.springs && s.springs < r.round) {
      s.springs = r.round
      playCue(CUES.bump, 0.95)
    }
    if (game.elapsed >= r.judged && s.judged < r.round) {
      s.judged = r.round
      playCue(CUES.woodenBridgeCollapse, 0.55)
    }
    for (const p of game.players) {
      if (isStanding(p) || s.out.has(p.id)) continue
      s.out.add(p.id)
      if (p.left) continue
      if (p.mine && p.how === 'eaten') playCue(CUES.spiderJumpscare, 1)
      else if (p.mine) playCue(CUES.wrongSelection, 0.8)
      playCue(CUES.fallingOver, p.mine ? 0.7 : 0.35)
    }
  }, [game])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: LOOK.night,
  color: LOOK.ink,
  font: `14px/1.5 ${FONT}`,
  userSelect: 'none',
}

const hud: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: LOOK.paper,
  borderBottom: '2px solid #d6cbe0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'pointer' }

const scareWrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  overflow: 'hidden',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 18,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
  padding: '0 16px',
}

const bannerBox: React.CSSProperties = {
  maxWidth: '100%',
  padding: '6px 18px',
  borderRadius: 14,
  font: `800 20px/1.25 ${FONT}`,
  textAlign: 'center',
}

const TONES: Record<'out' | 'hint' | 'good' | 'warn', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(239,232,243,0.94)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  good: { background: 'rgba(36,29,41,0.9)', color: '#fff' },
  warn: { background: LOOK.amber, color: LOOK.ink },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }
