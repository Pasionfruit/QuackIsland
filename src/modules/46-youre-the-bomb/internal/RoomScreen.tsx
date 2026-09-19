/**
 * You're The Bomb, on the screen.
 *
 * The room is drawn in its own canvas by `RoomScene`; this is the shell: the
 * keys and the clicks turned into hands for `useRoomNet`, your scans (which are
 * yours alone, and never leave this screen), and the words - the seconds until
 * the rolling pin, who is still in the room, who got out, and how you went.
 *
 * **WASD to move** (W is towards the hole), **Space to scan** for the bombs
 * around you, **left click to shove** whoever is in front of you - the way you
 * last walked.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { RoomScene, type ScanRef } from './RoomScene'
import { COLOURS, PIN, PUSH, SCAN, clock, cooldownLeft, inRoom, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useRoomNet } from './useRoomNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
  scan: '#7fe0ff',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: east and south. W is north, towards the hole. */
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

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

export function RoomScreen({ run }: { run: MinigameRun }) {
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

  const wire = useRoomNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const clicks = useRef(0)
  const scanPressed = useRef(false)
  const scans = useRef<ScanRef>({ scans: [] })
  const scannedAt = useRef(-Infinity)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
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
      const hands = { mx: length > 0 ? mx / length : 0, mz: length > 0 ? mz / length : 0, clicks: clicks.current }
      clicks.current = 0
      const result = wire.advance(current, dt, hands, paused.current)
      if (result.shoved !== null) playCue(CUES.bump, result.shoved > 0 ? 0.6 : 0.3)
      // A scan: yours alone, from where you stand, if it is ready.
      const mine = current.players.find((p) => p.mine)
      const t = clock(current)
      if (scanPressed.current && mine && inRoom(mine) && t >= 0 && !current.over && !paused.current && t - scannedAt.current >= SCAN.cooldown) {
        scannedAt.current = t
        scans.current.scans = [...scans.current.scans.filter((s) => t - s.t < SCAN.show), { x: mine.x, z: mine.z, t }]
        playCue(CUES.balloonInflate, 0.35)
      }
      scanPressed.current = false
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // A new game: no old scans.
  useEffect(() => {
    scans.current.scans = []
    scannedAt.current = -Infinity
  }, [game.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (down && !e.repeat && !paused.current) scanPressed.current = true
        return
      }
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
    clicks.current += 1
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const t = clock(game)
  useRoomSounds(game)
  const inside = game.players.filter(inRoom).length
  const escaped = game.players.filter((p) => p.escaped !== null).sort((a, b) => a.escaped! - b.escaped!)
  const scanLeft = Math.max(0, SCAN.cooldown - (t - scannedAt.current))
  const shoveLeft = mine ? cooldownLeft(game, mine) / PUSH.cooldown : 0
  const pinIn = PIN.arrives - Math.max(0, t)

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' | 'good' | 'warn' } | null = null
  if (ready && !game.over && mine) {
    const by = mine.by !== null ? game.players[mine.by] : null
    if (mine.escaped !== null) banner = { text: `You got out! ${ordinal(escaped.findIndex((p) => p === mine) + 1)}`, sub: 'watching the rest', tone: 'good' }
    else if (mine.how === 'bomb') banner = { text: 'BOOM!', sub: by ? `${nameOf(by.id)} shoved you onto a bomb` : 'you stepped on a bomb', tone: 'out' }
    else if (mine.how === 'pin') banner = { text: 'Flattened!', sub: 'the rolling pin got you', tone: 'out' }
    else if (pinIn <= 0) banner = { text: 'The pin is here - run!', tone: 'out' }
    else if (pinIn <= 10) banner = { text: `The rolling pin comes in ${Math.ceil(pinIn)}`, sub: 'get to the hole!', tone: 'warn' }
    else if (t < 5 && scans.current.scans.length === 0) banner = { text: 'Space to scan for bombs', sub: 'then make for the hole at the far end', tone: 'hint' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>You're The Bomb</span>
        {ready ? (
          <>
            <TopTimer left={game.over || pinIn <= 0 ? null : pinIn}>
              <span style={{ ...pill, background: pinIn <= 10 ? LOOK.red : LOOK.sun, color: pinIn <= 10 ? '#fff' : LOOK.ink }} data-pin-in={Math.max(0, Math.ceil(pinIn))}>
                {pinIn > 0 ? `pin in 0:${String(Math.ceil(pinIn)).padStart(2, '0')}` : 'PIN!'}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-inside={inside}>
              {inside} in the room
            </span>
            <span style={{ ...pill, background: LOOK.green, color: '#fff' }} data-escaped={escaped.length}>
              {escaped.length} out
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = COLOURS[index % COLOURS.length]
          const gone = !inRoom(p)
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: !gone ? colour : p.escaped !== null ? LOOK.green : 'rgba(255,255,255,0.85)',
                color: !gone || p.escaped !== null ? '#fff' : LOOK.faded,
                boxShadow: gone && p.escaped === null ? `inset 0 0 0 2px ${colour}` : 'none',
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-escaped={p.escaped ?? ''}
              data-out={p.out ?? ''}
            >
              {nameOf(p.id)}
              {p.escaped !== null ? ' · out ✓' : p.how === 'bomb' ? ' · 💥' : p.how === 'pin' ? ' · flat' : ''}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} scans={scans} />

        {mine && mine.out !== null && t - mine.out < 0.7 && !game.over ? <div style={{ ...flash, opacity: 1 - (t - mine.out) / 0.7 }} /> : null}

        {ready && mine && inRoom(mine) && !game.over ? (
          <div style={meters}>
            <div style={meter} data-scan={scanLeft.toFixed(2)}>
              <div style={{ ...meterFill, width: `${(1 - scanLeft / SCAN.cooldown) * 100}%`, background: LOOK.scan }} />
              <span style={meterText}>{scanLeft > 0 ? 'scanning…' : 'space: scan'}</span>
            </div>
            <div style={meter} data-cooldown={shoveLeft.toFixed(2)}>
              <div style={{ ...meterFill, width: `${(1 - shoveLeft) * 100}%`, background: 'rgba(255,255,255,0.5)' }} />
              <span style={meterText}>{shoveLeft > 0 ? 'shove…' : 'click: shove'}</span>
            </div>
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

/** The canvas, rendered once - see `RoomScene`. */
const Stage = memo(function Stage({ live, scans }: { live: RefObject<Game>; scans: RefObject<ScanRef> }) {
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
      <RoomScene live={live} scans={scans} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 55, near: 0.1, far: 200, position: [0, 15, 38] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** A bang for every bomb, a rumble as the pin comes in, a fall for anybody going, a pop for anybody out of the hole. */
function useRoomSounds(game: Game): void {
  const seen = useRef<{ id: number; blown: number; gone: Set<string>; pin: boolean }>({ id: -1, blown: 0, gone: new Set(), pin: false })
  useEffect(() => {
    const fresh = seen.current.id !== game.id
    if (fresh) seen.current = { id: game.id, blown: game.blown.length, gone: new Set(game.players.filter((p) => !inRoom(p)).map((p) => p.id)), pin: false }
    const s = seen.current
    if (game.blown.length > s.blown) {
      for (const b of game.blown.slice(s.blown)) playCue(CUES.woodenBridgeCollapse, game.players[b.by]?.mine ? 0.8 : 0.5)
      s.blown = game.blown.length
    }
    if (!s.pin && clock(game) >= PIN.arrives) {
      s.pin = true
      playCue(CUES.spinning, 0.7)
    }
    for (const p of game.players) {
      if (inRoom(p) || s.gone.has(p.id)) continue
      s.gone.add(p.id)
      if (p.escaped !== null) playCue(CUES.balloonPop, p.mine ? 0.7 : 0.35)
      else playCue(CUES.fallingOver, p.mine ? 0.7 : 0.35)
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
  background: '#1a1620',
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

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }

const flash: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(255,150,40,0.2) 30%, rgba(255,60,20,0.65) 100%)',
}

const meters: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 20,
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 10,
  pointerEvents: 'none',
}

const meter: React.CSSProperties = {
  position: 'relative',
  width: 140,
  height: 20,
  borderRadius: 999,
  background: 'rgba(42,34,51,0.65)',
  overflow: 'hidden',
}

const meterFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.6 }

const meterText: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  textAlign: 'center',
  color: '#fff',
  font: `800 11px/20px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
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
  font: `800 20px/1.25 ${FONT}`,
  textAlign: 'center',
}

const TONES: Record<'out' | 'hint' | 'good' | 'warn', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  good: { background: LOOK.green, color: '#fff' },
  warn: { background: LOOK.sun, color: LOOK.ink },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
