import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { myId } from '../68-minigame-kit'
import { AuraDebtGame, newRound } from './index'

function Preview() {
  const [round,setRound]=useState(()=>newRound())
  const [paused,setPaused]=useState(false)
  const restart=(trapper=false)=>{
    setPaused(false)
    // An explicit second human seat lets this preview inspect the trapper's UI.
    setRound(trapper?newRound({roster:[{id:myId(),bot:false},{id:'Preview rider',bot:false}],chosen:'Preview rider'}):newRound())
  }
  return <><AuraDebtGame round={round} paused={paused}/><nav className="aura-preview-controls" aria-label="Preview controls">
    <button onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button>
    <button onClick={()=>restart()}>Ride again</button><button onClick={()=>restart(true)}>Try traps</button>
  </nav></>
}
createRoot(document.getElementById('root')!).render(<Preview/>)
