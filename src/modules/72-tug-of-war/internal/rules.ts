import { createRng, hashSeed } from '../../00-core'
import { castOneVsAll, type ArenaPlayer, type Entrant } from '../../68-minigame-kit'

export const KEYS = 'ASDFJKL'
export const SEQUENCE_LENGTH = 4
export const SOLO_PULL = .02
export const TEAM_PULL = .032
export const MAX_RATE = 18
export const BURST = 3
export const PALETTE = ['#e4ae68','#77b5b6','#d69b91','#99b589','#b49bc3','#c9a67e','#8cacc3','#b8b17d']
export interface Player extends ArenaPlayer {
  role: 'solo' | 'team'
  cursor: number; cycle: number; correct: number; mistakes: number; ack: number
  lastAt: number; badAt: number; tokens: number; budgetAt: number; botAt: number
}
export interface Round {
  id: number; seed: number; elapsed: number; soloId: string; players: Player[]
  pull: number; over: boolean; winner: 'solo' | 'team' | null
}
export interface Press { round: number; seq: number; key: string }
export interface Hands { queue: Press[] }
export const emptyHands = (): Hands => ({ queue: [] })
export const activeTeam = (r: Round) => r.players.filter((p) => p.role==='team'&&!p.left)
export function sequenceFor(seed: number, id: string, cycle: number): string[] {
  const rng=createRng(hashSeed(seed,`tug:${id}:${cycle}`)),keys:string[]=[]
  for(let i=0;i<SEQUENCE_LENGTH;i++){
    const choices=[...KEYS].filter((key)=>key!==keys[i-1])
    keys.push(choices[Math.floor(rng()*choices.length)])
  }
  return keys
}
export function createRound(seed: number, entrants: readonly Entrant[], chosen: string|null, id=seed||1): Round {
  const {oneId}=castOneVsAll(entrants,chosen)
  const r:Round={id,seed,elapsed:0,soloId:oneId,pull:0,over:false,winner:null,
    players:entrants.map((p,i)=>({...p,left:false,role:p.id===oneId?'solo':'team',cursor:0,cycle:0,correct:0,mistakes:0,ack:0,lastAt:-1,badAt:-1,tokens:BURST,budgetAt:0,botAt:.4+i*.035}))}
  judgeEnd(r);return r
}
/** The local projection and the host use the same key/sequence transition. */
export function advanceKey(p: Player, key: string, seed: number, now: number): boolean {
  if(p.role==='solo'){
    if(key!=='1')return false
    p.correct++;p.lastAt=now;return true
  }
  if(!KEYS.includes(key)||key.length!==1)return false
  if(sequenceFor(seed,p.id,p.cycle)[p.cursor]!==key){p.cursor=0;p.mistakes++;p.badAt=now;return false}
  p.correct++;p.lastAt=now;p.cursor++
  if(p.cursor===SEQUENCE_LENGTH){p.cursor=0;p.cycle++}
  return true
}
export function applyPress(r: Round, who: number, press: Press): boolean {
  const p=r.players[who]
  if(!p||p.left||r.over||press.round!==r.id||!Number.isInteger(press.seq)||press.seq<=p.ack||press.seq>0x7fffffff||!['1',...KEYS].includes(press.key))return false
  p.ack=press.seq
  p.tokens=Math.min(BURST,p.tokens+Math.max(0,r.elapsed-p.budgetAt)*MAX_RATE);p.budgetAt=r.elapsed
  if(p.tokens+1e-9<1)return false
  p.tokens=Math.max(0,p.tokens-1)
  if(!advanceKey(p,press.key,r.seed,r.elapsed))return false
  const amount=p.role==='solo'?-SOLO_PULL:TEAM_PULL/Math.max(1,activeTeam(r).length)
  r.pull=Math.max(-1,Math.min(1,r.pull+amount))
  if(r.pull<=-1+1e-9)r.pull=-1
  if(r.pull>=1-1e-9)r.pull=1
  judgeEnd(r);return true
}
export function projectPlayer(p: Player, pending: readonly Press[], r: Pick<Round,'id'|'seed'|'elapsed'>): Player {
  const projected={...p}
  for(const press of pending)if(press.round===r.id&&press.seq>p.ack)advanceKey(projected,press.key,r.seed,r.elapsed)
  return projected
}
export function tick(r:Round,dt:number):void{if(!r.over&&r.players.length&&Number.isFinite(dt)&&dt>0)r.elapsed+=Math.min(dt,.05)}
export function judgeEnd(r:Round):void{
  if(r.over)return
  if(!r.players.some((p)=>p.id===r.soloId&&!p.left)){r.over=true;r.winner='team'}
  else if(!activeTeam(r).length||r.pull<=-1){r.over=true;r.winner='solo'}
  else if(r.pull>=1){r.over=true;r.winner='team'}
}
export function bots(r:Round):void{
  if(r.over)return
  for(const [i,p]of r.players.entries()){
    if(!p.bot||p.left||p.role!=='team'||r.elapsed<p.botAt)continue
    const rng=createRng(hashSeed(r.seed,`${p.id}:press:${p.ack}`)),expected=sequenceFor(r.seed,p.id,p.cycle)[p.cursor]
    const key=rng()<.12?[...KEYS].find((k)=>k!==expected)!:expected
    applyPress(r,i,{round:r.id,seq:p.ack+1,key})
    p.botAt=r.elapsed+.24+rng()*.12
  }
}
export function leave(r:Round,who:number):void{const p=r.players[who];if(!p||p.bot||p.left)return;p.left=true;judgeEnd(r)}
