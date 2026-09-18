/**
 * Musical Mayhem, on the screen.
 *
 * The floor is drawn in its own canvas by `MusicalMayhemScene`; this is the
 * shell: the keys and the mouse in, `useMayhemNet` deciding what they do, the
 * tune started and stopped by the phase, and the words - how many chairs are
 * left, whether the music is playing, who went out, and the results.
 *
 * **WASD to move, space to sit, left click to push.** Space and the mouse are
 * edge-triggered: a press is remembered until the next frame takes it, so a
 * press between two frames is never swallowed, and holding either does nothing
 * more than pressing it once.
 *
 * **The tune follows the phase and nothing else.** It starts when the game says
 * the music is playing and stops the instant the game says it has stopped -
 * which is the whole signal to scramble, so it is never faded, never scheduled
 * ahead, and never left running under a pause card.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { MusicalMayhemScene } from './MusicalMayhemScene'
import { COLOURS, ROUND, isIn, isSafe, phase, phaseTime, placings, type Game, type Player } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { createTune } from './tune'
import { useMayhemNet } from './useMayhemNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  danger: '#c8443c',
  go: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const chairWord = (n: number) => (n === 1 ? '1 chair' : `${n} chairs`)

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function MusicalMayhemScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useMayhemNet()
  const live = useRef(game)
  live.current = game

  const keys = useRef({ up: false, down: false, left: false, right: false })
  // Edge-triggered: set by an event, taken by the next frame.
  const pressed = useRef({ sit: false, push: false })
  const [muted, setMuted] = useState(false)
  const tune = useRef<ReturnType<typeof createTune> | null>(null)
  const playing = useRef(false)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newGame()
    live.current = fresh
    setGame(fresh)
  }

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.up = down
          break
        case 'KeyS':
        case 'ArrowDown':
          k.down = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = down
          break
        case 'Space':
          // Held space is one press: the sit is taken the first frame after it.
          if (down && !e.repeat) pressed.current.sit = true
          break
        default:
          return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    const forget = () => {
      keys.current = { up: false, down: false, left: false, right: false }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', forget)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', forget)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const k = keys.current
      // Up on the keyboard is towards the far side of the floor, which is -Z.
      const hands = { x: (k.right ? 1 : 0) - (k.left ? 1 : 0), z: (k.down ? 1 : 0) - (k.up ? 1 : 0) }
      const take = pressed.current
      pressed.current = { sit: false, push: false }
      if (wire.advance(current, dt, { hands, sit: take.sit, push: take.push }, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The tune, made on the first round that plays and torn down with the screen.
  useEffect(() => {
    return () => {
      tune.current?.dispose()
      tune.current = null
    }
  }, [])

  const wantsMusic = phase(game) === 'music' && !run.paused
  useEffect(() => {
    if (wantsMusic && !tune.current) tune.current = createTune()
    const t = tune.current
    if (!t) return
    t.setMuted(muted)
    if (wantsMusic === playing.current) return
    playing.current = wantsMusic
    if (wantsMusic) t.play()
    else t.stop()
  }, [wantsMusic, muted])

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const standing = game.players.filter(isIn)
  const at = phase(game)
  const justOut = game.players.filter((p) => p.out === game.round && game.round > 0)

  const headline = !ready
    ? 'waiting for the host…'
    : at === 'over'
      ? 'the music has stopped for good'
      : at === 'countdown'
        ? `starting in ${Math.max(1, Math.ceil(ROUND.countdown - phaseTime(game)))}…`
        : at === 'music'
          ? '🎵 keep moving - you cannot sit yet'
          : at === 'scramble'
            ? mine && mine.seat !== null
              ? isSafe(game, mine)
                ? "you're safe - nobody can shift you"
                : 'sat down! hold on…'
              : 'SIT DOWN!'
            : justOut.length > 0
              ? `${justOut.map((p) => nameOf(p.id)).join(' and ')} ${justOut.length === 1 ? 'is' : 'are'} out`
              : 'nobody sat - that round again'

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Musical Mayhem</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-round={game.round}>
              round {Math.max(1, game.round)}
            </span>
            <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-chairs={game.chairs}>
              🪑 {chairWord(game.chairs)} for {standing.length}
            </span>
            <span
              style={{ ...pill, background: at === 'scramble' ? LOOK.danger : at === 'music' ? LOOK.go : LOOK.faded, color: '#fff' }}
              data-phase={at}
            >
              {headline}
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>{headline}</span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setMuted((m) => !m)} style={mute} data-muted={muted ? 1 : 0} title="the tune">
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div
        style={board}
        data-board
        onPointerDown={(e) => {
          if (e.button !== 0 || paused.current) return
          pressed.current.push = true
        }}
      >
        <Stage live={live} />
        {ready ? <Standings game={game} me={me} nameOf={nameOf} /> : null}
        {ready && !game.over ? <Keys /> : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** Who is still in, and who went out when. */
