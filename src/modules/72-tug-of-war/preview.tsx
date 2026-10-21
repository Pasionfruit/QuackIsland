import { useEffect,useRef,useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createLobby,getNet,getPeers,isHost,joinLobby,leaveLobby,makeCode,sendToRoom,subscribeRoom,useNet,usePeers } from '../09-net'
import { chooseTheOne,CountOver,useTheOne,type RunPhase } from '../15-minigames'
import { isCount,myId } from '../68-minigame-kit'
import { TugPanel } from './internal/TugPanel'
import { gameRoster,nextSeed } from './internal/setup'
import { TAG } from './internal/wire'
import './internal/preview.css'
interface Session {id:number;go:number;phase:RunPhase;paused:boolean}
function Preview(){
  const net=useNet(),peers=usePeers(),chosen=useTheOne()
  const [session,setSession]=useState<Session|null>(null),[name,setName]=useState('player'),[code,setCode]=useState(''),[clock,setClock]=useState(Date.now()),[notice,setNotice]=useState('')
  const host=useRef<string|null>(null),joined=net.status==='joined',controller=!joined||net.host,roster=gameRoster().filter((p)=>!p.bot)
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),100);return()=>window.clearInterval(timer)},[])
  useEffect(()=>subscribeRoom((from,raw)=>{
    if(raw.tag!==TAG||raw.kind!=='preview'||!isHost(from,[myId(),...getPeers().map(p=>p.id)]))return
    if(raw.action==='start'&&isCount(raw.id)&&typeof raw.go==='number'&&Number.isFinite(raw.go)&&Math.abs(raw.go-Date.now())<10000&&typeof raw.solo==='string'){
      host.current=from;chooseTheOne(raw.solo);setNotice('');setSession({id:raw.id as number,go:raw.go,phase:'counting',paused:false})
    }else if(raw.action==='pause'&&typeof raw.paused==='boolean')setSession(s=>s&&s.id===raw.id?{...s,paused:raw.paused as boolean}:s)
  }),[])
  useEffect(()=>{if(session?.phase==='counting'&&clock>=session.go)setSession(s=>s&&{...s,phase:'playing'})},[clock,session])
  useEffect(()=>{if(host.current&&host.current!==myId()&&!peers.some(p=>p.id===host.current)){host.current=null;setSession(null);setNotice('The host left. The new host can start a fresh pull.')}},[peers])
  function start(){
    if(!controller)return
    const solo=roster.find(p=>p.id===chosen)?.id??myId(),next:Session={id:nextSeed(),go:Date.now()+3500,phase:'counting',paused:false}
    host.current=myId();chooseTheOne(solo);setNotice('');setSession(next)
    if(joined)sendToRoom({tag:TAG,kind:'preview',action:'start',...next,solo})
  }
  function pause(){if(!controller||!session||session.phase!=='playing')return;setSession({...session,paused:!session.paused});if(joined)sendToRoom({tag:TAG,kind:'preview',action:'pause',id:session.id,paused:!session.paused})}
  return <main className="tug-preview" data-run-phase={session?.phase??'lobby'} data-paused={String(session?.paused??false)}>
    <nav className="tug-preview-nav"><a href="./preview.html">TUG-OF-WAR <small>PLAYABLE PREVIEW</small></a><div>
      {joined?<><span>{net.room} · {peers.length+1} players · {net.host?'host':'guest'}</span><button onClick={()=>{setSession(null);leaveLobby()}}>Leave</button></>:<><input aria-label="Player name" maxLength={20} value={name} onChange={e=>setName(e.target.value)}/><button onClick={()=>{setSession(null);createLobby(makeCode(),name)}}>Create lobby</button><input aria-label="Lobby code" maxLength={5} placeholder="CODE" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button disabled={code.length!==5} onClick={()=>{setSession(null);joinLobby(code,name)}}>Join</button></>}
      {controller&&<><select aria-label="Solo player" value={chosen??myId()} onChange={e=>chooseTheOne(e.target.value)}>{roster.map(p=><option key={p.id} value={p.id}>{p.id===myId()?'you':peers.find(other=>other.id===p.id)?.name??p.id} as solo</option>)}</select><button className="tug-preview-start" data-preview-start onClick={start}>{session?'New round':'Play'}</button></>}
      {controller&&session&&<button data-preview-pause disabled={session.phase!=='playing'} onClick={pause}>{session.paused?'Resume':'Pause'}</button>}
    </div></nav>
    {(notice||net.why)&&<div className="tug-preview-notice" role="status">{notice||net.why}</div>}
    <div className="tug-preview-content">{session?<><TugPanel key={session.id} run={session} standalone/>{session.phase==='counting'&&<div className="tug-countdown"><CountOver left={Math.max(0,(session.go-clock)/1000)}/></div>}{session.paused&&<div className="tug-preview-pause"><span>THE ROPE ISN’T GOING ANYWHERE</span><h2>Let your fingers breathe.</h2><p>The pull is paused for everyone.</p></div>}</>:<div className="tug-welcome"><span>ONE BUTTON. MANY FINGERS. ZERO EXCUSES.</span><h1>Tug-of-war<span>.</span></h1><p>One very determined player.<br/>One team trying to spell their way to victory.</p><div className="tug-welcome-rope"><i/><b/><span>↔</span><b/><i/></div><div className="tug-welcome-rules"><article><span>THE SOLO</span><h2>Keep it simple.</h2><kbd>1</kbd><p>Tap 1 as quickly as you can.<br/>Every fresh press pulls your way.<br/>Holding the key doesn’t count.</p></article><article><span>THE TEAM</span><h2>Find your rhythm.</h2><div>{['A','S','J','K'].map(k=><kbd key={k}>{k}</kbd>)}</div><p>Type your displayed four-key sequence.<br/>Each correct key pulls for your team.<br/>A wrong key resets your sequence.</p></article></div><p className="tug-welcome-goal">First to pull the centre flag across their line wins.</p>{controller?<button onClick={start}>Let’s settle this ↗</button>:<p>Waiting for the host to start…</p>}<small>Playing alone? Four stand-ins will take the other end.</small></div>}</div>
  </main>
}
Object.assign(window,{__tugPreview:{createLobby,joinLobby,leaveLobby,getNet,getPeers,chooseTheOne,makeCode}})
createRoot(document.getElementById('root')!).render(<Preview/> )
