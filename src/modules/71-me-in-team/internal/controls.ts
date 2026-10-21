import { useEffect, useRef, useState, type RefObject } from 'react'
import { emptyHands, SENSITIVITY, wrapAngle, type Round } from './rules'

export function useTeamControls(board: RefObject<HTMLDivElement | null>, round: Round, enabled: boolean) {
  const hands = useRef(emptyHands()), keys = useRef(new Set<string>())
  const [locked, setLocked] = useState(false)
  const me = round.players.find((p) => p.mine)
  useEffect(() => { hands.current.yaw = me?.yaw ?? 0; hands.current.pitch = me?.pitch ?? .55 }, [round.id, me?.id])
  useEffect(() => {
    const reset = () => { keys.current.clear(); hands.current.forward = 0; hands.current.strafe = 0 }
    const update = () => {
      hands.current.forward = Number(keys.current.has('KeyW')) - Number(keys.current.has('KeyS'))
      hands.current.strafe = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'))
    }
    const keyDown = (e: KeyboardEvent) => {
      if (!enabled || document.pointerLockElement !== board.current || !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return
      e.preventDefault(); keys.current.add(e.code); update()
    }
    const keyUp = (e: KeyboardEvent) => { keys.current.delete(e.code); update() }
    const look = (e: MouseEvent) => {
      if (!enabled || document.pointerLockElement !== board.current) return
      hands.current.yaw = wrapAngle(hands.current.yaw - e.movementX * SENSITIVITY)
      hands.current.pitch = Math.max(.18, Math.min(1.1, hands.current.pitch - e.movementY * SENSITIVITY))
    }
    const changed = () => { const isLocked = document.pointerLockElement === board.current; setLocked(isLocked); if (!isLocked) reset() }
    if (!enabled) reset()
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', reset)
    document.addEventListener('mousemove', look); document.addEventListener('pointerlockchange', changed)
    return () => {
      reset(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', reset)
      document.removeEventListener('mousemove', look); document.removeEventListener('pointerlockchange', changed)
    }
  }, [board, enabled])
  useEffect(() => () => { if (document.pointerLockElement === board.current) document.exitPointerLock() }, [board])
  const capture = () => {
    if (!me || me.left || round.over || document.pointerLockElement === board.current) return
    try { const request = board.current?.requestPointerLock(); if (request instanceof Promise) request.catch(() => setLocked(false)) } catch { setLocked(false) }
  }
  return { hands, locked, capture }
}
