/**
 * I Just Work Here, on the screen.
 *
 * The office is drawn in its own canvas by `OfficeScene`; this is the shell:
 * the keys and the mouse turned into hands for `useOfficeNet`, and the words -
 * the clock, who is standing, your bazooka filling in part by part, everybody's
 * pieces-on-desk, what to do next, who got whom, and being eliminated.
 *
 * **WASD to move, the mouse to aim, left click to pick up or place a piece,
 * right click to fire, space to drop what you are carrying.** No pointer lock:
 * seen from above, the aim is wherever the mouse is.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { OfficeScene, type AimRef } from './OfficeScene'
import {
  COLOURS,
  LOOSE,
  PARTS,
  PIECES_EACH,
  PLACED,
  ROCKET,
  ROUND,
  atDesk,
  clock,
  cooldownLeft,
  isArmed,
  isStanding,
  pieceInReach,
  piecesOf,
  placedCount,
  placings,
  type Game,
} from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useOfficeNet, type Done } from './useOfficeNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: east and south. W is north, up the screen. */
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

/** How long a word about what you just tried stays up, seconds. */
const NOTE_FOR = 1.4

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function OfficeScreen({ run }: { run: MinigameRun }) {
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

  const wire = useOfficeNet()
  const live = useRef(game)
  live.current = game

  const aim = useRef<AimRef>({ ndc: null, yaw: 0 })
  /** The game whose starting aim has been set. */
  const aimFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const clicks = useRef({ act: false, fire: false, drop: false })
  const board = useRef<HTMLDivElement>(null)
  /** The last thing you tried, and when by the game clock, for a word about it. */
  const [note, setNote] = useState<{ did: Done['did']; at: number } | null>(null)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const mine = current.players.find((p) => p.mine)
      if (mine && aimFor.current !== current.id) {
        aimFor.current = current.id
        aim.current.yaw = mine.yaw
      }
      let x = 0
      let z = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          x += k[0]
          z += k[1]
        }
      }
      const hands = { x: Math.sign(x), z: Math.sign(z), yaw: aim.current.yaw, ...clicks.current }
      clicks.current = { act: false, fire: false, drop: false }
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.did) {
        setNote({ did: result.did, at: current.elapsed })
        playDid(result.did)
      }
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The keys. Space puts down, and never scrolls or presses a button behind the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (down && !e.repeat && !paused.current) clicks.current.drop = true
        return
      }
      if (!(e.code in KEYS)) return
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

  // Paused, or over: let go of the keys.
  useEffect(() => {
    if (run.paused || game.over) held.current.clear()
  }, [run.paused, game.over])

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    aim.current.ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -(((e.clientY - rect.top) / rect.height) * 2 - 1) }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerMove(e)
    if (paused.current || live.current.over) return
    if (e.button === 0) clicks.current.act = true
    else if (e.button === 2) clicks.current.fire = true
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const t = clock(game)
  useOfficeSounds(game)
  const standing = game.players.filter(isStanding).length
  const armed = mine ? isArmed(game, mineIndex) : false
  const placed = mine ? placedCount(game, mineIndex) : 0
  const cooling = mine && armed ? cooldownLeft(game, mine) / ROCKET.cooldown : 0

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' | 'got' | 'warn' } | null = null
  if (ready && !game.over && mine) {
    const got = game.players.filter((p) => p.by === mineIndex && p !== mine && p.out !== null && t - p.out < 2).pop()
    const noted = note && game.elapsed - note.at < NOTE_FOR ? note.did : null
    const armedAt = armedSince(game, mineIndex)
    if (mine.out !== null) {
      const by = mine.by !== null ? game.players[mine.by] : null
      banner =
        t - mine.out < 3
          ? { text: mine.by === mineIndex ? 'You blew yourself up' : `${by ? nameOf(by.id) : 'Somebody'} got you`, sub: 'watching the rest', tone: 'out' }
          : { text: 'Out - watching the rest', tone: 'hint' }
    } else if (got) banner = { text: `You got ${nameOf(got.id)}`, tone: 'got' }
    else if (armedAt !== null && t - armedAt < 3) banner = { text: 'Bazooka ready!', sub: 'right click to fire - not too near a wall', tone: 'got' }
    else if (noted === 'nothing') {
      banner = mine.carrying >= 0 ? { text: 'Take it back to your desk first', tone: 'warn' } : { text: 'None of yours in reach', tone: 'warn' }
    } else if (noted === 'pick') banner = { text: `Got your ${PARTS[game.pieces[mine.carrying]?.part ?? 0]}`, sub: 'take it back to your desk', tone: 'hint' }
    else if (noted === 'place') banner = { text: `${placed} of ${PIECES_EACH} on your desk`, tone: 'hint' }
    else if (noted === 'drop') banner = { text: 'Put it down', tone: 'hint' }
    else if (armed) banner = null
    else if (mine.carrying >= 0) banner = atDesk(game, mineIndex) ? { text: 'Left click to put it on your desk', tone: 'hint' } : { text: 'Take it back to your desk', sub: 'follow the arrow - one piece at a time', tone: 'hint' }
    else if (pieceInReach(game, mineIndex) >= 0) banner = { text: 'Left click to pick it up', tone: 'hint' }
    else if (t < 6) banner = { text: 'Find your 4 pieces', sub: 'they are in your colour, somewhere in the office', tone: 'hint' }
  }

  const feed = game.players
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.out !== null)
    .sort((a, b) => b.p.out! - a.p.out!)
    .slice(0, 5)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>I Just Work Here</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : ROUND.limit - Math.max(0, t)}>
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}>
                {minutes(Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t))))}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-standing={standing}>
              {standing} standing
            </span>
            {mine ? <Parts game={game} index={mineIndex} colour={colours[mineIndex]} /> : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = colours[index]
          const n = placedCount(game, index)
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: p.out === null ? colour : 'rgba(255,255,255,0.85)',
                color: p.out === null ? '#fff' : LOOK.faded,
                boxShadow: p.out === null ? 'none' : `inset 0 0 0 2px ${colour}`,
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-out={p.out ?? ''}
              data-placed={n}
              data-kills={p.kills}
            >
              {nameOf(p.id)} {n >= PIECES_EACH ? '· armed' : `· ${n}/${PIECES_EACH}`}
              {p.kills > 0 ? ` · ${p.kills} out` : ''}
            </span>
          )
        })}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: armed && mine?.out === null ? 'crosshair' : 'default' }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} aim={aim} />

        {mine && mine.out !== null && t - mine.out < 0.7 && !game.over ? <div style={{ ...flash, opacity: 1 - (t - mine.out) / 0.7 }} /> : null}

        {ready && mine && armed && mine.out === null && !game.over ? (
          <div style={reload} data-cooldown={cooling.toFixed(2)}>
            <div style={{ ...reloadFill, width: `${(1 - cooling) * 100}%`, background: cooling > 0 ? LOOK.faded : colours[mineIndex] }} />
            <span style={reloadText}>{cooling > 0 ? 'reloading' : 'ready'}</span>
          </div>
        ) : null}

        {feed.length > 0 ? (
          <div style={feedWrap}>
            {feed.map(({ p, index }) => (
              <div key={p.id} style={feedRow}>
                {p.by !== null && p.by !== index && game.players[p.by] ? (
                  <>
                    <span style={{ ...dot, background: colours[p.by] }} />
                    <span>{nameOf(game.players[p.by].id)}</span>
                    <span style={{ opacity: 0.6 }}>💥</span>
                  </>
                ) : (
                  <span style={{ opacity: 0.75 }}>self 💥</span>
                )}
                <span style={{ ...dot, background: colours[index] }} />
                <span>{nameOf(p.id)}</span>
              </div>
            ))}
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
      </div>
    </div>
  )
}

