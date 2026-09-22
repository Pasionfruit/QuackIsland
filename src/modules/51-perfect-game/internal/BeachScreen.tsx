/**
 * Perfect Game, on the screen.
 *
 * The beach is drawn in its own canvas by `BeachScene`; this is the shell: on
 * your turn the keys and the mouse turned into your aim, and the click into your
 * roll, for `useBeachNet`; and the words - whose turn it is, the ten seconds,
 * everybody's score, how many crabs the coconut has hit as it goes, and the
 * result.
 *
 * **WASD moves you round the box behind the line, the mouse aims - the throw
 * points at wherever the mouse is on the sand - and left click rolls it.**
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { COLUMN } from './beach'
import { BeachScene, type PointerRef } from './BeachScene'
import { COLOURS, TURN, phaseOf, placings, tau, thrower, turnHits, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useBeachNet } from './useBeachNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#fbf5e8',
  sun: '#ffc94d',
  sea: '#2f8fc0',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that move you, by `KeyboardEvent.code`: east and south. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
}

/** How fast you walk round the box, metres a second. */
export const WALK = 5

export function BeachScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = useBeachNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const clicked = useRef(false)
  const pointer = useRef<PointerRef>({ at: null })
  /** Your aim, on your turn: where you stand, and the angle - from the mouse. */
  const aim = useRef<{ turn: string; x: number; z: number; angle: number } | null>(null)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const who = thrower(current)
      let hands = null
      if (who >= 0 && current.players[who].mine) {
        const key = `${current.id}:${current.turn}`
        if (aim.current?.turn !== key) aim.current = { turn: key, ...current.aim }
        const a = aim.current
        if (phaseOf(current) === 'aim' && !paused.current) {
          let mx = 0
          let mz = 0
          for (const code of held.current) {
            const k = KEYS[code]
            if (k) {
              mx += k[0]
              mz += k[1]
            }
          }
          const length = Math.hypot(mx, mz)
          const step = Math.min(Math.max(dt, 0), 0.1) * WALK
          if (length > 0) {
            a.x += (mx / length) * step
            a.z += (mz / length) * step
          }
          const at = pointer.current.at
          if (at) a.angle = Math.atan2(-(at.x - a.x), -(at.z - a.z))
        }
        hands = { aim: { x: a.x, z: a.z, angle: a.angle }, rolled: clicked.current }
      }
      clicked.current = false
      const result = wire.advance(current, dt, hands, paused.current)
      // Kept in the box and in range by the rules; hold ours to that too.
      if (aim.current && hands) Object.assign(aim.current, current.aim)
      if (result.rolled) playCue(CUES.throwingBread, 0.7)
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!(e.code in KEYS)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (run.paused || game.over) held.current.clear()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    clicked.current = true
  }

  const ready = game.players.length > 0
  const who = thrower(game)
  const throwerP = game.players[who]
  const mineToThrow = !!throwerP?.mine
  const phase = phaseOf(game)
  const t = tau(game)
  const hitSoFar = phase === 'rolling' || phase === 'result' ? turnHits(game).filter((h) => h.at <= t).length : 0
  useCrabSounds(game)

  let banner: { text: string; sub?: string; tone: 'good' | 'bad' | 'hint' | 'turn' } | null = null
  if (ready && !game.over && throwerP) {
    const name = nameOf(throwerP.id)
    if (phase === 'intro') banner = mineToThrow ? { text: 'Your turn next!', sub: `in ${Math.ceil(-t)}`, tone: 'turn' } : { text: `Next up: ${name}`, sub: `in ${Math.ceil(-t)}`, tone: 'turn' }
    else if (phase === 'aim')
      banner = mineToThrow
        ? { text: 'Your throw!', sub: 'WASD to move · aim with the mouse · click to roll', tone: 'hint' }
        : { text: `${name} is aiming…`, tone: 'hint' }
    else if (phase === 'result') {
      const n = throwerP.score ?? hitSoFar
      banner =
        n === COLUMN.crabs
          ? { text: 'PERFECT GAME!', sub: `all ${COLUMN.crabs} crabs`, tone: 'good' }
          : n === 0
            ? { text: 'No crabs!', sub: mineToThrow ? 'missed the lot' : `${name} missed the lot`, tone: 'bad' }
            : { text: `${n} crab${n === 1 ? '' : 's'}!`, sub: mineToThrow ? 'your score' : `for ${name}`, tone: 'good' }
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Perfect Game</span>
        {ready && !game.over ? (
          <>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-turn={game.turn + 1}>
              turn {game.turn + 1} of {game.order.length}
            </span>
            {phase === 'aim' ? (
              <TopTimer left={Math.max(0, TURN.aim - t)}>
                <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-aim-left={Math.ceil(Math.max(0, TURN.aim - t))}>
                  0:{String(Math.ceil(Math.max(0, TURN.aim - t))).padStart(2, '0')}
                </span>
              </TopTimer>
            ) : null}
          </>
        ) : !ready ? (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        ) : null}
        <span style={{ flex: 1 }} />
        {game.order.map((index) => {
          const p = game.players[index]
          if (!p) return null
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: p.left ? 'rgba(255,255,255,0.85)' : colours[index],
                color: p.left ? LOOK.faded : '#fff',
                opacity: p.left ? 0.45 : 1,
                outline: index === who ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
              }}
              data-score={p.score ?? ''}
            >
              {nameOf(p.id)} · {p.score === null ? (index === who ? '🥥' : '…') : p.score}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board data-phase={phase}>
        <Stage live={live} pointer={pointer} />

        {phase === 'rolling' || phase === 'result' ? (
          <div style={counter} data-hits={hitSoFar}>
            {hitSoFar}
            <span style={{ fontSize: 18, fontWeight: 800 }}> / {COLUMN.crabs}</span>
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

        {mineToThrow && phase === 'aim' ? <div style={hint}>click to roll · rolls itself at 0</div> : null}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `BeachScene`. */
const Stage = memo(function Stage({ live, pointer }: { live: RefObject<Game>; pointer: RefObject<PointerRef> }) {
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
      <BeachScene live={live} pointer={pointer} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 55, near: 0.1, far: 400, position: [0, 17, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/**
 * A throw's sound for anybody else's roll, a bonk for every crab as it is hit -
 * rising as they mount up - and a cheer for a big score. Off the clock and the
 * throw every screen has.
 */
function useCrabSounds(game: Game): void {
  const seen = useRef<{ key: string; hit: number; rolled: boolean; done: boolean }>({ key: '', hit: 0, rolled: false, done: false })
  useEffect(() => {
    const key = `${game.id}:${game.turn}`
    if (seen.current.key !== key) seen.current = { key, hit: 0, rolled: game.rolledAt !== null, done: false }
    const s = seen.current
    if (game.players.length === 0 || game.over) return
    const who = thrower(game)
    if (game.rolledAt !== null && !s.rolled) {
      s.rolled = true
      if (!game.players[who]?.mine) playCue(CUES.throwingBread, 0.45)
    }
    const t = tau(game)
    const hit = turnHits(game).filter((h) => h.at <= t).length
    for (let k = s.hit; k < hit; k++) playCue(CUES.bonk, Math.min(0.9, 0.3 + k * 0.03))
    s.hit = hit
    if (phaseOf(game) === 'result' && !s.done) {
      s.done = true
      if (hit >= 15) playCue(CUES.balloonInflate, 0.7)
      else if (hit === 0) playCue(CUES.wrongSelection, 0.5)
    }
  }, [game])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#9fd6f2',
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
  borderBottom: '2px solid #ecdcb8',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'crosshair' }

const counter: React.CSSProperties = {
  position: 'absolute',
  right: 24,
  bottom: 20,
  padding: '4px 18px',
  borderRadius: 16,
  background: 'rgba(42,34,51,0.75)',
  color: '#fff',
  font: `900 44px/1.1 ${FONT}`,
  pointerEvents: 'none',
}

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

const TONES: Record<'good' | 'bad' | 'hint' | 'turn', React.CSSProperties> = {
  good: { background: LOOK.green, color: '#fff', boxShadow: '0 4px 0 rgba(0,0,0,0.25)' },
  bad: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)' },
  hint: { background: 'rgba(251,245,232,0.94)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  turn: { background: LOOK.sea, color: '#fff' },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `800 16px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }

