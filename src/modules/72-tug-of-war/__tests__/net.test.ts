import { describe,expect,it } from 'vitest'
import { createArenaLink,holding,type ArenaRoom } from '../../68-minigame-kit'
import { TUG_RULES } from '../internal/net'
import { createRound,emptyHands,sequenceFor } from '../internal/rules'
import { decodePress,decodeSnapshot,encodePress,encodeSnapshot } from '../internal/wire'
function setup(){
  let now=0,departed='';const ids=['a','b','c'],inbox=new Map<string,(from:string,raw:Record<string,unknown>)=>void>()
  const links=ids.map(id=>{const room:ArenaRoom={host:()=>id==='a',joined:()=>true,me:()=>id,peers:()=>ids.filter(other=>other!==id&&other!==departed),now:()=>now,send:raw=>{for(const[other,hear]of inbox)if(other!==id&&other!==departed)hear(id,raw)}};return createArenaLink(TUG_RULES,room)})
  ids.forEach((id,i)=>inbox.set(id,links[i].hear))
  const rounds=ids.map(id=>id==='a'?createRound(51,ids.map(id=>({id,mine:id==='a',bot:false})),'b'):holding(createRound(0,[],null,0))),hands=ids.map(emptyHands)
  function frames(n:number,paused=false){for(let j=0;j<n;j++){now+=50;links.forEach((link,i)=>link.advance(rounds[i],.05,hands[i],paused))}}
  frames(10);return{rounds,hands,links,frames,depart:(id:string)=>{departed=id}}
}
describe('Tug-of-war wire and kit loop',()=>{
  it('shares the selected guest solo and correct own bodies',()=>{
    const s=setup();s.rounds.forEach((r,i)=>{expect(r.soloId).toBe('b');expect(r.players.find(p=>p.mine)?.id).toBe(['a','b','c'][i])})
    expect(decodeSnapshot(encodeSnapshot(s.rounds[0]))).not.toBeNull()
  })
  it('accepts guest solo presses and shares a final solo victory',()=>{
    const s=setup()
    for(let seq=1;seq<=50;seq++){s.hands[1].queue.push({round:s.rounds[1].id,seq,key:'1'});s.frames(2)}
    s.frames(10);expect(s.rounds.every(r=>r.pull===-1&&r.winner==='solo')).toBe(true)
  })
  it('accepts each teammate’s personal sequence and shares team victory',()=>{
    const s=setup()
    for(let seq=1;seq<=32;seq++){
      for(const who of[0,2]){const p=s.rounds[0].players[who];s.hands[who].queue.push({round:s.rounds[0].id,seq,key:sequenceFor(s.rounds[0].seed,p.id,p.cycle)[p.cursor]})}
      s.frames(2)
    }
    s.frames(10);expect(s.rounds.every(r=>r.pull===1&&r.winner==='team')).toBe(true)
  })
  it('refuses non-game, malformed and excessively large key messages',()=>{
    const good=encodePress({round:3,seq:1,key:'A'});expect(decodePress(good)).toEqual({round:3,seq:1,key:'A'})
    for(const bad of[{key:'AA'},{key:'Enter'},{seq:0},{seq:NaN},{round:Infinity},{tag:'other-game'}])expect(decodePress({...good,...bad})).toBeNull()
    const raw=encodeSnapshot(setup().rounds[0]);expect(decodeSnapshot({...raw,pull:2})).toBeNull();expect(decodeSnapshot({...raw,players:[['a']]})).toBeNull()
  })
  it('does not trust a supplied rope position or force',()=>{
    const s=setup(),r=s.rounds[0]
    s.links[0].hear('b',{...encodePress({round:r.id,seq:1,key:'1'}),pull:-1,force:999})
    s.frames(5);expect(r.pull).toBeCloseTo(-.02);expect(r.over).toBe(false)
  })
  it('freezes all game clocks and rope state during a shared pause',()=>{
    const s=setup(),before=structuredClone(s.rounds[0]);s.frames(20,true);expect(s.rounds[0]).toEqual(before)
    s.frames(5);expect(s.rounds[0].elapsed).toBeGreaterThan(before.elapsed)
  })
  it('handles a guest solo leaving and shares team victory',()=>{
    const s=setup();s.depart('b');s.frames(10)
    expect(s.rounds[0].winner).toBe('team');expect(s.rounds[2].winner).toBe('team')
  })
})
