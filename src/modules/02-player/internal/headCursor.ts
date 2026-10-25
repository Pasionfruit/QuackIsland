/** Absolute cursor tracking is separate from captured/dragged camera input. */
export interface HeadCursor { x: number; y: number; active: boolean }
export const createHeadCursor = (): HeadCursor => ({ x: 0, y: 0, active: false })

export function watchHeadCursor(canvas: HTMLCanvasElement, cursor: HeadCursor, enabled: () => boolean): () => void {
  const clear = () => { cursor.active = false }
  const move = (event: MouseEvent) => {
    if (!enabled() || document.pointerLockElement === canvas) { clear(); return }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) { clear(); return }
    cursor.x = (event.clientX - rect.left) / rect.width * 2 - 1
    cursor.y = 1 - (event.clientY - rect.top) / rect.height * 2
    cursor.active = true
  }
  canvas.addEventListener('mousemove', move)
  canvas.addEventListener('mouseleave', clear)
  window.addEventListener('blur', clear)
  document.addEventListener('pointerlockchange', clear)
  return () => {
    canvas.removeEventListener('mousemove', move)
    canvas.removeEventListener('mouseleave', clear)
    window.removeEventListener('blur', clear)
    document.removeEventListener('pointerlockchange', clear)
    clear()
  }
}

/** Head-relative angles, using the camera's actual screen-right axis. */
export function cursorHeadLook(cursor: HeadCursor, facing: number, right: { x: number; z: number }): { yaw: number; pitch: number } {
  if (!cursor.active) return { yaw: 0, pitch: 0 }
  const c = Math.cos(facing), s = Math.sin(facing)
  const side = right.x * c - right.z * s
  const ahead = right.x * s + right.z * c
  return {
    yaw: Math.atan2(cursor.x * 4 * side, 4 + cursor.x * 2 * ahead),
    pitch: -cursor.y * .7,
  }
}
