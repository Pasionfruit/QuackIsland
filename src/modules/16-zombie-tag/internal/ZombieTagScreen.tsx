/**
 * Zombie Tag, on the screen.
 *
 * **The camera never moves, and it is not overhead.** It sits high and back at
 * sixty degrees - see `camera.ts` - so the arena reads as a room seen from
 * across it rather than as a map, and everything in it has a side as well as a
 * top. It stays exactly where it is for the whole round: six zombies closing
 * from three sides is a thing you watch happen rather than a thing that
 * surprises you, and no part of the board is information you had to earn.
 *
 * The world is drawn in its own canvas by `ZombieTagScene`, lit like the
 * island and populated with the island's own avatar. This file is the shell
 * around it: keys in, `stepRound` decides what happens, and the HUD sits over
 * the top in the DOM where text belongs.
 *
 * The split is the same one the player controller uses next door, for the same
 * reason - the rules are worth testing and the drawing is not.
 */
import { Canvas } from '@react-three/fiber'
import { getNet, useNet, usePeers } from '../../09-net'
import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { ARENA } from './arena'
import { FOV } from './camera'
import { PALETTE, ZombieTagScene } from './ZombieTagScene'
import {
  NO_INTENT,
  placings,
  survivedFor,
  survivors,
  zombies,
  type Body,
  type Intent,
  type Round,
} from './round'
import { emptyRound, myId, newRound } from './setup'
import { useRoundNet } from './useRoundNet'
import type { MinigameRun } from '../../15-minigames'

/** Text and chrome. The board's own colours live with the board, in the scene. */
const LOOK = {
  ink: '#4a3524',
  sand: '#f6e4bf',
  you: PALETTE.you,
  runner: PALETTE.runner,
  zombie: PALETTE.zombie,
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function ZombieTagScreen({ run }: { run: MinigameRun }) {
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : emptyRound()))
  // Read in the frame callback rather than closed over, so pausing takes
  // effect on the very next frame instead of whenever the effect re-runs.
  const paused = useRef(run.paused)
  paused.current = run.paused

  // The host simulates and sends; a guest sends its keys and follows. Alone,
  // you are your own host and this is the same path with nobody listening.
  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRoundNet()
  // The round is stepped every frame and drawn every frame, so it lives in a
  // ref and React is told about it rather than asked to own it.
  const live = useRef(round)
  live.current = round

  /** Somebody's name for the scoreboard: you, a lobby name, or a runner's. */
  const nameOf = (id: string) =>
    id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id)

  // Dealt into the ref as well as the state, so the frame that follows the
  // click steps the new round rather than handing React the old one back.
  const again = () => {
    const fresh = newRound()
    live.current = fresh
    setRound(fresh)
  }

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
      // Called on every frame, over or paused or not: a guest has to keep
      // hearing the host to see a round end and the next one dealt, and the
      // host has to keep telling them. Whether the clock moves is `advance`'s
      // call - see `useRoundNet` - and a solo pause still stops it dead.
      if (wire.advance(current, dt, mine(keys.current, pushEdge.current), paused.current)) {
        // Stepped in place, then handed back as a new object so React draws it.
        setRound({ ...current })
      }
      // Spent or not, a push does not wait out a pause to be thrown later.
      pushEdge.current = false
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const you = round.bodies.find((b) => b.mine) ?? null
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

      {/* The arena, in its own canvas. Its camera is fixed and tilted - see
          `camera.ts` - and its lights are the island's daylight, so the room
          belongs to the same world as the beach you walked in from. */}
      <div style={board}>
        <Canvas
          shadows={{ type: PCFSoftShadowMap }}
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 1, far: 400, position: [0, 60, 34] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
        >
          <ZombieTagScene round={round} />
        </Canvas>
      </div>

      {/* Only the host can deal a fresh round; a guest waits to be dealt one,
          the same as they waited to be brought here. */}
      {round.over ? (
        <Over round={round} me={me} nameOf={nameOf} onAgain={net.host ? again : null} />
      ) : null}
    </div>
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
  const won = round.winner === me
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
              <span style={{ flex: 1, fontWeight: body.id === me ? 700 : 400 }}>
                {nameOf(body.id)}
              </span>
              <span style={{ opacity: 0.6 }}>{survivedFor(body, round).toFixed(1)}s</span>
            </div>
          ))}
        </div>

        {onAgain ? (
          <button type="button" onClick={onAgain} style={againButton} data-again>
            again
          </button>
        ) : (
          <div style={{ ...againButton, opacity: 0.55, textAlign: 'center' }}>
            waiting for the host
          </div>
        )}
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
/**
 * Everything under the HUD, and what the canvas fills.
 *
 * No padding: the canvas is the room and it should run to the edges of the
 * window the way the world's does. `minHeight: 0` so it gives rather than
 * pushing the page past the bottom, which is the same rule every screen in
 * this build follows.
 */
const board: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  position: 'relative',
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
  display: 'block',
  width: '100%',
  // A button is border-box already; the waiting note that borrows this style
  // is a div, and without it the padding pushes it out past the card.
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: '#ffc94d',
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
