import { describe,expect,it } from 'vitest'
import { activeTeam,applyPress,bots,BURST,createRound,judgeEnd,KEYS,leave,projectPlayer,sequenceFor,SOLO_PULL,TEAM_PULL,tick,type Round } from '../internal/rules'
const fresh=(team=2)=>createRound(91,Array.from({length:team+1},(_,i)=>({id:i?`p${i}`:'solo',mine:i===0,bot:false})),'solo')
function press(r:Round,who:number,key:string){r.elapsed+=.08;return applyPress(r,who,{round:r.id,seq:r.players[who].ack+1,key})}
const expected=(r:Round,who:number)=>sequenceFor(r.seed,r.players[who].id,r.players[who].cycle)[r.players[who].cursor]
describe('Tug-of-war rules',()=>{
  it('deals reproducible personal randomized four-key sequences without adjacent repeats',()=>{
    const seen=new Set<string>()
    for(let seed=0;seed<40;seed++){
      const sequence=sequenceFor(seed,'p1',0);expect(sequence).toEqual(sequenceFor(seed,'p1',0));expect(sequence).toHaveLength(4)
      expect(sequence.every((key,i)=>KEYS.includes(key)&&(i===0||sequence[i-1]!==key))).toBe(true);seen.add(sequence.join(''))
    }
    expect(seen.size).toBeGreaterThan(20)
    expect(sequenceFor(91,'p1',0)).not.toEqual(sequenceFor(91,'p2',0))
  })
  it('the solo pulls with 1 and cannot use a team letter',()=>{
    const r=fresh();expect(press(r,0,'1')).toBe(true);expect(r.pull).toBeCloseTo(-SOLO_PULL)
    expect(press(r,0,'A')).toBe(false);expect(r.players[0].correct).toBe(1)
  })
  it('each correct next team key immediately pulls, before the whole sequence is completed',()=>{
    const r=fresh();expect(press(r,1,expected(r,1))).toBe(true)
    expect(r.pull).toBeCloseTo(TEAM_PULL/2);expect(r.players[1]).toMatchObject({cursor:1,correct:1,cycle:0})
  })
  it('a wrong key resets only that player’s cursor and adds no pull',()=>{
    const r=fresh();press(r,1,expected(r,1));press(r,2,expected(r,2));const pull=r.pull
    const wrong=[...KEYS].find((key)=>key!==expected(r,1))!
    expect(press(r,1,wrong)).toBe(false);expect(r.pull).toBe(pull)
    expect(r.players[1]).toMatchObject({cursor:0,mistakes:1});expect(r.players[2].cursor).toBe(1)
  })
  it('refreshes the personal sequence after four correct keys',()=>{
    const r=fresh(),p=r.players[1]
    for(let i=0;i<4;i++)press(r,1,expected(r,1))
    expect(p).toMatchObject({cursor:0,cycle:1,correct:4});expect(r.pull).toBeCloseTo(TEAM_PULL*2)
  })
  it.each([1,2,4,7])('normalizes a team of %i so a full team key contributes the same combined pull',n=>{
    const r=fresh(n);for(let i=1;i<r.players.length;i++)press(r,i,expected(r,i))
    expect(r.pull).toBeCloseTo(TEAM_PULL)
  })
  it('projects unacknowledged keys immediately and never counts acknowledged keys twice',()=>{
    const r=fresh(),p=r.players[1],keys=sequenceFor(r.seed,p.id,0),pending=keys.map((key,i)=>({round:r.id,seq:i+1,key}))
    expect(projectPlayer(p,pending,r)).toMatchObject({correct:4,cursor:0,cycle:1})
    expect(p.correct).toBe(0)
    for(const event of pending){r.elapsed+=.08;applyPress(r,1,event)}
    expect(projectPlayer(p,pending,r)).toMatchObject({correct:4,cursor:0,cycle:1})
  })
  it('ignores replayed, out-of-round and invalid key intents',()=>{
    const r=fresh();press(r,0,'1');const before=structuredClone(r)
    expect(applyPress(r,0,{round:r.id,seq:1,key:'1'})).toBe(false)
    expect(applyPress(r,0,{round:r.id+1,seq:2,key:'1'})).toBe(false)
    expect(applyPress(r,0,{round:r.id,seq:2,key:'Delete'})).toBe(false)
    expect(r).toEqual(before)
  })
  it('allows a small network burst but rate-limits unlimited unique presses',()=>{
    const r=fresh()
    for(let seq=1;seq<=20;seq++)applyPress(r,0,{round:r.id,seq,key:'1'})
    expect(r.players[0].correct).toBe(BURST);expect(r.players[0].ack).toBe(20)
    r.elapsed+=.1;expect(applyPress(r,0,{round:r.id,seq:21,key:'1'})).toBe(true)
  })
  it('wins for the solo exactly at its goal and freezes later input',()=>{
    const r=fresh();for(let i=0;i<50;i++)press(r,0,'1')
    expect(r).toMatchObject({pull:-1,over:true,winner:'solo'})
    const before=structuredClone(r);applyPress(r,1,{round:r.id,seq:1,key:expected(r,1)});tick(r,.05)
    expect(r).toEqual(before)
  })
  it('wins for the team at the opposite goal',()=>{
    const r=fresh(1);for(let i=0;i<32;i++)press(r,1,expected(r,1))
    expect(r).toMatchObject({pull:1,over:true,winner:'team'})
  })
  it('has no passive drift or timed winner during an idle tie',()=>{
    const r=fresh();r.elapsed=150;for(let i=0;i<100;i++){tick(r,.05);judgeEnd(r)}
    expect(r.pull).toBe(0);expect(r.over).toBe(false)
  })
  it('removes departed teammates without rescaling historical pull, then adjusts future contributions',()=>{
    const r=fresh(2);press(r,1,expected(r,1));const pull=r.pull;leave(r,2)
    expect(r.pull).toBe(pull);expect(activeTeam(r)).toHaveLength(1)
    press(r,1,expected(r,1));expect(r.pull).toBeCloseTo(pull+TEAM_PULL)
    leave(r,0);expect(r.winner).toBe('team')
  })
  it('lets the solo win when the entire opposing side leaves',()=>{
    const r=fresh();leave(r,1);leave(r,2);expect(r.winner).toBe('solo')
  })
  it('runs reproducible stand-ins through real correct and mistaken key inputs',()=>{
    const seats=[{id:'solo',mine:true,bot:false},{id:'bot',mine:false,bot:true}],a=createRound(5,seats,'solo'),b=createRound(5,seats,'solo')
    for(let i=0;i<160;i++)for(const r of[a,b]){tick(r,.05);bots(r)}
    expect(a).toEqual(b);expect(a.players[1].correct).toBeGreaterThan(0);expect(a.players[1].mistakes).toBeGreaterThan(0)
  })
})
