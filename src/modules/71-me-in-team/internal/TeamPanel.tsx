import { useCallback, useReducer, useRef, useState } from 'react'
import { GameCanvas } from '../../00-core'
import { getMyName, getNet, getPeers } from '../../09-net'
import { useFinish, type MinigameRun, type Standing } from '../../15-minigames'
import { courseFor } from './course'
import { activeTeam, DURATION, PALETTE, type Round } from './rules'
import { newRound, waitingRound } from './setup'
import { useTeamNet } from './net'
import { useTeamControls } from './controls'
import { Arena } from './Arena'
import './team.css'

export interface TeamProps { run: Pick<MinigameRun, 'phase' | 'paused'>; initial?: Round; standalone?: boolean }
const nameOf = (id: string) => id === getNet().id || id === 'you' ? getMyName() || 'you' : getPeers().find((p) => p.id === id)?.name ?? id
export function standings(r: Round): Standing[] { return r.players.map((p, i) => ({ id: p.id, name: p.mine ? 'you' : nameOf(p.id), mine: p.mine, colour: PALETTE[i % PALETTE.length], place: !p.left && p.role === r.winner ? 1 : 2 })) }
function FinishBridge({ round }: { round: Round }) { useFinish(round.over, () => standings(round)); return null }
function CourseMap({ round }: { round: Round }) {
  const course = courseFor(round.seed), team = activeTeam(round)
  return <div className="team-map"><span>THE COURSE</span><svg viewBox="-14 -25 28 50" aria-label="Course map: player positions, flags and exit">
    <rect x={-13} y={-24} width={26} height={48} rx={1} fill="#e6e5d7" />
    {course.obstacles.map((c, i) => <rect key={i} x={c.x-c.w/2} y={c.z-c.d/2} width={c.w} height={c.d} rx={.2} fill="#b5c5bf" />)}
    {team.slice(1).map((p, i) => <line key={p.id} x1={team[i].x} y1={team[i].z} x2={p.x} y2={p.z} stroke="#718f90" strokeWidth={.25} />)}
    {course.checkpoints.map((p, i) => <g key={i}><circle cx={p.x} cy={p.z} r={1.5} fill={i < round.checkpoint ? '#90baa3' : i === round.checkpoint ? '#e1b268' : '#d3d1c1'} /><text x={p.x} y={p.z+.75} textAnchor="middle" fill="#fff9de" fontSize={2} fontWeight="bold">{i+1}</text></g>)}
    <rect x={-2} y={-21.5} width={4} height={1} fill="#729792" />
    {round.players.filter((p) => !p.left).map((p, i) => <circle key={p.id} cx={p.x} cy={p.z} r={p.mine ? .85 : .6} fill={p.role === 'solo' ? '#d59e51' : PALETTE[(i % (PALETTE.length-1))+1]} stroke={p.mine ? '#fff8d7' : '#ffffff70'} strokeWidth={.25} />)}
  </svg><small>● SOLO <i/> — CHAINED TEAM</small></div>
}
export function TeamPanel({ run, initial, standalone = false }: TeamProps) {
  const [round] = useState<Round>(() => initial ?? (getNet().status === 'joined' && !getNet().host ? waitingRound() : newRound()))
  const [, render] = useReducer((n: number) => n + 1, 0)
  const board = useRef<HTMLDivElement>(null), timer = useRef(0)
  const me = round.players.find((p) => p.mine), solo = me?.role === 'solo'
  const active = run.phase === 'playing' && !run.paused && !round.over && !!me && !me.left
  const controls = useTeamControls(board, round, active), link = useTeamNet()
  const netPaused = run.paused || !['playing', 'finishing', 'over'].includes(run.phase)
  const advance = useCallback((dt: number) => { link.advance(round, dt, controls.hands.current, netPaused); timer.current += dt; if (timer.current >= 1/25) { timer.current = 0; render() } }, [link, round, controls.hands, netPaused])
  const course = courseFor(round.seed), runner = round.players.find((p) => p.id === round.soloId), target = course.checkpoints[round.checkpoint] ?? course.finish
  const distance = runner ? Math.hypot(target.x-runner.x, target.z-runner.z) : 0
  const team = activeTeam(round)
  return <section className="team-game" data-team-game data-role={me?.role ?? 'waiting'} data-over={String(round.over)} data-checkpoint={round.checkpoint}>
    {!standalone && <FinishBridge round={round} />}
    <header className="team-header"><div className="team-title"><span>TOGETHER, WHETHER YOU LIKE IT OR NOT</span><h1><em>ME</em> in Team<span>.</span></h1></div><div className={`team-role ${solo ? 'solo' : ''}`}>{!me ? 'DEALING ROLES' : solo ? 'YOU ARE THE SOLO' : 'YOU ARE CHAINED'}</div><div className="team-time"><b>{Math.ceil(Math.max(0,DURATION-round.elapsed)).toString().padStart(2,'0')}</b><span>SECONDS<br/>TO BREAK FREE</span></div></header>
    <div className="team-progress"><span>THE SOLO’S ROUTE</span><div>{['FLAG 01','FLAG 02','FLAG 03','EXIT'].map((label,i) => <article key={label} className={`${i < round.checkpoint ? 'done' : ''} ${i === round.checkpoint ? 'current' : ''}`}><i>{i < round.checkpoint ? '✓' : i === 3 ? '↗' : i+1}</i><b>{label}</b>{i < 3 && <small>→</small>}</article>)}</div></div>
    <div className="team-viewport" ref={board} data-board onPointerDown={(e) => { if(e.button===0)controls.capture() }} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas><Arena round={round} hands={controls.hands} advance={advance} /></GameCanvas>
      <div className="team-vignette" />
      <div className="team-next"><span className="team-live-dot"/><b>{round.checkpoint < 3 ? `FLAG ${round.checkpoint+1}` : 'MAKE THE EXIT'}</b><small>{Math.round(distance)} m for the solo</small></div>
      <CourseMap round={round} />
      <div className="team-roster"><span>{solo ? 'THE HUMAN ROADBLOCK' : 'YOUR VERY ATTACHED TEAM'}</span><div>{team.map((p,i) => <article key={p.id}><i style={{background:PALETTE[(round.players.indexOf(p) % (PALETTE.length-1))+1]}}/><b>{p.mine ? 'you' : nameOf(p.id)}</b>{i < team.length-1 && <small>∞</small>}</article>)}</div></div>
      {!solo && <div className={`team-tension ${round.tension > .97 ? 'taut' : ''}`}><div><i>∞</i><b>{team.length < 2 ? 'LAST TEAMMATE STANDING' : round.tension > .97 ? 'THE CHAIN IS TAUT' : 'A LITTLE SLACK. USE IT.'}</b></div><span><i style={{width:`${Math.round(round.tension*100)}%`}}/></span><small>{team.length < 2 ? 'Block the runner. Hold out until the clock ends.' : 'Pull together to move. Opposite directions drag everyone.'}</small></div>}
      {!controls.locked && !round.over && <div className="team-capture"><b>{me ? 'Click the course to take the camera.' : 'Waiting for the host’s deal…'}</b><span>WASD moves relative to your view · mouse turns the camera · Esc releases it</span></div>}
      {round.over && standalone && <div className="team-result" role="status"><span>NO ONE GETS THERE ALONE. EXCEPT…</span><h2>{round.winner==='solo' ? 'The ME wins.' : 'The team holds.'}</h2><p>{round.winner==='solo' ? team.length ? 'Three flags. One exit. Nobody holding you back.' : 'The opposing team left the course.' : runner?.left ? 'The solo left the course. The chain takes the win.' : 'The solo ran out of time. Coordination won the day.'}</p><div><b>{round.checkpoint}<small>FLAGS COLLECTED</small></b><b>{round.elapsed.toFixed(1)}<small>SECONDS PLAYED</small></b></div><small>Choose New round above to go again.</small></div>}
    </div>
    <footer className="team-footer"><p>{solo ? 'Collect the flags in order. Find a way around the chain.' : 'Stay connected. Cut off the runner. Make the minute last.'}</p><div><kbd>WASD</kbd> Move <kbd>MOUSE</kbd> Camera <kbd>ESC</kbd> Release</div></footer>
  </section>
}
