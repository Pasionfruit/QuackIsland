import { createRng } from '../../00-core'
import type { CasinoKind } from './layout'

export type Action='hit'|'stand'|'roll'
export type Outcome='playing'|'win'|'loss'|'push'
export interface BaseRound { game:CasinoKind; outcome:Outcome; multiplier:number; message:string }
export interface BlackjackRound extends BaseRound { game:'blackjack'; player:number[];dealer:number[] }
export interface RouletteRound extends BaseRound { game:'roulette';number:number;colour:'red'|'black'|'green' }
export interface SlotsRound extends BaseRound { game:'slots';reels:number[][];matched:number;symbol:number }
export interface BaccaratRound extends BaseRound { game:'baccarat';player:number[];banker:number[];playerTotal:number;bankerTotal:number;winner:'player'|'banker'|'tie' }
export interface CrapsRound extends BaseRound { game:'craps';dice:[number,number];point:number|null;rolls:number }
export type Round=BlackjackRound|RouletteRound|SlotsRound|BaccaratRound|CrapsRound
export const RED_NUMBERS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
export const SLOT_SYMBOLS=['Cherries','Bell','Star','Seven'] as const
/** Total returns including the original stake, for 3/4/5 from the left on the centre line. */
export const SLOT_PAYTABLE=[[4,12,40],[6,20,60],[8,30,90],[12,40,120]] as const
export const MAX_ACTIONS=512
export const rank=(card:number)=>card%13+1
export const suit=(card:number)=>Math.floor(card/13)
export const cardLabel=(card:number)=>`${['A','2','3','4','5','6','7','8','9','10','J','Q','K'][rank(card)-1]}${['♠','♥','♦','♣'][suit(card)]}`

export function shoe(seed:number,decks=1):number[]{
  const rng=createRng(seed),cards=Array.from({length:52*decks},(_,i)=>i%52)
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
  return cards
}
export function blackjackTotal(cards:readonly number[]):number {
  let aces=0,total=0
  for(const card of cards){const value=rank(card);if(value===1)aces++;total+=value===1?11:Math.min(value,10)}
  while(total>21&&aces>0){total-=10;aces--}
  return total
}
export const baccaratTotal=(cards:readonly number[])=>cards.reduce((sum,c)=>sum+Math.min(rank(c),10),0)%10
export function bankerDraws(total:number,third:number|null):boolean {
  if(third===null)return total<=5
  return total<=2||(total===3&&third!==8)||(total===4&&third>=2&&third<=7)||
    (total===5&&third>=4&&third<=7)||(total===6&&(third===6||third===7))
}
export function validChoice(game:CasinoKind,choice:string):boolean {
  if(game==='blackjack')return choice==='hand'
  if(game==='slots')return choice==='centre'
  if(game==='craps')return choice==='pass'
  if(game==='baccarat')return ['player','banker','tie'].includes(choice)
  if(['red','black','even','odd','low','high'].includes(choice))return true
  return /^number:(?:[0-9]|[12][0-9]|3[0-6])$/.test(choice)
}
export const defaultChoice=(game:CasinoKind)=>({blackjack:'hand',roulette:'red',slots:'centre',baccarat:'player',craps:'pass'})[game]
export const stakeStep=(game:CasinoKind,choice:string)=>game==='blackjack'?2:game==='baccarat'&&choice==='banker'?20:1
export function maximumMultiplier(game:CasinoKind,choice:string):number {
  return game==='blackjack'?2.5:game==='slots'?120:game==='roulette'?(choice.startsWith('number:')?36:2):
    game==='baccarat'?(choice==='tie'?9:choice==='banker'?1.95:2):2
}
export function wagerProblem(game:CasinoKind,choice:string,stake:number):string|null {
  if(!validChoice(game,choice))return 'Choose a valid bet.'
  if(!Number.isSafeInteger(stake)||stake<1||stake>10000)return 'Bet a whole amount from 1 to 10,000.'
  const step=stakeStep(game,choice)
  if(stake%step!==0)return `This bet uses multiples of ${step} so payouts stay in whole resources.`
  return null
}

function blackjack(seed:number,actions:readonly Action[]):BlackjackRound {
  const deck=shoe(seed),player=[deck[0],deck[2]],dealer=[deck[1],deck[3]]
  let cursor=4
  const result=(outcome:Outcome,multiplier:number,message:string):BlackjackRound=>({game:'blackjack',player,dealer,outcome,multiplier,message})
  if(blackjackTotal(player)===21||blackjackTotal(dealer)===21){
    if(actions.length)throw Error('This hand already ended.')
    return blackjackTotal(player)===blackjackTotal(dealer)?result('push',1,'Both have blackjack. Stake returned.'):
      blackjackTotal(player)===21?result('win',2.5,'Blackjack! Pays 3:2.'):result('loss',0,'Dealer blackjack.')
  }
  let finished:BlackjackRound|null=null
  for(const action of actions){
    if(finished||!['hit','stand'].includes(action))throw Error('That action is not available for this hand.')
    if(action==='hit'){
      player.push(deck[cursor++])
      if(blackjackTotal(player)>21){finished=result('loss',0,'You went over 21.');continue}
      if(blackjackTotal(player)<21)continue
    }
    while(blackjackTotal(dealer)<17)dealer.push(deck[cursor++])
    const p=blackjackTotal(player),d=blackjackTotal(dealer)
    finished=d>21||p>d?result('win',2,'You beat the dealer.'):p===d?result('push',1,'Tie. Stake returned.'):result('loss',0,'Dealer wins.')
  }
  return finished??result('playing',0,'Hit or stand. Dealer stands on all 17s.')
}

