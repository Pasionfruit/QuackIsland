import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { bots, judgeEnd, leave, setInput, settle, stepWorld, tick, type Hands, type Round } from './rules'
import { applySnapshot, decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, handsOf, type InputMessage, type Snapshot } from './wire'

export const TEAM_RULES: ArenaRules<Round, Hands, InputMessage, Snapshot, null> = {
  encodeSnapshot, decodeSnapshot, applySnapshot, decodeGuest: decodeInput, reportMove: encodeInput,
  tick, bots, settle, leave, judgeEnd,
  drive: (r, who, hands, dt, authoritative) => { setInput(r, r.players[who], hands); if (!authoritative) stepWorld(r, dt); return null },
  hear: (r, who, message) => { setInput(r, r.players[who], handsOf(message)) },
}
export function useTeamNet() { return useArenaNet(TEAM_RULES) }
