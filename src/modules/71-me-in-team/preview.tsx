import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createLobby, getNet, getPeers, isHost, joinLobby, leaveLobby, makeCode, sendToRoom, subscribeRoom, useNet, usePeers } from '../09-net'
import { chooseTheOne, CountOver, useTheOne, type RunPhase } from '../15-minigames'
import { isCount, myId } from '../68-minigame-kit'
import { TeamPanel } from './internal/TeamPanel'
import { gameRoster, nextSeed } from './internal/setup'
import { TAG } from './internal/wire'
import './internal/preview.css'

interface Session { id: number; go: number; phase: RunPhase; paused: boolean }
function Preview() {
  const net=useNet(), peers=usePeers(), chosen=useTheOne()
  const [session,setSession]=useState<Session|null>(null),[name,setName]=useState('player'),[code,setCode]=useState(''),[clock,setClock]=useState(Date.now()),[notice,setNotice]=useState('')
  const host=useRef<string|null>(null), joined=net.status==='joined', mayControl=!joined||net.host
  const roster=gameRoster().filter((p)=>!p.bot)
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),100);return()=>window.clearInterval(timer)},[])
  useEffect(()=>subscribeRoom((from,raw)=>{
    if(raw.tag!==TAG||raw.kind!=='preview'||!isHost(from,[myId(),...getPeers().map((p)=>p.id)]))return
    if(raw.action==='start'&&isCount(raw.id)&&typeof raw.go==='number'&&Number.isFinite(raw.go)&&Math.abs(raw.go-Date.now())<10000&&typeof raw.solo==='string'){
      host.current=from;chooseTheOne(raw.solo);setNotice('');setSession({id:raw.id as number,go:raw.go,phase:'counting',paused:false})
    }else if(raw.action==='pause'&&typeof raw.paused==='boolean')setSession((s)=>s&&s.id===raw.id?{...s,paused:raw.paused as boolean}:s)
  }),[])
  useEffect(()=>{if(session?.phase==='counting'&&clock>=session.go)setSession((s)=>s&&{...s,phase:'playing'})},[clock,session])
  useEffect(()=>{
    if(host.current&&host.current!==myId()&&!peers.some((p)=>p.id===host.current)){host.current=null;setSession(null);setNotice('The host left. The new host can start a fresh round.')}
  },[peers])
  function start(){
    if(!mayControl)return
    const solo=roster.find((p)=>p.id===chosen)?.id??myId(),next:Session={id:nextSeed(),go:Date.now()+3500,phase:'counting',paused:false}
    chooseTheOne(solo);host.current=myId();setNotice('');setSession(next)
    if(joined)sendToRoom({tag:TAG,kind:'preview',action:'start',...next,solo})
  }
  function pause(){if(!mayControl||!session||session.phase!=='playing')return;setSession({...session,paused:!session.paused});if(joined)sendToRoom({tag:TAG,kind:'preview',action:'pause',id:session.id,paused:!session.paused})}
  return <main className="team-preview" data-run-phase={session?.phase??'lobby'} data-paused={String(session?.paused??false)}>
    <nav className="team-preview-nav"><a href="./preview.html">ME IN TEAM <small>PLAYABLE PREVIEW</small></a><div>
      {joined?<><span>{net.room} · {peers.length+1} players · {net.host?'host':'guest'}</span><button onClick={()=>{setSession(null);leaveLobby()}}>Leave</button></>:<><input aria-label="Player name" value={name} maxLength={20} onChange={(e)=>setName(e.target.value)}/><button onClick={()=>{setSession(null);createLobby(makeCode(),name)}}>Create lobby</button><input aria-label="Lobby code" placeholder="CODE" value={code} maxLength={5} onChange={(e)=>setCode(e.target.value.toUpperCase())}/><button disabled={code.length!==5} onClick={()=>{setSession(null);joinLobby(code,name)}}>Join</button></>}
      {mayControl&&<><select aria-label="Solo player" value={chosen??myId()} onChange={(e)=>chooseTheOne(e.target.value)}>{roster.map((p)=><option key={p.id} value={p.id}>{p.id===myId()?'you':peers.find((other)=>other.id===p.id)?.name??p.id} as solo</option>)}</select><button className="team-preview-start" data-preview-start onClick={start}>{session?'New round':'Play'}</button></>}
      {mayControl&&session&&<button data-preview-pause disabled={session.phase!=='playing'} onClick={pause}>{session.paused?'Resume':'Pause'}</button>}
    </div></nav>
    {(notice||net.why)&&<div className="team-preview-notice" role="status">{notice||net.why}</div>}
    <div className="team-preview-content">{session?<><TeamPanel key={session.id} run={session} standalone/>{session.phase==='counting'&&<div className="team-countdown"><CountOver left={Math.max(0,(session.go-clock)/1000)}/></div>}{session.paused&&<div className="team-preview-pause"><span>EVERYONE STAYS CONNECTED</span><h2>Pause the pull.</h2><p>The clock and chain are stopped for everyone.</p></div>}</>:<div className="team-welcome"><span className="team-welcome-kicker">ONE VS EVERYONE. ATTACHMENTS INCLUDED.</span><h1><em>ME</em> in Team<span>.</span></h1><p>A little independence goes a long way.<br/>Unless an entire team is standing in your way.</p><div className="team-welcome-chain"><i/><b>∞</b><i/><b>∞</b><i/><b>∞</b><i/></div><div className="team-welcome-rules"><article><span>THE ME</span><h2>Find your own way.</h2><p>Collect flags 1, 2 and 3.<br/>Reach the exit before 60 seconds.<br/>Go around the chain. Outmaneuver the team.</p></article><article><span>THE TEAM</span><h2>Pull your weight.</h2><p>You’re physically chained together.<br/>Coordinate WASD to move and block.<br/>Keep the solo off the exit until time runs out.</p></article></div><div className="team-welcome-controls"><kbd>WASD</kbd> Move <kbd>MOUSE</kbd> Camera <span>·</span> 3+ players for a human chain</div>{mayControl?<button onClick={start}>Let’s see who needs whom ↗</button>:<p>Waiting for the host to start…</p>}<small>Playing alone? Four stand-ins will form the opposing chain.</small></div>}</div>
  </main>
}
Object.assign(window,{__teamPreview:{createLobby,joinLobby,leaveLobby,getNet,getPeers,chooseTheOne,makeCode}})
createRoot(document.getElementById('root')!).render(<Preview/> )
