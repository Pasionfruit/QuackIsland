/**
 * Keyboard Warrior, on the screen.
 *
 * The arena is drawn in its own canvas by `KeyboardWarriorScene`; this is the
 * shell: the keyboard turned into attempts for `useLetterNet`, and the words -
 * the countdown, which letter of how many, everybody's points, what became of
 * your attempt, who got each letter and how fast, and the results.
 *
 * **Type the letter.** The first letter key you press after a letter appears is
 * your one attempt at it. Its reaction is timed from the frame the letter first
 * showed on this screen to the key going down, both on the page's own clock - the
 * key's own `timeStamp`, not whenever the next frame got round to it. A key down
 * before the letter was on the screen is not an attempt. Held keys repeating, and
 * anything with Ctrl, Alt or Cmd, are ignored.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, replayMinigame, useCueOnChange, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { KeyboardWarriorScene } from './KeyboardWarriorScene'
import { COLOURS, ROUND, asLetter, attemptOf, phase, placings, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useLetterNet, type Typed } from './useLetterNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const seconds = (s: number) => `${s.toFixed(2)} s`

export function KeyboardWarriorScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const colours = useMemo(
    () => game.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers)),
    [game.players, myColour, peers],
  )
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const wire = useLetterNet()
  const live = useRef(game)
  live.current = game
  /** Keys pressed since the last frame, with when, on the page's clock. */
  const pressed = useRef<{ key: string; at: number }[]>([])
  /** The letter on the screen, and when this screen first showed it. */
  const shown = useRef<{ game: number; index: number; appearsAt: number; at: number } | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || paused.current) return
      const key = asLetter(e.key)
      if (key) pressed.current.push({ key, at: e.timeStamp })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      // Your one attempt: the first key down after this screen showed the letter.
      const on = shown.current
      const letter = current.letter
      let typed: Typed | null = null
      for (const press of pressed.current.splice(0)) {
        if (typed || !on || on.game !== current.id || on.index !== letter.index || on.appearsAt !== letter.appearsAt || press.at < on.at) continue
        typed = { key: press.key, reaction: (press.at - on.at) / 1000 }
      }
      const result = wire.advance(current, dt, typed, paused.current)
      // The letter goes up on this frame: from now, keys count.
      const l = current.letter
      if (phase(current) === 'up' && (!shown.current || shown.current.game !== current.id || shown.current.index !== l.index || shown.current.appearsAt !== l.appearsAt)) {
        shown.current = { game: current.id, index: l.index, appearsAt: l.appearsAt, at: now }
      }
      if (result.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const letter = game.letter
  const now = phase(game)
  const mine = mineIndex >= 0 ? attemptOf(game, mineIndex) : undefined
  const winner = letter.winner !== null ? game.players[letter.winner] : null
  const won = letter.winner !== null ? letter.attempts.find((a) => a.player === letter.winner) : undefined

  // Your one go at this letter, the moment it is on the record, if it was wrong.
  useCueOnChange(CUES.wrongSelection, `${game.id}:${letter.index}:${mine?.key ?? ''}`, !!mine && mine.key !== letter.char)

  let banner: { text: string; sub?: string; tone: 'count' | 'hint' | 'right' | 'wrong' | 'point' | 'none' } | null = null
  if (ready && mineIndex >= 0) {
    if (now === 'waiting') banner = { text: 'Get ready…', tone: 'hint' }
    else if (now === 'up') {
      if (!mine) banner = { text: 'Type it!', tone: 'hint' }
      else if (mine.key === letter.char) banner = { text: `✓ ${mine.key} in ${seconds(mine.reaction)}`, sub: 'the quickest gets the point', tone: 'right' }
      else banner = { text: `✗ You typed ${mine.key}`, sub: 'out for this one', tone: 'wrong' }
    } else if (now === 'result') {
      if (winner?.mine && won) banner = { text: `+1 - ${letter.char} in ${seconds(won.reaction)}`, tone: 'point' }
      else if (winner && won) banner = { text: `${nameOf(winner.id)} got ${letter.char} - ${seconds(won.reaction)}`, sub: mine && mine.key === letter.char ? `you were ${seconds(mine.reaction)}` : undefined, tone: 'none' }
      else banner = { text: `Nobody got ${letter.char}`, tone: 'none' }
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Keyboard Warrior</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-round={letter.index + 1}>
            letter {Math.min(letter.index + 1, ROUND.letters)} of {ROUND.letters}
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: colours[index],
              color: '#fff',
              opacity: p.left ? 0.45 : 1,
              outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
              outlineOffset: 1,
            }}
            data-score={p.score}
          >
            {nameOf(p.id)} <b>{p.score}</b>
          </span>
        ))}
      </div>

      <div style={board} data-board data-phase={now} data-letter={now === 'up' ? letter.char : ''}>
        <Stage live={live} />
        {banner ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `KeyboardWarriorScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
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
      <KeyboardWarriorScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.1, far: 200, position: [0, 4, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: most points first, with each player's quickest winning letter. */
function Over({
  game,
  me,
  nameOf,
  colours,
  onAgain,
}: {
  game: Game
  me: string
  nameOf: (id: string) => string
  colours: readonly string[]
  onAgain: (() => void) | null
}) {
  const order = placings(game)
  const mine = order.find((entry) => entry.player.id === me)
  const shared = mine ? order.filter((e) => e.place === mine.place).length > 1 : false
  const headline = !mine ? 'Pens down' : mine.place === 1 ? (shared ? 'Joint winner!' : 'Keyboard Warrior!') : `${ordinal(mine.place)} place`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>Most letters first.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: colours[entry.index] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ font: `600 12px/1.4 ${FONT}`, color: LOOK.faded }}>
                {entry.player.left ? 'left' : entry.player.best !== null ? `quickest ${seconds(entry.player.best)}` : ''}
              </span>
              <span style={{ minWidth: 64, textAlign: 'right', font: `700 14px/1.4 ${FONT}` }}>{entry.player.score === 1 ? '1 letter' : `${entry.player.score} letters`}</span>
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
  background: '#f3b58a',
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

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 18,
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

const TONES: Record<'count' | 'hint' | 'right' | 'wrong' | 'point' | 'none', React.CSSProperties> = {
  count: { background: 'rgba(20,16,28,0.85)', color: '#fff', font: `800 44px/1.1 ${FONT}`, minWidth: 80 },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  right: { background: LOOK.green, color: '#fff' },
  wrong: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)' },
  point: { background: LOOK.sun, color: LOOK.ink, boxShadow: '0 4px 0 #d79a22' },
  none: { background: 'rgba(20,16,28,0.8)', color: '#fff' },
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
