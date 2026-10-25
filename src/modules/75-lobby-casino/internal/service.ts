import { earn, getPurse, parseWallet, PURSE_KEY, sameWallet, trySpend } from '../../11-currency'
import { CasinoLedger, type BetRequest, type TicketStorage } from './ledger'
import { casinoSeat, nextCasinoSeed } from './setup'
import type { Action } from './rules'

export const CASINO_TICKET_KEY='localrot.casino.ticket.v1'
const storage:TicketStorage={
  read:()=>{try{return localStorage.getItem(CASINO_TICKET_KEY)}catch{throw Error('Casino saving is unavailable in this browser.')}},
  write:value=>{try{localStorage.setItem(CASINO_TICKET_KEY,value)}catch{throw Error('The hand could not be saved. Retry the saved hand before placing another wager.')}},
  clear:()=>{try{localStorage.removeItem(CASINO_TICKET_KEY)}catch{throw Error('The saved hand could not be cleared.')}},
}
const bank={read:getPurse,spend:trySpend,credit:earn}
const ledger=new CasinoLedger(bank,storage)
let queue:Promise<unknown>=Promise.resolve()

function walletIsCurrent(){
  let saved:string|null
  try{saved=localStorage.getItem(PURSE_KEY)}catch{throw Error('Casino saving is unavailable in this browser.')}
  // The wallet contract is browser-local; refuse a stale cached wallet from another tab.
  let raw:unknown=null
  try{raw=saved===null?null:JSON.parse(saved)}catch{ /* The wallet parser treats damaged data as empty. */ }
  const persisted=parseWallet(raw)
  if(!sameWallet(persisted,getPurse()))throw Error('Your wallet changed in another tab. Reload this tab before betting.')
}
async function exclusively<T>(operation:()=>T):Promise<T>{
  const work=()=>{walletIsCurrent();return operation()}
  const run=()=>navigator.locks?navigator.locks.request('localrot.casino.wallet',work):Promise.resolve().then(work)
  const result=queue.then(run,run);queue=result.catch(()=>undefined)
  return result
}

export const resumeCasino=()=>exclusively(()=>ledger.resume())
export const actCasino=(action:Action,id:string)=>exclusively(()=>ledger.act(action,id))
export const resetCasinoRecord=()=>exclusively(()=>ledger.resetDamagedRecord())
export const beginCasino=(request:Omit<BetRequest,'seed'|'id'>)=>exclusively(()=>{
  if(!casinoSeat())throw Error('Wait for your lobby seat before betting.')
  const seed=nextCasinoSeed()
  return ledger.start({...request,seed,id:`casino:${Date.now().toString(36)}:${(seed>>>0).toString(36)}`})
})
