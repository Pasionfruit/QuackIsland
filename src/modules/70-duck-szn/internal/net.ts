import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { bots, COOLDOWN, judgeEnd, leave, move, shoot, tick, type Hands, type Round } from './rules'
import { applySnapshot, decodeGuest, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, hearMove, type Guest, type Snapshot } from './wire'

export const DUCK_RULES: ArenaRules<Round, Hands, Guest, Snapshot, null> = {
  encodeSnapshot, decodeSnapshot, applySnapshot, decodeGuest, reportMove: encodeMove,
  tick, bots, leave, judgeEnd,
  drive: (r, who, hands, dt, authoritative, say) => {
    const p = r.players[who]
    if (!p) return null
    move(r, p, hands, dt)
    if (hands.fire && p.role === 'hunter' && p.alive && !p.left && r.elapsed + 1e-6 >= p.lastShot + COOLDOWN) {
      if (authoritative) shoot(r, who, p.yaw, p.pitch)
      else { say(encodeMove(r, p)); say(encodeShot(r, p)); p.lastShot = r.elapsed }
    }
    hands.fire = false
    return null
  },
  hear: (r, who, message, sinceLast) => {
    const p = r.players[who]
    if (message.kind === 'move') hearMove(r, p, message, sinceLast)
    else if (Math.hypot(message.x - p.x, message.z - p.z) <= 1.5) shoot(r, who, message.yaw, message.pitch)
  },
}
export function useDuckNet() { return useArenaNet(DUCK_RULES) }
