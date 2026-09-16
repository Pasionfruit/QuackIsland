/**
 * Zombie Tag, on the screen.
 *
 * **The camera never moves.** The whole arena is drawn at once, from directly
 * above, and it stays exactly where it is for the whole round - so what you
 * can see is never a thing you had to earn, and six zombies closing from three
 * sides is a thing you watch happen rather than a thing that surprises you.
 * That is the entire reason this is an SVG with a fixed `viewBox`: the browser
 * fits the arena into whatever room the window has, centred, undistorted, and
 * there is no camera code at all.
 *
 * Everything else is a thin shell. Keys go in, `stepRound` decides what
 * happens, and this draws where the bodies ended up - the same split the
 * player controller uses, and for the same reason: the rules are worth testing
 * and the drawing is not.
 *
 * Coloured shapes, not models. The assets stage of this game has not been
 * done, and pretending otherwise with a half-made duck would be worse than a
 * circle with a face on it.
 */
import { useEffect, useRef, useState } from 'react'
import { ARENA, HALF_H, HALF_W, OBSTACLES } from './arena'
import { crowdIntents } from './ai'
import {
  NO_INTENT,
  placings,
  stepRound,
  survivedFor,
  survivors,
  zombies,
  type Body,
  type Intent,
  type Round,
} from './round'
import { ME, newRound } from './setup'

