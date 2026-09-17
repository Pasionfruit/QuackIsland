/**
 * Synchronize Steps, on the screen.
 *
 * The staircase is drawn in its own canvas by `SynchronizeStepsScene`; this is
 * the shell: a pick passed to `useTowerNet`, and the words - the round and how
 * long is left to pick, everybody's step, the three buttons, what each number
 * did at the reveal, and the results from the top of the tower to the bottom.
 *
 * **1, 4 or 6 on the keyboard, or click a button.** As often as you like while
 * the round lasts; the last pick counts.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import type { MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { PALETTE, SynchronizeStepsScene, outcomeColour } from './SynchronizeStepsScene'
import { COLOURS, TOWER, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useTowerNet } from './useTowerNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys for each pick. */
const KEYS: Record<string, number> = { Digit1: 1, Numpad1: 1, Digit4: 4, Numpad4: 4, Digit6: 6, Numpad6: 6 }

export function SynchronizeStepsScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useTowerNet()
  const live = useRef(game)
  live.current = game
  /** A pick made since the last frame, or null. */
  const picked = useRef<number | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newGame()
    live.current = fresh
    setGame(fresh)
  }

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const pick = picked.current
      picked.current = null
      if (wire.advance(current, dt, pick, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pick = KEYS[e.code]
      if (pick === undefined || e.repeat || paused.current) return
      e.preventDefault()
      picked.current = pick
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (option: number) => {
    if (paused.current) return
    picked.current = option
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const canPick = ready && game.phase === 'choose' && !!mine && !mine.out
  const left = game.phase === 'choose' ? Math.max(0, TOWER.choose - game.clock) : 0

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Synchronize Steps</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-round={game.round + 1}>
            round {game.round + 1}
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((stepper, index) => (
          <span
            key={stepper.id}
            style={{
              ...pill,
              background: stepper.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: stepper.mine ? '#fff' : LOOK.ink,
              boxShadow: stepper.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: stepper.out ? 0.5 : 1,
            }}
            data-step={stepper.step}
          >
            {nameOf(stepper.id)} · {stepper.out ? 'out' : stepper.step}
          </span>
        ))}
      </div>

      <div style={board} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />
        {ready && game.phase === 'reveal' ? <Reveal game={game} nameOf={nameOf} /> : null}
      </div>

      {ready && game.phase !== 'over' ? (
        <div style={panel}>
          <div style={timerTrack}>
            <div style={{ ...timerFill, width: `${(left / TOWER.choose) * 100}%` }} />
          </div>
          <div style={{ color: LOOK.faded, font: `600 13px/1.3 ${FONT}` }}>
            {!mine
              ? 'watching'
              : mine.out
                ? 'you are out - watching the rest'
                : game.phase === 'choose'
                  ? mine.pick === null
                    ? 'How many steps down? Match exactly one other player to move.'
                    : 'Picked - you can still change it'
                  : 'Everybody moves…'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {TOWER.options.map((option) => {
              const chosen = mine?.pick === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={!canPick}
                  onPointerDown={(e) => {
                    if (e.button === 0) pick(option)
                  }}
                  style={{
                    ...optionButton,
                    background: chosen ? LOOK.sun : '#fff',
                    boxShadow: chosen ? '0 4px 0 #d79a22' : '0 4px 0 #cfc6dc',
                    transform: chosen ? 'translateY(2px)' : 'none',
                    opacity: canPick || chosen ? 1 : 0.5,
                    cursor: canPick ? 'pointer' : 'default',
                  }}
                  data-option={option}
                  data-chosen={chosen ? 1 : 0}
                >
                  {option}
                  <span style={{ display: 'block', font: `600 11px/1 ${FONT}`, opacity: 0.6, marginTop: 2 }}>key {option}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {game.phase === 'over' && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** What each number did this round: who picked it, and whether they stayed, moved or dropped. */
function Reveal({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const groups = TOWER.options.map((option) => ({
    option,
    who: game.players
      .map((stepper, index) => ({ stepper, index }))
      .filter(({ stepper }) => stepper.last && stepper.last.pick === option && (!stepper.out || stepper.out.round === game.round)),
  }))
  return (
    <div style={revealWrap}>
      {groups.map(({ option, who }) => {
        const count = who.length
        const what = count === 0 ? 'nobody' : count === 1 ? 'alone - stays' : count === 2 ? `pair - down ${option}` : `crowd - down ${TOWER.crowdDrop}`
        return (
          <div key={option} style={{ ...revealCard, borderColor: count ? outcomeColour(count) : 'rgba(255,255,255,0.3)' }} data-reveal={option} data-count={count}>
            <div style={{ ...revealNumber, background: count ? outcomeColour(count) : 'rgba(255,255,255,0.25)' }}>{option}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `700 13px/1.3 ${FONT}` }}>{what}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                {who.map(({ stepper, index }) => (
                  <span key={stepper.id} style={{ ...chip, background: COLOURS[index % COLOURS.length] }}>
                    {nameOf(stepper.id)}
                    {stepper.last?.auto ? ' (late)' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The canvas, rendered once - see `SynchronizeStepsScene`. */
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
      <SynchronizeStepsScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 20, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: from the top of the tower to the bottom. */
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
  const mine = order.find((entry) => entry.stepper.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Down they came' : mine.place === 1 ? (winners.length > 1 ? 'A tie at the top!' : 'Top of the tower!') : mine.stepper.out ? 'You reached the bottom' : 'Down they came'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {game.round + 1 >= TOWER.rounds && game.players.filter((p) => !p.out).length > 1 ? `${TOWER.rounds} rounds up. ` : ''}Highest first.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.stepper.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.stepper.id === me ? 700 : 400 }}>{nameOf(entry.stepper.id)}</span>
              <span style={{ font: `600 13px/1.4 ${FONT}`, color: entry.stepper.out ? LOOK.faded : LOOK.ink }}>
                {entry.stepper.out ? `out in round ${entry.stepper.out.round + 1}, from step ${entry.stepper.out.from}` : `step ${entry.stepper.step}`}
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
  background: PALETTE.background,
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
  borderBottom: '2px solid #ddd3e8',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const panel: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px 14px',
  background: LOOK.paper,
  borderTop: '2px solid #ddd3e8',
}

const timerTrack: React.CSSProperties = { width: 'min(360px, 100%)', height: 8, borderRadius: 999, background: '#ddd3e8', overflow: 'hidden' }
const timerFill: React.CSSProperties = { height: '100%', borderRadius: 999, background: '#3f8fd0' }

const optionButton: React.CSSProperties = {
  width: 84,
  padding: '8px 0 6px',
  borderRadius: 16,
  border: 'none',
  color: LOOK.ink,
  font: `800 30px/1 ${FONT}`,
  textAlign: 'center',
}

const revealWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 12,
  display: 'flex',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '0 12px',
  pointerEvents: 'none',
}

const revealCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: 220,
  maxWidth: 'calc(100vw - 24px)',
  boxSizing: 'border-box',
  padding: '6px 10px 6px 6px',
  borderRadius: 14,
  border: '3px solid',
  background: 'rgba(20, 16, 28, 0.8)',
  color: '#fff',
}

const revealNumber: React.CSSProperties = {
  flex: '0 0 auto',
  width: 40,
  height: 40,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: `800 22px/1 ${FONT}`,
  color: '#fff',
}

const chip: React.CSSProperties = { padding: '0 7px', borderRadius: 999, font: `600 11px/1.6 ${FONT}`, color: '#fff', whiteSpace: 'nowrap' }

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
  width: 440,
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
