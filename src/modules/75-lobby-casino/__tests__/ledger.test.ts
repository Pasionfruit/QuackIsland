import { describe, expect, it } from 'vitest'
import { CURRENCY_IDS, MAX_HELD, type Wallet } from '../../11-currency'
import { CasinoLedger, decodeTicket, type BetRequest, type CasinoBank, type TicketStorage } from '../internal/ledger'
import { playRound } from '../internal/rules'

function findSeed(predicate:(r:ReturnType<typeof playRound>)=>boolean,game:BetRequest['game']='blackjack',choice='hand'){
  for(let i=0;i<10000;i++)if(predicate(playRound(game,i,choice)))return i
  throw Error('No test seed')
}
function fixture(){
  let purse={fish:100,shell:100,grape:100},raw:string|null=null,writes=0,debits=0,credits=0
  const failures=new Set<number>()
  const bank:CasinoBank={read:()=>({...purse}),spend:cost=>{
    if(CURRENCY_IDS.some(id=>(cost[id]??0)>purse[id]))return false
    for(const id of CURRENCY_IDS)purse[id]-=cost[id]??0
    debits++;return true
  },credit:(id,n)=>{purse[id]=Math.min(MAX_HELD,purse[id]+n);credits++}}
  const storage:TicketStorage={read:()=>raw,write:value=>{if(failures.has(++writes))throw Error('Storage failure');raw=value},clear:()=>{raw=null}}
  const request:BetRequest={game:'blackjack',choice:'hand',seed:findSeed(r=>r.outcome==='playing'),stake:10,currency:'shell',id:'test:1'}
  return {ledger:new CasinoLedger(bank,storage),bank,storage,request,failures,
    purse:()=>purse,counts:()=>({debits,credits}),setPurse:(value:Wallet)=>{purse={...value}},setRaw:(value:string)=>{raw=value}}
}

describe('resource-backed casino ledger',()=>{
  it('debits each selected currency exactly once and credits wins back into that currency',()=>{
    for(const currency of CURRENCY_IDS){
      const f=fixture(),seed=findSeed(r=>r.outcome==='win','roulette','red')
      const ticket=f.ledger.start({...f.request,game:'roulette',choice:'red',seed,currency})
      expect(ticket.stage).toBe('complete');expect(f.purse()[currency]).toBe(110)
      for(const other of CURRENCY_IDS.filter(id=>id!==currency))expect(f.purse()[other]).toBe(100)
      f.ledger.resume();f.ledger.resume();expect(f.counts()).toEqual({debits:1,credits:1})
    }
  })
  it('rejects unaffordable, fractional and wrong-increment stakes without charging anything',()=>{
    const f=fixture()
    for(const stake of [0,-1,1.5,3,102])expect(()=>f.ledger.start({...f.request,stake})).toThrow()
    expect(f.counts().debits).toBe(0);expect(f.storage.read()).toBeNull()
  })
  it('resumes an unfinished hand after reopening and refuses a second wager',()=>{
    const f=fixture(),first=f.ledger.start(f.request)
    const reloaded=new CasinoLedger(f.bank,f.storage),resumed=reloaded.resume()!
    expect(resumed.id).toBe(first.id);expect(f.purse().shell).toBe(90)
    expect(()=>reloaded.start({...f.request,id:'test:2'})).toThrow(/saved hand/)
    reloaded.act('stand',resumed.id);expect(f.counts().debits).toBe(1)
  })
  it('treats a retried completed wager ID as the same bet',()=>{
    const f=fixture(),seed=findSeed(r=>r.outcome==='win','roulette','red')
    const request={...f.request,game:'roulette' as const,choice:'red',seed}
    const first=f.ledger.start(request),again=f.ledger.start(request)
    expect(again).toEqual(first);expect(f.counts()).toEqual({debits:1,credits:1})
  })
  it('recovers an interrupted stake write without debiting twice',()=>{
    const f=fixture();f.failures.add(2)
    expect(()=>f.ledger.start(f.request)).toThrow('Storage failure')
    expect(f.purse().shell).toBe(90)
    const reloaded=new CasinoLedger(f.bank,f.storage)
    expect(reloaded.resume()?.stage).toBe('active')
    expect(f.counts().debits).toBe(1)
  })
  it('recovers an interrupted payout write without crediting twice',()=>{
    const f=fixture(),seed=findSeed(r=>r.outcome==='win','roulette','red');f.failures.add(4)
    expect(()=>f.ledger.start({...f.request,game:'roulette',choice:'red',seed})).toThrow('Storage failure')
    expect(f.purse().shell).toBe(110)
    expect(new CasinoLedger(f.bank,f.storage).resume()?.stage).toBe('complete')
    expect(f.counts()).toEqual({debits:1,credits:1})
  })
  it('leaves the wallet alone if saving the initial wager fails',()=>{
    const f=fixture();f.failures.add(1)
    expect(()=>f.ledger.start(f.request)).toThrow()
    expect(f.purse().shell).toBe(100);expect(f.counts().debits).toBe(0)
  })
  it('never guesses how to apply an ambiguous interrupted wallet change',()=>{
    const f=fixture();f.failures.add(2)
    expect(()=>f.ledger.start(f.request)).toThrow()
    f.setPurse({...f.purse(),shell:95})
    expect(()=>new CasinoLedger(f.bank,f.storage).resume()).toThrow(/does not match/)
    expect(f.purse().shell).toBe(95)
  })
  it('rejects malformed saved records and prevents silently discarding valid hands',()=>{
    const f=fixture();f.setRaw('{bad json')
    expect(()=>f.ledger.resume()).toThrow(/saved hand/)
    f.ledger.resetDamagedRecord();expect(f.storage.read()).toBeNull()
    const ticket=f.ledger.start(f.request)
    expect(()=>f.ledger.resetDamagedRecord()).toThrow(/valid saved/)
    expect(decodeTicket(JSON.stringify({...ticket,currency:'gold'}))).toBeNull()
    expect(decodeTicket(JSON.stringify({...ticket,stake:Infinity}))).toBeNull()
  })
  it('checks payout headroom and charges no more for additional craps rolls',()=>{
    const f=fixture();f.setPurse({...f.purse(),shell:MAX_HELD})
    expect(()=>f.ledger.start(f.request)).toThrow(/largest possible return/)
    f.setPurse({fish:100,shell:100,grape:100})
    const seed=findSeed(r=>r.outcome==='playing','craps','pass')
    let ticket=f.ledger.start({...f.request,game:'craps',choice:'pass',seed})
    while(ticket.stage==='active')ticket=f.ledger.act('roll',ticket.id)
    expect(f.counts().debits).toBe(1)
  })
  it('does not apply an action from an old panel to a replacement hand',()=>{
    const f=fixture(),first=f.ledger.start(f.request)
    f.ledger.act('stand',first.id)
    const second=f.ledger.start({...f.request,id:'test:2'}),before=f.purse().shell
    expect(()=>f.ledger.act('hit',first.id)).toThrow(/hand changed/)
    expect(f.purse().shell).toBe(before)
    expect(decodeTicket(f.storage.read()!)?.actions).toEqual([])
    expect(second.id).toBe('test:2')
  })
})
