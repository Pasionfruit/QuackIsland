import { adoptRound, decodeHeader, encodeHeader, isCount, mergePlayers, playerRows, sides } from '../../68-minigame-kit'
import { BURST, KEYS, type Press, type Round } from './rules'
export const TAG='tug-of-war'
const ROLES=sides('solo','team')
type Row=[string,number,number,number,number,number,number,number,boolean,boolean,number,number,number]
export interface Snapshot {id:number;seed:number;elapsed:number;soloId:string;over:boolean;winner:Round['winner'];pull:number;rows:Row[]}
const finite=(n:unknown,a:number,b:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b
export function encodePress(press:Press):Record<string,unknown>{return{tag:TAG,kind:'press',...press}}
export function decodePress(raw:Record<string,unknown>):Press|null{
  return raw.tag===TAG&&raw.kind==='press'&&isCount(raw.round)&&(raw.round as number)<=0xffffffff&&isCount(raw.seq)&&(raw.seq as number)>0&&(raw.seq as number)<=0x7fffffff&&typeof raw.key==='string'&&raw.key.length===1&&['1',...KEYS].includes(raw.key)?{round:raw.round as number,seq:raw.seq as number,key:raw.key}:null
}
export function encodeSnapshot(r:Round):Record<string,unknown>{return{...encodeHeader(TAG,r,r.soloId,ROLES),pull:r.pull,players:r.players.map((p):Row=>[p.id,p.cursor,p.cycle,p.correct,p.mistakes,p.ack,p.lastAt,p.badAt,p.left,p.bot,p.tokens,p.budgetAt,p.botAt])}}
export function decodeSnapshot(raw:Record<string,unknown>):Snapshot|null{
  const h=decodeHeader(raw,TAG,ROLES),rows=playerRows(raw.players,13)
  if(!h||!rows?.length||!finite(raw.pull,-1,1))return null
  for(const p of rows)if(!isCount(p[1])||(p[1] as number)>3||![2,3,4,5].every((i)=>isCount(p[i])&&(p[i] as number)<=0x7fffffff)
    ||!finite(p[6],-1,86400)||!finite(p[7],-1,86400)||typeof p[8]!=='boolean'||typeof p[9]!=='boolean'||!finite(p[10],0,BURST)||!finite(p[11],0,86400)||!finite(p[12],0,86400))return null
  if(!rows.some((p)=>p[0]===h.oneId)||new Set(rows.map((p)=>p[0])).size!==rows.length)return null
  if(!h.over&&(raw.pull===-1||raw.pull===1))return null
  return{...h,soloId:h.oneId,pull:raw.pull,rows:rows as Row[]}
}
export function applySnapshot(r:Round,s:Snapshot,me:string):void{
  adoptRound(r,s.id);r.seed=s.seed;r.soloId=s.soloId;r.pull=s.pull;r.over=s.over;r.winner=s.winner
  const fields=(p:Row)=>({role:p[0]===s.soloId?'solo' as const:'team' as const,cursor:p[1],cycle:p[2],correct:p[3],mistakes:p[4],ack:p[5],lastAt:p[6],badAt:p[7],left:p[8],bot:p[9],tokens:p[10],budgetAt:p[11],botAt:p[12]})
  r.players=mergePlayers(r.players,s.rows,me,s.over,{create:(p)=>({id:p[0],mine:p[0]===me,...fields(p)}),shared:fields,owned:()=>({})})
}
