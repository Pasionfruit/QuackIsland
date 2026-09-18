/**
 * I'll Just Wait, on the screen.
 *
 * The stage is drawn in its own canvas by `IllJustWaitScene`; this is the
 * shell: the mouse and Space in, your clock wound on the frame, `useClockNet`
 * deciding what an answer is worth, and the words - your target at the top,
 * how far everybody has got, the time left, and the results.
 *
 * **Hold left click to wind forward, right click to wind back.** A press is a
 * one-minute nudge at once; hold on and it sweeps, slowly at first and faster
 * the longer you hold, so both a long way round and the last minute are easy.
 * The buttons are watched on the window as well, so letting go with the
 * pointer off the stage still lets go.
 *
 * **Space to confirm.** Right, and you are on to the next target; wrong, and
 * your clock goes back to 12:00 to try again. Either way it starts from 12:00.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { TopTimer, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { IllJustWaitScene } from './IllJustWaitScene'
import { COLOURS, finished, newHand, placings, pointsOf, press, resetHand, stageOf, timeLeft, turnHand, type Game, type Hand, type Verdict } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useClockNet } from './useClockNet'
import { TARGETS, targetFor } from './wording'

const LOOK = {
  ink: '#1f2a33',
  faded: '#6f7d88',
  paper: '#f2f6f8',
  sun: '#ffc94d',
  green: '#2f9e5b',
  red: '#d9443a',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"
const MONO = "ui-monospace, 'Cascadia Mono', 'Consolas', 'Menlo', monospace"

/** How long "right" or "wrong" stays up, in seconds. */
const FLASH = 1.2

