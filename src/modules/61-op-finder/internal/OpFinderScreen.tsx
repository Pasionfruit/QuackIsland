/**
 * OP Finder, on the screen.
 *
 * A decorative line of racers is drawn in its own canvas by `OpFinderScene`;
 * this is the shell - the HUD, and the challenge panel itself, which is
 * plain HTML the same way every minigame's typing or clicking leg is.
 *
 * **Mouse to navigate and click, keyboard to type when a challenge asks for
 * it.** No WASD, no camera to move - nobody goes anywhere in this one.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { usePlayerColour } from '../../02-player'
import { getNet, rosterColour, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { OpFinderScene } from './OpFinderScene'
import {
  COLOURS,
  STAGE_COUNT,
  THINGS,
  answer,
  challengeFor,
  placings,
  timeLeft,
  type Challenge,
  type Guess,
  type Intent,
  type Round,
} from './rules'
import { myId, newRound, waitingRound } from './setup'
import { useOpNet } from './useOpNet'

const LOOK = {
  ink: '#2a2233',
  faded: '#877d93',
  paper: '#f4f0f8',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#3fa66b',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function OpFinderScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the round from here.
  const [round, setRound] = useState<Round>(() => (getNet().host ? newRound() : waitingRound()))
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const myColour = usePlayerColour()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  const colours = round.players.map((player, index) => rosterColour(player, index, COLOURS, myColour, peers))
  const results = useFinish(round.over, () =>
    placings(round).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: colours[e.index], mine: e.player.id === me })),
  )
  const wire = useOpNet()
  const live = useRef(round)
  live.current = round

  useOpSounds(round)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const mine = current.players.find((p) => p.mine)
      const intent: Intent = mine ? { stage: mine.stage, mistakes: mine.mistakes } : { stage: 0, mistakes: 0 }
      if (wire.advance(current, dt, intent, paused.current)) setRound({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const guess = (g: Guess) => {
    if (paused.current) return
    const current = live.current
    const p = current.players.find((pp) => pp.mine)
    if (!p || current.over) return
    const right = answer(current, p, g)
    playCue(right ? CUES.balloonPop : CUES.wrongSelection, 0.5)
    setRound({ ...current })
  }

  const ready = round.players.length > 0
  const mineIndex = round.players.findIndex((p) => p.mine)
  const mine = round.players[mineIndex]
  const left = timeLeft(round)
  const locked = !!mine && round.elapsed < mine.lockedUntil

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>OP Finder</span>
        {ready ? (
          <>
            <TopTimer left={round.over ? null : left}>
              <span style={{ ...pill, background: left <= 20 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
                {Math.ceil(left)}s
              </span>
            </TopTimer>
            {mine ? (
              <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-stage={mine.stage}>
                {mine.stage}/{STAGE_COUNT}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
      </div>

      <div style={board} data-board>
        <Stage live={live} />
        {ready && mine && !round.over && mine.stage < STAGE_COUNT ? (
          <ChallengePanel
            key={`${round.id}:${mine.stage}`}
            challenge={challengeFor(round.seed, mine.stage)}
            locked={locked}
            onGuess={guess}
          />
        ) : null}
      </div>

      {results && ready ? <Over round={round} me={me} nameOf={nameOf} colours={colours} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** The canvas, rendered once - see `OpFinderScene`. */
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
      <OpFinderScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 42, near: 1, far: 200, position: [0, 6, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

function icon(i: number): string {
  return THINGS[i].icon
}

/** Switches what renders by the current challenge's kind - the same idea as Sprint Triathlon's `Task`. */
function ChallengePanel({ challenge, locked, onGuess }: { challenge: Challenge; locked: boolean; onGuess: (g: Guess) => void }) {
  if (challenge.kind === 'match') {
    return (
      <Panel title="Click the one that matches" locked={locked}>
        <div style={bigIcon} data-target>{icon(challenge.target)}</div>
        <Grid>
          {challenge.options.map((thing, i) => (
            <IconButton key={i} onClick={() => onGuess({ kind: 'match', pick: i })} disabled={locked}>
              {icon(thing)}
            </IconButton>
          ))}
        </Grid>
      </Panel>
    )
  }
  if (challenge.kind === 'text') return <TextPanel text={challenge.text} locked={locked} onGuess={onGuess} />
  if (challenge.kind === 'identify') {
    return (
      <Panel title="Click the odd one out" locked={locked}>
        <Grid>
          {challenge.options.map((thing, i) => (
            <IconButton key={i} onClick={() => onGuess({ kind: 'identify', pick: i })} disabled={locked}>
              {icon(thing)}
            </IconButton>
          ))}
        </Grid>
      </Panel>
    )
  }
  if (challenge.kind === 'pattern') {
    return (
      <Panel title="What comes next?" locked={locked}>
        <div style={sequenceRow} data-sequence>
          {challenge.sequence.map((thing, i) => (
            <span key={i} style={sequenceIcon}>{icon(thing)}</span>
          ))}
          <span style={{ ...sequenceIcon, opacity: 0.4 }}>?</span>
        </div>
        <Grid>
          {challenge.options.map((thing, i) => (
            <IconButton key={i} onClick={() => onGuess({ kind: 'pattern', pick: i })} disabled={locked}>
              {icon(thing)}
            </IconButton>
          ))}
        </Grid>
      </Panel>
    )
  }
  if (challenge.kind === 'checkboxes') return <CheckboxPanel challenge={challenge} locked={locked} onGuess={onGuess} />
  return <CountPanel challenge={challenge} locked={locked} onGuess={onGuess} />
}

function Panel({ title, locked, children }: { title: string; locked: boolean; children: React.ReactNode }) {
  return (
    <div style={panelWrap}>
      <div style={{ ...panelBox, borderColor: locked ? LOOK.red : LOOK.paper }} data-task>
        <div style={panelTitle}>{title}</div>
        {children}
        {locked ? <div style={lockedHint} data-locked>not quite - try again in a moment</div> : null}
      </div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={grid}>{children}</div>
}

function IconButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button type="button" style={iconButton} onClick={onClick} disabled={disabled} data-answer>
      {children}
    </button>
  )
}

