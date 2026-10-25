import { useEffect, useRef, useState } from 'react'
import { CURRENCY_IDS, MAX_HELD, currency as currencyInfo, usePurse, type CurrencyId } from '../../11-currency'
import { CASINO_NAMES, type CasinoKind } from './layout'
import type { Ticket } from './ledger'
import { actCasino, beginCasino, resetCasinoRecord, resumeCasino } from './service'
import { blackjackTotal, cardLabel, defaultChoice, maximumMultiplier, playRound, SLOT_PAYTABLE, SLOT_SYMBOLS,
  stakeStep, suit, totalReturn, wagerProblem, type Action, type Round } from './rules'
import './casino.css'

export const RESOURCE_NAMES:Record<CurrencyId,string>={fish:'Fish',shell:'Seashells',grape:'Grapes'}
const SYMBOLS=['🍒','🔔','★','7']
const DESCRIPTIONS:Record<CasinoKind,string>={
  blackjack:'Hit or stand. Dealer stands on all 17s. Blackjack pays 3:2; other wins pay 1:1. No splits, doubles or insurance.',
  roulette:'Single-zero wheel. Outside bets pay 1:1; a straight number pays 35:1. Zero loses on outside bets.',
  slots:'The centre line pays for 3, 4 or 5 matching symbols from the left. All reels have four equally likely symbols.',
  baccarat:'Player pays 1:1; Banker pays 19:20 after commission; Tie pays 8:1. Player/Banker bets push on a tie.',
  craps:'Pass Line only. Come-out 7/11 wins; 2/3/12 loses. Otherwise make your point before a 7. Wins pay 1:1.',
}
function Cards({cards,hidden=false}:{cards:readonly number[];hidden?:boolean}){
  return <div className="casino-cards">{cards.map((card,i)=>hidden&&i>0?
    <span key={i} className="casino-card casino-card-back" aria-label="Face-down card">✦</span>:
    <span key={i} className={`casino-card ${[1,2].includes(suit(card))?'casino-card-red':''}`} aria-label={cardLabel(card)}>{cardLabel(card)}</span>)}</div>
}
function RoundView({round}:{round:Round|null}){
  if(!round)return <div className="casino-empty"><span>♠ ♦ ♣ ♥</span><p>Choose your resource and wager to begin.</p></div>
  switch(round.game){
    case 'blackjack':return <div className="casino-hands"><div><h3>Dealer {round.outcome!=='playing'&&<b>{blackjackTotal(round.dealer)}</b>}</h3><Cards cards={round.dealer} hidden={round.outcome==='playing'}/></div>
      <div><h3>You <b>{blackjackTotal(round.player)}</b></h3><Cards cards={round.player}/></div></div>
    case 'baccarat':return <div className="casino-hands"><div><h3>Player <b>{round.playerTotal}</b></h3><Cards cards={round.player}/></div>
      <div><h3>Banker <b>{round.bankerTotal}</b></h3><Cards cards={round.banker}/></div></div>
    case 'roulette':return <div className={`casino-wheel-result casino-wheel-${round.colour}`}><strong>{round.number}</strong><span>{round.colour.toUpperCase()}</span></div>
    case 'slots':return <div className="casino-reels" aria-label="Five slot reels">{round.reels.map((column,i)=><div key={i} className="casino-reel">{column.map((symbol,row)=><span key={row}
      className={`${row===1?'casino-centre-line':''} ${row===1&&round.multiplier>0&&i<round.matched?'casino-symbol-win':''}`} aria-label={SLOT_SYMBOLS[symbol]}>{SYMBOLS[symbol]}</span>)}</div>)}</div>
    case 'craps':return <div className="casino-dice"><div>{round.dice.map((value,i)=><span key={i} aria-label={`Die ${value}`}>{['','⚀','⚁','⚂','⚃','⚄','⚅'][value]}</span>)}</div>
      <strong>Total {round.dice[0]+round.dice[1]}</strong><p>{round.point?`Point: ${round.point}`:'Come-out roll'} · Roll {round.rolls}</p></div>
  }
}

