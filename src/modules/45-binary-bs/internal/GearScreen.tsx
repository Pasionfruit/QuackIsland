/**
 * Binary BS, on the screen.
 *
 * The gear is drawn in its own canvas by `GearScene`; this is the shell: the
 * keys turned into votes and a walk for `useGearNet`, and the words - the
 * round, who is left, the five seconds, the sum as it comes out, who went.
 *
 * **0 and 1 vote** (the number row or the keypad, or the two buttons). You can
 * change your mind until the five seconds are up. **WASD walks you about your
 * own side** - W is north, towards the mark.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { clicksOf, isSample, sampleCaption, tallied, totalAfter, turnState, viewOf } from './display'
import { GearScene } from './GearScene'
import { COLOURS, PHASES, canVote, clock, isIn, markedSide, numberFor, placings, sideOf, voteEnds, when, type Game } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useGearNet } from './useGearNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  blue: '#3d8bff',
  green: '#34b34a',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: east and south. */
const WALK: Record<string, [number, number]> = { KeyW: [0, -1], KeyS: [0, 1], KeyD: [1, 0], KeyA: [-1, 0] }
/** The keys that vote. */
export const VOTES: Record<string, 0 | 1> = { Digit0: 0, Numpad0: 0, Digit1: 1, Numpad1: 1 }

