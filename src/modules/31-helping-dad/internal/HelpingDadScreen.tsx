/**
 * Helping Dad, on the screen.
 *
 * The maze is drawn in its own canvas by `HelpingDadScene`; this is the shell:
 * the mouse turned into a point in the maze and passed to `useTorchNet`, and the
 * words - the countdown, the time left, telling you to pick your torch up, Dad
 * yelling, your finish, and the results.
 *
 * **Move the mouse to move through the maze.** Put it on your torch to pick the
 * torch up, then lead it - slowly.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, replayMinigame, useCueOnChange, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV, aimAt } from './camera'
import { HelpingDadScene } from './HelpingDadScene'
import type { Point } from './maze'
import { COLOURS, ROUND, TORCH, clock, placings, remaining, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useTorchNet } from './useTorchNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** What Dad yells, one after another. */
export const YELLS = ['WATCH THE WALLS!', 'SLOWLY!', 'What did I just say?!', 'CAREFUL!', 'Are you even looking?!'] as const

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

export function HelpingDadScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.torch.id, place: e.place, name: nameOf(e.torch.id), colour: COLOURS[e.index % COLOURS.length], mine: e.torch.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useTorchNet()
  const live = useRef(game)
  live.current = game
  /** Where the mouse is in the maze, or null before it has moved over the board. */
  const aim = useRef<Point | null>(null)
  /** The mouse on the board, -1 to 1 each way, and the board's shape, so the aim can be worked out again. */
  const pointer = useRef<{ x: number; y: number; aspect: number } | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const p = pointer.current
      aim.current = p ? aimAt({ x: p.x, y: p.y }, p.aspect) : null
      if (wire.advance(current, dt, aim.current, paused.current).changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointer = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    pointer.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1), aspect: r.width / r.height }
  }

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const t = clock(game)
  const finishers = game.players.filter((p) => p.finished !== null).sort((a, b) => a.finished! - b.finished!)
  const myPlace = mine && mine.finished !== null ? finishers.filter((p) => p.finished! < mine.finished!).length + 1 : null

  // Walls touched are in every snapshot, so these fire from the same numbers on
  // every screen. Your own wall is a bonk and Dad yelling - a different line
  // each time, by how many you have hit; anybody else's is a quieter bonk.
  // Counts only go up within a maze, so a count at zero is a new maze: silent.
  const myHits = mine?.hits ?? 0
  const otherHits = game.players.reduce((n, p) => (p.mine ? n : n + p.hits), 0)
  useCueOnChange(CUES.bonk, myHits, myHits > 0 && !run.paused)
  useCueOnChange(CUES.dadYelling, myHits, myHits > 0 && !run.paused, 0.8, myHits - 1)
  useCueOnChange(CUES.bonk, otherHits, otherHits > 0 && !run.paused, 0.25)

  let banner: { text: string; sub?: string; tone: 'count' | 'yell' | 'hint' | 'done' } | null = null
  if (ready && !game.over && mine) {
    if (mine.finished !== null) banner = { text: `You made it - ${ordinal(myPlace ?? 1)}`, sub: 'waiting for the others', tone: 'done' }
    else if (mine.stunned > 0) banner = { text: `DAD: ${YELLS[(mine.hits - 1 + YELLS.length) % YELLS.length]}`, sub: `stunned ${(Math.ceil(mine.stunned * 10) / 10).toFixed(1)}s`, tone: 'yell' }
    else if (!mine.held) banner = { text: 'Put the mouse on your torch to pick it up', tone: 'hint' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Helping Dad</span>
        {ready ? (
          <TopTimer left={game.over ? null : ROUND.limit - Math.max(0, t)}><span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}>
            {Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}s
          </span></TopTimer>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((torch, index) => (
          <span
            key={torch.id}
            style={{
              ...pill,
              background: torch.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: torch.mine ? LOOK.ink : LOOK.ink,
              boxShadow: torch.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: torch.left ? 0.5 : 1,
            }}
            data-hits={torch.hits}
          >
            {nameOf(torch.id)}
            {torch.finished !== null ? ' ✓' : torch.stunned > 0 ? ' 💫' : ''}
          </span>
        ))}
      </div>

      <div
        style={{ ...board, cursor: mine?.held ? 'none' : 'crosshair' }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} aim={aim} />
        {mine && mine.stunned > 0 && !game.over ? <div style={{ ...vignette, opacity: Math.min(1, mine.stunned / TORCH.stun) }} /> : null}
        {banner ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `HelpingDadScene`. */
const Stage = memo(function Stage({ live, aim }: { live: RefObject<Game>; aim: RefObject<Point | null> }) {
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
      <HelpingDadScene live={live} aim={aim} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 20, 8] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: finishers by time, then everybody else by how far they had left. */
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
  const mine = order.find((entry) => entry.torch.id === me)
  const headline = !mine ? 'Lights on' : mine.torch.finished === null ? 'Still in the dark' : mine.place === 1 ? 'Dad is proud of you!' : 'You made it out'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>Quickest out first.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.torch.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.torch.id === me ? 700 : 400 }}>{nameOf(entry.torch.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{entry.torch.hits === 1 ? '1 wall' : `${entry.torch.hits} walls`}</span>
              <span style={{ minWidth: 92, textAlign: 'right', font: `600 13px/1.4 ${FONT}`, color: entry.torch.finished !== null ? LOOK.green : LOOK.faded }}>
                {entry.torch.finished !== null ? `${entry.torch.finished.toFixed(1)}s` : entry.torch.left ? 'left' : `${remaining(game, entry.torch).toFixed(1)} m to go`}
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
  background: '#050409',
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const vignette: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,40,40,0) 45%, rgba(255,40,40,0.45) 100%)',
}

/** At the bottom of the stage: Dad is at the top. */
const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 18,
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

const TONES: Record<'count' | 'yell' | 'hint' | 'done', React.CSSProperties> = {
  count: { background: 'rgba(20,16,28,0.85)', color: '#fff', font: `800 44px/1.1 ${FONT}`, minWidth: 80 },
  yell: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  done: { background: LOOK.green, color: '#fff' },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }

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
  width: 460,
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
