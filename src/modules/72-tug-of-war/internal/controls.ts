import { useEffect, useRef } from 'react'
import { emptyHands, KEYS, type Press, type Round } from './rules'

export function useTugControls(round: Round, enabled: boolean, repaint: () => void) {
  const hands = useRef(emptyHands())
  const pending = useRef<Press[]>([])
  const serial = useRef(0)
  const held = useRef(new Set<string>())
  const me = round.players.find((p) => p.mine)
  useEffect(() => {
    hands.current.queue.length = 0; pending.current.length = 0; held.current.clear()
    serial.current = me?.ack ?? 0
  }, [round.id, me?.id])
  useEffect(() => {
    const reset = () => { held.current.clear(); hands.current.queue.length = 0; pending.current.length = 0 }
    if (!enabled) reset()
    const down = (e: KeyboardEvent) => {
      if (!enabled || !me || me.left || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return
      const key = me.role === 'solo' ? ['Digit1','Numpad1'].includes(e.code) ? '1' : '' : e.key.length === 1 && KEYS.includes(e.key.toUpperCase()) ? e.key.toUpperCase() : ''
      if (!key) return
      e.preventDefault()
      const physical = e.code || e.key
      if (held.current.has(physical)) return
      held.current.add(physical)
      if (hands.current.queue.length >= 32 || pending.current.length >= 64) return
      serial.current = Math.max(serial.current, me.ack) + 1
      const press = { round: round.id, seq: serial.current, key }
      hands.current.queue.push(press); pending.current.push(press); repaint()
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code || e.key)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset) }
  }, [enabled, me, round, repaint])
  return { hands, pending }
}