function roulette(seed:number,choice:string):RouletteRound {
  const number=Math.floor(createRng(seed)()*37),colour=number===0?'green':RED_NUMBERS.has(number)?'red':'black'
  const win=choice.startsWith('number:')?number===Number(choice.slice(7)):
    number!==0&&(choice===colour||(choice==='even'&&number%2===0)||(choice==='odd'&&number%2===1)||
      (choice==='low'&&number<=18)||(choice==='high'&&number>=19))
  return {game:'roulette',number,colour,outcome:win?'win':'loss',multiplier:win?(choice.startsWith('number:')?36:2):0,
    message:`${number} ${colour}. ${win?'Your bet wins!':'Your bet loses.'}`}
}

export function slotResult(reels:number[][]):Pick<SlotsRound,'matched'|'symbol'|'multiplier'> {
  const symbol=reels[0][1];let matched=1
  while(matched<5&&reels[matched][1]===symbol)matched++
  return {symbol,matched,multiplier:matched>=3?SLOT_PAYTABLE[symbol][matched-3]:0}
}
function slots(seed:number):SlotsRound {
  const rng=createRng(seed),reels=Array.from({length:5},()=>Array.from({length:3},()=>Math.floor(rng()*4)))
  const result=slotResult(reels)
  return {game:'slots',reels,...result,outcome:result.multiplier?'win':'loss',
    message:result.multiplier?`${result.matched} ${SLOT_SYMBOLS[result.symbol]} from the left!`:'No centre-line match. Three or more from the left wins.'}
}

function baccarat(seed:number,choice:string):BaccaratRound {
  const deck=shoe(seed,8),player=[deck[0],deck[2]],banker=[deck[1],deck[3]];let cursor=4
  if(baccaratTotal(player)<8&&baccaratTotal(banker)<8){
    let third:number|null=null
    if(baccaratTotal(player)<=5){const card=deck[cursor++];player.push(card);third=Math.min(rank(card),10)%10}
    if(bankerDraws(baccaratTotal(banker),third))banker.push(deck[cursor++])
  }
  const playerTotal=baccaratTotal(player),bankerTotal=baccaratTotal(banker)
  const winner=playerTotal===bankerTotal?'tie':playerTotal>bankerTotal?'player':'banker'
  const push=winner==='tie'&&choice!=='tie',win=winner===choice
  return {game:'baccarat',player,banker,playerTotal,bankerTotal,winner,outcome:push?'push':win?'win':'loss',
    multiplier:push?1:win?(choice==='tie'?9:choice==='banker'?1.95:2):0,
    message:push?'Tie. Your Player/Banker stake is returned.':`${winner[0].toUpperCase()+winner.slice(1)} wins. ${win?'Your bet wins!':'Your bet loses.'}`}
}

function craps(seed:number,actions:readonly Action[]):CrapsRound {
  const rng=createRng(seed);let point:number|null=null,result:CrapsRound|undefined
  for(let i=0;i<=actions.length;i++){
    if(i>0&&(actions[i-1]!=='roll'||result?.outcome!=='playing'))throw Error('This Pass Line bet cannot be rolled again.')
    const dice:[number,number]=[1+Math.floor(rng()*6),1+Math.floor(rng()*6)],total=dice[0]+dice[1]
    let outcome:Outcome='playing',message=''
    if(point===null){
      if(total===7||total===11){outcome='win';message='Come-out win!'}
      else if([2,3,12].includes(total)){outcome='loss';message='Craps on the come-out roll.'}
      else{point=total;message=`Point is ${point}. Roll it again before a 7.`}
    }else if(total===point){outcome='win';message='Point made!'}
    else if(total===7){outcome='loss';message='Seven out.'}
    else message=`Point is ${point}. Keep rolling.`
    if(i===MAX_ACTIONS&&outcome==='playing'){outcome='push';message='Table roll limit reached. Stake returned.'}
    result={game:'craps',dice,point,rolls:i+1,outcome,multiplier:outcome==='win'?2:outcome==='push'?1:0,message}
  }
  return result!
}

export function playRound(game:CasinoKind,seed:number,choice:string,actions:readonly Action[]=[]):Round {
  if(!validChoice(game,choice)||!Number.isSafeInteger(seed)||!Array.isArray(actions)||actions.length>MAX_ACTIONS)throw Error('Invalid casino round.')
  if(game!=='blackjack'&&game!=='craps'&&actions.length)throw Error('This game settles in one deal.')
  switch(game){
    case 'blackjack':return blackjack(seed,actions)
    case 'roulette':return roulette(seed,choice)
    case 'slots':return slots(seed)
    case 'baccarat':return baccarat(seed,choice)
    case 'craps':return craps(seed,actions)
  }
}

export const totalReturn=(round:Round,stake:number)=>Math.round(round.multiplier*stake)
