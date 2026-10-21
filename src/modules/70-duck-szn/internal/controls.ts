import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { emptyHands, PITCH_LIMIT, SENSITIVITY, wrapAngle, type Round } from './rules'

export function useDuckControls(board: RefObject<HTMLDivElement | null>, round: Round, active: boolean) {
  const hands = useRef(emptyHands())
  const [locked, setLocked] = useState(false)
  const [lockProblem, setLockProblem] = useState(false)
  const keys = useRef(new Set<string>())
  const mine = round.players.find((p) => p.mine)
  const alive = !!mine && mine.alive && !mine.left
  const enabled = active && alive
  const reset = useCallback(() => {
    keys.current.clear()
    hands.current.forward = 0; hands.current.strafe = 0; hands.current.crouch = false; hands.current.fire = false
  }, [])
  useEffect(() => {
    hands.current.yaw = mine?.yaw ?? 0
    hands.current.pitch = mine?.pitch ?? 0
    reset()
  // Initialize only on a new deal/body; snapshots must not reset a player's mouse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, mine?.id, reset])
  useEffect(() => {
    if (!enabled) reset()
  }, [enabled, reset])
  useEffect(() => {
    const sync = () => {
      const now = document.pointerLockElement === board.current
      setLocked(now)
      if (!now) reset()
      else setLockProblem(false)
    }
    const down = (e: KeyboardEvent) => {
      if (!enabled || document.pointerLockElement !== board.current) return
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) return
      e.preventDefault(); keys.current.add(e.code)
      hands.current.forward = Number(keys.current.has('KeyW')) - Number(keys.current.has('KeyS'))
      hands.current.strafe = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'))
      hands.current.crouch = keys.current.has('Space')
    }
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
      hands.current.forward = Number(keys.current.has('KeyW')) - Number(keys.current.has('KeyS'))
      hands.current.strafe = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'))
      hands.current.crouch = keys.current.has('Space')
    }
    const look = (e: MouseEvent) => {
      if (!enabled || document.pointerLockElement !== board.current) return
      hands.current.yaw = wrapAngle(hands.current.yaw - e.movementX * SENSITIVITY)
      hands.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, hands.current.pitch - e.movementY * SENSITIVITY))
    }
    const error = () => setLockProblem(true)
    document.addEventListener('pointerlockchange', sync)
    document.addEventListener('pointerlockerror', error)
    document.addEventListener('mousemove', look)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset)
    return () => {
      document.removeEventListener('pointerlockchange', sync); document.removeEventListener('pointerlockerror', error); document.removeEventListener('mousemove', look)
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset)
      reset()
      if (document.pointerLockElement === board.current) document.exitPointerLock()
    }
  }, [board, enabled, reset])
  const click = useCallback((button: number) => {
    if (button !== 0 || !alive) return
    if (document.pointerLockElement !== board.current) {
      try { const request = board.current?.requestPointerLock(); if (request instanceof Promise) request.catch(() => setLockProblem(true)) } catch { setLockProblem(true) }
    } else if (enabled && mine?.role === 'hunter') hands.current.fire = true
  }, [alive, board, enabled, mine?.role])
  return { hands, locked, lockProblem, click }
}