function Standings({ game, me, nameOf }: { game: Game; me: string; nameOf: (id: string) => string }) {
  const seat = (p: Player) => (p.seat !== null ? '🪑' : '')
  return (
    <div style={standings} data-standings>
      {placings(game).map((entry) => (
        <div key={entry.player.id} style={row} data-out={entry.player.out ?? ''}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length], opacity: isIn(entry.player) ? 1 : 0.35 }} />
          <span
            style={{
              flex: 1,
              fontWeight: entry.player.id === me ? 700 : 400,
              opacity: isIn(entry.player) ? 1 : 0.45,
              textDecoration: isIn(entry.player) ? 'none' : 'line-through',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nameOf(entry.player.id)}
          </span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{isIn(entry.player) ? seat(entry.player) : `out r${entry.player.out ?? 0}`}</span>
        </div>
      ))}
    </div>
  )
}

/** The controls, small and out of the way: three of them and they all matter. */
function Keys() {
  return (
    <div style={hints}>
      <span>
        <b>WASD</b> run
      </span>
      <span>
        <b>space</b> sit
      </span>
      <span>
        <b>left click</b> push
      </span>
    </div>
  )
}

/** The canvas, rendered once - see `MusicalMayhemScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <MusicalMayhemScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.1, far: 200, position: [0, 24, 16] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: the last one sitting first, then whoever went out latest. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'The music stops' : mine.place === 1 ? 'The last one sitting!' : `${ordinal(mine.place)} place`
  const sub =
    winners.length === 1
      ? `${nameOf(winners[0].player.id)} took the last chair.`
      : `${winners.map((w) => nameOf(w.player.id)).join(' and ')} were left standing together.`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{sub}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={row} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{entry.player.out === null ? 'last one sitting' : `out in round ${entry.player.out}`}</span>
            </div>
          ))}
        </div>
        {onAgain ? (
          <button type="button" onClick={onAgain} style={againButton} data-again>
            again
          </button>
        ) : (
          <div style={{ ...againButton, opacity: 0.55, textAlign: 'center' }}>waiting for the host</div>
        )}
      </div>
    </div>
  )
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #8ed3e8 0%, #6fc2dd 40%, #3f9fc4 100%)',
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
  background: LOOK.sand,
  borderBottom: '2px solid #ecd0a0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const mute: React.CSSProperties = {
  padding: '2px 10px',
  borderRadius: 999,
  border: 'none',
  background: '#ecd0a0',
  font: `14px/1.5 ${FONT}`,
  cursor: 'pointer',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', cursor: 'crosshair' }

const standings: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 190,
  maxWidth: 'calc(100% - 24px)',
  padding: '8px 12px',
  borderRadius: 14,
  background: 'rgba(246, 228, 191, 0.92)',
  boxShadow: '0 3px 0 rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  font: `13px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const hints: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  display: 'flex',
  gap: 12,
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(246, 228, 191, 0.85)',
  font: `12px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(12, 40, 55, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 400,
  maxWidth: 'calc(100vw - 32px)',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.sand,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const againButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
