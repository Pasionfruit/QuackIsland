/**
 * M.I.L.F (fishing), on the screen.
 *
 * The lake is drawn in its own canvas by `PondScene`; this is the shell: the
 * click turned into a pull for `usePondNet`, and the words - the 25 seconds,
 * **your catch** fish by fish and in kilograms, everybody's total, and what your
 * last pull landed.
 *
 * **Left click pulls the rod.** Watch how far it bends: a little is a small fish,
 * right over is a big one; straight is nothing at all.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { FISH, LENGTH, bendAt, playBack, type Bite } from './pond'
import { PondScene } from './PondScene'
import { COLOURS, bitesOf, castLeft, catches, placings, total, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { usePondNet, type Pulled } from './usePondNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#fbf3ea',
  sun: '#ffc94d',
  lake: '#2c6c8c',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const kg = (v: number) => `${v.toFixed(1)} kg`

export function PondScreen({ run }: { run: MinigameRun }) {
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

  const wire = usePondNet()
  const live = useRef(game)
  live.current = game
  const clicked = useRef(false)
  /** What your last pull landed, and when, for the banner. */
  const [last, setLast] = useState<{ what: Bite | null; at: number } | null>(null)

  useEffect(() => {
    let frame = 0
    let before = performance.now()
    const tick = (now: number) => {
      const dt = (now - before) / 1000
      before = now
      const current = live.current
      const result = wire.advance(current, dt, { pulled: clicked.current }, paused.current)
      clicked.current = false
      landed(result.pulled, current.elapsed)
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  /** Your own pull: a sound and the banner. */
  const landed = (pulled: Pulled, at: number) => {
    if (pulled === undefined) return
    playCue(CUES.cutRope, 0.4)
    if (pulled) playCue(pulled.size >= 2 ? CUES.launch : CUES.balloonPop, 0.6)
    else playCue(CUES.wrongSelection, 0.5)
    setLast({ what: pulled, at })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    clicked.current = true
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const t = game.elapsed
  const left = Math.max(0, LENGTH - t)
  const mine = mineIndex >= 0 ? catches(game, mineIndex) : []
  const casting = mineIndex >= 0 ? castLeft(game, mineIndex) : 0
  useBiteSounds(game, mineIndex)

  let banner: { text: string; sub?: string; tone: 'good' | 'bad' | 'hint' } | null = null
  if (ready && !game.over && mineIndex >= 0) {
    if (last && t - last.at < 1.6) {
      banner = last.what
        ? { text: `Caught ${FISH[last.what.size].name === 'your mom' ? '' : 'a '}${FISH[last.what.size].name}!`, sub: kg(last.what.weight), tone: 'good' }
        : { text: 'Nothing!', sub: "the rod wasn't bent", tone: 'bad' }
    } else if (casting > 0) banner = { text: 'Casting…', tone: 'hint' }
    else if (t < 4 && mine.length === 0) banner = { text: 'Watch your rod - click to pull when it bends', sub: 'a little bend is a small fish, bent right over is a big one', tone: 'hint' }
  }

  const ranked = placings(game)
  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>M.I.L.F (fishing)</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : left}>
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.ceil(left)}>
                0:{String(Math.ceil(left)).padStart(2, '0')}
              </span>
            </TopTimer>
            {mineIndex >= 0 ? (
              <span style={{ ...pill, background: LOOK.lake, color: '#fff' }} data-total={total(game, mineIndex)}>
                your catch {kg(total(game, mineIndex))}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {ranked.map(({ player: p, index }) => (
          <span
            key={p.id}
            style={{ ...pill, background: p.left ? 'rgba(255,255,255,0.85)' : COLOURS[index % COLOURS.length], color: p.left ? LOOK.faded : '#fff', opacity: p.left ? 0.45 : 1, outline: p.mine ? `2px solid ${LOOK.ink}` : 'none', outlineOffset: 1 }}
            data-total={total(game, index)}
          >
            {nameOf(p.id)} · {kg(total(game, index))}
          </span>
        ))}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />

        {ready && mineIndex >= 0 ? (
          <div style={card} data-catches={mine.length}>
            <div style={cardTitle}>Your catch</div>
            {mine.length === 0 ? <div style={{ color: LOOK.faded, font: `600 13px/1.5 ${FONT}` }}>nothing yet</div> : null}
            {mine.map((b, i) => (
              <div key={i} style={line}>
                <span>🐟 {FISH[b.size].name}</span>
                <span style={{ fontWeight: 800 }}>{kg(b.weight)}</span>
              </div>
            ))}
            {mine.length > 0 ? (
              <div style={{ ...line, borderTop: '1px solid #e4d8ca', marginTop: 4, paddingTop: 4 }}>
                <span>total</span>
                <span style={{ fontWeight: 900 }}>{kg(total(game, mineIndex))}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {banner ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}

        {ready && mineIndex >= 0 && !game.over ? <div style={hint}>click to pull</div> : null}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `PondScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
      }}
    >
      <PondScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 55, near: 0.1, far: 400, position: [0, 3, 4] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * A little plop when something takes your bait - the same for every fish, so it
 * tells you to look and not what is there - and a splash for anybody else's
 * catch. Off the clock and the pulls every screen has.
 */
function useBiteSounds(game: Game, mine: number): void {
  const seen = useRef<{ id: number; bite: number; landed: number }>({ id: -1, bite: -1, landed: 0 })
  useEffect(() => {
    if (seen.current.id !== game.id) seen.current = { id: game.id, bite: -1, landed: -1 }
    const s = seen.current
    if (game.players.length === 0 || game.over) return
    if (mine >= 0) {
      const now = bendAt(bitesOf(game, mine), game.players[mine].pulls, game.elapsed)
      if (now.bite >= 0 && now.bite !== s.bite) playCue(CUES.bump, 0.25)
      s.bite = now.bite
    }
    let landed = 0
    game.players.forEach((p, i) => {
      if (i !== mine) landed += playBack(bitesOf(game, i), p.pulls).landed.filter(Boolean).length
    })
    if (s.landed >= 0 && landed > s.landed) playCue(CUES.balloonPop, 0.2)
    s.landed = landed
  }, [game, mine])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#f4b27a',
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
  borderBottom: '2px solid #ead9c4',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'pointer' }

const card: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 16,
  minWidth: 170,
  padding: '10px 14px',
  borderRadius: 14,
  background: 'rgba(251,243,234,0.95)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
  pointerEvents: 'none',
}

const cardTitle: React.CSSProperties = { font: `800 11px/1.4 ${FONT}`, letterSpacing: 1, textTransform: 'uppercase', color: LOOK.lake, marginBottom: 2 }

const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 14, font: `600 14px/1.6 ${FONT}` }

const hint: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 20,
  transform: 'translateX(-50%)',
  padding: '3px 14px',
  borderRadius: 999,
  background: 'rgba(42,34,51,0.55)',
  color: '#fff',
  font: `800 11px/20px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
  pointerEvents: 'none',
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
  font: `800 22px/1.25 ${FONT}`,
  textAlign: 'center',
}

const TONES: Record<'good' | 'bad' | 'hint', React.CSSProperties> = {
  good: { background: LOOK.green, color: '#fff', boxShadow: '0 4px 0 rgba(0,0,0,0.25)' },
  bad: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)' },
  hint: { background: 'rgba(251,243,234,0.94)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `800 16px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
