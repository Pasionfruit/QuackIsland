import { type ArenaRules } from '../../68-minigame-kit'
import { bots, clamp, leave, releaseTrap, tick, type Hands, type Round } from './rules'
import { applySnapshot, decodeGuest, decodeSnapshot, encodeMove, encodeSnapshot, encodeTrap, type Guest, type Snapshot } from './wire'

export const arenaRules: ArenaRules<Round, Hands, Guest, Snapshot, never> = {
  encodeSnapshot, decodeSnapshot, applySnapshot, decodeGuest, reportMove: encodeMove,
  tick, bots, leave,
  drive(r, index, hands, _dt, authoritative, say) {
    const p = r.players[index]
    if (!p || p.left || r.over) return null
    p.inputX = clamp(hands.steer, -1, 1)
    p.inputY = clamp(hands.throttle, -1, 1)
    if (p.id === r.oneId) {
      if (authoritative) { r.steer = p.inputX; r.throttle = p.inputY }
    } else if (hands.sequence > p.sent) {
      p.sent = hands.sequence
      if (authoritative) releaseTrap(r, p.id, hands.trap, hands.aim, hands.sequence)
      else say(encodeTrap(r, hands))
    }
    return null
  },
  hear(r, index, m) {
    const p = r.players[index]
    if (!p || p.left || r.over || m.round !== r.id) return
    if (m.kind === 'move' && p.id === r.oneId) { r.steer = m.steer; r.throttle = m.throttle }
    if (m.kind === 'trap') releaseTrap(r, p.id, m.trap, m.x, m.sequence)
  },
  judgeEnd() {},
}