/** How the arena is painted. Sand and sea, the same island the rest of it uses. */
const LOOK = {
  floor: '#f3e2c0',
  floorLine: '#e4cfa4',
  wall: '#8a6a44',
  crate: '#c08a52',
  crateTop: '#d8a468',
  you: '#3f8fd0',
  runner: '#5eb85b',
  zombie: '#b0499a',
  stunned: '#f0d048',
  ink: '#4a3524',
  sand: '#f6e4bf',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function ZombieTagScreen() {
  const [round, setRound] = useState<Round>(() => newRound())
  // The round is stepped every frame and drawn every frame, so it lives in a
  // ref and React is told about it rather than asked to own it.
  const live = useRef(round)
  live.current = round

  const keys = useRef({ up: false, down: false, left: false, right: false })
  const pushEdge = useRef(false)

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.up = down
          break
        case 'KeyS':
        case 'ArrowDown':
          k.down = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = down
          break
        case 'Space':
          // Edge-detected, so holding space is one push and not a siren.
          if (down) pushEdge.current = true
          break
        default:
          return
      }
      // Escape is the screen's way out and must keep working; everything this
      // game uses is swallowed so the page does not scroll under the arena.
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      if (!current.over) {
        const intents = crowdIntents(current)
        intents.set(ME, mine(keys.current, pushEdge.current))
        pushEdge.current = false
        // Stepped in place, then handed back as a new object so React draws it.
        setRound({ ...stepRound(current, intents, dt) })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const you = round.bodies.find((b) => b.id === ME) ?? null
  const left = survivors(round)
  const chase = zombies(round)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Zombie Tag</span>
        <Pill colour={LOOK.runner}>{left.length} running</Pill>
        <Pill colour={LOOK.zombie}>{chase.length} zombies</Pill>
        <span style={{ flex: 1 }} />
        <Pill colour={LOOK.ink}>{round.elapsed.toFixed(1)}s</Pill>
        {you ? <PushMeter body={you} /> : null}
      </div>

      {/* One fixed view of the whole arena. `meet` keeps it undistorted and
          centred at any window size, which is the whole camera. */}
      <svg
        viewBox={`${-HALF_W} ${-HALF_H} ${ARENA.width} ${ARENA.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={board}
        aria-label="Zombie Tag arena"
      >
        <rect
          x={-HALF_W}
          y={-HALF_H}
          width={ARENA.width}
          height={ARENA.height}
          fill={LOOK.floor}
          stroke={LOOK.wall}
          strokeWidth={0.6}
          rx={0.8}
        />

        {OBSTACLES.map((box, i) => (
          <g key={i}>
            <rect
              x={box.x - box.width / 2}
              y={box.y - box.height / 2}
              width={box.width}
              height={box.height}
              fill={LOOK.crate}
              rx={0.3}
              data-obstacle={i}
            />
            <rect
              x={box.x - box.width / 2}
              y={box.y - box.height / 2}
              width={box.width}
              height={box.height * 0.4}
              fill={LOOK.crateTop}
              rx={0.3}
            />
          </g>
        ))}

        {round.bodies.map((body) => (
          <BodyMark key={body.id} body={body} />
        ))}
      </svg>

      {round.over ? <Over round={round} onAgain={() => setRound(newRound())} /> : null}
    </div>
  )
}

/** One body: a circle, a nose to say which way it is facing, and a stun ring. */
function BodyMark({ body }: { body: Body }) {
  const colour = body.side === 'zombie' ? LOOK.zombie : body.mine ? LOOK.you : LOOK.runner
  return (
    <g data-body={body.id} data-side={body.side} transform={`translate(${body.x} ${body.y})`}>
      {body.stun > 0 ? (
        <circle r={ARENA.radius * 1.5} fill="none" stroke={LOOK.stunned} strokeWidth={0.22} />
      ) : null}
      <circle
        r={ARENA.radius}
        fill={colour}
        stroke={body.mine ? LOOK.ink : 'none'}
        strokeWidth={body.mine ? 0.18 : 0}
      />
      {/* Which way it is pointing. A chase is unreadable without it. */}
      <circle
        cx={Math.cos(body.facing) * ARENA.radius * 0.55}
        cy={Math.sin(body.facing) * ARENA.radius * 0.55}
        r={ARENA.radius * 0.28}
        fill={LOOK.sand}
        opacity={0.9}
      />
    </g>
  )
}

/** The push, as a bar that fills back up. */
function PushMeter({ body }: { body: Body }) {
  const ready = body.cooldown === 0
  const full = 1 - body.cooldown / ARENA.pushCooldown
  return (
    <span style={{ ...pill, background: ready ? LOOK.you : 'rgba(0,0,0,0.12)', color: '#fff' }}>
      <span style={{ position: 'relative', zIndex: 1 }}>
        {ready ? 'push ready — space' : `push ${body.cooldown.toFixed(1)}s`}
      </span>
      {ready ? null : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            width: `${full * 100}%`,
            background: LOOK.you,
            borderRadius: 999,
            opacity: 0.5,
          }}
        />
      )}
    </span>
  )
}

function Pill({ colour, children }: { colour: string; children: React.ReactNode }) {
  return <span style={{ ...pill, background: colour, color: '#fff' }}>{children}</span>
}

/** The scoreboard: who lasted longest, and how long you managed. */
function Over({ round, onAgain }: { round: Round; onAgain: () => void }) {
  const order = placings(round)
  const won = round.winner === ME
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>
          {won ? 'You survived!' : 'Caught'}
        </div>
        <div style={{ color: '#8a725c', marginBottom: 12 }}>
          {won
            ? 'Last one running. The zombies got everybody else.'
            : `${round.winner ?? 'Nobody'} outlasted you.`}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.slice(0, 8).map((body, i) => (
            <div key={body.id} style={scoreRow} data-place={i + 1}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: body.id === ME ? 700 : 400 }}>
                {body.id === ME ? 'you' : body.id}
              </span>
              <span style={{ opacity: 0.6 }}>{survivedFor(body, round).toFixed(1)}s</span>
            </div>
          ))}
        </div>

        <button type="button" onClick={onAgain} style={againButton} data-again>
          again
        </button>
      </div>
    </div>
  )
}

/** What the keyboard is asking for, this frame. */
function mine(
  keys: { up: boolean; down: boolean; left: boolean; right: boolean },
  push: boolean,
): Intent {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  // Screen y grows downwards, and so does the arena's - up on the keyboard is
  // towards the top of the board, which is negative.
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0)
  if (x === 0 && y === 0 && !push) return NO_INTENT
  return { x, y, push }
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
}

const pill: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
}

/**
 * The board fills whatever is left, and the SVG fits the arena inside it.
 *
 * `minHeight: 0` so it gives rather than pushing the page past the window, and
 * the fitting is `preserveAspectRatio`'s job - there is no measuring here and
 * no scrollbar anywhere.
 */
const board: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  padding: 12,
  boxSizing: 'border-box',
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

const scoreRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const againButton: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: '#ffc94d',
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
