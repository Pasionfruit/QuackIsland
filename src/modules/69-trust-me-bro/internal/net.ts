import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { applyIntent, bots, leave, tick, type Intent, type Round } from './rules'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, TAG, type Snapshot } from './wire'

export interface Hands { queue: Intent[] }
export const TRUST_RULES: ArenaRules<Round, Hands, Intent, Snapshot, null> = {
  sendMs: 100, reportMs: 500,
  encodeSnapshot, decodeSnapshot, applySnapshot, decodeGuest: decodeIntent,
  reportMove: (r) => ({ tag: TAG, kind: 'idle', round: r.id }),
  tick, bots, leave, judgeEnd: () => {},
  drive: (round, me, hands, _dt, authoritative, say) => {
    for (const intent of hands.queue.splice(0)) {
      if (authoritative) applyIntent(round, me, intent)
      else say(encodeIntent(intent))
    }
    return null
  },
  hear: (round, who, intent) => { applyIntent(round, who, intent) },
}
export function useTrustNet() { return useArenaNet(TRUST_RULES) }
