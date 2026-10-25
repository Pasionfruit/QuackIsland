import { describe, expect, it } from 'vitest'
import { AURA, createRound, leave, releaseTrap, speed, tick } from '../internal/rules'

const entrants=[{id:'rider',mine:true,bot:false},{id:'trapper',mine:false,bot:false}]
const fresh=()=>createRound(1337,entrants,'rider',11)
describe('Aura Debt rules',()=>{
  it('reproduces the course for the same seed and inputs',()=>{
    const a=fresh(),b=fresh()
    for(let i=0;i<70;i++){tick(a,.1);tick(b,.1)}
    expect(a).toEqual(b)
    expect(a.hazards.length).toBeGreaterThan(0)
    expect(speed(a)).toBeGreaterThan(10)
  })
  it('requires a live trapper, a fresh click, and a cooled-down trap',()=>{
    const r=fresh();r.players[1].cooldown=0
    expect(releaseTrap(r,'rider','crate',0,1)).toBe(false)
    expect(releaseTrap(r,'unknown','crate',0,1)).toBe(false)
    expect(releaseTrap(r,'trapper','crate',NaN,1)).toBe(false)
    expect(releaseTrap(r,'trapper','crate',20,1)).toBe(true)
    expect(r.hazards[0].x).toBe(4.9)
    expect(r.hazards[0].warning).toBe(AURA.warning)
    expect(releaseTrap(r,'trapper','slick',0,2)).toBe(false)
    r.players[1].cooldown=0;r.elapsed=2
    expect(releaseTrap(r,'trapper','slick',0,2)).toBe(false)
    expect(releaseTrap(r,'trapper','slick',0,3)).toBe(true)
  })
  it('hits a swept crossing once and allows a lateral dodge',()=>{
    for(const x of [0,4]){
      const r=fresh();r.x=x
      r.hazards=[{id:1,kind:'crate',x:0,at:1,warning:0,hit:false,owner:'trapper'}]
      tick(r,.2)
      expect(r.hazards[0].hit).toBe(x===0)
      expect(r.stability<90).toBe(x===0)
      const health=r.stability;tick(r,.1)
      expect(r.stability).toBeGreaterThanOrEqual(health)
    }
  })
  it('does not hit a rider before the warning expires',()=>{
    const r=fresh();r.hazards=[{id:1,kind:'gust',x:0,at:1,warning:1,hit:false,owner:'trapper'}]
    tick(r,.1);expect(r.stability).toBe(100)
  })
  it('lets WASD steer off the edge and stops the round after falling',()=>{
    const r=fresh();r.steer=1
    for(let i=0;i<40;i++)tick(r,.1)
    expect(r.winner).toBe('trappers');expect(r.reason).toMatch(/course/)
    const time=r.elapsed;tick(r,.2);expect(r.elapsed).toBe(time)
  })
  it('awards the rider survival at the limit and handles disconnects',()=>{
    const r=fresh();r.elapsed=89.95;r.nextCourse=1000
    tick(r,.1);expect(r.winner).toBe('rider')
    const a=fresh();leave(a,0);expect(a.winner).toBe('trappers')
    const b=fresh();leave(b,1);expect(b.winner).toBe('rider')
  })
  it('slicks reduce grip and gusts shove the rider',()=>{
    const a=fresh();a.hazards=[{id:1,kind:'slick',x:0,at:1,warning:0,hit:false,owner:'trapper'}]
    tick(a,.1);expect(a.slippery).toBeGreaterThan(2)
    const b=fresh();b.hazards=[{id:1,kind:'gust',x:0,at:1,warning:0,hit:false,owner:'trapper'}]
    tick(b,.1);expect(Math.abs(b.vx)).toBeGreaterThan(3);expect(Math.abs(b.balance)).toBeGreaterThan(.3)
  })
})
