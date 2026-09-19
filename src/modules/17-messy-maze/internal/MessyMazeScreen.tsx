/**
 * Messy Maze, on the screen.
 *
 * The maze is drawn in its own canvas by `MessyMazeScene`; this file is the
 * shell round it. Letters in, `useRaceNet` decides what they do, and a HUD
 * across the top says the one thing you most need to know once a platform has
 * had you: **which keys move you now**.
 *
 * **The keyboard reports letters, never directions.** Every letter key that is
 * down is sent as held, whatever your binding - the binding is applied where
 * the race is run, so a spin cannot leave this browser pressing yesterday's
 * keys. Letters are read from what the key types rather than where it sits,
 * so the letter on the HUD is the letter printed on the key.
 */
import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import {
  CUES,
  TopTimer,
  replayMinigame,
  useCueOnChange,
  useFinish,
  type MinigameRun,
} from '../../15-minigames'
import { ARROWS, heldLetters } from './bindings'
import { FOV } from './camera'
import { MessyMazeScene, PALETTE } from './MessyMazeScene'
import { mazeFor } from './maze'
import { RACE, goalOpen, placings, platformsTouched, stillRacing, type Race, type Racer } from './race'
import { myId, newRace, waitingRace } from './setup'
import { useRaceNet } from './useRaceNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  you: PALETTE.you,
  platform: PALETTE.platform,
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** How long the "new keys" card stays up after a spin, in milliseconds. */
const FLASH_MS = 1400

