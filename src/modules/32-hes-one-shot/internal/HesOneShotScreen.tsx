/**
 * He's One Shot, on the screen.
 *
 * The arena is drawn in its own canvas by `HesOneShotScene`; this is the shell:
 * the keys, the mouse and the trigger turned into hands for `useShotNet`, and
 * the words - the countdown, the clock, who is standing, the crosshair with the
 * gun's cooldown round it, who got whom, being eliminated, and the results.
 *
 * **WASD to move, Space to jump, the mouse to aim, left click to shoot.** The
 * first click on the arena takes the mouse - pointer lock, the way any
 * first-person game does it - and shoots nothing; escape gives it back. A browser
 * that will not lock the pointer gets drag-to-aim instead, and every click shoots.
 *
 * Being eliminated moves you - beside whoever got you, whose hunter you now are -
 * and the mouse is what turns you, so the screen turns you the way you now face.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { HesOneShotScene, type LookRef } from './HesOneShotScene'
import { COLOURS, GUN, PITCH_LIMIT, ROUND, SHIELD, clock, cooldownLeft, crewOf, guarded, isStanding, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useShotNet } from './useShotNet'

/** Radians turned per pixel of mouse movement. */
export const SENSITIVITY = 0.0024

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`, so they sit in the same place on any layout. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
}

/** The jump key, by `KeyboardEvent.code`. */
const JUMP_KEY = 'Space'

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function HesOneShotScreen({ run }: { run: MinigameRun }) {
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
  const wire = useShotNet()
  const live = useRef(game)
  live.current = game

  const look = useRef<LookRef>({ yaw: 0, pitch: 0 })
  /** The game whose starting direction the look has been set to. */
  const lookFor = useRef<number | null>(null)
  const held = useRef(new Set<string>())
  const trigger = useRef(false)
  const board = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [locked, setLocked] = useState(false)
  const [lockRefused, setLockRefused] = useState(false)
  const refused = useRef(false)
  /** When your last shot met somebody, by the page clock. */
  const [hitAt, setHitAt] = useState(-Infinity)
  /** When you picked a shield up, and when yours broke, by the page clock. */
  const [shieldAt, setShieldAt] = useState(-Infinity)
  const [brokeAt, setBrokeAt] = useState(-Infinity)
  /** When yours broke by the game's clock, which is what its cooldown counts on: a pause holds it. */
  const [brokeGame, setBrokeGame] = useState(-Infinity)
  const hadShield = useRef(false)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const mine = current.players.find((p) => p.mine)
      if (mine && lookFor.current !== current.id) {
        lookFor.current = current.id
        look.current = { yaw: mine.yaw, pitch: 0 }
      }
      let forward = 0
      let right = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          forward += k[0]
          right += k[1]
        }
      }
      const hands = { forward: Math.sign(forward), right: Math.sign(right), yaw: look.current.yaw, pitch: look.current.pitch, jump: held.current.has(JUMP_KEY), fire: trigger.current }
      trigger.current = false
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.shot && result.shot.hit >= 0) setHitAt(now)
      const after = current.players.find((p) => p.mine)
      // Eliminated, and moved beside whoever got you: the mouse turns you, so it has to be turned to match.
      if (result.respawned && after) look.current = { yaw: after.yaw, pitch: 0 }
      // A shield picked up, and one broken by a hit - which is a shield going with you still standing.
      if (after && !hadShield.current && after.shield) setShieldAt(now)
      if (after && hadShield.current && !after.shield && after.out === null) {
        setBrokeAt(now)
        setBrokeGame(current.elapsed)
      }
      hadShield.current = !!after?.shield
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The keys, and the mouse while it is locked to the arena - or dragged, where it cannot be.
  useEffect(() => {
    const isLocked = () => !!board.current && document.pointerLockElement === board.current
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!(e.code in KEYS) && e.code !== JUMP_KEY) return
      // The space bar scrolls a page and presses a focused button: neither is wanted here.
      if (e.code === JUMP_KEY) e.preventDefault()
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    const onMove = (e: MouseEvent) => {
      if (paused.current) return
      if (!isLocked() && !(refused.current && dragging.current && (e.buttons & 1) !== 0)) return
      look.current.yaw -= e.movementX * SENSITIVITY
      look.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.current.pitch - e.movementY * SENSITIVITY))
    }
    const onLockChange = () => setLocked(isLocked())
    const onLockError = () => {
      refused.current = true
      setLockRefused(true)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', onLockError)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', onLockError)
      if (isLocked()) document.exitPointerLock()
    }
  }, [])

  // Paused, or over: let go of the mouse and the keys, so the card can be clicked.
  useEffect(() => {
    if (!run.paused && !game.over) return
    held.current.clear()
    dragging.current = false
    if (board.current && document.pointerLockElement === board.current) document.exitPointerLock()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    const el = e.currentTarget
    if (document.pointerLockElement === el) {
      trigger.current = true
      return
    }
    if (refused.current) {
      dragging.current = true
      trigger.current = true
      return
    }
    try {
      const asked = el.requestPointerLock() as unknown
      if (asked instanceof Promise) asked.catch(() => document.dispatchEvent(new Event('pointerlockerror')))
    } catch {
      document.dispatchEvent(new Event('pointerlockerror'))
    }
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const t = clock(game)
  useShotSounds(game)
  const standing = game.players.filter(isStanding).length
  const cooling = mine ? cooldownLeft(game, mine) / GUN.cooldown : 0
  const sinceHit = (performance.now() - hitAt) / 1000
  // The cooldown after a shield broke on you, counting down: only while it is one from this game.
  const sinceBroke = game.elapsed - brokeGame
  const shieldLeft = sinceBroke >= 0 && sinceBroke < SHIELD.cooldown ? SHIELD.cooldown - sinceBroke : 0

  let banner: { text: string; sub?: string; tone: 'count' | 'out' | 'hint' | 'got' } | null = null
  if (ready && !game.over && mine) {
    const got = game.players.filter((p) => p.by === mineIndex && p.out !== null && t - p.out < 2).pop()
    const since = (n: number) => (performance.now() - n) / 1000
    if (mine.out !== null && t - mine.out < 3) {
      const by = mine.by !== null ? game.players[mine.by] : null
      // Whoever got you may have been got themselves since: it is their side you are on, and them you cannot hurt.
      const side = crewOf(game, mineIndex)
      const master = side !== null ? game.players[side] : null
      banner = {
        text: "You're a hunter now",
        sub: by ? `${nameOf(by.id)} got you - you hunt for ${master && master !== by ? nameOf(master.id) : 'them'}, and cannot hurt them` : 'keep shooting',
        tone: 'out',
      }
    } else if (got) banner = { text: `You got ${nameOf(got.id)}`, sub: `${nameOf(got.id)} hunts for you now`, tone: 'got' }
    else if (since(brokeAt) < 1.5) banner = { text: 'Your shield broke!', sub: 'that one would have got you', tone: 'out' }
    else if (since(shieldAt) < 1.5 && mine.shield) banner = { text: 'Shield!', sub: 'the next hit is absorbed', tone: 'got' }
    else if (!locked && !lockRefused) banner = { text: 'Click to take aim', sub: 'WASD move - Space jump - click shoot', tone: 'hint' }
  }
  const hunts = mine && mine.out !== null ? crewOf(game, mineIndex) : null

  const feed = game.players
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.out !== null)
    .sort((a, b) => b.p.out! - a.p.out!)
    .slice(0, 5)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>He's One Shot</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : ROUND.limit - Math.max(0, t)}><span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-time-left={Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t)))}>
              {minutes(Math.max(0, Math.ceil(ROUND.limit - Math.max(0, t))))}
            </span></TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-standing={standing}>
              {standing} standing
            </span>
            {t >= 0 && guarded(game) && !game.over ? (
              <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-guard>
                hidden - {Math.ceil(ROUND.guard - t)}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: p.out === null ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: p.out === null ? '#fff' : LOOK.faded,
              boxShadow: p.out === null ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: p.left ? 0.45 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-out={p.out ?? ''}
            data-kills={p.kills}
          >
            {nameOf(p.id)}
            {p.kills > 0 ? ` ·${p.kills}` : ''}
            {p.shield && p.out === null ? ' 🛡' : ''}
          </span>
        ))}
      </div>

      <div
        ref={board}
        style={{ ...boardStyle, cursor: locked ? 'none' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerUp={() => (dragging.current = false)}
        onContextMenu={(e) => e.preventDefault()}
        data-board
      >
        <Stage live={live} look={look} />

        {mine && mine.out !== null && t - mine.out < 0.7 && !game.over ? <div style={{ ...flash, opacity: 1 - (t - mine.out) / 0.7 }} /> : null}
        {mine && mine.shield && mine.out === null && !game.over ? <div style={shielded} data-shield /> : null}

        {ready && mine && !game.over ? (
          <div style={crosshairWrap}>
            <svg width={56} height={56} viewBox="-28 -28 56 56" data-cooldown={cooling.toFixed(2)}>
              <circle r={20} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={4} />
              {cooling > 0 ? (
                <circle r={20} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray={`${(1 - cooling) * 125.7} 125.7`} transform="rotate(-90)" opacity={0.85} />
              ) : null}
              {[0, 90, 180, 270].map((a) => (
                <line key={a} x1={0} y1={-6} x2={0} y2={-12} stroke={cooling > 0 ? 'rgba(255,255,255,0.5)' : '#fff'} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a})`} />
              ))}
              <circle r={1.8} fill={cooling > 0 ? 'rgba(255,255,255,0.5)' : '#fff'} />
              {sinceHit < 0.3
                ? [45, 135, 225, 315].map((a) => <line key={a} x1={0} y1={-8} x2={0} y2={-16} stroke={LOOK.red} strokeWidth={3} strokeLinecap="round" transform={`rotate(${a})`} />)
                : null}
            </svg>
            {mine.out !== null ? (
              <div style={hunterTag} data-hunts={hunts ?? ''}>
                {hunts !== null ? `HUNTER FOR ${nameOf(game.players[hunts].id).toUpperCase()}` : 'HUNTER'}
              </div>
            ) : null}
            {mine.shield && mine.out === null ? <div style={{ ...hunterTag, background: 'rgba(40,150,210,0.85)' }}>SHIELD</div> : null}
            {!mine.shield && mine.out === null && shieldLeft > 0 ? (
              <div style={{ ...hunterTag, background: 'rgba(42,34,51,0.75)', color: '#9fdcf5' }} data-shield-cooldown={Math.ceil(shieldLeft)}>
                SHIELD {Math.ceil(shieldLeft)}s
              </div>
            ) : null}
          </div>
        ) : null}

        {feed.length > 0 ? (
          <div style={feedWrap}>
            {feed.map(({ p, index }) => (
              <div key={p.id} style={feedRow}>
                {p.by !== null && game.players[p.by] ? (
                  <>
                    <span style={{ ...dot, background: COLOURS[p.by % COLOURS.length] }} />
                    <span>{nameOf(game.players[p.by].id)}</span>
                    <span style={{ opacity: 0.6 }}>➜</span>
                  </>
                ) : null}
                <span style={{ ...dot, background: COLOURS[index % COLOURS.length] }} />
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

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `HesOneShotScene`. */
const Stage = memo(function Stage({ live, look }: { live: RefObject<Game>; look: RefObject<LookRef> }) {
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
      <HesOneShotScene live={live} look={look} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 75, near: 0.05, far: 250, position: [0, 26, 20] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: anybody standing first, then the last to go, back to the first. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const headline = !mine
    ? 'Time'
    : mine.place === 1
      ? mine.player.out === null && order.filter((entry) => entry.place === 1).length === 1
        ? 'Last one standing - you win!'
        : mine.player.out === null
          ? 'Still standing!'
          : 'Last one standing - you win!'
      : mine.player.out === null && !mine.player.left
        ? 'You survived'
        : `Shot down - ${ordinal(mine.place)}`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>The last to go wins.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ ...dot, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>{entry.player.kills === 1 ? '1 hit' : `${entry.player.kills} hits`}</span>
              <span style={{ minWidth: 92, textAlign: 'right', font: `600 13px/1.4 ${FONT}`, color: entry.player.out === null && !entry.player.left ? LOOK.green : LOOK.faded }}>
                {entry.player.out !== null ? `out at ${minutes(entry.player.out)}` : entry.player.left ? 'left' : 'standing'}
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
  background: '#9fd8f0',
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
  background: 'radial-gradient(ellipse at center, rgba(255,40,40,0.15) 30%, rgba(255,40,40,0.6) 100%)',
}

const crosshairWrap: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -28px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
}

/** A pale blue glow round the edge of the screen while your shield is up. */
const shielded: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 70px 10px rgba(90, 209, 255, 0.45)',
}

const hunterTag: React.CSSProperties = {
  marginTop: 6,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(42,34,51,0.75)',
  color: '#fff',
  font: `800 11px/1.5 ${FONT}`,
  letterSpacing: 1,
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

const TONES: Record<'count' | 'out' | 'hint' | 'got', React.CSSProperties> = {
  count: { background: 'rgba(20,16,28,0.85)', color: '#fff', font: `800 44px/1.1 ${FONT}`, minWidth: 80 },
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  got: { background: LOOK.green, color: '#fff' },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  boxSizing: 'border-box',
  background: 'rgba(15, 10, 20, 0.35)',
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

/**
 * A bang for every shot fired and a thud for everybody who goes down - off each
 * player's `shotAt` and `out`, which every screen is sent. Your own shot is
 * loud; everybody else's is quieter. A new game is only remembered.
 */
function useShotSounds(game: Game): void {
  const seen = useRef<{ id: number; by: Map<string, { shot: number; out: boolean; shield: boolean }> }>({ id: -1, by: new Map() })
  useEffect(() => {
    const fresh = seen.current.id !== game.id
    if (fresh) seen.current = { id: game.id, by: new Map() }
    const by = seen.current.by
    for (const p of game.players) {
      const was = by.get(p.id)
      by.set(p.id, { shot: p.shotAt, out: p.out !== null, shield: p.shield })
      if (fresh || !was) continue
      if (p.shotAt !== was.shot) playCue(CUES.gunShot, p.mine ? 0.6 : 0.25)
      if (!was.out && p.out !== null) playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
      // A shield picked up, and one that took a hit and broke.
      if (!was.shield && p.shield) playCue(CUES.bump, p.mine ? 0.5 : 0.2)
      if (was.shield && !p.shield && p.out === null) playCue(CUES.balloonPop, p.mine ? 0.6 : 0.35)
    }
  }, [game])
}
