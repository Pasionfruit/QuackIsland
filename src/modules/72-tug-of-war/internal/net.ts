import { useArenaNet,type ArenaRules } from '../../68-minigame-kit'
import { applyPress,bots,judgeEnd,leave,tick,type Hands,type Press,type Round } from './rules'
import { applySnapshot,decodePress,decodeSnapshot,encodePress,encodeSnapshot,TAG,type Snapshot } from './wire'
export const TUG_RULES:ArenaRules<Round,Hands,Press,Snapshot,null>={
  reportMs:500,encodeSnapshot,decodeSnapshot,applySnapshot,decodeGuest:decodePress,
  reportMove:(r)=>({tag:TAG,kind:'idle',round:r.id}),tick,bots,leave,judgeEnd,
  drive:(r,who,hands,_dt,authoritative,say)=>{for(const press of hands.queue.splice(0)){if(authoritative)applyPress(r,who,press);else say(encodePress(press))}return null},
  hear:(r,who,press)=>{applyPress(r,who,press)},
}
export function useTugNet(){return useArenaNet(TUG_RULES)}
