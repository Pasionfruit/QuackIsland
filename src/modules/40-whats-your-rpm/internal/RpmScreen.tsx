/**
 * What's Your RPM?, on the screen.
 *
 * Two halves. On the left, **your mini phone**: the feed, drawn as the page it
 * is, a reel at a time, with the reels sliding up as you scroll and an ad over
 * the top when one is in the way. On the right, the race, drawn in its own
 * canvas by `RpmScene`: everybody walking their lane to the end of the feed.
 *
 * **Mouse wheel to scroll.** Watched on the window, so it counts wherever the
 * pointer is. A wheel event queues reels and the frame drains them onto the
 * feed no faster than the top speed - see `Wheel` in the rules - so a
 * free-spinning wheel tops out rather than teleporting.
 *
 * **Click Skip Ad.** An ad stops the feed dead and throws away whatever was
 * queued. Its skip button is somewhere different every time, and smaller the
 * further down the feed you are.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { TopTimer, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { adCopyAt, reelAt } from './reels'
import { RpmScene } from './RpmScene'
import {
  COLOURS,
  FEED,
  blocked,
  clearWheel,
  drainWheel,
  finished,
  newWheel,
  nextAd,
  placings,
  queueWheel,
  rpm,
  timeLeft,
  wheelReels,
  type Game,
  type Player,
  type Wheel,
} from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useFeedNet } from './useFeedNet'

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

/** How far back the speedometer remembers, in seconds. */
const SAMPLES = 2

export function RpmScreen({ run }: { run: MinigameRun }) {
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
  const wire = useFeedNet()
  const live = useRef(game)
  live.current = game

  /** Your wheel, between the event and the feed. */
  const wheel = useRef<Wheel>(newWheel())
  /** The ad whose skip button was clicked since the last frame. */
  const skipping = useRef<number | null>(null)
  /** How far you had got, a moment at a time, for the speedometer. */
  const samples = useRef<{ at: number; progress: number }[]>([])
  /** The game the wheel was last reset for. */
  const dealtFor = useRef(-1)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    const spin = (e: WheelEvent) => {
      if (paused.current) return
      queueWheel(wheel.current, wheelReels(e.deltaY, e.deltaMode))
    }
    window.addEventListener('wheel', spin, { passive: true })
    return () => window.removeEventListener('wheel', spin)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current

      // A new game: nothing queued, nothing remembered.
      if (current.id !== dealtFor.current) {
        dealtFor.current = current.id
        clearWheel(wheel.current)
        samples.current = []
      }

      const mine = current.players.find((p) => p.mine)
      const canScroll = !paused.current && !current.over && !!mine && !mine.left && !finished(mine) && !blocked(current, mine)
      const reels = canScroll ? drainWheel(wheel.current, dt) : (clearWheel(wheel.current), 0)
      const skip = paused.current ? null : skipping.current
      skipping.current = null

      const moved = wire.advance(current, dt, reels, skip, paused.current)
      if (mine && !paused.current) {
        const list = samples.current
        list.push({ at: now / 1000, progress: mine.progress })
        while (list.length > 2 && now / 1000 - list[0].at > SAMPLES) list.shift()
      }
      if (moved) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.players.length > 0
  const mine = game.players.find((p) => p.mine)
  const playing = ready && !game.over
  const left = timeLeft(game)
  const speed = playing && mine && !blocked(game, mine) ? Math.round(rpm(samples.current)) : 0
  const reel = mine ? Math.min(FEED.reels, Math.floor(mine.progress) + 1) : 0

  let caption = ''
  let captionColour = '#fff'
  if (playing && mine) {
    if (finished(mine)) {
      caption = 'All caught up! Waiting for the host…'
      captionColour = '#8ff0ad'
    } else if (blocked(game, mine)) {
      caption = 'An ad! Click Skip Ad'
      captionColour = '#ffb1a8'
    } else if (mine.progress === 0) {
      caption = 'Scroll down with the mouse wheel - fast!'
    } else {
      caption = 'Keep scrolling'
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>What's Your RPM?</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-reel={reel}>
            {mine && finished(mine) ? 'all caught up' : `reel ${reel} of ${FEED.reels}`}
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        {playing ? (
          <span style={{ ...pill, background: 'rgba(31,42,51,0.08)', color: LOOK.ink, font: `700 12px/1.5 ${MONO}` }} data-rpm={speed}>
            {speed} rpm
          </span>
        ) : null}
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
            data-progress={Math.floor(p.progress)}
          >
            {nameOf(p.id)} · {Math.floor(p.progress)}/{FEED.reels}
          </span>
        ))}
      </div>

      {playing ? (
        <TopTimer left={game.over ? null : left}>
          <span style={{ ...pill, background: left <= 15 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        </TopTimer>
      ) : null}

      <div style={board} onContextMenu={(e) => e.preventDefault()} data-board>
        <div style={phoneColumn}>
          {mine ? (
            <Phone
              game={game}
              player={mine}
              speed={speed}
              onSkip={(index) => {
                if (!paused.current) skipping.current = index
              }}
            />
          ) : null}
          {playing ? <div style={{ ...captionStyle, color: captionColour }}>{caption}</div> : null}
        </div>
        <div style={stageBox}>
          <Stage live={live} />
        </div>
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
      <style>{KEYFRAMES}</style>
    </div>
  )
}

/** Your mini phone: the feed, and an ad over it when one is in the way. */
function Phone({ game, player, speed, onSkip }: { game: Game; player: Player; speed: number; onSkip: (index: number) => void }) {
  const at = player.progress
  const first = Math.max(0, Math.floor(at) - 1)
  const shown: number[] = []
  for (let i = first; i <= Math.min(FEED.reels, Math.floor(at) + 1); i++) shown.push(i)
  const ad = blocked(game, player) ? nextAd(game, player) : null
  return (
    <div style={phone} data-phone>
      <div style={screen}>
        {shown.map((i) => (
          <div key={i} style={{ ...reelBox, transform: `translateY(${(i - at) * 100}%)` }}>
            {i < FEED.reels ? <ReelCard seed={game.seed} index={i} /> : <CaughtUp />}
          </div>
        ))}
        <div style={topBar}>
          <span style={{ fontWeight: 700 }}>Reels</span>
          <span style={{ font: `700 12px/1 ${MONO}` }}>{speed} rpm</span>
        </div>
        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${(Math.min(at, FEED.reels) / FEED.reels) * 100}%` }} />
        </div>
        {ad ? (
          <AdCover
            key={player.skipped}
            seed={game.seed}
            index={player.skipped}
            x={ad.x}
            y={ad.y}
            size={ad.size}
            count={game.ads.length}
            onSkip={() => onSkip(player.skipped)}
          />
        ) : null}
      </div>
      <div style={notch} />
    </div>
  )
}

function ReelCard({ seed, index }: { seed: number; index: number }) {
  const reel = reelAt(seed, index)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(160deg, hsl(${reel.hue} 70% 58%), hsl(${(reel.hue + 40) % 360} 65% 32%))`,
        color: '#fff',
      }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: '28%', textAlign: 'center', fontSize: 'clamp(48px, 9vh, 96px)', lineHeight: 1 }}>{reel.emoji}</div>
      <div style={{ position: 'absolute', right: 10, bottom: '22%', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', font: `700 11px/1.2 ${FONT}` }}>
        <span style={sideIcon}>♥<br />{reel.likes}</span>
        <span style={sideIcon}>💬</span>
        <span style={sideIcon}>↗</span>
      </div>
      <div style={{ position: 'absolute', left: 14, right: 56, bottom: 22, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
        <div style={{ font: `700 13px/1.3 ${FONT}` }}>{reel.handle}</div>
        <div style={{ font: `13px/1.35 ${FONT}`, opacity: 0.95 }}>{reel.caption}</div>
      </div>
      <div style={{ position: 'absolute', left: 14, top: 44, font: `700 11px/1 ${MONO}`, opacity: 0.7 }}>
        {index + 1}/{FEED.reels}
      </div>
    </div>
  )
}

function CaughtUp() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#101418', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ font: `700 18px/1.3 ${FONT}` }}>You're all caught up</div>
      <div style={{ font: `13px/1.3 ${FONT}`, opacity: 0.7 }}>No more reels</div>
    </div>
  )
}

