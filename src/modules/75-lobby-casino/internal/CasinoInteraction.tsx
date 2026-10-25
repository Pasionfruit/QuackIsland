import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PRIORITY, useGameFrame } from '../../00-core'
import { getPlayerState, isPlayerInputLocked } from '../../02-player'
import { CasinoPanel } from './CasinoPanel'
import { CASINO_NAMES, type CasinoKind, type CasinoStation } from './layout'

export function nearestCasino(stations:readonly CasinoStation[],player:{x:number;y:number;z:number}|null):CasinoStation|null {
  if(!player)return null
  let nearest:CasinoStation|null=null,distance=3.6
  for(const station of stations){
    const d=Math.hypot(player.x-station.x,player.z-station.z)
    if(d<distance&&Math.abs(player.y-station.y)<2.5){nearest=station;distance=d}
  }
  return nearest
}

/** DOM uses its own React root because this controller mounts in the R3F scene. */
export function CasinoInteraction({stations,enabled,lockInput}:{
  stations:readonly CasinoStation[];enabled:boolean;lockInput:(owner:string)=>()=>void
}){
  const [near,setNear]=useState<CasinoKind|null>(null),[open,setOpen]=useState<CasinoKind|null>(null)
  const nearNow=useRef<CasinoKind|null>(null),elapsed=useRef(0),release=useRef<(()=>void)|null>(null)
  const dom=useRef<Root|null>(null)
  const close=useCallback(()=>{release.current?.();release.current=null;setOpen(null)},[])
  const show=useCallback((game:CasinoKind)=>{
    if(release.current||!enabled||isPlayerInputLocked()||nearestCasino(stations,getPlayerState())?.kind!==game)return
    release.current=lockInput('lobby-casino')
    if(document.pointerLockElement)document.exitPointerLock()
    nearNow.current=null;setOpen(game);setNear(null)
  },[lockInput,enabled,stations])
  useGameFrame((_frame,dt)=>{
    elapsed.current+=dt
    if(elapsed.current<.15)return
    elapsed.current=0
    const kind=enabled&&open===null&&!isPlayerInputLocked()?nearestCasino(stations,getPlayerState())?.kind??null:null
    if(nearNow.current!==kind){nearNow.current=kind;setNear(kind)}
  },PRIORITY.post)
  useEffect(()=>{
    const container=document.createElement('div');container.dataset.casinoOverlay='true';document.body.append(container)
    const root=createRoot(container);dom.current=root
    return ()=>{
      release.current?.();release.current=null;dom.current=null
      queueMicrotask(()=>{root.unmount();container.remove()})
    }
  },[])
  useEffect(()=>{
    dom.current?.render(<>
      {enabled&&near&&open===null&&<button className="casino-nearby" onClick={()=>show(near)}>Play {CASINO_NAMES[near]}<kbd>G</kbd></button>}
      {enabled&&open&&<CasinoPanel key={open} game={open} onClose={close}/>}
    </>)
  },[enabled,near,open,show,close])
  useEffect(()=>{if(!enabled)close()},[enabled,close])
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.code!=='KeyG'||event.repeat||event.ctrlKey||event.altKey||event.metaKey||!enabled||open||isPlayerInputLocked()||!nearNow.current)return
      const target=event.target as HTMLElement|null
      if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable))return
      event.preventDefault();event.stopPropagation();show(nearNow.current)
    }
    window.addEventListener('keydown',key,true)
    return ()=>window.removeEventListener('keydown',key,true)
  },[enabled,open,show])
  return null
}
