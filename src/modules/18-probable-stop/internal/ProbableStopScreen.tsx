/**
 * Probable Stop, on the screen.
 *
 * The bridges are drawn in their own canvas by `ProbableStopScene`; this is the
 * shell round it: the keys and the mouse in, `useGameNet` deciding what they
 * do, a HUD across the top saying which round and what the odds are, and three
 * cards along the bottom - one per path - to see who is standing where and to
 * click on.
 *
 * **Three ways to choose, one choice.** WASD moves you a path at a time, the
 * mouse picks a path outright (on a bridge or a card), and Space confirms.
 * Clicking the path you are already on confirms it too, so a mouse player never
 * has to reach for the keyboard. Whatever you are standing on when the clock
 * runs out is what counts, confirmed or not; confirming is how a lobby that has
 * all made up its mind skips the rest of the countdown.
 */
import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { GAME, placings, roundsSurvived, safeCount, stillIn, type Game, type Intent } from './game'
import { BEATS, bridgeCondition, revealProgress } from './place'
import { PALETTE, ProbableStopScene } from './ProbableStopScene'
import { myId, newGame, waitingGame } from './setup'
import { useGameNet } from './useGameNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  danger: '#c8443c',
  safe: '#4f9e44',
  you: PALETTE.you,
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const PREVIOUS = new Set(['KeyA', 'KeyW', 'ArrowLeft', 'ArrowUp'])
const NEXT = new Set(['KeyD', 'KeyS', 'ArrowRight', 'ArrowDown'])

