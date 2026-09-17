/**
 * Wack-Attack, on the screen.
 *
 * The field is drawn in its own canvas by `WackAttackScene`; this is the shell:
 * the keys and clicks in, `useFieldNet` deciding what they do, and a HUD with
 * the clock and everybody's points, a flash for each of your own whacks, and
 * the results.
 *
 * **WASD to walk, left click to swing.** A click anywhere on the field swings:
 * the hammer comes down in front of you, the way you are facing - there is
 * nothing to aim with the mouse.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import type { MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { WackAttackScene } from './WackAttackScene'
import { COLOURS, FIELD, placings, timeLeft, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useFieldNet } from './useFieldNet'

const LOOK = {
  ink: '#3b3a2c',
  faded: '#80806a',
  paper: '#f2f0dc',
  sun: '#ffc94d',
  gold: '#e6a400',
  danger: '#c8443c',
  green: '#3f9a3a',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function WackAttackScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useFieldNet()
  const live = useRef(game)
  live.current = game

  const keys = useRef({ up: false, down: false, left: false, right: false })
  const clicked = useRef(false)
  /** Your last points, and when: for the flash. */
  const [flash, setFlash] = useState<{ points: number; at: number } | null>(null)
  const lastScore = useRef(0)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newGame()
    live.current = fresh
    lastScore.current = 0
    setGame(fresh)
  }

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
          k.up = down
          break
        case 'KeyS':
          k.down = down
          break
        case 'KeyA':
          k.left = down
          break
        case 'KeyD':
          k.right = down
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
      const k = keys.current
      // Up on the keyboard is away from the camera: the far side of the field.
      const walking = { x: (k.right ? 1 : 0) - (k.left ? 1 : 0), y: (k.down ? 1 : 0) - (k.up ? 1 : 0) }
      const swung = clicked.current
      clicked.current = false
      const current = live.current
      if (wire.advance(current, dt, walking, swung, paused.current)) setGame({ ...current })
      const mine = current.players.find((p) => p.mine)
      if (mine && current.id === live.current.id && mine.score > lastScore.current) {
        setFlash({ points: mine.score - lastScore.current, at: current.elapsed })
      }
      lastScore.current = mine?.score ?? 0
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || paused.current) return
    clicked.current = true
  }

  const ready = game.players.length > 0
  const left = timeLeft(game)
  const showFlash = ready && !game.over && flash && game.elapsed - flash.at < 0.9

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Wack-Attack</span>
        {ready ? (
          <span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        {ready ? (
          <span style={{ color: LOOK.faded, fontSize: 12 }}>
            mole {FIELD.points.mole} · golden mole {FIELD.points.golden}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {game.players.map((whacker, index) => (
          <span
            key={whacker.id}
            data-score={whacker.score}
            style={{
              ...pill,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: whacker.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.75)',
              color: whacker.mine ? '#fff' : LOOK.ink,
              boxShadow: whacker.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
            }}
          >
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(whacker.id)}</span>
            <strong>{whacker.score}</strong>
          </span>
        ))}
      </div>

      <div style={board} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />
        {showFlash && flash ? (
          <div style={flashWrap}>
            <div key={flash.at} style={{ ...flashStyle, background: flash.points >= FIELD.points.golden ? LOOK.gold : LOOK.green }} data-flash={flash.points}>
              {flash.points >= FIELD.points.golden ? `Golden mole! +${flash.points}` : `Whack! +${flash.points}`}
            </div>
          </div>
        ) : null}
      </div>

      {game.over && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `WackAttackScene`. */
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
      <WackAttackScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 300, position: [0, 24, 16] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most points first. */
function Over({
  game,
  me,
  nameOf,
  onAgain,
}: {
  game: Game
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(game)
  const mine = order.find((entry) => entry.whacker.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Time is up' : mine.place === 1 ? (winners.length > 1 ? 'A tie for first!' : 'Top whacker!') : 'Time is up'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{game.whacks.length} moles whacked this round.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.whacker.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.whacker.id === me ? 700 : 400 }}>{nameOf(entry.whacker.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {entry.whacker.whacks} moles{entry.whacker.golden > 0 ? ` · ${entry.whacker.golden} golden` : ''}
              </span>
              <strong style={{ minWidth: 28, textAlign: 'right' }}>{entry.whacker.score}</strong>
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
  background: '#bfe4c8',
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
  borderBottom: '2px solid #dcd8b6',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', cursor: 'pointer' }

const flashWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 16,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const flashStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 999,
  color: '#fff',
  font: `800 18px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(25, 40, 25, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const scoreRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

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