export function MessyMazeScreen({ run }: { run: MinigameRun }) {
  const [race, setRace] = useState<Race>(() => (getNet().host ? newRace() : waitingRace()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(race.over, () =>
    placings(race).map((r, i) => ({ id: r.id, place: i + 1, name: nameOf(r.id), mine: r.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRaceNet()
  const live = useRef(race)
  live.current = race

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  // Every letter that is down. A set rather than four flags, because which
  // four letters matter changes mid-race.
  const held = useRef(new Set<string>())

  useEffect(() => {
    const letterOf = (e: KeyboardEvent) =>
      e.key.length === 1 && /[a-z]/i.test(e.key) ? e.key.toUpperCase() : null
    const down = (e: KeyboardEvent) => {
      // Leave shortcuts alone: ctrl-R is still a reload, not a step left.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const letter = letterOf(e)
      if (!letter) return
      held.current.add(letter)
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      const letter = letterOf(e)
      if (letter) held.current.delete(letter)
    }
    // A key let go while the window was not looking never sends its keyup.
    const forget = () => held.current.clear()
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
      if (wire.advance(current, dt, heldLetters(held.current), paused.current)) {
        setRace({ ...current })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const you = race.racers.find((r) => r.mine) ?? null

  // The card that says your keys just changed. Shown when your spin count goes
  // up, and only then - not for the first snapshot a guest ever sees.
  const [flash, setFlash] = useState<number | null>(null)
  const seenSpins = useRef<number | null>(null)
  useEffect(() => {
    if (!you) return
    if (seenSpins.current !== null && you.spins > seenSpins.current) {
      setFlash(you.spins)
      const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
      seenSpins.current = you.spins
      return () => window.clearTimeout(timer)
    }
    seenSpins.current = you.spins
  }, [you?.spins, race.seed])

  // A spin is heard off the spin counts everybody is sent: loud for your own,
  // quiet for anybody else's. Keyed on the race's seed as well, so a new race
  // putting every count back to nought is a change that stays silent.
  const mySpins = you?.spins ?? 0
  const theirSpins = race.racers.reduce((sum, r) => (r.mine ? sum : sum + r.spins), 0)
  useCueOnChange(CUES.spinning, `${race.seed}:${mySpins}`, mySpins > 0)
  useCueOnChange(CUES.spinning, `${race.seed}:${theirSpins}`, theirSpins > 0, 0.2)

  const inCount = race.racers.length - stillRacing(race).length
  const callLeft =
    race.firstIn !== null && !race.over ? Math.max(0, RACE.lastCall - (race.elapsed - race.firstIn)) : null

  return (
    <div style={page}>
      <style>{KEYFRAMES}</style>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Messy Maze</span>
        {race.racers.length > 0 ? (
          <span style={{ color: LOOK.faded, whiteSpace: 'nowrap' }} data-maze={race.layout}>
            {mazeFor(race.layout).name}
          </span>
        ) : null}
        {you ? <PlatformPill racer={you} /> : null}
        <Pill colour={LOOK.ink}>
          {inCount} of {race.racers.length} in
        </Pill>
        {callLeft !== null ? <Pill colour="#c8443c">last call {Math.ceil(callLeft)}s</Pill> : null}
        <span style={{ flex: 1 }} />
        <TopTimer><Pill colour={LOOK.ink}>{race.elapsed.toFixed(1)}s</Pill></TopTimer>
        {you ? <Keys key={you.spins} binding={you.binding} /> : null}
      </div>

      <div style={board}>
        <Canvas
          shadows={{ type: PCFSoftShadowMap }}
          dpr={[1, 2]}
          camera={{ fov: FOV, near: 1, far: 500, position: [0, 80, 30] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
        >
          <MessyMazeScene race={race} />
        </Canvas>

        {you && you.place !== null && !race.over ? (
          <div style={banner}>You're in — {ordinal(you.place)}! Watching the others.</div>
        ) : null}
        {flash !== null && you ? <SpinCard key={flash} binding={you.binding} /> : null}
      </div>

      {results ? (
        <Over race={race} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} />
      ) : null}
    </div>
  )
}

/** How many platforms you have, out of the two the middle wants. */
function PlatformPill({ racer }: { racer: Racer }) {
  const count = Math.min(platformsTouched(racer), RACE.platformsNeeded)
  const open = goalOpen(racer)
  return (
    <span style={{ ...pill, background: open ? LOOK.sun : LOOK.platform, color: open ? LOOK.ink : '#fff' }}>
      {open ? 'go to the middle!' : `platforms ${count} of ${RACE.platformsNeeded}`}
    </span>
  )
}

/**
 * Your keys, laid out the way they are on a keyboard: up on top, left, down
 * and right underneath. Keyed on the spin count by the HUD, so it re-mounts on
 * every spin - which is what makes the keys pulse when they change.
 */
function Keys({ binding }: { binding: string }) {
  const cap = (i: number) => (
    <span style={keycap} data-direction={ARROWS[i]}>
      <span style={{ fontSize: 9, opacity: 0.55, lineHeight: 1 }}>{ARROWS[i]}</span>
      <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{binding[i]}</span>
    </span>
  )
  return (
    <span style={keys} data-binding={binding}>
      <span style={{ display: 'flex', justifyContent: 'center' }}>{cap(0)}</span>
      <span style={{ display: 'flex', gap: 3 }}>
        {cap(1)}
        {cap(2)}
        {cap(3)}
      </span>
    </span>
  )
}

/** The card over the maze after a spin: here are your new keys. */
function SpinCard({ binding }: { binding: string }) {
  return (
    <div style={spinBackdrop}>
      <div style={spinCard}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: LOOK.platform }}>
          SPIN! NEW KEYS
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={bigCap}>
              <span style={{ fontSize: 14, opacity: 0.55 }}>{ARROWS[i]}</span>
              <span style={{ fontSize: 28, fontWeight: 800 }}>{binding[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pill({ colour, children }: { colour: string; children: React.ReactNode }) {
  return <span style={{ ...pill, background: colour, color: '#fff' }}>{children}</span>
}

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** The results: in the order people reached the middle, then everybody else. */
function Over({
  race,
  me,
  nameOf,
  onAgain,
}: {
  race: Race
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(race)
  const mine = race.racers.find((r) => r.id === me) ?? null
  const headline = !mine
    ? 'Race over'
    : mine.place === 1
      ? 'You got there first!'
      : mine.place !== null
        ? `You came ${ordinal(mine.place)}`
        : "You didn't make it"
  const winner = order.find((r) => r.place === 1)
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {winner
            ? winner.id === me
              ? 'First to the middle.'
              : `${nameOf(winner.id)} reached the middle first.`
            : 'Nobody reached the middle in time.'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.slice(0, 8).map((racer) => (
            <div key={racer.id} style={scoreRow} data-place={racer.place ?? 0}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{racer.place ?? '–'}</span>
              <span style={{ flex: 1, fontWeight: racer.id === me ? 700 : 400 }}>{nameOf(racer.id)}</span>
              <span style={{ opacity: 0.6 }}>
                {racer.finishedAt !== null ? `${racer.finishedAt.toFixed(1)}s` : `${platformsTouched(racer)} platforms`}
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

const KEYFRAMES = `
@keyframes mm-pop { 0% { transform: scale(1.35); } 60% { transform: scale(0.95); } 100% { transform: scale(1); } }
@keyframes mm-card { 0% { opacity: 0; transform: translateY(8px) scale(0.9); } 12% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
`

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
  padding: '6px 16px',
  background: LOOK.sand,
  borderBottom: '2px solid #ecd0a0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const keys: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  animation: 'mm-pop 360ms ease-out',
}

const keycap: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 24,
  borderRadius: 6,
  background: '#fff',
  boxShadow: '0 2px 0 #d9c29a',
  color: LOOK.ink,
  font: `12px/1 ${FONT}`,
}

const board: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  position: 'relative',
}

const banner: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  borderRadius: 999,
  background: LOOK.sun,
  color: LOOK.ink,
  font: `700 14px/1.4 ${FONT}`,
  boxShadow: '0 3px 0 #d79a22',
  whiteSpace: 'nowrap',
}

const spinBackdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Clicks and keys go straight through: this is something to read while
  // playing, not something to dismiss.
  pointerEvents: 'none',
}

const spinCard: React.CSSProperties = {
  padding: '12px 18px 16px',
  borderRadius: 20,
  background: 'rgba(246, 228, 191, 0.94)',
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  textAlign: 'center',
  animation: `mm-card ${FLASH_MS}ms ease-out forwards`,
}

const bigCap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: 54,
  height: 58,
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 4px 0 #d9c29a',
  color: LOOK.ink,
  font: `14px/1.1 ${FONT}`,
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
