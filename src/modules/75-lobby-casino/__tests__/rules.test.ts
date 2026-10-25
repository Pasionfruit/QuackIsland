import { describe, expect, it } from 'vitest'
import { baccaratTotal, bankerDraws, blackjackTotal, playRound, shoe, slotResult, stakeStep, totalReturn, wagerProblem } from '../internal/rules'
import type { CasinoKind } from '../internal/layout'

export function seedFor(game:CasinoKind,choice:string,predicate:(r:ReturnType<typeof playRound>)=>boolean):number{
  for(let seed=0;seed<10000;seed++)if(predicate(playRound(game,seed,choice)))return seed
  throw Error('No matching test seed')
}

describe('playable casino rules',()=>{
  it('shuffles a reproducible deck and handles aces and baccarat face cards',()=>{
    expect(shoe(42)).toEqual(shoe(42));expect(new Set(shoe(42)).size).toBe(52)
    expect(shoe(42,8).filter(c=>c===0)).toHaveLength(8)
    expect(blackjackTotal([0,13,12])).toBe(12)
    expect(blackjackTotal([0,13,8])).toBe(21)
    expect(baccaratTotal([9,10,11,12,0])).toBe(1)
  })
  it('settles natural blackjack at 3:2 and rejects actions after the hand ends',()=>{
    const seed=seedFor('blackjack','hand',r=>r.outcome==='win'&&r.multiplier===2.5)
    expect(totalReturn(playRound('blackjack',seed,'hand'),10)).toBe(25)
    expect(()=>playRound('blackjack',seed,'hand',['hit'])).toThrow()
    expect(wagerProblem('blackjack','hand',3)).toContain('multiples of 2')
  })
  it('lets a player hit or stand and makes the dealer stand at 17 or higher',()=>{
    const seed=seedFor('blackjack','hand',r=>r.outcome==='playing')
    const first=playRound('blackjack',seed,'hand')
    const hit=playRound('blackjack',seed,'hand',['hit'])
    expect(first.game==='blackjack'&&first.player.length).toBe(2)
    expect(hit.game==='blackjack'&&hit.player.length).toBe(3)
    const stand=playRound('blackjack',seed,'hand',['stand'])
    expect(stand.outcome).not.toBe('playing')
    if(stand.game==='blackjack')expect(blackjackTotal(stand.dealer)).toBeGreaterThanOrEqual(17)
  })
  it('treats zero as a loss on outside roulette bets and pays a straight number 35:1',()=>{
    const seed=seedFor('roulette','red',r=>r.game==='roulette'&&r.number===0)
    for(const choice of ['red','black','even','odd','low','high'])expect(playRound('roulette',seed,choice).outcome).toBe('loss')
    expect(totalReturn(playRound('roulette',seed,'number:0'),4)).toBe(144)
    expect(wagerProblem('roulette','number:37',1)).not.toBeNull()
  })
  it('pays only 3+ centre-line symbols from the left and has the declared slot return',()=>{
    const reels=(row:number[])=>row.map(symbol=>[0,symbol,0])
    expect(slotResult(reels([1,1,1,3,1])).multiplier).toBe(6)
    expect(slotResult(reels([2,1,1,1,1])).multiplier).toBe(0)
    expect(slotResult(reels([3,3,3,3,3])).multiplier).toBe(120)
    let returns=0
    for(let n=0;n<1024;n++){
      const row=Array.from({length:5},(_,i)=>Math.floor(n/4**i)%4)
      returns+=slotResult(reels(row)).multiplier
    }
    expect(returns/1024).toBe(.953125)
  })
  it('uses the full baccarat Banker draw table',()=>{
    for(let total=0;total<=7;total++)for(let third=0;third<=9;third++){
      const draw=total<=2||(total===3&&third!==8)||(total===4&&[2,3,4,5,6,7].includes(third))||
        (total===5&&[4,5,6,7].includes(third))||(total===6&&[6,7].includes(third))
      expect(bankerDraws(total,third)).toBe(draw)
    }
    expect(bankerDraws(5,null)).toBe(true);expect(bankerDraws(6,null)).toBe(false)
    expect(stakeStep('baccarat','banker')).toBe(20)
    const seed=seedFor('baccarat','banker',r=>r.outcome==='win')
    expect(totalReturn(playRound('baccarat',seed,'banker'),20)).toBe(39)
    const tie=seedFor('baccarat','player',r=>r.game==='baccarat'&&r.winner==='tie')
    expect(totalReturn(playRound('baccarat',tie,'player'),5)).toBe(5)
    expect(totalReturn(playRound('baccarat',tie,'tie'),5)).toBe(45)
  })
  it('handles craps come-out wins/losses and keeps the point until point or seven',()=>{
    const win=seedFor('craps','pass',r=>r.outcome==='win'),loss=seedFor('craps','pass',r=>r.outcome==='loss')
    expect(totalReturn(playRound('craps',win,'pass'),8)).toBe(16)
    expect(totalReturn(playRound('craps',loss,'pass'),8)).toBe(0)
    const seed=seedFor('craps','pass',r=>r.outcome==='playing'),actions:('roll')[]=[]
    const first=playRound('craps',seed,'pass')
    let round=first
    while(round.outcome==='playing'&&actions.length<512){actions.push('roll');round=playRound('craps',seed,'pass',actions)}
    expect(round.outcome).not.toBe('playing')
    if(first.game==='craps'&&round.game==='craps'){
      expect(round.point).toBe(first.point)
      expect(round.dice[0]+round.dice[1]).toBe(round.outcome==='win'?round.point:7)
    }
  })
})