/** When a player's fourth piece went on their desk, in `clock` - worked out from nothing but the pieces, so it is the same on every screen. */
const armedAt = new Map<string, number>()
function armedSince(game: Game, index: number): number | null {
  const key = `${game.id}:${index}`
  if (!isArmed(game, index)) {
    armedAt.delete(key)
    return null
  }
  if (!armedAt.has(key)) armedAt.set(key, clock(game))
  if (armedAt.size > 32) armedAt.delete(armedAt.keys().next().value!)
  return armedAt.get(key)!
}

/** Your bazooka, part by part: filled in on your desk, outlined in your arms, faint while it is still out there. */
function Parts({ game, index, colour }: { game: Game; index: number; colour: string }) {
  const p = game.players[index]
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} data-parts={placedCount(game, index)}>
      {piecesOf(game, index).map((i) => {
        const it = game.pieces[i]
        const on = it.state === PLACED
        const carried = p.carrying === i
        return (
          <span
            key={i}
            title={PARTS[it.part]}
            style={{
              ...pill,
              padding: '3px 8px',
              background: on ? colour : carried ? '#fff' : 'rgba(255,255,255,0.6)',
              color: on ? '#fff' : it.state === LOOSE ? LOOK.faded : LOOK.ink,
              boxShadow: `inset 0 0 0 2px ${colour}`,
            }}
          >
            {PARTS[it.part]}
          </span>
        )
      })}
    </span>
  )
}

