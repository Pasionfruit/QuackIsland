/**
 * Duck Hunt, on the screen.
 *
 * The arena is drawn in its own canvas by `DuckHuntScene`; this is the shell:
 * the HUD with the clock and everybody's score in their colour and shape, and
 * a crosshair in place of the pointer that shows your cooldown - a ring that
 * fills back up over the second and a half, so you always know whether a click
 * will fire before you make it.
 *
 * **Mouse to aim, left click to shoot.** Nothing else. The crosshair is drawn
 * in the DOM and follows the pointer directly rather than through React, so it
 * never lags a frame behind your hand.
 */
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import type { MinigameRun } from '../../15-minigames'
import { ARENA, COLOURS, EMBLEMS, type Emblem } from './arena'
import { FOV } from './camera'
import { DuckHuntScene } from './DuckHuntScene'
import { balloonsFor, placings, timeLeft, type Game } from './game'
import { myId, newGame, waitingGame } from './setup'
import { useGameNet, type Trigger } from './useGameNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  danger: '#c8443c',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function DuckHuntScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useGameNet()
  const live = useRef(game)
  live.current = game
  const trigger = useRef<Trigger | null>(null)
  const crosshair = useRef<HTMLDivElement>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newGame()
    live.current = fresh
    setGame(fresh)
  }

  const onShoot = useCallback((shot: Trigger) => {
    if (!paused.current) trigger.current = shot
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const shot = trigger.current
      trigger.current = null
      if (wire.advance(current, dt, shot, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const moveCrosshair = (e: React.PointerEvent) => {
    const el = crosshair.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`
    el.style.opacity = '1'
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const cooling = mine ? mine.cooldown / ARENA.cooldown : 0
  const left = timeLeft(game)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Duck Hunt</span>
        {ready ? (
          <span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        {mine ? (
          <span style={{ ...pill, background: '#fff', color: LOOK.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            shoot <EmblemIcon emblem={EMBLEMS[mineIndex]} colour={COLOURS[mineIndex]} size={18} /> only
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {game.players.map((player, index) => (
          <span
            key={player.id}
            data-score={player.score}
            style={{
              ...pill,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: player.mine ? COLOURS[index] : 'rgba(255,255,255,0.7)',
              color: player.mine ? '#fff' : LOOK.ink,
            }}
          >
            <EmblemIcon emblem={EMBLEMS[index]} colour={player.mine ? '#fff' : COLOURS[index]} size={14} />
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(player.id)}</span>
            <strong>{player.score}</strong>
          </span>
        ))}
      </div>

      <div
        style={{ ...board, cursor: ready && !game.over ? 'none' : 'default' }}
        onPointerMove={moveCrosshair}
        onPointerLeave={() => crosshair.current && (crosshair.current.style.opacity = '0')}
      >
        <Canvas
          shadows={{ type: PCFShadowMap }}
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 1, far: 400, position: [0, 12, 40] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
        >
          <DuckHuntScene game={game} onShoot={onShoot} />
        </Canvas>

        {ready && !game.over ? (
          <div ref={crosshair} style={crosshairBox} data-cooldown={mine ? mine.cooldown.toFixed(2) : '0'}>
            <Crosshair colour={mine ? COLOURS[mineIndex] : '#fff'} cooling={cooling} />
          </div>
        ) : null}
      </div>

      {game.over && ready ? (
        <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? again : null} />
      ) : null}
    </div>
  )
}

/**
 * The crosshair: four ticks and a dot, with a ring round it that empties when
 * you shoot and fills back up as the cooldown runs out. Solid and in your colour
 * when you can fire.
 */
function Crosshair({ colour, cooling }: { colour: string; cooling: number }) {
  const r = 17
  const around = 2 * Math.PI * r
  const readyToFire = cooling <= 0
  return (
    <svg width={48} height={48} viewBox="-24 -24 48 48" style={{ overflow: 'visible' }}>
      <circle r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={5} />
      <circle
        r={r}
        fill="none"
        stroke={readyToFire ? colour : '#ffffff'}
        strokeWidth={3}
        strokeDasharray={`${around * (1 - cooling)} ${around}`}
        transform="rotate(-90)"
      />
      {[0, 90, 180, 270].map((angle) => (
        <line
          key={angle}
          x1={0}
          y1={-8}
          x2={0}
          y2={-13}
          stroke={readyToFire ? '#ffffff' : 'rgba(255,255,255,0.5)'}
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${angle})`}
        />
      ))}
      <circle r={2.2} fill={readyToFire ? colour : 'rgba(255,255,255,0.6)'} />
    </svg>
  )
}

/** A player's shape, in the DOM - the same eight as on the balloons. */
export function EmblemIcon({ emblem, colour, size }: { emblem: Emblem; colour: string; size: number }) {
  const s = 10
  const polygon = (sides: number, start: number, radius = s) =>
    Array.from({ length: sides }, (_, i) => {
      const a = start + (i * Math.PI * 2) / sides
      return `${(Math.cos(a) * radius).toFixed(2)},${(-Math.sin(a) * radius).toFixed(2)}`
    }).join(' ')
  const shape = (() => {
    switch (emblem) {
      case 'dot':
        return <circle r={s * 0.8} fill={colour} />
      case 'ring':
        return <circle r={s * 0.72} fill="none" stroke={colour} strokeWidth={s * 0.45} />
      case 'triangle':
        return <polygon points={polygon(3, Math.PI / 2, s * 1.1)} fill={colour} />
      case 'square':
        return <polygon points={polygon(4, Math.PI / 4, s * 1.05)} fill={colour} />
      case 'diamond':
        return <polygon points={polygon(4, 0, s * 1.05)} fill={colour} />
      case 'hexagon':
        return <polygon points={polygon(6, 0)} fill={colour} />
      case 'star':
        return (
          <>
            <polygon points={polygon(3, Math.PI / 2, s * 1.1)} fill={colour} />
            <polygon points={polygon(3, -Math.PI / 2, s * 1.1)} fill={colour} />
          </>
        )
      case 'cross':
        return (
          <>
            <rect x={-s} y={-s * 0.3} width={s * 2} height={s * 0.6} fill={colour} />
            <rect x={-s * 0.3} y={-s} width={s * 0.6} height={s * 2} fill={colour} />
          </>
        )
    }
  })()
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" data-emblem={emblem} style={{ flex: '0 0 auto' }}>
      {shape}
    </svg>
  )
}

/** The results: most of their own balloons popped, first. */
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
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine
    ? 'Time!'
    : mine.place === 1
      ? winners.length > 1
        ? 'A tie for first!'
        : 'You popped the most!'
      : `You came ${mine.place}${['th', 'st', 'nd', 'rd'][mine.place] ?? 'th'}`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {balloonsFor(game, 0)} balloons each. Only your own count.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map(({ player, index, place }) => (
            <div key={player.id} style={scoreRow} data-place={place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{place}</span>
              <EmblemIcon emblem={EMBLEMS[index]} colour={COLOURS[index]} size={16} />
              <span style={{ flex: 1, fontWeight: player.id === me ? 700 : 400 }}>{nameOf(player.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {player.shots} {player.shots === 1 ? 'shot' : 'shots'}
              </span>
              <strong style={{ minWidth: 22, textAlign: 'right' }}>{player.score}</strong>
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

const crosshairBox: React.CSSProperties = {
  position: 'absolute',
  left: -24,
  top: -24,
  width: 48,
  height: 48,
  pointerEvents: 'none',
  opacity: 0,
  willChange: 'transform',
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
  width: 340,
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
