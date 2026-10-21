import { useCallback, useReducer, useRef, useState } from 'react'
import { GameCanvas } from '../../00-core'
import { getMyName, getNet, getPeers } from '../../09-net'
import { useFinish, type MinigameRun, type Standing } from '../../15-minigames'
import { COOLDOWN, DURATION, PALETTE, standing, type Round } from './rules'
import { useDuckControls } from './controls'
import { useDuckNet } from './net'
import { Marsh } from './Marsh'
import { newRound, waitingRound } from './setup'
import './duck.css'

export interface DuckSznProps { run: Pick<MinigameRun, 'phase' | 'paused'>; initial?: Round; standalone?: boolean }
export function nameOf(id: string): string { return id === getNet().id || id === 'you' ? getMyName() || 'you' : getPeers().find((p) => p.id === id)?.name ?? id }
export function standings(r: Round): Standing[] {
  return r.players.map((p, i) => ({ id: p.id, mine: p.mine, name: p.mine ? 'you' : nameOf(p.id), colour: PALETTE[i % PALETTE.length], place: !p.left && p.role === r.winner ? 1 : 2 }))
}
function FinishBridge({ round }: { round: Round }) { useFinish(round.over, () => standings(round)); return null }

export function DuckSznPanel({ run, initial, standalone = false }: DuckSznProps) {
  const [round] = useState<Round>(() => initial ?? (getNet().status === 'joined' && !getNet().host ? waitingRound() : newRound()))
  const [, render] = useReducer((n: number) => n + 1, 0)
  const board = useRef<HTMLDivElement>(null)
  const me = round.players.find((p) => p.mine)
  const active = run.phase === 'playing' && !run.paused && !round.over
  const netPaused = run.paused || !['playing', 'finishing', 'over'].includes(run.phase)
  const controls = useDuckControls(board, round, active)
  const link = useDuckNet()
  const painted = useRef(0)
  const advance = useCallback((dt: number) => {
    link.advance(round, dt, controls.hands.current, netPaused)
    painted.current += dt
    if (painted.current >= 1 / 25) { painted.current = 0; render() }
  }, [link, round, netPaused, controls.hands])
  const ducks = round.players.filter((p) => p.role === 'duck')
  const alive = ducks.filter(standing).length
  const hunter = me?.role === 'hunter'
  const spectating = !!me && (!me.alive || me.left)
  const left = Math.max(0, DURATION - round.elapsed)
  const ready = me ? Math.min(1, Math.max(0, (round.elapsed - me.lastShot) / COOLDOWN)) : 1
  const hit = hunter && !!round.shot?.victim && round.elapsed - round.shot.at < 0.6
  const firing = hunter && !!me && round.elapsed - me.lastShot < 0.1
  return <section className="duck-game" data-duck-szn data-role={me?.role ?? 'waiting'} data-over={String(round.over)} data-hiding={String(!!me?.crouch)}>
    {!standalone && <FinishBridge round={round} />}
    <header className="duck-header"><div className="duck-brand"><span className="duck-brand-mark">↗</span><div><small>MARSHLAND PURSUIT</small><h1>Duck szn<span>.</span></h1></div></div><div className={`duck-role ${hunter ? 'hunter' : ''}`}>{!me ? 'Dealing roles…' : hunter ? 'YOU ARE THE HUNTER' : spectating ? 'YOU’RE SPECTATING' : 'YOU ARE A DUCK'}</div><div className="duck-clock" data-time={left.toFixed(2)}><strong>{Math.ceil(left).toString().padStart(2, '0')}</strong><span>SECONDS<br/>REMAINING</span></div></header>
    <div className={`duck-viewport ${firing ? 'firing' : ''}`} ref={board} data-board onPointerDown={(e) => controls.click(e.button)} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas><Marsh round={round} advance={advance} /></GameCanvas>
      <div className="duck-vignette" />
      <div className="duck-objective"><span className="duck-live-dot"/><span>{hunter ? 'FIND THEM. BEFORE THE MINUTE’S UP.' : spectating ? 'STAY WITH YOUR FLOCK.' : 'SMALL TARGET. BIG SURVIVAL INSTINCT.'}</span></div>
      <div className="duck-flock"><span>THE FLOCK</span><div>{ducks.map((p, i) => <i key={p.id} title={`${p.mine ? 'you' : nameOf(p.id)} · ${p.left ? 'left' : p.alive ? 'hiding' : 'tagged'}`} className={!standing(p) ? 'out' : ''} style={{ background: standing(p) ? PALETTE[(i + 1) % PALETTE.length] : undefined }} />)}</div><b>{alive}<small> / {ducks.length} ducks left</small></b></div>
      {me && !spectating && !round.over && <div className={`duck-reticle ${hit ? 'hit' : ''} ${hunter ? 'hunter' : 'duck'}`}><i/><i/><i/><i/><b>{hit ? '×' : '·'}</b></div>}
      {hunter && !spectating && !round.over && <div className="duck-gun" aria-hidden="true"><div className="duck-gun-barrel"/><div className="duck-gun-stock"/><div className="duck-gun-hand"/></div>}
      {!hunter && !spectating && me && <div className={`duck-hide-state ${me.crouch ? 'hiding' : ''}`}><span>{me.crouch ? '↓' : '↟'}</span><div><b>{me.crouch ? 'KEEPING A LOW PROFILE' : 'KEEP MOVING'}</b><small>{me.crouch ? 'Smaller silhouette · slower movement' : 'Hold Space to crouch behind low cover'}</small></div></div>}
      {hunter && <div className="duck-shot-state"><b>{hit ? 'GOT ONE.' : ready >= 1 ? 'READY WHEN YOU ARE' : 'STEADY…'}</b><span><i style={{ transform: `scaleX(${ready})` }}/></span><small>{me?.shots ?? 0} shots · {me?.kills ?? 0} tagged</small></div>}
      {!controls.locked && !round.over && <div className="duck-click-hint"><b>{spectating ? 'You’ve been tagged. Watch the flock.' : !me ? 'Waiting for the host…' : controls.lockProblem ? 'Click the marsh to try mouse capture again.' : 'Click the marsh to take the mouse.'}</b><span>{hunter ? 'WASD to move · mouse to aim · left click to shoot' : 'WASD to move · mouse to look · hold Space to hide'}</span></div>}
      {round.over && standalone && <div className="duck-result" role="status"><span>THAT’S THE SEASON</span><h2>{round.winner === 'hunter' ? 'Hunter wins.' : 'Ducks survive.'}</h2><p>{round.winner === 'hunter' ? 'Every duck was tagged before time ran out.' : round.players.find((p) => p.role === 'hunter')?.left ? 'The hunter left the marsh. The flock wins.' : `${alive} ${alive === 1 ? 'duck made' : 'ducks made'} it to the end of the minute.`}</p><div><b>{Math.min(60, round.elapsed).toFixed(1)}<small>SECONDS</small></b><b>{ducks.filter((p) => !p.alive).length}<small>TAGGED</small></b><b>{alive}<small>SURVIVED</small></b></div><small>Choose New hunt above for another round.</small></div>}
      {spectating && !round.over && <div className="duck-spectator">TAGGED · FOLLOWING A SURVIVOR</div>}
    </div>
    <footer className="duck-footer"><span><i/> {round.over ? 'HUNT ENDED' : 'ONE HUNTER. EVERYONE ELSE IS A DUCK.'}</span><div><kbd>WASD</kbd> Move <kbd>MOUSE</kbd> {hunter ? 'Aim' : 'Look'} <kbd>{hunter ? 'CLICK' : 'SPACE'}</kbd> {hunter ? 'Shoot' : 'Hold to hide'} <kbd>ESC</kbd> Release mouse</div></footer>
  </section>
}