/** An ad over the whole screen, with its skip button somewhere on it. */
function AdCover({ seed, index, x, y, size, count, onSkip }: { seed: number; index: number; x: number; y: number; size: number; count: number; onSkip: () => void }) {
  const copy = adCopyAt(seed, index)
  return (
    <div style={adCover} data-ad={index}>
      <div style={{ position: 'absolute', left: 12, top: 40, ...adChip }}>
        Sponsored · Ad {index + 1} of {count}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '26%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(44px, 8vh, 84px)', lineHeight: 1, animation: 'rpm-wobble 1.2s ease-in-out infinite' }}>{copy.emoji}</div>
        <div style={{ font: `800 20px/1.2 ${FONT}` }}>{copy.product}</div>
        <div style={{ font: `14px/1.3 ${FONT}`, opacity: 0.8 }}>{copy.pitch}</div>
        {/* Does nothing, like every button on an ad you did not mean to press. */}
        <div style={adAction}>{copy.action}</div>
      </div>
      <button
        type="button"
        style={{ ...skipButton, left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(-50%, -50%) scale(${size})` }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          onSkip()
        }}
        data-skip={index}
      >
        Skip Ad ⏭
      </button>
    </div>
  )
}

/** The canvas, rendered once - see `RpmScene`. */
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
      <RpmScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 12, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: finishers first, soonest first, then everybody by how far they got. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const somebody = order.some((entry) => entry.player.finishedAt !== null)
  const headline = !somebody ? 'Time!' : mine?.place === 1 ? (winners.length > 1 ? 'A tie at the top!' : 'All caught up first!') : `${nameOf(winners[0].player.id)} got there first`
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
              <span style={{ minWidth: 70, textAlign: 'right', font: `600 12px/1.4 ${MONO}`, color: entry.player.finishedAt === null ? LOOK.faded : LOOK.green }}>
                {entry.player.finishedAt === null ? `${Math.floor(entry.player.progress)}/${FEED.reels}` : `${entry.player.finishedAt.toFixed(1)}s`}
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

const KEYFRAMES = [
  '@keyframes rpm-pop { 0% { transform: scale(0.9); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }',
  '@keyframes rpm-wobble { 0%,100% { transform: rotate(-6deg) } 50% { transform: rotate(6deg) } }',
].join('\n')

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#1d2433',
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', display: 'flex' }

const phoneColumn: React.CSSProperties = {
  flex: '0 0 auto',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '14px 20px 14px 28px',
  boxSizing: 'border-box',
}

const stageBox: React.CSSProperties = { flex: 1, minWidth: 0, height: '100%', position: 'relative' }

const phone: React.CSSProperties = {
  position: 'relative',
  height: 'min(calc(100% - 44px), 740px)',
  aspectRatio: '9 / 18',
  boxSizing: 'border-box',
  padding: 10,
  borderRadius: 38,
  background: '#0c0d10',
  boxShadow: '0 0 0 2px #3a3d46, 0 14px 40px rgba(0,0,0,0.5)',
}

const screen: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  borderRadius: 29,
  background: '#000',
}

const notch: React.CSSProperties = {
  position: 'absolute',
  top: 18,
  left: '50%',
  width: 70,
  height: 18,
  marginLeft: -35,
  borderRadius: 999,
  background: '#0c0d10',
  pointerEvents: 'none',
}

const reelBox: React.CSSProperties = { position: 'absolute', inset: 0, willChange: 'transform' }

const topBar: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  right: 14,
  top: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#fff',
  font: `14px/1 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
  pointerEvents: 'none',
}

const progressTrack: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 4,
  background: 'rgba(255,255,255,0.25)',
}

const progressFill: React.CSSProperties = { height: '100%', background: '#fff' }

const sideIcon: React.CSSProperties = { textAlign: 'center', fontSize: 20, lineHeight: 1.1, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }

const adCover: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, #fdfdfd, #e7ecf2)',
  color: LOOK.ink,
  animation: 'rpm-pop 0.12s ease-out',
}

const adChip: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 6,
  background: '#f5c542',
  color: '#3b2a00',
  font: `700 10px/1.5 ${FONT}`,
}

const adAction: React.CSSProperties = {
  marginTop: 8,
  padding: '10px 26px',
  borderRadius: 999,
  background: '#2f6fed',
  color: '#fff',
  font: `700 15px/1.2 ${FONT}`,
  cursor: 'pointer',
}

const skipButton: React.CSSProperties = {
  position: 'absolute',
  padding: '9px 16px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.7)',
  background: 'rgba(0,0,0,0.78)',
  color: '#fff',
  font: `700 14px/1 ${FONT}`,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  zIndex: 2,
}

const captionStyle: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  background: 'rgba(16, 22, 28, 0.6)',
  font: `700 14px/1.3 ${FONT}`,
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
  width: 420,
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
