import { describe, expect, it } from 'vitest'
import { createArenaLink, type ArenaRoom } from '../../68-minigame-kit'
import { arenaRules } from '../internal/arena'
import { createRound, neutralHands } from '../internal/rules'
import { applySnapshot, decodeGuest, decodeSnapshot, encodeMove, encodeSnapshot, encodeTrap } from '../internal/wire'

const entrants=[{id:'rider',mine:true,bot:false},{id:'trapper',mine:false,bot:false}]
const fresh=()=>createRound(1337,entrants,'rider',11)
describe('Aura Debt wire and arena',()=>{
  it('round-trips kit headers, pose inputs, trap claims, and hazards',()=>{
    const r=fresh();r.players[1].cooldown=0
    r.hazards=[{id:1,kind:'gust',x:-2,at:30,warning:1,hit:false,owner:'trapper'}]
    const s=decodeSnapshot(encodeSnapshot(r));expect(s).not.toBeNull()
    const guest=fresh();applySnapshot(guest,s!,'trapper')
    expect(guest.hazards).toEqual(r.hazards);expect(guest.oneId).toBe('rider');expect(guest.players[1].mine).toBe(true)
    r.players[0].inputX=-1
    expect(decodeGuest(encodeMove(r,r.players[0]))).toEqual({round:11,kind:'move',steer:-1,throttle:0})
    expect(decodeGuest(encodeTrap(r,{...neutralHands(),aim:2,trap:'slick',sequence:1}))).toEqual({round:11,kind:'trap',trap:'slick',x:2,sequence:1})
  })
  it('rejects malformed, oversized, and nonfinite packets',()=>{
    const r=fresh(),raw=encodeSnapshot(r)
    expect(decodeSnapshot({...raw,rider:[NaN,0,0,0,100,0,0,0]})).toBeNull()
    expect(decodeSnapshot({...raw,hazards:Array(19).fill([])})).toBeNull()
    expect(decodeSnapshot({...raw,players:[['rider',false,false,0,0],['rider',false,false,0,0]]})).toBeNull()
    const trap=encodeTrap(r,{...neutralHands(),sequence:1})
    expect(decodeGuest({...trap,k:'meteor'})).toBeNull()
    expect(decodeGuest({...trap,q:-1})).toBeNull()
  })
  it('rejects movement from trap operators and forged rider trap claims',()=>{
    const r=fresh()
    arenaRules.hear(r,1,{round:11,kind:'move',steer:1,throttle:1},()=>.05)
    expect(r.steer).toBe(0)
    arenaRules.hear(r,0,{round:11,kind:'trap',trap:'crate',x:0,sequence:1},()=>.05)
    expect(r.hazards).toHaveLength(0)
    arenaRules.hear(r,0,{round:99,kind:'move',steer:1,throttle:1},()=>.05)
    expect(r.steer).toBe(0)
  })
  it('runs the kit host loop, respects pause and relays a guest trap',()=>{
    let now=1000
    const sent:Record<string,unknown>[]=[]
    const room:ArenaRoom={host:()=>true,joined:()=>true,me:()=> 'rider',peers:()=>['trapper'],send:m=>sent.push(m),now:()=>now}
    const host=createArenaLink(arenaRules,room),r=fresh()
    host.advance(r,.1,neutralHands(),true);expect(r.elapsed).toBe(0)
    for(let i=0;i<20;i++){now+=100;host.advance(r,.1,neutralHands(),false)}
    expect(r.elapsed).toBeGreaterThan(1)
    host.hear('trapper',encodeTrap(r,{...neutralHands(),sequence:1,aim:2,trap:'gust'}))
    now+=100;host.advance(r,.1,neutralHands(),false)
    expect(r.hazards.some(h=>h.owner==='trapper'&&h.kind==='gust'&&h.x===2)).toBe(true)
    expect(sent.some(m=>decodeSnapshot(m)!==null)).toBe(true)
  })
  it('keeps both kit clients in sync and accepts a guest click exactly once',()=>{
    let now=1000
    const hostRound=fresh(), guestRound=fresh()
    guestRound.players.forEach(p=>p.mine=p.id==='trapper')
    const host=createArenaLink(arenaRules,{host:()=>true,joined:()=>true,me:()=> 'rider',peers:()=>['trapper'],
      now:()=>now,send:m=>guest.hear('rider',m)})
    const guest=createArenaLink(arenaRules,{host:()=>false,joined:()=>true,me:()=> 'trapper',peers:()=>['rider'],
      now:()=>now,send:m=>host.hear('trapper',m)})
    const hands=neutralHands()
    for(let i=0;i<25;i++){
      now+=100;host.advance(hostRound,.1,neutralHands(),false);guest.advance(guestRound,.1,hands,false)
    }
    hands.sequence=1;hands.trap='slick';hands.aim=-2
    for(let i=0;i<5;i++){
      now+=100;guest.advance(guestRound,.1,hands,false);host.advance(hostRound,.1,neutralHands(),false)
    }
    expect(hostRound.hazards.filter(h=>h.owner==='trapper')).toHaveLength(1)
    expect(guestRound.hazards.find(h=>h.owner==='trapper')?.kind).toBe('slick')
    expect(guestRound.players.find(p=>p.mine)?.id).toBe('trapper')
    expect(Math.abs(hostRound.distance-guestRound.distance)).toBeLessThan(.02)
  })
})
