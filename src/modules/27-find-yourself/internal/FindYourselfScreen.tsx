/**
 * Find Yourself, on the screen.
 *
 * The table is drawn in its own canvas by `FindYourselfScene`; this is the
 * shell: a click on a cup passed to `useTableNet`, and the words - which stage
 * and what it is worth, what is happening, how long is left to pick, who has
 * picked, what you found, and the results.
 *
 * **Aim with the mouse, left click to pick a cup.** Once a stage: the first cup
 * you click is your pick.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import type { MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { FindYourselfScene, type SceneHands } from './FindYourselfScene'
import { COLOURS, TABLE, found, phaseLength, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useTableNet } from './useTableNet'

const LOOK = {
  ink: '#2d2a33',
  faded: '#7d7887',
  paper: '#f3efe6',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function FindYourselfScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useTableNet()
  const live = useRef(game)
  live.current = game
  /** A click on a cup, waiting for the next frame. */
  const clicked = useRef<number | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const hands = useMemo<SceneHands>(
    () => ({
      canPick: () => {
        const g = live.current
        const mine = g.players.find((p) => p.mine)
        return !paused.current && g.phase === 'pick' && !!mine && mine.picks[g.stage] === null
      },
      onPick: (slot) => {
        clicked.current = slot
      },
    }),
    [],
  )

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
      const picked = clicked.current
      clicked.current = null
      if (wire.advance(current, dt, picked, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const worth = TABLE.points[game.stage]
  const left = Math.max(0, phaseLength(game) - game.clock)
  const myPick = mine?.picks[game.stage]

  let status = ''
  if (game.phase === 'show') status = 'Find your face!'
  else if (game.phase === 'cover') status = 'Keep your eye on it…'
  else if (game.phase === 'shuffle') status = 'Shuffling…'
  else if (game.phase === 'pick') status = myPick === null || myPick === undefined ? 'Pick your cup!' : 'Waiting for the others…'
  else if (game.phase === 'result') status = 'Cups up!'
  else status = 'Game over'

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Find Yourself</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-stage={game.stage + 1}>
              stage {game.stage + 1} of {TABLE.points.length} · {worth} {worth === 1 ? 'point' : 'points'}
            </span>
            <span style={{ ...pill, background: game.phase === 'pick' ? LOOK.sun : 'rgba(45,42,51,0.12)', color: LOOK.ink }} data-phase={game.phase}>
              {status}
              {game.phase === 'pick' ? ` ${Math.ceil(left)}s` : ''}
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((finder, index) => {
          const picked = finder.picks[game.stage] !== null
          return (
            <span
              key={finder.id}
              data-score={finder.score}
              style={{
                ...pill,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: finder.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
                color: finder.mine ? '#fff' : LOOK.ink,
                boxShadow: finder.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
                opacity: finder.left ? 0.5 : 1,
              }}
            >
              <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(finder.id)}</span>
              <strong>{finder.score}</strong>
              {game.phase === 'pick' && picked ? <span title="picked">✓</span> : null}
            </span>
          )
        })}
      </div>

      <div style={board} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} hands={hands} />
        {ready && game.phase === 'show' && mine ? (
          <Banner colour={COLOURS[mineIndex % COLOURS.length]} text={`Your face is the ${colourName(mineIndex)} one - watch its cup`} />
        ) : null}
        {ready && game.phase === 'pick' && mine && (myPick === null || myPick === undefined) ? (
          <Banner colour={LOOK.ink} text="Click the cup your face is under" data="pick" />
        ) : null}
        {ready && game.phase === 'result' && mine ? (
          found(game, mineIndex, game.stage) ? (
            <Banner colour={LOOK.green} text={`You found yourself! +${worth}`} data="found" />
          ) : (
            <Banner colour={LOOK.red} text={myPick === null || myPick === undefined ? 'No pick - no points' : 'Not you under that one'} data="missed" />
          )
        ) : null}
      </div>

      {game.phase === 'over' && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

const COLOUR_NAMES = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'teal', 'pink'] as const

function colourName(index: number): string {
  return COLOUR_NAMES[index % COLOUR_NAMES.length]
}

function Banner({ text, colour, data }: { text: string; colour: string; data?: string }) {
  return (
    <div style={bannerWrap}>
      <div style={{ ...banner, background: colour }} data-banner={data ?? ''}>
        {text}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `FindYourselfScene`. */
const Stage = memo(function Stage({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
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
      <FindYourselfScene live={live} hands={hands} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 12, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most points first, with who found themselves in which stage. */
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
  const mine = order.find((entry) => entry.finder.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine ? 'Game over' : mine.place === 1 ? (winners.length > 1 ? 'A tie for first!' : 'You know yourself best!') : 'Game over'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{headline}</div>
        <div style={{ ...scoreRow, color: LOOK.faded, fontSize: 11 }}>
          <span style={{ minWidth: 18 }} />
          <span style={{ width: 12 }} />
          <span style={{ flex: 1 }} />
          {TABLE.points.map((p, i) => (
            <span key={i} style={stageCell}>
              +{p}
            </span>
          ))}
          <span style={{ ...stageCell, minWidth: 34 }}>total</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.finder.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.finder.id === me ? 700 : 400 }}>{nameOf(entry.finder.id)}</span>
              {TABLE.points.map((_, stage) => (
                <span key={stage} style={{ ...stageCell, color: found(game, entry.index, stage) ? LOOK.green : LOOK.faded }}>
                  {found(game, entry.index, stage) ? '✓' : '·'}
                </span>
              ))}
              <strong style={{ ...stageCell, minWidth: 34 }}>{entry.finder.score}</strong>
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
  background: '#2e3a4a',
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
  borderBottom: '2px solid #ddd5c4',
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
  left: 0,
  right: 0,
  bottom: 20,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0 16px',
}

const banner: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 999,
  color: '#fff',
  font: `700 16px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
  textAlign: 'center',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15, 18, 25, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 400,
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

const stageCell: React.CSSProperties = { minWidth: 26, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }

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
