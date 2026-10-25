import { CURRENCY_IDS, MAX_HELD, type Cost, type CurrencyId, type Wallet } from '../../11-currency'
import { CASINO_KINDS, type CasinoKind } from './layout'
import { MAX_ACTIONS, maximumMultiplier, playRound, totalReturn, wagerProblem, type Action, type Round } from './rules'

export interface CasinoBank { read():Wallet;spend(cost:Cost):boolean;credit(currency:CurrencyId,amount:number):void }
export interface TicketStorage { read():string|null;write(value:string):void;clear():void }
export interface Ticket {
  version:1;id:string;game:CasinoKind;currency:CurrencyId;stake:number;seed:number;choice:string;actions:Action[]
  stage:'debit'|'active'|'credit'|'complete';debitBefore:number;creditBefore?:number;credited?:number
}
export interface BetRequest { game:CasinoKind;currency:CurrencyId;stake:number;choice:string;seed:number;id:string }
const integer=(v:unknown,min=0,max=MAX_HELD):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max

/** Recompute outcomes from seed and accepted actions; stored payout data never drives the rules. */
export function decodeTicket(raw:string):Ticket|null {
  if(raw.length>65536)return null
  try{
    const t=JSON.parse(raw)
    if(!t||typeof t!=='object'||t.version!==1||typeof t.id!=='string'||!/^[a-zA-Z0-9:._-]{1,120}$/.test(t.id)||
      !CASINO_KINDS.includes(t.game)||!CURRENCY_IDS.includes(t.currency)||typeof t.choice!=='string'||
      !integer(t.seed,-2147483648,4294967295)||!integer(t.stake,1,10000)||wagerProblem(t.game,t.choice,t.stake)||
      !Array.isArray(t.actions)||t.actions.length>MAX_ACTIONS||!t.actions.every((a:unknown)=>['hit','stand','roll'].includes(a as string))||
      !['debit','active','credit','complete'].includes(t.stage)||!integer(t.debitBefore,t.stake))return null
    const ticket:Ticket={version:1,id:t.id,game:t.game,currency:t.currency,choice:t.choice,seed:t.seed,stake:t.stake,
      actions:[...t.actions],stage:t.stage,debitBefore:t.debitBefore}
    const round=playRound(ticket.game,ticket.seed,ticket.choice,ticket.actions)
    if(ticket.stage==='debit'&&ticket.actions.length)return null
    if(ticket.stage==='credit'||ticket.stage==='complete'){
      if(round.outcome==='playing'||!integer(t.creditBefore)||!integer(t.credited)||
        t.credited!==Math.min(totalReturn(round,ticket.stake),MAX_HELD-t.creditBefore))return null
      ticket.creditBefore=t.creditBefore;ticket.credited=t.credited
    }
    return ticket
  }catch{return null}
}

/** Synchronous operations run inside the live adapter's browser lock. */
export class CasinoLedger {
  constructor(private bank:CasinoBank,private storage:TicketStorage){}
  private save(ticket:Ticket){this.storage.write(JSON.stringify(ticket));return ticket}
  private read():Ticket|null {
    const raw=this.storage.read()
    if(raw===null)return null
    const ticket=decodeTicket(raw)
    if(!ticket)throw Error('The saved hand could not be read. Reset its table record to continue; this does not refund a wager.')
    return ticket
  }
  view(ticket:Ticket):Round{return playRound(ticket.game,ticket.seed,ticket.choice,ticket.actions)}

  resume():Ticket|null {
    let ticket=this.read()
    if(!ticket)return null
    if(ticket.stage==='debit'){
      const balance=this.bank.read()[ticket.currency],after=ticket.debitBefore-ticket.stake
      if(balance===ticket.debitBefore){
        if(!this.bank.spend({[ticket.currency]:ticket.stake})){
          this.storage.clear();throw Error('There are not enough resources for this wager.')
        }
        if(this.bank.read()[ticket.currency]!==after)throw Error('The wallet changed while placing this wager. Reopen the table to recover it.')
      }else if(balance!==after)throw Error('An interrupted wager does not match the wallet. No further resources were moved.')
      ticket=this.save({...ticket,stage:'active'})
    }
    if(ticket.stage==='active'){
      const round=this.view(ticket)
      if(round.outcome!=='playing'){
        const before=this.bank.read()[ticket.currency],credited=Math.min(totalReturn(round,ticket.stake),MAX_HELD-before)
        ticket=this.save({...ticket,stage:credited>0?'credit':'complete',creditBefore:before,credited})
      }
    }
    if(ticket.stage==='credit'){
      const before=ticket.creditBefore!,after=before+ticket.credited!,balance=this.bank.read()[ticket.currency]
      if(balance===before){
        this.bank.credit(ticket.currency,ticket.credited!)
        if(this.bank.read()[ticket.currency]!==after)throw Error('The wallet changed during payout. Reopen the table to recover it.')
      }else if(balance!==after)throw Error('An interrupted payout does not match the wallet. No further resources were moved.')
      ticket=this.save({...ticket,stage:'complete'})
    }
    return ticket
  }

  start(request:BetRequest):Ticket {
    const previous=this.resume()
    if(previous?.id===request.id){
      if(previous.game!==request.game||previous.currency!==request.currency||previous.stake!==request.stake||
        previous.choice!==request.choice||previous.seed!==request.seed)throw Error('A wager ID cannot be reused for another bet.')
      return previous
    }
    if(previous&&previous.stage!=='complete')throw Error('Finish your saved hand before placing another wager.')
    if(!CASINO_KINDS.includes(request.game)||!CURRENCY_IDS.includes(request.currency)||!integer(request.seed,-2147483648,4294967295)||
      !/^[a-zA-Z0-9:._-]{1,120}$/.test(request.id))throw Error('Invalid wager.')
    const problem=wagerProblem(request.game,request.choice,request.stake)
    if(problem)throw Error(problem)
    const balance=this.bank.read()[request.currency]
    if(balance<request.stake)throw Error('You do not have enough of that resource.')
    if(balance-request.stake+Math.round(request.stake*maximumMultiplier(request.game,request.choice))>MAX_HELD)
      throw Error('Choose a smaller bet so the largest possible return fits in your wallet.')
    const ticket:Ticket={...request,version:1,actions:[],stage:'debit',debitBefore:balance}
    this.save(ticket)
    return this.resume()!
  }

  act(action:Action,expectedId:string):Ticket {
    const recorded=this.read()
    if(!recorded||recorded.id!==expectedId)throw Error('This hand changed in another tab. Reopen the table before acting.')
    const ticket=this.resume()
    if(!ticket||ticket.stage!=='active'||this.view(ticket).outcome!=='playing')throw Error('There is no unfinished hand to play.')
    const actions=[...ticket.actions,action]
    playRound(ticket.game,ticket.seed,ticket.choice,actions)
    this.save({...ticket,actions})
    return this.resume()!
  }
  /** Explicit recovery action for an unreadable record; never changes the wallet. */
  resetDamagedRecord(){
    const raw=this.storage.read()
    if(raw!==null&&decodeTicket(raw))throw Error('A valid saved hand cannot be discarded. Finish it at a table.')
    this.storage.clear()
  }
}