export function IllJustWaitScreen({ run }: { run: MinigameRun }) {
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
  const wire = useClockNet()
  const live = useRef(game)
  live.current = game

  /** Your clock, wound on the frame. */
  const hand = useRef<Hand>(newHand())
  /** Which buttons are down. */
  const held = useRef({ forward: false, back: false })
  /** Presses since the last frame, in order - so a tap shorter than a frame is still a minute. */
  const presses = useRef<(-1 | 1)[]>([])
  /** Space since the last frame. */
  const confirming = useRef(false)
  /** The game the clock was last reset for. */
  const dealtFor = useRef(-1)
  /** The last verdict, and when, for the flash under the target. */
  const [flash, setFlash] = useState<{ verdict: Verdict; at: number } | null>(null)
  /** Wrong answers on the target you are on - yours, on your screen only. */
  const [misses, setMisses] = useState(0)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    const forget = () => {
      held.current = { forward: false, back: false }
    }
    const release = (e: PointerEvent) => {
      if (e.button === 0) held.current.forward = false
      if (e.button === 2) held.current.back = false
    }
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (e.repeat || paused.current) return
      confirming.current = true
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', forget)
    window.addEventListener('blur', forget)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', forget)
      window.removeEventListener('blur', forget)
      window.removeEventListener('keydown', key)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const clock = hand.current

      // A new game: back to 12:00.
      if (current.id !== dealtFor.current) {
        dealtFor.current = current.id
        resetHand(clock)
        presses.current = []
        setMisses(0)
      }

      const mine = current.players.find((p) => p.mine)
      const canWind = !paused.current && !current.over && !!mine && !mine.left && !finished(mine)
      if (canWind) {
        for (const dir of presses.current) press(clock, dir)
        const { forward, back } = held.current
        turnHand(clock, forward && !back ? 1 : back && !forward ? -1 : 0, dt)
      } else {
        turnHand(clock, 0, dt)
      }
      presses.current = []

      const answer = confirming.current && canWind ? clock.minutes : null
      confirming.current = false
      const { moved, verdict } = wire.advance(current, dt, clock.minutes, answer, paused.current)
      if (verdict) {
        // Right or wrong, the next go starts from 12:00.
        resetHand(clock)
        setFlash({ verdict, at: now })
        setMisses((n) => (verdict === 'wrong' ? n + 1 : 0))
      }
      if (moved) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (paused.current) return
    if (e.button === 0) {
      held.current.forward = true
      presses.current.push(1)
    } else if (e.button === 2) {
      held.current.back = true
      presses.current.push(-1)
    }
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const stage = mine ? stageOf(mine) : 0
  const done = !!mine && finished(mine)
  const target = ready && !done ? targetFor(game.seed, stage) : null
  const playing = ready && !game.over
  const left = timeLeft(game)
  const flashing = flash && performance.now() - flash.at < FLASH * 1000 ? flash.verdict : null

  let caption = ''
  let captionColour: string = '#fff'
  if (playing) {
    if (done) {
      caption = 'All three! Waiting for the host…'
      captionColour = '#8ff0ad'
    } else if (flashing === 'wrong') {
      caption = 'Not quite - back to 12:00'
      captionColour = '#ffb1a8'
    } else if (flashing === 'right') {
      caption = 'Correct! On to the next one'
      captionColour = '#8ff0ad'
    } else {
      caption = 'Hold left click to wind forward, right click to wind back - Space to confirm'
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>I'll Just Wait</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-stage={stage + 1}>
            {done ? 'finished' : `target ${stage + 1} of ${TARGETS}`}
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        {misses > 0 && playing && !done ? <span style={{ ...pill, background: 'rgba(217,68,58,0.12)', color: LOOK.red }}>{misses} wrong</span> : null}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: p.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: p.mine ? '#fff' : LOOK.ink,
              boxShadow: p.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: p.left ? 0.5 : 1,
            }}
            data-points={pointsOf(p)}
          >
            {nameOf(p.id)} · {pointsOf(p)}/{TARGETS}
          </span>
        ))}
      </div>

      {playing ? (
        <TopTimer>
          <span style={{ ...pill, background: left <= 15 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        </TopTimer>
      ) : null}

      <div
        style={{ ...board, cursor: playing && !done ? 'pointer' : 'default' }}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} hand={hand} />
        {playing ? (
          <div style={bannerWrap}>
            {target ? (
              <div
                key={stage}
                style={{
                  ...banner,
                  borderColor: flashing === 'wrong' ? LOOK.red : flashing === 'right' ? LOOK.green : 'rgba(255,255,255,0.25)',
                  animation: flashing === 'wrong' ? 'illjustwait-shake 0.35s' : undefined,
                }}
                data-target={target.minutes}
                data-target-text={target.text}
              >
                {target.text}
              </div>
            ) : null}
            <div style={{ ...captionStyle, color: captionColour }}>{caption}</div>
          </div>
        ) : null}
        <style>{'@keyframes illjustwait-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-8px) } 75% { transform: translateX(8px) } }'}</style>
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `IllJustWaitScene`. */
const Stage = memo(function Stage({ live, hand }: { live: RefObject<Game>; hand: RefObject<Hand> }) {
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
      <IllJustWaitScene live={live} hand={hand} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 5, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most targets first, with when each was got. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Time!' : mine.place === 1 ? (winners.length > 1 ? 'A tie at the top!' : 'First to all three!') : 'Time!'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{headline}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              {entry.player.solved.map((s, i) => (
                <span key={i} style={{ minWidth: 52, textAlign: 'right', font: `600 12px/1.4 ${MONO}`, color: s === null ? LOOK.faded : LOOK.green }}>
                  {s === null ? '-' : `${s.toFixed(1)}s`}
                </span>
              ))}
              <span style={{ minWidth: 36, textAlign: 'right', fontWeight: 700 }}>
                {pointsOf(entry.player)}/{TARGETS}
              </span>
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
  background: '#23303a',
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
  borderBottom: '2px solid #d3dee5',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  right: 16,
  top: 20,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
}

const banner: React.CSSProperties = {
  maxWidth: 820,
  padding: '10px 22px',
  borderRadius: 16,
  background: 'rgba(16, 22, 28, 0.85)',
  border: '3px solid rgba(255,255,255,0.25)',
  color: '#fff',
  font: `700 28px/1.25 ${FONT}`,
  textAlign: 'center',
}

const captionStyle: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  background: 'rgba(16, 22, 28, 0.6)',
  font: `700 15px/1.3 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
  textAlign: 'center',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingBottom: 24,
  boxSizing: 'border-box',
  background: 'linear-gradient(0deg, rgba(15, 10, 20, 0.6), rgba(15, 10, 20, 0) 70%)',
}

const overCard: React.CSSProperties = {
  width: 480,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
  boxShadow: '0 6px 0 rgba(0,0,0,0.25)',
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
