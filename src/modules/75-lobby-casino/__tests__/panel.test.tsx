// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ticket } from '../internal/ledger'
import { playRound, totalReturn } from '../internal/rules'

const mocks=vi.hoisted(()=>({purse:{fish:100,shell:100,grape:100},resume:vi.fn(),begin:vi.fn(),action:vi.fn(),reset:vi.fn()}))
vi.mock('../../11-currency',async original=>({...await original<typeof import('../../11-currency')>(),usePurse:()=>mocks.purse}))
vi.mock('../internal/service',()=>({resumeCasino:mocks.resume,beginCasino:mocks.begin,actCasino:mocks.action,resetCasinoRecord:mocks.reset}))
import { CasinoPanel } from '../internal/CasinoPanel'

let root:Root,host:HTMLDivElement
const findButton=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!
const seedFor=(game:'roulette'|'blackjack',choice:string,outcome:string)=>{
  for(let seed=0;seed<10000;seed++)if(playRound(game,seed,choice).outcome===outcome)return seed
  throw Error('No UI test seed')
}
const saved=(overrides:Partial<Ticket>={}):Ticket=>({version:1,id:'panel:1',game:'roulette',currency:'fish',stake:10,seed:seedFor('roulette','red','win'),
  choice:'red',actions:[],stage:'complete',debitBefore:100,creditBefore:90,credited:20,...overrides})

beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks();mocks.purse={fish:100,shell:100,grape:100}
  mocks.resume.mockResolvedValue(null);mocks.begin.mockResolvedValue(saved());mocks.reset.mockResolvedValue(undefined)
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers()})

describe('casino wager panel',()=>{
  it('uses the selected resource and locks out duplicate clicks while a bet resolves',async()=>{
    await act(async()=>root.render(<CasinoPanel game="roulette" onClose={()=>{}}/>))
    await act(async()=>findButton('Fish').click())
    await act(async()=>{findButton('Spin').click();findButton('Spin').click();await vi.advanceTimersByTimeAsync(1000)})
    expect(mocks.begin).toHaveBeenCalledTimes(1)
    expect(mocks.begin.mock.calls[0][0]).toEqual({game:'roulette',currency:'fish',stake:10,choice:'red'})
    expect(host.textContent).toContain('Returned 20 fish')
    expect(host.textContent).toContain('Net +10')
  })
  it('never starts a wager when all purse balances are empty',async()=>{
    mocks.purse={fish:0,shell:0,grape:0}
    await act(async()=>root.render(<CasinoPanel game="roulette" onClose={()=>{}}/>))
    expect(findButton('Spin').disabled).toBe(true)
    await act(async()=>findButton('Spin').click())
    expect(mocks.begin).not.toHaveBeenCalled()
  })
  it('resumes the committed currency and lets the player stand without placing a second wager',async()=>{
    const ticket=saved({game:'blackjack',choice:'hand',seed:seedFor('blackjack','hand','playing'),stage:'active',currency:'grape',creditBefore:undefined,credited:undefined})
    mocks.resume.mockResolvedValue(ticket)
    const round=playRound('blackjack',ticket.seed,'hand',['stand'])
    mocks.action.mockResolvedValue({...ticket,actions:['stand'],stage:'complete',creditBefore:90,credited:totalReturn(round,10)})
    await act(async()=>root.render(<CasinoPanel game="blackjack" onClose={()=>{}}/>))
    expect(findButton('Grapes').getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[aria-label="Face-down card"]')).not.toBeNull()
    await act(async()=>{findButton('Stand').click();await vi.advanceTimersByTimeAsync(1000)})
    expect(mocks.action).toHaveBeenCalledWith('stand',ticket.id)
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(host.querySelector('[aria-label="Face-down card"]')).toBeNull()
  })
})
