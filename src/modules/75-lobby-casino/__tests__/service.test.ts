// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPurse, earn, getPurse, PURSE_KEY } from '../../11-currency'
import { beginCasino, CASINO_TICKET_KEY, resetCasinoRecord, resumeCasino } from '../internal/service'

beforeEach(()=>{
  localStorage.clear();clearPurse();earn('fish',100);earn('shell',100);earn('grape',100)
})
afterEach(()=>{vi.restoreAllMocks();clearPurse();localStorage.clear()})

describe('live wallet casino adapter',()=>{
  it('uses the real purse API for each resource and restores completed wagers without paying again',async()=>{
    for(const currency of ['fish','shell','grape'] as const){
      const before=getPurse(),ticket=await beginCasino({game:'roulette',choice:'red',stake:10,currency})
      expect(ticket.stage).toBe('complete')
      expect(getPurse()[currency]).toBe(before[currency]-10+ticket.credited!)
      for(const other of (['fish','shell','grape'] as const).filter(id=>id!==currency))expect(getPurse()[other]).toBe(before[other])
      const settled=getPurse();await resumeCasino();expect(getPurse()).toEqual(settled)
    }
  })
  it('rejects a stale wallet changed by another tab without overwriting that storage',async()=>{
    const before=getPurse(),changed={...before,shell:49}
    localStorage.setItem(PURSE_KEY,JSON.stringify(changed))
    await expect(beginCasino({game:'roulette',choice:'red',stake:10,currency:'shell'})).rejects.toThrow(/another tab/)
    expect(getPurse()).toEqual(before)
    expect(JSON.parse(localStorage.getItem(PURSE_KEY)!)).toEqual(changed)
  })
  it('keeps the purse unchanged if recording a new wager fails',async()=>{
    const before=getPurse(),original=Storage.prototype.setItem
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){
      if(key===CASINO_TICKET_KEY)throw Error('Quota exceeded')
      original.call(this,key,value)
    })
    await expect(beginCasino({game:'roulette',choice:'red',stake:10,currency:'fish'})).rejects.toThrow(/could not be saved/)
    expect(getPurse()).toEqual(before)
  })
  it('can explicitly reset a malformed hand record without touching any resources',async()=>{
    const before=getPurse();localStorage.setItem(CASINO_TICKET_KEY,'{damaged')
    await expect(resumeCasino()).rejects.toThrow(/saved hand/)
    await resetCasinoRecord();expect(localStorage.getItem(CASINO_TICKET_KEY)).toBeNull()
    expect(getPurse()).toEqual(before)
  })
})