function TextPanel({ text, locked, onGuess }: { text: string; locked: boolean; onGuess: (g: Guess) => void }) {
  const [value, setValue] = useState('')
  const submit = () => {
    if (locked || value.trim().length === 0) return
    onGuess({ kind: 'text', text: value })
  }
  return (
    <Panel title="Type what you see" locked={locked}>
      <div style={warpedRow} data-warped-text={text}>
        {[...text].map((ch, i) => (
          <span
            key={i}
            style={{
              ...warpedChar,
              transform: `rotate(${((i * 37) % 21) - 10}deg) translateY(${((i * 53) % 9) - 4}px)`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
      <input
        style={textInput}
        value={value}
        disabled={locked}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        data-answer-input
      />
      <button type="button" style={submitButton} onClick={submit} disabled={locked} data-submit>
        check
      </button>
    </Panel>
  )
}

function CheckboxPanel({
  challenge,
  locked,
  onGuess,
}: {
  challenge: Extract<Challenge, { kind: 'checkboxes' }>
  locked: boolean
  onGuess: (g: Guess) => void
}) {
  const [checked, setChecked] = useState<readonly number[]>([])
  const toggle = (i: number) => {
    if (locked) return
    setChecked((current) => (current.includes(i) ? current.filter((v) => v !== i) : [...current, i]))
  }
  return (
    <Panel title={`Check all the ${challenge.category}s, then confirm`} locked={locked}>
      <Grid>
        {challenge.options.map((thing, i) => (
          <button
            key={i}
            type="button"
            style={{ ...iconButton, outline: checked.includes(i) ? `3px solid ${LOOK.sun}` : 'none' }}
            onClick={() => toggle(i)}
            disabled={locked}
            data-checkbox
            data-checked={checked.includes(i)}
          >
            {icon(thing)}
          </button>
        ))}
      </Grid>
      <button
        type="button"
        style={submitButton}
        disabled={locked}
        onClick={() => onGuess({ kind: 'checkboxes', picks: checked })}
        data-confirm
      >
        confirm
      </button>
    </Panel>
  )
}

function CountPanel({
  challenge,
  locked,
  onGuess,
}: {
  challenge: Extract<Challenge, { kind: 'count' }>
  locked: boolean
  onGuess: (g: Guess) => void
}) {
  return (
    <Panel title={`How many ${icon(challenge.target)} do you see?`} locked={locked}>
      <div style={countField} data-count-target={icon(challenge.target)}>
        {challenge.field.map((thing, i) => (
          <span key={i} style={countIcon}>{icon(thing)}</span>
        ))}
      </div>
      <div style={{ ...grid, gridTemplateColumns: `repeat(${challenge.choices.length}, 1fr)` }}>
        {challenge.choices.map((n, i) => (
          <IconButton key={i} onClick={() => onGuess({ kind: 'count', pick: i })} disabled={locked}>
            {n}
          </IconButton>
        ))}
      </div>
    </Panel>
  )
}

/** The results: first to finish wins, everybody else ranked by how far they got. */
function Over({
  round,
  me,
  nameOf,
  colours,
  onAgain,
}: {
  round: Round
  me: string
  nameOf: (id: string) => string
  colours: readonly string[]
  onAgain: (() => void) | null
}) {
  const order = placings(round)
  const mine = order.find((entry) => entry.player.id === me)
  const headline = !mine ? 'Round over' : mine.place === 1 ? "You're not a bot!" : 'Somebody else finished first'
  const how = (entry: (typeof order)[number]) =>
    entry.player.finishAt !== null ? `finished · ${entry.player.finishAt.toFixed(1)}s` : `${entry.player.stage}/${STAGE_COUNT}`
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14, marginTop: 10 }}>
          {order.map((entry) => (
            <div key={entry.player.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: colours[entry.index] }} />
              <span style={{ flex: 1, fontWeight: entry.player.id === me ? 700 : 400 }}>{nameOf(entry.player.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{how(entry)}</span>
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
  background: 'linear-gradient(180deg, #cfe0f6 0%, #e9e3f5 60%, #f4ecdd 100%)',
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
  borderBottom: '2px solid #e2d9ee',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative' }

const panelWrap: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(92vw, 420px)',
}

const panelBox: React.CSSProperties = {
  background: LOOK.paper,
  border: '3px solid',
  borderRadius: 20,
  padding: 18,
  boxShadow: '0 8px 0 rgba(0,0,0,0.12)',
  textAlign: 'center',
}

const panelTitle: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 12 }

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
  marginTop: 10,
}

const bigIcon: React.CSSProperties = { fontSize: 56, marginBottom: 4 }

const iconButton: React.CSSProperties = {
  fontSize: 28,
  padding: '10px 0',
  borderRadius: 12,
  border: `2px solid ${LOOK.ink}22`,
  background: '#fff',
  cursor: 'pointer',
}

const sequenceRow: React.CSSProperties = { display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 6, fontSize: 30 }
const sequenceIcon: React.CSSProperties = { display: 'inline-block' }

const warpedRow: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 700,
  letterSpacing: 4,
  marginBottom: 10,
  color: LOOK.ink,
}
const warpedChar: React.CSSProperties = { display: 'inline-block' }

const textInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  fontSize: 16,
  borderRadius: 10,
  border: `2px solid ${LOOK.ink}33`,
  textAlign: 'center',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const submitButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 3px 0 #d79a22',
  color: LOOK.ink,
  font: `700 14px/1.2 ${FONT}`,
  cursor: 'pointer',
  marginTop: 10,
}

const countField: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 4,
  fontSize: 22,
  maxWidth: 320,
  margin: '0 auto 10px',
}
const countIcon: React.CSSProperties = { display: 'inline-block' }

const lockedHint: React.CSSProperties = { marginTop: 10, color: LOOK.red, fontSize: 12, fontWeight: 600 }

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(30, 22, 40, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 360,
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
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

/** A wrong guess, and somebody finishing - off each player's `mistakes` and `finishAt`, which every screen already has. */
function useOpSounds(round: Round): void {
  const seen = useRef<{ seed: number; by: Map<string, { mistakes: number; finished: boolean }> }>({ seed: -1, by: new Map() })
  useEffect(() => {
    const fresh = seen.current.seed !== round.seed
    if (fresh) seen.current = { seed: round.seed, by: new Map() }
    const by = seen.current.by
    for (const p of round.players) {
      const was = by.get(p.id)
      by.set(p.id, { mistakes: p.mistakes, finished: p.finishAt !== null })
      if (fresh || !was) continue
      if (!was.finished && p.finishAt !== null) playCue(CUES.balloonPop, p.mine ? 0.8 : 0.4)
    }
  }, [round])
}