/** The canvas, rendered once - see `OfficeScene`. */
const Stage = memo(function Stage({ live, aim }: { live: RefObject<Game>; aim: RefObject<AimRef> }) {
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
      <OfficeScene live={live} aim={aim} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 50, near: 0.1, far: 200, position: [0, 34, 17] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** What your own hands did, out loud. */
function playDid(did: Done['did']): void {
  if (did === 'pick') playCue(CUES.bump, 0.6)
  else if (did === 'place') playCue(CUES.stepDown, 0.7)
  else if (did === 'drop') playCue(CUES.bump, 0.35)
  else if (did === 'nothing') playCue(CUES.wrongSelection, 0.35)
}

/**
 * A whoosh for every rocket fired, a pop for every blast, a fall for you going
 * down, and a fanfare of sorts when your bazooka is whole - off the rockets and
 * blasts every screen is sent. Your own are loud; everybody else's quieter. A
 * new game is only remembered.
 */
function useOfficeSounds(game: Game): void {
  const seen = useRef<{ id: number; rockets: Set<number>; blasts: Set<number>; fired: number; out: boolean; armed: boolean }>({
    id: -1,
    rockets: new Set(),
    blasts: new Set(),
    fired: -Infinity,
    out: false,
    armed: false,
  })
  useEffect(() => {
    const s = seen.current
    const fresh = s.id !== game.id
    const index = game.players.findIndex((p) => p.mine)
    const mine = game.players[index]
    if (fresh) Object.assign(s, { id: game.id, rockets: new Set(), blasts: new Set(), fired: mine?.firedAt ?? -Infinity, out: false, armed: false })
    for (const r of game.rockets) {
      if (r.seq === 0 || s.rockets.has(r.seq)) continue
      s.rockets.add(r.seq)
      if (!fresh && r.by !== index) playCue(CUES.launch, 0.3)
    }
    if (mine && mine.firedAt !== s.fired) {
      s.fired = mine.firedAt
      if (!fresh) playCue(CUES.launch, 0.6)
    }
    for (const b of game.blasts) {
      if (s.blasts.has(b.seq)) continue
      s.blasts.add(b.seq)
      if (!fresh) playCue(CUES.balloonPop, b.by === index || b.victims.includes(index) ? 0.8 : 0.45)
    }
    if (mine) {
      const out = mine.out !== null
      if (out && !s.out && !fresh) playCue(CUES.fallingOver, 0.7)
      s.out = out
      const armed = isArmed(game, index)
      if (armed && !s.armed && !fresh) playCue(CUES.balloonInflate, 0.6)
      s.armed = armed
    }
    if (s.rockets.size > 256) s.rockets.clear()
    if (s.blasts.size > 256) s.blasts.clear()
  }, [game])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#cfd6dc',
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

const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, flex: '0 0 auto', display: 'inline-block' }

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const flash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,150,40,0.2) 30%, rgba(255,60,20,0.65) 100%)',
}

const reload: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 110,
  transform: 'translateX(-50%)',
  width: 160,
  height: 18,
  borderRadius: 999,
  background: 'rgba(42,34,51,0.55)',
  overflow: 'hidden',
  pointerEvents: 'none',
}

const reloadFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0 }

const reloadText: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  textAlign: 'center',
  color: '#fff',
  font: `800 11px/18px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

const feedWrap: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 4,
  pointerEvents: 'none',
}

const feedRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 10px',
  borderRadius: 999,
  background: 'rgba(244,240,248,0.88)',
  font: `600 12px/1.5 ${FONT}`,
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 22,
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

const TONES: Record<'out' | 'hint' | 'got' | 'warn', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  got: { background: LOOK.green, color: '#fff' },
  warn: { background: LOOK.sun, color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
