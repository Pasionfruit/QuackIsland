import { useCallback,useReducer,useRef,useState } from 'react'
import { GameCanvas } from '../../00-core'
import { getMyName,getNet,getPeers } from '../../09-net'
import { useFinish,type MinigameRun,type Standing } from '../../15-minigames'
import { activeTeam,PALETTE,projectPlayer,sequenceFor,type Round } from './rules'
import { newRound,waitingRound } from './setup'
import { useTugNet } from './net'
import { useTugControls } from './controls'
import { RopeScene } from './RopeScene'
import './tug.css'

export interface TugProps {run:Pick<MinigameRun,'phase'|'paused'>;initial?:Round;standalone?:boolean}
const nameOf=(id:string)=>id===getNet().id||id==='you'?getMyName()||'you':getPeers().find((p)=>p.id===id)?.name??id
export function standings(r:Round):Standing[]{return r.players.map((p,i)=>({id:p.id,mine:p.mine,name:p.mine?'you':nameOf(p.id),colour:PALETTE[i%PALETTE.length],place:!p.left&&p.role===r.winner?1:2}))}
function FinishBridge({round}:{round:Round}){useFinish(round.over,()=>standings(round));return null}
export function TugPanel({run,initial,standalone=false}:TugProps){
  const [round]=useState<Round>(()=>initial??(getNet().status==='joined'&&!getNet().host?waitingRound():newRound()))
  const [,repaint]=useReducer((n:number)=>n+1,0),painted=useRef(0)
  const me=round.players.find((p)=>p.mine),solo=me?.role==='solo',active=run.phase==='playing'&&!run.paused&&!round.over&&!!me&&!me.left
  const controls=useTugControls(round,active,repaint),link=useTugNet()
  const netPaused=run.paused||!['playing','finishing','over'].includes(run.phase)
  const advance=useCallback((dt:number)=>{
    link.advance(round,dt,controls.hands.current,netPaused)
    const own=round.players.find((p)=>p.mine)
    if(own)controls.pending.current=controls.pending.current.filter((press)=>press.round===round.id&&press.seq>own.ack)
    painted.current+=dt;if(painted.current>=1/30){painted.current=0;repaint()}
  },[link,round,netPaused,controls.hands,controls.pending])
  const projected=me?projectPlayer(me,controls.pending.current,round):null
  const sequence=projected?sequenceFor(round.seed,projected.id,projected.cycle):[]
  const team=activeTeam(round),bad=!!projected&&round.elapsed-projected.badAt<.35,pulse=!!projected&&round.elapsed-projected.lastAt<.13
  const minutes=Math.floor(round.elapsed/60),seconds=Math.floor(round.elapsed%60).toString().padStart(2,'0')
  return <section className="tug-game" data-tug-game data-role={me?.role??'waiting'} data-over={String(round.over)} data-pull={round.pull}>
    {!standalone&&<FinishBridge round={round}/>}
    <header className="tug-header"><div><span>NO ROOM FOR HALF-HEARTED EFFORT</span><h1>Tug-of-war<span>.</span></h1></div><div className={`tug-role ${solo?'solo':''}`}>{!me?'DEALING ROLES':solo?'YOU ARE THE SOLO':'YOU ARE ON THE TEAM'}</div><div className="tug-elapsed"><b>{minutes}:{seconds}</b><small>ELAPSED</small></div></header>
    <div className="tug-meter"><b>THE SOLO</b><div><i className="tug-meter-centre"/><span style={{left:`${(round.pull+1)*50}%`}}/><i className="tug-meter-left"/><i className="tug-meter-right"/></div><b>THE TEAM</b></div>
    <div className="tug-body"><div className="tug-main"><div className="tug-viewport" data-board><GameCanvas><RopeScene round={round} advance={advance}/></GameCanvas><div className="tug-vignette"/><div className="tug-objective">DRAG THE CENTRE FLAG ACROSS YOUR LINE.</div><div className="tug-side-label left">ONE OF YOU<span>SOLO</span></div><div className="tug-side-label right">ALL OF YOU<span>{team.length} ON THE TEAM</span></div></div>
      <div className={`tug-input ${bad?'bad':''} ${pulse?'pulse':''}`}>
        {!projected?<p>Waiting for the host’s first deal…</p>:<><div className="tug-input-copy"><span>{solo?'THE SIMPLE PART':'YOUR PERSONAL SEQUENCE'}</span><h2>{solo?'Give it everything.':bad?'Reset. Find your rhythm.':'Make every key count.'}</h2><p>{solo?'Tap 1 rapidly. Holding the key doesn’t count.':'Type left to right. A wrong key resets this sequence.'}</p></div>
        <div className={`tug-keys ${solo?'single':''}`} aria-label={solo?'Press 1 to pull':'Your randomized key sequence'}>{solo?<kbd data-next-key="1">1</kbd>:sequence.map((key,i)=><kbd key={`${projected.cycle}:${i}`} data-next-key={i===projected.cursor?key:undefined} className={`${i<projected.cursor?'done':''} ${i===projected.cursor?'next':''}`}>{key}<small>{i<projected.cursor?'✓':i===projected.cursor?'NEXT':i+1}</small></kbd>)}</div>
        <div className="tug-own-stats"><b data-correct={projected.correct}>{projected.correct}<small>YOUR PULLS</small></b>{!solo&&<b>{projected.cycle}<small>SEQUENCES</small></b>}</div></>}
      </div>
    </div><aside className="tug-sidebar"><span>{solo?'THE OTHER SIDE':'YOUR SIDE OF THE ROPE'}</span><h2>{solo?'Strength in numbers.':'In it together.'}</h2><p>{solo?'One button. One very determined opponent. You.':'Every correct key helps. Keep typing your own sequence.'}</p><div className="tug-roster">{round.players.filter((p)=>p.role==='team').map((p,i)=><article key={p.id} className={p.left?'left':''}><div><i style={{background:PALETTE[(i%(PALETTE.length-1))+1]}}/><b>{p.mine?'you':nameOf(p.id)}</b><span>{p.left?'left':`${p.correct} pulls`}</span></div><p>{[0,1,2,3].map((n)=><i key={n} className={n<p.cursor?'done':''}/>)}</p></article>)}</div><div className="tug-help"><b>First across wins.</b><p>Every successful input moves the rope. There’s no timeout and no passive drift.</p><small>Both sides are balanced for the number of active teammates.</small></div></aside></div>
    {round.over&&standalone&&<div className="tug-result" role="status"><span>THAT’S WHAT WE CALL COMMITMENT</span><h2>{round.winner==='solo'?'One was enough.':'Together takes it.'}</h2><p>{round.players.find((p)=>p.role==='solo')?.left?'The solo left the rope. The team wins.':!team.length?'The team let go. The solo wins.':round.winner==='solo'?'The solo pulled the centre flag across the line.':'The team pulled the centre flag across the line.'}</p><div><b>{round.players.filter((p)=>p.role==='solo').reduce((n,p)=>n+p.correct,0)}<small>SOLO PULLS</small></b><b>{round.players.filter((p)=>p.role==='team').reduce((n,p)=>n+p.correct,0)}<small>TEAM PULLS</small></b><b>{round.elapsed.toFixed(1)}<small>SECONDS</small></b></div><small>Choose New round above for another pull.</small></div>}
    <footer className="tug-footer"><span>{solo?'ONE KEY. ALL YOUR EFFORT.':'A DIFFERENT SEQUENCE. A SHARED GOAL.'}</span><p>{round.over?'ROUND ENDED':run.paused?'TAKE A BREATH':solo?'1 to pull · press and release for every tap':'Keyboard to pull · follow the highlighted key'}</p></footer>
  </section>
}