export function CasinoPanel({game,onClose}:{game:CasinoKind;onClose:()=>void}){
  const purse=usePurse(),[ticket,setTicket]=useState<Ticket|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('')
  const [resource,setResource]=useState<CurrencyId>('shell'),[amount,setAmount]=useState('10'),[choice,setChoice]=useState(defaultChoice(game))
  const [busy,setBusy]=useState(false),busyNow=useRef(false),alive=useRef(true),dialog=useRef<HTMLDivElement>(null)
  const pending=ticket!==null&&ticket.stage!=='complete'
  const kind=pending?ticket.game:game
  const displayed=ticket?.game===kind?ticket:null
  const round=displayed?playRound(displayed.game,displayed.seed,displayed.choice,displayed.actions):null
  const step=stakeStep(kind,choice),stake=Number(amount),problem=wagerProblem(kind,choice,stake)
  const affordable=Number.isSafeInteger(stake)&&stake>0&&stake<=purse[resource]
  const returnFits=purse[resource]-stake+Math.round(stake*maximumMultiplier(kind,choice))<=MAX_HELD

  useEffect(()=>{
    alive.current=true
    const previous=document.activeElement as HTMLElement|null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    resumeCasino().then(saved=>{if(alive.current){setTicket(saved);setReady(true)}}).catch(e=>{if(alive.current){setError(e instanceof Error?e.message:'The table could not be opened.');setReady(true)}})
    return ()=>{alive.current=false;previous?.focus()}
  },[])
  useEffect(()=>{setChoice(defaultChoice(kind))},[kind])
  useEffect(()=>{
    if(pending&&ticket){setResource(ticket.currency);setAmount(String(ticket.stake));setChoice(ticket.choice)}
  },[pending,ticket?.id])

  async function perform(operation:()=>Promise<Ticket|null>,delay=350){
    if(busyNow.current)return
    busyNow.current=true;setBusy(true);setError('')
    try{
      const started=Date.now(),saved=await operation()
      const remaining=delay-(Date.now()-started)
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining))
      if(alive.current)setTicket(saved)
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The table could not complete that action.')}
    finally{busyNow.current=false;if(alive.current)setBusy(false)}
  }
  const bet=()=>perform(()=>beginCasino({game:kind,currency:resource,stake,choice}),kind==='slots'||kind==='roulette'?650:350)
  const act=(action:Action)=>{if(displayed)void perform(()=>actCasino(action,displayed.id))}
  const changeChoice=(value:string)=>{
    setChoice(value)
    const required=stakeStep(kind,value)
    if(!Number.isSafeInteger(stake)||stake<required||stake%required)setAmount(String(required))
  }
  const trapFocus=(event:React.KeyboardEvent)=>{
    event.stopPropagation()
    if(event.key==='Escape'&&!busy){event.preventDefault();onClose();return}
    if(event.key!=='Tab')return
    const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')
    if(!controls?.length)return
    const first=controls[0],last=controls[controls.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  return <div className="casino-backdrop"><div ref={dialog} className="casino-panel" role="dialog" aria-modal="true" aria-labelledby="casino-title" onKeyDown={trapFocus}>
    <header><div><span className="casino-eyebrow">ISLAND CLUB</span><h2 id="casino-title">{CASINO_NAMES[kind]}</h2></div>
      <button className="casino-close" onClick={onClose} disabled={busy} aria-label="Close casino table">×</button></header>
    <div className="casino-panel-body"><main>
      {pending&&ticket.game!==game&&<p className="casino-note">Continuing your saved {CASINO_NAMES[ticket.game]} wager.</p>}
      <div className={`casino-felt ${busy?'casino-resolving':''}`} aria-busy={busy}><RoundView round={round}/></div>
      {round&&<div className={`casino-result casino-result-${round.outcome}`} role="status"><strong>{busy?'Playing…':round.message}</strong>
        {displayed?.stage==='complete'&&!busy&&<p>Returned {displayed.credited!.toLocaleString()} {RESOURCE_NAMES[displayed.currency].toLowerCase()} · Net {displayed.credited!-displayed.stake>=0?'+':''}{(displayed.credited!-displayed.stake).toLocaleString()}</p>}
        {displayed?.stage==='complete'&&displayed.credited!<totalReturn(round,displayed.stake)&&<p>The return was limited by your wallet capacity.</p>}
      </div>}
      {pending&&round?.outcome==='playing'&&<div className="casino-turn-actions">
        {round.game==='blackjack'?<><button disabled={busy||!!error} onClick={()=>act('hit')}>Hit</button><button disabled={busy||!!error} onClick={()=>act('stand')}>Stand</button></>:
          <button disabled={busy||!!error} onClick={()=>act('roll')}>Roll dice</button>}
        <p>Your {ticket.stake} {RESOURCE_NAMES[ticket.currency].toLowerCase()} wager stays in play. Closing saves the hand.</p>
      </div>}
      <details className="casino-rules"><summary>Table rules & payouts</summary><p>{DESCRIPTIONS[kind]}</p>
        {kind==='slots'&&<table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>{SLOT_PAYTABLE.map((row,i)=><tr key={i}><th>{SYMBOLS[i]} {SLOT_SYMBOLS[i]}</th>{row.map((value,j)=><td key={j}>{value}×</td>)}</tr>)}</tbody></table>}
        <p>Winning returns include your original wager. Resources are not exchanged between currencies.</p>
      </details>
    </main><aside><h3>Your purse</h3><div className="casino-resources">{CURRENCY_IDS.map(id=><button key={id} disabled={pending||busy} aria-pressed={resource===id} onClick={()=>setResource(id)}>
      <span>{currencyInfo(id)?.glyph} {RESOURCE_NAMES[id]}</span><strong>{purse[id].toLocaleString()}</strong></button>)}</div>
      <fieldset disabled={!ready||pending||busy}><legend>Place a wager</legend>
        {kind==='roulette'&&<><label>Bet<select aria-label="Roulette bet" value={choice.startsWith('number:')?'number':choice} onChange={e=>changeChoice(e.target.value==='number'?'number:0':e.target.value)}>
          <option value="red">Red · 1:1</option><option value="black">Black · 1:1</option><option value="even">Even · 1:1</option><option value="odd">Odd · 1:1</option>
          <option value="low">1–18 · 1:1</option><option value="high">19–36 · 1:1</option><option value="number">Straight number · 35:1</option>
        </select></label>{choice.startsWith('number:')&&<label>Number<input aria-label="Roulette number" type="number" min={0} max={36} value={choice.slice(7)} onChange={e=>setChoice(`number:${e.target.value}`)}/></label>}</>}
        {kind==='baccarat'&&<label>Bet<select aria-label="Baccarat bet" value={choice} onChange={e=>changeChoice(e.target.value)}><option value="player">Player · 1:1</option>
          <option value="banker">Banker · 5% commission</option><option value="tie">Tie · 8:1</option></select></label>}
        <label>Amount · {RESOURCE_NAMES[resource]}<input aria-label="Wager amount" type="number" min={step} max={10000} step={step} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <div className="casino-amount-buttons">{[step,10,50].filter((n,i,a)=>a.indexOf(n)===i&&n%step===0).map(n=><button key={n} onClick={()=>setAmount(String(n))}>{n}</button>)}</div>
        {step>1&&<p className="casino-note">Use multiples of {step} for whole-resource payouts.</p>}
        <button className="casino-bet-button" disabled={!!problem||!affordable||!returnFits||!!error} onClick={bet}>{kind==='blackjack'||kind==='baccarat'?'Deal hand':kind==='craps'?'Roll come-out':'Spin'}</button>
        {!affordable&&<p className="casino-note">You need enough {RESOURCE_NAMES[resource].toLowerCase()} to cover this wager.</p>}
        {problem&&<p className="casino-note">{problem}</p>}
        {affordable&&!returnFits&&<p className="casino-note">Choose a smaller wager or another resource so the largest return fits in your wallet.</p>}
        {!problem&&affordable&&<p className="casino-note">Largest total return: {Math.round(stake*maximumMultiplier(kind,choice)).toLocaleString()} {RESOURCE_NAMES[resource].toLowerCase()}.</p>}
      </fieldset>
      {pending&&<p className="casino-note">Finish this wager before starting another.</p>}
      {error&&<div className="casino-error" role="alert"><p>{error}</p><button disabled={busy} onClick={()=>perform(resumeCasino,0)}>Retry saved hand</button>
        {error.includes('saved hand could not')&&<button disabled={busy} onClick={()=>perform(async()=>{await resetCasinoRecord();return null},0)}>Reset damaged record</button>}</div>}
    </aside></div>
  </div></div>
}