export function ProbableStopScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.phase === 'over', () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useGameNet()
  const live = useRef(game)
  live.current = game
  const wish = useRef<Intent>({ round: -1, pick: GAME.startPath, confirmed: false })
  const [hovered, setHovered] = useState<number | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  /** Whether this browser's player can change anything right now. */
  const canChoose = () => {
    const g = live.current
    const mine = g.players.find((p) => p.mine)
    return !paused.current && g.phase === 'choosing' && !!mine && mine.alive && wish.current.round === g.round
  }

  const pick = (lane: number) => {
    if (!canChoose()) return
    const w = wish.current
    if (w.pick === lane) {
      w.confirmed = true
    } else {
      w.pick = lane
      w.confirmed = false
    }
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const by = PREVIOUS.has(e.code) ? -1 : NEXT.has(e.code) ? 1 : 0
      if (by === 0 && e.code !== 'Space') return
      e.preventDefault()
      if (e.repeat || !canChoose()) return
      const w = wish.current
      if (e.code === 'Space') {
        w.confirmed = true
        return
      }
      const to = Math.max(0, Math.min(GAME.paths - 1, w.pick + by))
      if (to !== w.pick) {
        w.pick = to
        w.confirmed = false
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      if (wire.advance(current, dt, wish.current, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The pointer over a bridge is a hand, the same as over a card.
  useEffect(() => {
    document.body.style.cursor = hovered !== null && game.phase === 'choosing' ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered, game.phase])

  const ready = game.players.length > 0
  const left = stillIn(game)
  const lastTwo = safeCount(game.round) === 1

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Probable Stop</span>
        {ready ? (
          <>
            <Pill colour={LOOK.ink}>
              round {game.round + 1} of {GAME.rounds}
            </Pill>
            <Pill colour={lastTwo ? LOOK.danger : LOOK.safe}>
              {lastTwo ? 'only 1 of 3 paths holds' : '2 of 3 paths hold'}
            </Pill>
            <Pill colour={LOOK.ink}>{left.length} still in</Pill>
          </>
        ) : null}
        <span style={{ flex: 1 }} />
        {ready ? <Status game={game} /> : <span style={{ color: LOOK.faded }}>waiting for the host…</span>}
      </div>

      <div style={board}>
        <Canvas
          shadows={{ type: PCFShadowMap }}
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 1, far: 400, position: [0, 40, 40] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
          onPointerMissed={() => setHovered(null)}
        >
          <ProbableStopScene game={game} hovered={hovered} onPick={pick} onHover={setHovered} />
        </Canvas>

        {ready && game.phase === 'choosing' ? <Countdown game={game} /> : null}
        {ready && game.phase === 'reveal' ? <Verdict game={game} /> : null}

        {ready ? (
          <div style={cards}>
            {PALETTE.lanes.map((colour, lane) => (
              <PathCard
                key={lane}
                lane={lane}
                colour={colour}
                game={game}
                hovered={hovered === lane}
                onPick={() => pick(lane)}
                onHover={(on) => setHovered(on ? lane : null)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {results && ready ? (
        <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} />
      ) : null}
    </div>
  )
}

/** Where you stand, in words, top right. */
function Status({ game }: { game: Game }) {
  const mine = game.players.find((p) => p.mine)
  if (!mine) return <span style={{ color: LOOK.faded }}>watching</span>
  if (!mine.alive) {
    return (
      <span style={{ color: LOOK.faded }} data-status="out">
        you fell in round {(mine.outIn ?? 0) + 1} - watching
      </span>
    )
  }
  if (game.phase !== 'choosing') return <span style={{ color: LOOK.faded }}>…</span>
  return mine.confirmed ? (
    <Pill colour={PALETTE.confirmed} ink={LOOK.ink}>
      locked in on path {mine.pick + 1} - move to change
    </Pill>
  ) : (
    <Pill colour={LOOK.you}>A / D to move · click a path · Space to lock in</Pill>
  )
}

/** The seconds left, big, over the view. */
function Countdown({ game }: { game: Game }) {
  const everyone = stillIn(game).every((p) => p.confirmed)
  return (
    <div style={countdown} data-countdown={Math.ceil(game.clock)}>
      <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{Math.ceil(game.clock)}</div>
      {everyone ? <div style={{ fontSize: 13, fontWeight: 700 }}>everybody's in</div> : null}
    </div>
  )
}

/** What happened to you, once the bridges have gone. */
function Verdict({ game }: { game: Game }) {
  const mine = game.players.find((p) => p.mine)
  if (!mine || (!mine.alive && mine.outIn !== game.round)) return null
  if (revealProgress(game) < BEATS.drop[0]) return null
  const fell = !mine.alive
  const last = game.round === GAME.rounds - 1
  return (
    <div style={{ ...verdict, background: fell ? LOOK.danger : LOOK.safe }} data-verdict={fell ? 'fell' : 'held'}>
      {fell ? 'Your bridge dropped!' : last ? 'You made it through all six!' : 'Your bridge held!'}
    </div>
  )
}

/** One path: its colour, who is on it, and - once revealed - whether it held. */
function PathCard({
  lane,
  colour,
  game,
  hovered,
  onPick,
  onHover,
}: {
  lane: number
  colour: string
  game: Game
  hovered: boolean
  onPick: () => void
  onHover: (on: boolean) => void
}) {
  const mine = game.players.find((p) => p.mine)
  const here = game.players.filter((p) => p.pick === lane && (p.alive || p.outIn === game.round))
  const yours = !!mine && mine.alive && mine.pick === lane
  // Not until the bridges that are going go: everybody walks out not knowing.
  const revealed = game.phase !== 'choosing' && game.safe.length > 0 && revealProgress(game) >= BEATS.drop[0]
  const held = game.safe.includes(lane)
  return (
    <button
      type="button"
      data-path={lane}
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        ...card,
        borderColor: yours ? LOOK.you : hovered ? colour : 'transparent',
        boxShadow: yours ? `0 0 0 3px ${LOOK.you}, 0 4px 0 rgba(0,0,0,0.15)` : card.boxShadow,
        cursor: game.phase === 'choosing' ? 'pointer' : 'default',
      }}
    >
      <span style={{ ...swatch, background: colour }} />
      <span style={{ fontWeight: 800 }}>path {lane + 1}</span>
      <span style={{ color: LOOK.faded, fontStyle: 'italic' }}>{bridgeCondition(game, lane)}</span>
      <span style={{ color: LOOK.faded }}>{here.length === 1 ? '1 on it' : `${here.length} on it`}</span>
      {yours ? (
        <span style={{ fontWeight: 700, color: LOOK.you }}>{mine?.confirmed ? 'you ✓' : 'you'}</span>
      ) : null}
      {revealed ? (
        <span style={{ ...tag, background: held ? LOOK.safe : LOOK.danger }}>{held ? 'held' : 'dropped'}</span>
      ) : null}
    </button>
  )
}

function Pill({ colour, ink = '#fff', children }: { colour: string; ink?: string; children: React.ReactNode }) {
  return <span style={{ ...pill, background: colour, color: ink }}>{children}</span>
}

/** The results: survivors first, then by how late people fell. */
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
  const mine = game.players.find((p) => p.id === me)
  const survivors = stillIn(game).length
  const headline = !mine
    ? 'Game over'
    : mine.alive
      ? 'You survived all six!'
      : `You fell in round ${(mine.outIn ?? 0) + 1}`
  const sub =
    survivors === 0
      ? 'Nobody made it all the way.'
      : survivors === 1
        ? `${mine?.alive ? 'Nobody else' : nameOf(stillIn(game)[0].id)} made it all the way.`
        : `${survivors} made it all the way.`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{sub}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.slice(0, 8).map(({ player, place }) => (
            <div key={player.id} style={scoreRow} data-place={place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{place}</span>
              <span style={{ flex: 1, fontWeight: player.id === me ? 700 : 400 }}>{nameOf(player.id)}</span>
              <span style={{ opacity: 0.6 }}>
                {player.alive ? 'survived all 6' : `fell in round ${roundsSurvived(player) + 1}`}
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative' }

const countdown: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  minWidth: 72,
  padding: '8px 16px',
  borderRadius: 20,
  background: 'rgba(246, 228, 191, 0.94)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.15)',
  textAlign: 'center',
  color: LOOK.ink,
  font: `14px/1.3 ${FONT}`,
  pointerEvents: 'none',
}

const verdict: React.CSSProperties = {
  position: 'absolute',
  top: 18,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '8px 20px',
  borderRadius: 999,
  color: '#fff',
  font: `800 18px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

const cards: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 14,
  display: 'flex',
  justifyContent: 'center',
  gap: 10,
  padding: '0 16px',
  flexWrap: 'wrap',
  pointerEvents: 'none',
}

const card: React.CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 16,
  border: '3px solid transparent',
  background: 'rgba(246, 228, 191, 0.96)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.15)',
  color: LOOK.ink,
  font: `14px/1.3 ${FONT}`,
}

const swatch: React.CSSProperties = { width: 14, height: 14, borderRadius: 4, flex: '0 0 auto' }

const tag: React.CSSProperties = {
  padding: '1px 8px',
  borderRadius: 999,
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
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
  width: 320,
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.sand,
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
