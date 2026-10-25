// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameCallback } from '../../00-core'
import { claimPlayerInput, isPlayerInputLocked } from '../../02-player'
import { layoutCasino } from '../internal/layout'

const mocks=vi.hoisted(()=>({frame:null as FrameCallback|null,player:{x:0,y:3,z:0}}))
vi.mock('../../00-core',async original=>({...await original<typeof import('../../00-core')>(),useGameFrame:(callback:FrameCallback)=>{mocks.frame=callback}}))
vi.mock('../../02-player',async original=>({...await original<typeof import('../../02-player')>(),getPlayerState:()=>mocks.player}))
vi.mock('../internal/CasinoPanel',()=>({CasinoPanel:({game,onClose}:{game:string;onClose:()=>void})=><button onClick={onClose}>Close {game}</button>}))
import { CasinoInteraction, nearestCasino } from '../internal/CasinoInteraction'

const stations=layoutCasino(()=>({height:3,slope:0,normalX:0,normalY:1,normalZ:0}))
let root:Root,host:HTMLDivElement
const frame=async()=>act(async()=>{mocks.frame!({} as Parameters<FrameCallback>[0],.2)})

beforeEach(()=>{
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  mocks.player={x:stations[0].x,y:3,z:stations[0].z+1}
})
afterEach(async()=>{await act(async()=>root.unmount());await Promise.resolve();host.remove()})

describe('nearby casino interaction',()=>{
  it('requires the player to be near a table and near its ground height',()=>{
    expect(nearestCasino(stations,{x:0,y:3,z:0})).toBeNull()
    expect(nearestCasino(stations,{...mocks.player,y:10})).toBeNull()
    expect(nearestCasino(stations,mocks.player)?.kind).toBe('blackjack')
  })
  it('opens with G, locks player input, and releases the lease when closed or unmounted',async()=>{
    await act(async()=>root.render(<CasinoInteraction stations={stations} enabled lockInput={claimPlayerInput}/>))
    await frame()
    expect(document.querySelector('.casino-nearby')?.textContent).toContain('Play Blackjack')
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',bubbles:true})))
    expect(isPlayerInputLocked()).toBe(true)
    const close=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Close blackjack')!
    await act(async()=>close.click());expect(isPlayerInputLocked()).toBe(false)
    await frame()
    const nearby=document.querySelector<HTMLButtonElement>('.casino-nearby')!
    const nearPlayer={...mocks.player};mocks.player={x:0,y:3,z:0}
    await act(async()=>nearby.click());expect(isPlayerInputLocked()).toBe(false)
    mocks.player=nearPlayer
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',bubbles:true})))
    expect(isPlayerInputLocked()).toBe(true)
    await act(async()=>root.render(null));await Promise.resolve()
    expect(isPlayerInputLocked()).toBe(false)
    expect(document.querySelector('[data-casino-overlay]')).toBeNull()
  })
  it('hides the prompt when another screen owns player input',async()=>{
    const release=claimPlayerInput('settings-test')
    try{
      await act(async()=>root.render(<CasinoInteraction stations={stations} enabled lockInput={claimPlayerInput}/>))
      await frame();expect(document.querySelector('.casino-nearby')).toBeNull()
      release();await frame();expect(document.querySelector('.casino-nearby')).not.toBeNull()
    }finally{release()}
  })
})
