/**
 * Sharing Is Caring, on the screen.
 *
 * The arena is drawn in its own canvas by `SharingIsCaringScene`; this is the
 * shell: the keys in, `useRoundNet` deciding what they do, a HUD with the clock,
 * who has the crown and your points, a running scoreboard, and the results.
 *
 * **WASD to move.** That is every control there is: you pick the crown up by
 * walking into it, and take it off somebody by walking into them.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { SharingIsCaringScene } from './SharingIsCaringScene'
import { COLOURS, placings, points, timeLeft, type Intent, type Round } from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useRoundNet } from './useRoundNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  gold: '#e0a21a',
  danger: '#c8443c',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function SharingIsCaringScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : waitingRound()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(round.over, () =>
    placings(round).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRoundNet()
  const live = useRef(round)
  live.current = round

  const keys = useRef({ up: false, down: false, left: false, right: false })

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const again = () => {
    const fresh = newRound()
    live.current = fresh
    setRound(fresh)
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
      const current = live.current
      const k = keys.current
      // Up on the keyboard is towards the far side of the arena.
      const mine: Intent = {
        x: (k.right ? 1 : 0) - (k.left ? 1 : 0),
        y: (k.down ? 1 : 0) - (k.up ? 1 : 0),
      }
      if (wire.advance(current, dt, mine, paused.current)) setRound({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = round.players.length > 0
  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const left = timeLeft(round)
  const holderIndex = round.players.findIndex((p) => p.id === round.holder)

  const crownText =
    round.holder === null
      ? 'grab the crown!'
      : round.holder === me
        ? 'you have the crown - run!'
        : mine && mine.dazed > 0
          ? `knocked back! ${nameOf(round.holder)} has the crown`
          : `${nameOf(round.holder)} has the crown`

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Sharing Is Caring</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: left <= 10 ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
              {Math.ceil(left)}s
            </span>
            <span
              style={{
                ...pill,
                background: holderIndex >= 0 ? COLOURS[holderIndex % COLOURS.length] : LOOK.gold,
                color: '#fff',
              }}
              data-holder={round.holder ?? ''}
            >
              👑 {crownText}
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {mine ? (
          <span style={{ ...pill, background: COLOURS[mineIndex % COLOURS.length], color: '#fff' }} data-points={points(mine.score)}>
            {points(mine.score)} {points(mine.score) === 1 ? 'point' : 'points'}
          </span>
        ) : null}
      </div>

      <div style={board} data-board>
        <Stage live={live} />
        {ready ? <Standings round={round} me={me} nameOf={nameOf} /> : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} onAgain={net.host ? again : null} /> : null}
    </div>
  )
}

/** Everybody's points as they stand, best first, with the crown against its wearer. */
function Standings({ round, me, nameOf }: { round: Round; me: string; nameOf: (id: string) => string }) {
  return (
    <div style={standings} data-standings>
      {placings(round).map((entry) => (
        <div key={entry.player.id} style={scoreRow}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
          <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nameOf(entry.player.id)}
          </span>
          <span style={{ width: 18, textAlign: 'center' }}>{entry.player.id === round.holder ? '👑' : ''}</span>
          <span style={{ fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{points(entry.player.score)}</span>
        </div>
      ))}
    </div>
  )
}

/** The canvas, rendered once - see `SharingIsCaringScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Round> }) {
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
      <SharingIsCaringScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 1, far: 400, position: [0, 30, 30] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most points first, level scores sharing a place. */
function Over({
  round,
  me,
  nameOf,
  onAgain,
}: {
  round: Round
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(round)
  const mine = order.find((entry) => entry.player.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const headline = !mine
    ? 'Time!'
    : mine.place === 1
      ? winners.length > 1
        ? 'A shared crown!'
        : 'Long may you reign!'
      : `${ordinal(mine.place)} place`
  const sub =
    winners.length > 1
      ? `${winners.map((w) => nameOf(w.player.id)).join(' and ')} tied on ${points(winners[0].player.score)} points.`
      : `${nameOf(winners[0].player.id)} wore it longest.`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{sub}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                took it {entry.player.takes} {entry.player.takes === 1 ? 'time' : 'times'}
              </span>
              <span style={{ fontWeight: 700, minWidth: 48, textAlign: 'right' }}>{points(entry.player.score)} pts</span>
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

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
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

const standings: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 180,
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
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
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
