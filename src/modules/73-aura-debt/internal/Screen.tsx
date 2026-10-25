import { useCallback, useEffect, useRef, useState } from 'react'
import { myId, useArenaNet } from '../../68-minigame-kit'
import { useFinish, type MinigameRun } from '../../15-minigames'
import { arenaRules } from './arena'
import { AURA, TRAPS, clamp, difficulty, neutralHands, speed, standings, type Round, type TrapKind } from './rules'
import { AuraScene, type View } from './Scene'
import './style.css'

const LABELS: Record<TrapKind,string> = { crate:'Crate', slick:'Oil slick', gust:'Crosswind' }
const HELP: Record<TrapKind,string> = { crate:'Hard impact · narrow target', slick:'Low grip · makes steering slippery', gust:'Wide push · knocks balance sideways' }

export function AuraDebtGame({ round:r, playing=true, paused=false, onFinish }: {
  round: Round; playing?: boolean; paused?: boolean; onFinish?: (r:Round)=>void
}) {
  const link = useArenaNet(arenaRules)
  const hands = useRef(neutralHands()), view = useRef<View>({yaw:0,pitch:0}), keys = useRef(new Set<string>())
  const [, redraw] = useState(0)
  const [selected, setSelected] = useState<TrapKind>('crate')
  const [dragging, setDragging] = useState(false)
  const mine = r.players.find(p=>p.id===myId() || p.mine)
  const rider = mine?.id === r.oneId
  const finished = useRef(false)

  useEffect(() => {
    hands.current=neutralHands(); keys.current.clear(); view.current={yaw:0,pitch:0}; finished.current=false
  },[r])
  useEffect(() => {
    const held=keys.current
    const clear=()=>held.clear()
    if (!playing || paused || r.over) clear()
    const down=(e:KeyboardEvent)=>{
      if (!playing || paused || r.over || (e.target instanceof HTMLElement && ['INPUT','TEXTAREA'].includes(e.target.tagName))) return
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) { e.preventDefault(); held.add(e.code) }
    }
    const up=(e:KeyboardEvent)=>held.delete(e.code)
    window.addEventListener('keydown',down); window.addEventListener('keyup',up); window.addEventListener('blur',clear)
    document.addEventListener('visibilitychange',clear)
    return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);clear()}
  },[playing,paused,r])
  useEffect(()=>{
    let request=0, previous=performance.now(), lastPaint=0
    const frame=(now:number)=>{
      const dt=Math.min((now-previous)/1000,.1); previous=now
      const k=keys.current, h=hands.current
      h.steer=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'))
      h.throttle=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'))
      link.advance(r,dt,playing && !paused ? h : null,!playing||paused)
      if(r.over && !finished.current){finished.current=true;onFinish?.(r)}
      if(now-lastPaint>33){redraw(n=>n+1);lastPaint=now}
      request=requestAnimationFrame(frame)
    }
    request=requestAnimationFrame(frame)
    return ()=>cancelAnimationFrame(request)
  },[link,r,playing,paused,onFinish])

  const release=()=>{if(playing&&!paused&&!r.over&&!rider&&mine&&!mine.left){hands.current.sequence++;redraw(n=>n+1)}}
  const choose=(trap:TrapKind)=>{hands.current.trap=trap;setSelected(trap)}
  return <section className="aura-game" aria-label="Aura Debt skateboard arena">
    <div className="aura-viewport" onPointerDown={e=>{if(e.button!==0)return;if(rider){setDragging(true);e.currentTarget.setPointerCapture(e.pointerId)}else release()}}
      onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)}
      onPointerMove={e=>{if(rider){if(dragging){view.current.yaw=clamp(view.current.yaw-e.movementX*.006,-1.1,1.1);view.current.pitch=clamp(view.current.pitch+e.movementY*.008,-.5,1)}}}}>
      <AuraScene round={r} rider={rider} hands={hands.current} view={view.current}/>
    </div>
    <header className="aura-top"><div><span className="aura-eyebrow">ONE VS ALL / SKATE SURVIVAL</span><h1>AURA DEBT<span>Keep your balance. Keep your aura.</span></h1></div>
      <div className="aura-clock"><strong>{Math.max(0,AURA.duration-r.elapsed).toFixed(1)}<small>s</small></strong><span>SURVIVE TO ZERO</span></div></header>
    <aside className="aura-stats"><span className="aura-role">{rider?'YOU ARE THE RIDER':mine?'YOU CONTROL THE TRAPS':'SPECTATING'}</span>
      <label>STABILITY <strong>{Math.max(0,Math.round(r.stability))}%</strong><meter min={0} max={100} low={35} value={Math.max(0,r.stability)}/></label>
      <label>BALANCE <strong>{r.slippery>0?'SLIPPERY!':'LEAN'}</strong><div className="aura-balance"><i style={{left:`${clamp(50+r.balance*47,3,97)}%`}}/></div></label>
      <div className="aura-numbers"><span>{Math.round(r.distance)} m</span><span>{speed(r).toFixed(1)} m/s</span></div>
      <p>COURSE INTENSITY {Math.round(difficulty(r)*100)}%</p><progress max={100} value={difficulty(r)*100}/>
    </aside>
    <footer className="aura-bottom">{rider?<><strong>Stay on the board.</strong><p><kbd>W</kbd> Accelerate <kbd>S</kbd> Brake <kbd>A</kbd><kbd>D</kbd> Steer / countersteer</p><span>Drag mouse to look · glowing rings warn of incoming traps</span></>:
      <><div className="aura-traps">{TRAPS.map(trap=><button key={trap} aria-pressed={selected===trap} onClick={()=>choose(trap)}><b>{LABELS[trap]}</b><span>{HELP[trap]}</span></button>)}</div>
      <p>Move mouse to aim across the course · Left click the course to release</p><strong>{!mine?'Watching this round':mine.cooldown>0?`Recharging ${mine.cooldown.toFixed(1)}s`:'TRAP READY'} · {LABELS[selected]}</strong></>}
    </footer>
    {(!playing||paused)&&!r.over&&<div className="aura-cover"><h2>{paused?'PAUSED':'GET READY'}</h2><p>{rider?'You are riding. Dodge hazards and survive 90 seconds.':'Aim traps ahead of the rider and knock them off.'}</p></div>}
    {r.over&&<div className="aura-cover aura-result"><span className="aura-eyebrow">ROUND RESULT</span><h2>{r.winner==='rider'?'AURA INTACT':'AURA LOST'}</h2><p>{r.reason}</p><strong>{r.elapsed.toFixed(1)} seconds · {Math.round(r.distance)} metres</strong><p>{r.winner==='rider'?'The rider wins':'The trap operators win'}</p></div>}
  </section>
}

export function AuraDebtPanel({run}:{run:MinigameRun}) {
  const round=run.game as Round
  const [,refresh]=useState(0)
  const finished=useCallback(()=>refresh(n=>n+1),[])
  useFinish(round.over,()=>standings(round))
  return <AuraDebtGame round={round} playing={run.phase==='playing'} paused={run.paused} onFinish={finished}/>
}
