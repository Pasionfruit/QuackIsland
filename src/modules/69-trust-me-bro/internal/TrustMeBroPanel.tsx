import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { GameCanvas } from '../../00-core'
import { getMyName, getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { type MinigameRun, type Standing, useFinish } from '../../15-minigames'
import { isCount, myId } from '../../68-minigame-kit'
import { CHOOSE_SECONDS, COLOURS, doors, MESSAGE_MAX, TARGET, type Intent, type Round } from './rules'
import { newRound, waitingRound } from './setup'
import { useTrustNet, type Hands } from './net'
import { TAG } from './wire'
import { Stage } from './Stage'
import './trust.css'

export interface TrustMeBroProps {
  run: Pick<MinigameRun, 'phase' | 'paused'>
  initial?: Round
  /** Standalone preview owns its results; the main game uses the shared podium. */
  standalone?: boolean
}
export function nameOf(id: string): string {
  return id === myId() ? (getMyName() || 'you') : getPeers().find((p) => p.id === id)?.name ?? id
}
export function standings(round: Round): Standing[] {
  return round.players.map((p, i) => ({ id: p.id, mine: p.mine, colour: COLOURS[i % COLOURS.length], name: p.mine ? 'you' : nameOf(p.id), place: !p.left && ((round.winner === 'solo') === (p.role === 'solo')) ? 1 : 2 }))
}
function FinishBridge({ round }: { round: Round }) { useFinish(round.over, () => standings(round)); return null }

export function TrustMeBroPanel({ run, initial, standalone = false }: TrustMeBroProps) {
  const [round] = useState<Round>(() => initial ?? (getNet().status === 'joined' && !getNet().host ? waitingRound() : newRound()))
  const [, render] = useReducer((n: number) => n + 1, 0)
  const [message, setMessage] = useState('')
  const [clue, setClue] = useState<{ stage: number; safe: number } | null>(null)
  const hands = useRef<Hands>({ queue: [] })
  const sequence = useRef(0)
  const painted = useRef(0)
  const clueAt = useRef(-1)
  const lastPoint = useRef<string>('')
  const link = useTrustNet()
  const me = round.players.find((p) => p.mine)
  const playing = run.phase === 'playing' && !run.paused && !round.over
  const choosing = playing && round.phase === 'choose' && !!me && !me.left
  const solo = me?.role === 'solo'
  const result = round.history[round.stage]
  const safeClue = !solo ? round.secret?.safe[round.stage] ?? (clue?.stage === round.stage ? clue.safe : null) : null
  const queue = useCallback((action: Intent['action'], value?: number, text?: string) => {
    if (!choosing || hands.current.queue.length >= 32) return
    hands.current.queue.push({ round: round.id, stage: round.stage, seq: ++sequence.current, action, value, text })
  }, [choosing, round])
  const point = useCallback((door: number) => {
    if (solo || !choosing) return
    const key = `${round.stage}:${door}`
    if (lastPoint.current === key) return
    lastPoint.current = key
    queue('point', door)
  }, [solo, choosing, queue, round])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return
      if (!choosing || !solo) return
      if (['KeyA', 'KeyW', 'KeyS', 'KeyD', 'Space'].includes(event.code)) event.preventDefault()
      if (event.code === 'KeyA' || event.code === 'KeyW') queue('step', -1)
      if (event.code === 'KeyD' || event.code === 'KeyS') queue('step', 1)
      if (event.code === 'Space' && !event.repeat) queue('choose')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [choosing, solo, queue])
  useEffect(() => { hands.current.queue.length = 0 }, [run.paused, run.phase, round.stage])
  useEffect(() => subscribeRoom((from, raw) => {
    if (raw.tag !== TAG || raw.kind !== 'clue' || raw.to !== myId() || raw.round !== round.id || raw.stage !== round.stage || !isCount(raw.safe) || (raw.safe as number) >= doors(round)) return
    // The first peer is the host in the shared lobby's roster order.
    if (getNet().host || from !== getPeers()[0]?.id || round.soloId === myId()) return
    setClue({ stage: raw.stage as number, safe: raw.safe as number })
  }), [round])

  const advance = useCallback((dt: number) => {
    link.advance(round, dt, hands.current, !playing)
    if (playing && round.secret && getNet().host && round.elapsed - clueAt.current >= 1) {
      clueAt.current = round.elapsed
      for (const p of round.players) if (!p.bot && !p.left && p.role === 'adviser' && !p.mine) sendToRoom({ tag: TAG, kind: 'clue', to: p.id, round: round.id, stage: round.stage, safe: round.secret.safe[round.stage] })
    }
    painted.current += dt
    if (painted.current >= 1 / 20) { painted.current = 0; render() }
  }, [link, round, playing])
  function say(event: FormEvent) {
    event.preventDefault()
    if (!message.trim() || !choosing || solo) return
    queue('say', undefined, message)
    setMessage('')
  }

  return <section className="trust-game" data-trust-game data-stage={round.stage} data-phase={round.phase} data-solo={solo ? 'true' : 'false'} data-selected={round.selected}>
    {!standalone && <FinishBridge round={round} />}
    <header className="trust-header">
      <div className="trust-title"><span className="trust-eyebrow">ONE VS EVERYONE</span><h1>Trust me, bro<span>.</span></h1></div>
      <div className="trust-rounds" aria-label="Round progress">{[5, 4, 3, 2].map((n, i) => <div key={n} className={`${i === round.stage ? 'current' : ''} ${round.history[i]?.ok ? 'won' : round.history[i] ? 'lost' : ''}`}><small>ROUND {i + 1}</small><b>{round.history[i] ? round.history[i].ok ? '✓' : '×' : `1/${n}`}</b></div>)}</div>
      <div className="trust-score"><strong>{round.successes}<span> / {TARGET}</span></strong><small>safe picks to win</small></div>
    </header>
    <div className="trust-body">
      <div className="trust-stage-wrap">
        <div className="trust-stage-note"><span className="trust-dot" /> {round.over ? 'THE VERDICT IS IN' : round.phase === 'reveal' ? 'LET’S SEE WHO YOU TRUSTED' : 'ONE SAFE DOOR. A LOT OF OPINIONS.'}</div>
        <div className="trust-canvas" data-board><GameCanvas><Stage round={round} advance={advance} point={point} /></GameCanvas></div>
        <div className="trust-door-labels" style={{ gridTemplateColumns: `repeat(${doors(round)}, 1fr)` }}>
          {Array.from({ length: doors(round) }, (_, i) => <button key={i} data-door={i} onPointerEnter={() => point(i)} onClick={() => point(i)} disabled={!choosing || solo} className={`${round.selected === i ? 'selected' : ''} ${result?.safe === i ? 'safe' : ''}`} aria-label={`Point to door ${i + 1}`}><span>DOOR</span><b>{String(i + 1).padStart(2, '0')}</b><div className="trust-point-dots">{round.players.filter((p) => !p.left && p.point === i).map((p) => <i key={p.id} title={nameOf(p.id)} style={{ background: COLOURS[round.players.indexOf(p) % COLOURS.length] }} />)}</div></button>)}
        </div>
        <div className="trust-bottom-status" aria-live="polite">
          {!me ? <><b>Waiting for the host’s deal…</b><span>You’ll join this round when it arrives.</span></> : round.over ? <><b>{round.winner === 'solo' ? 'The solo player wins.' : 'The bros win.'}</b><span>{round.successes} safe {round.successes === 1 ? 'pick' : 'picks'} · {round.history.length} rounds played</span></> : round.phase === 'reveal' ? <><b>{result?.ok ? 'Good call. Solid ground.' : result?.pick === null ? 'Time’s up. No door chosen.' : 'That trust was misplaced.'}</b><span>Door {result ? result.safe + 1 : '…'} was safe. {round.stage < 3 ? 'Next round coming up…' : 'Counting the final score…'}</span></> : <><b>{solo ? 'Your call. Who do you believe?' : `${nameOf(round.soloId)} is making the choice.`}</b><span>{solo ? 'A / W previous · D / S next · Space choose' : 'Move your mouse over a door to point. Say something convincing.'}</span></>}
        </div>
        {playing && round.phase === 'choose' && <div className="trust-timer" aria-label="Seconds left">{Math.ceil(Math.max(0, CHOOSE_SECONDS - round.phaseTime))}<small>SEC</small></div>}
      </div>
      <aside className="trust-advice">
        <div className="trust-advice-head"><span className="trust-eyebrow">THE PEANUT GALLERY</span><h2>{solo ? 'Somebody’s bluffing.' : 'Make it convincing.'}</h2><p>{solo ? 'They know the safe door. That doesn’t mean they’ll tell you.' : 'You can tell the truth. You can absolutely lie.'}</p></div>
        {!solo && me && <div className="trust-private-clue" data-clue={safeClue ?? ''}><span>YOUR PRIVATE TIP</span><b>{safeClue === null ? 'Waiting for the tip…' : `Door ${safeClue + 1} is safe.`}</b><small>The solo player’s screen hides this tip.</small></div>}
        <div className="trust-messages" aria-live="polite">{round.players.filter((p) => p.role === 'adviser').map((p) => <article key={p.id} className={p.left ? 'left' : ''}>
          <div className="trust-message-author"><i style={{ background: COLOURS[round.players.indexOf(p) % COLOURS.length] }} /><b>{p.mine ? 'you' : nameOf(p.id)}</b>{p.point !== null && !p.left && <span>→ {p.point + 1}</span>}</div>
          <p>{p.left ? 'Left the room.' : p.text || (choosing ? 'Sizing up the doors…' : 'Waiting for the next round.')}</p>
        </article>)}{round.players.filter((p) => p.role === 'adviser' && !p.left).length === 0 && <p className="trust-empty">No advisers left. Go with your gut.</p>}</div>
        {!solo && me && <form onSubmit={say} className="trust-compose"><label htmlFor="trust-message">Your encouragement</label><div><input id="trust-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MESSAGE_MAX} disabled={!choosing} placeholder="Trust me. Door 3." autoComplete="off" /><button type="submit" disabled={!choosing || !message.trim()}>Send ↗</button></div><small>{message.length}/{MESSAGE_MAX} · Enter to send</small></form>}
        <div className="trust-rule"><b>Four rounds. One solo player.</b><span>Find solid ground twice to win. A fall costs a point, not your next round.</span></div>
      </aside>
    </div>
  </section>
}