export function GearScreen({ run }: { run: MinigameRun }) {
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

  const wire = useGearNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const pressed = useRef<0 | 1 | null>(null)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      let mx = 0
      let mz = 0
      for (const code of held.current) {
        const k = WALK[code]
        if (k) {
          mx += k[0]
          mz += k[1]
        }
      }
      const hands = { mx: Math.sign(mx), mz: Math.sign(mz), vote: pressed.current }
      pressed.current = null
      const result = wire.advance(live.current, dt, hands, paused.current)
      if (result.voted) playCue(CUES.bump, 0.5)
      if (result.changed) setGame({ ...live.current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code in VOTES) {
        if (down && !e.repeat && !paused.current) pressed.current = VOTES[e.code]
        return
      }
      if (!(e.code in WALK)) return
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

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  // Before round one, what is drawn is the sample round: made-up players on a gear of four, run by the same rules.
  const view = viewOf(game)
  const sample = isSample(view)
  const t = clock(view)
  const w = when(t)
  useGearSounds(view)
  const left = view.players.filter(isIn).length
  const sides = view.seats.length
  const number = ready ? numberFor(view.seed, view.round) : 0
  const marked = sides > 0 ? markedSide(number, sides) : -1
  const markedWho = view.seats[marked]
  const result = view.results.find((r) => r.round === view.round)
  const voting = mineIndex >= 0 && canVote(game, mineIndex)

  let call: { big: string; sub?: string; tone?: 'red' } | null = null
  if (ready && !view.over && t >= 0 && w.round === view.round) {
    if (w.phase === 'vote') {
      call = {
        big: `${Math.max(0, voteEnds(view.round) - t).toFixed(1)}`,
        sub: `${number} on a ${sides}-sided gear - ${markedWho !== undefined ? `${nameOf(view.players[markedWho].id)} ${markedWho === mineIndex ? 'are' : 'is'} marked` : ''} · every 0 takes one off`,
      }
    } else if (result) {
      const victim = view.players[result.victim]
      const clicks = clicksOf(result)
      // The number, less a one for each 0, and - if that is more than the gear has sides, or less than none - how many it comes to round the gear.
      const sum = `${result.number} − ${result.zeros} zero${result.zeros === 1 ? '' : 's'} = ${result.steps}${result.steps === clicks ? '' : ` → ${result.steps} mod ${result.seats.length} = ${clicks}`} → side ${result.side + 1}`
      if (w.phase === 'reveal') {
        // The votes added into the total in the middle, one at a time.
        const k = tallied(result, w)
        const last = k > 0 ? result.seats[k - 1] : -1
        const said = last >= 0 ? result.votes[last] : null
        call =
          k < result.seats.length
            ? {
                big: `${result.number} → ${totalAfter(result, k)}`,
                sub: last >= 0 ? `${nameOf(view.players[last].id)} voted ${said === null ? '–' : said}: ${said === 0 ? 'takes one off' : 'adds nothing'} · ${k} of ${result.seats.length} added` : 'the votes are shown…',
              }
            : { big: sum, sub: `${clicks} side${clicks === 1 ? '' : 's'} to turn` }
      } else if (w.phase === 'turn') {
        // The counter going down as each side stops.
        const left = clicks - turnState(clicks, w).done
        call = { big: `${left}`, sub: left === 0 ? (clicks === 0 ? 'it is already at the mark' : 'stopped') : `side${left === 1 ? '' : 's'} still to turn` }
      } else call = { big: victim ? `${nameOf(victim.id)} ${result.victim === mineIndex ? 'are' : 'is'} out!` : 'Nobody on it', sub: sum, tone: 'red' }
    }
  }

  let banner: { text: string; sub?: string; tone: 'out' | 'hint' } | null = null
  if (ready && !game.over && mine && !sample) {
    if (mine.out !== null) banner = t - mine.out < 3 ? { text: 'Your side went!', sub: 'watching the rest', tone: 'out' } : { text: 'Out - watching the rest', tone: 'hint' }
    else if (w.phase === 'vote' && mine.vote === null) banner = { text: 'Press 0 or 1', sub: marked === sideOf(game, mineIndex) ? 'your side is marked!' : 'votes are secret until the end', tone: 'hint' }
  }

  const vote = (v: 0 | 1) => {
    if (!paused.current) pressed.current = v
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Binary BS</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: sample ? LOOK.sun : LOOK.ink, color: sample ? LOOK.ink : '#fff' }} data-round={sample ? 'sample' : view.round}>
              {sample ? 'sample round' : `round ${view.round}`}
            </span>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-left={left}>
              {left} left
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {view.players.map((p, index) => {
          const colour = COLOURS[index % COLOURS.length]
          const side = sideOf(view, index)
          const shown = result && w.phase !== 'vote' ? result.votes[index] : undefined
          return (
            <span
              key={p.id}
              style={{
                ...pill,
                background: isIn(p) ? colour : 'rgba(255,255,255,0.85)',
                color: isIn(p) ? '#fff' : LOOK.faded,
                boxShadow: isIn(p) ? 'none' : `inset 0 0 0 2px ${colour}`,
                opacity: p.left ? 0.45 : 1,
                outline: p.mine ? `2px solid ${LOOK.ink}` : 'none',
                outlineOffset: 1,
                textDecoration: p.out !== null ? 'line-through' : 'none',
              }}
              data-out={p.out ?? ''}
              data-side={side}
            >
              {nameOf(p.id)}
              {side >= 0 && isIn(p) ? ` · side ${side + 1}` : ''}
              {shown !== undefined ? ` · ${shown === null ? '–' : shown}` : w.phase === 'vote' && p.vote !== null && isIn(p) ? ' · ✓' : ''}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} data-board>
        <Stage live={live} />

        {sample ? (
          <div style={sampleWrap} data-sample={w.phase}>
            <div style={sampleBox}>
              <b>{sampleCaption(w).title}</b> · {sampleCaption(w).text} <i>(your 0 and 1 count from round one)</i>
            </div>
          </div>
        ) : null}

        {call ? (
          <div style={callWrap} data-phase={w.phase}>
            <div style={{ ...callBox, background: call.tone === 'red' ? LOOK.red : 'rgba(42,34,51,0.88)' }}>{call.big}</div>
            {call.sub ? <div style={callSub}>{call.sub}</div> : null}
          </div>
        ) : null}

        {ready && mine && isIn(mine) && !game.over ? (
          <div style={voteWrap} data-vote={mine.vote ?? ''}>
            {([0, 1] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => vote(v)}
                disabled={!voting}
                style={{
                  ...voteButton,
                  background: mine.vote === v ? (v === 0 ? LOOK.blue : LOOK.green) : 'rgba(244,240,248,0.92)',
                  color: mine.vote === v ? '#fff' : LOOK.ink,
                  opacity: voting || mine.vote === v ? 1 : 0.45,
                  transform: mine.vote === v ? 'translateY(-3px)' : 'none',
                }}
                data-vote-button={v}
              >
                {v}
              </button>
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

/** The canvas, rendered once - see `GearScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        camera.lookAt(0, 0, 1.5)
      }}
    >
      <GearScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
/** From above and a little south, the mark at the top of the screen. */
const CAMERA = { fov: 50, near: 0.1, far: 200, position: [0, 24, 15] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** A tick through the last seconds of the vote, the gear grinding round, a crash as a side drops, a fall for whoever goes. */
function useGearSounds(game: Game): void {
  const seen = useRef<{ id: number; phase: string; out: Set<string>; tally: number; clicks: number }>({ id: -2, phase: '', out: new Set(), tally: 0, clicks: 0 })
  useEffect(() => {
    if (seen.current.id !== game.id) seen.current = { id: game.id, phase: '', out: new Set(game.players.filter((p) => p.out !== null).map((p) => p.id)), tally: 0, clicks: 0 }
    const s = seen.current
    if (game.players.length === 0 || game.over || clock(game) < 0) return
    const w = when(clock(game))
    const phase = `${w.round}:${w.phase}`
    if (phase !== s.phase) {
      s.tally = 0
      s.clicks = 0
    }
    const counted = game.results.find((r) => r.round === w.round)
    if (counted && w.phase === 'reveal') {
      // A tick as each vote is added into the total in the middle.
      const k = tallied(counted, w)
      if (k > s.tally) playCue(CUES.bump, 0.3)
      s.tally = k
    }
    if (counted && w.phase === 'turn') {
      // A click as each side comes to rest.
      const done = turnState(clicksOf(counted), w).done
      if (done > s.clicks) playCue(CUES.bump, 0.7)
      s.clicks = done
    }
    if (phase !== s.phase) {
      s.phase = phase
      if (w.phase === 'vote') playCue(CUES.suspense, 0.4)
      else if (w.phase === 'drop') playCue(CUES.woodenBridgeCollapse, 0.6)
    }
    for (const p of game.players) {
      if (p.out === null || s.out.has(p.id)) continue
      s.out.add(p.id)
      playCue(CUES.fallingOver, p.mine ? 0.7 : 0.4)
    }
  }, [game])
}

/** How long the vote is, for the words. */
export const VOTE_SECONDS = PHASES.vote

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#1d1830',
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

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const callWrap: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
  padding: '0 16px',
}

/** The words over the sample round: what is happening, as it happens. */
const sampleWrap: React.CSSProperties = {
  position: 'absolute',
  bottom: 104,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0 16px',
}

const sampleBox: React.CSSProperties = {
  maxWidth: 640,
  padding: '8px 16px',
  borderRadius: 14,
  background: LOOK.sun,
  color: LOOK.ink,
  font: `600 15px/1.35 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.3)',
  textAlign: 'center',
}

const callBox: React.CSSProperties = {
  padding: '6px 22px',
  borderRadius: 16,
  color: '#fff',
  font: `900 26px/1.2 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.3)',
  textAlign: 'center',
}

const callSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)', textAlign: 'center' }

const voteWrap: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 22,
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 14,
}

const voteButton: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 18,
  border: 'none',
  font: `900 40px/72px ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
  cursor: 'pointer',
  transition: 'transform 80ms',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 110,
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

const TONES: Record<'out' | 'hint', React.CSSProperties> = {
  out: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 4px 0 rgba(0,0,0,0.35)' },
  hint: { background: 'rgba(244,240,248,0.92)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
